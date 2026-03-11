// Empire Reborn — WebSocket Game Manager

import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import {
  type GameState,
  type GameConfig,
  type PlayerAction,
  type TurnResult,
  type CityState,
  type UnitState,
  type ViewMapCell,
  type PlayerInfo,
  Owner,
  UnitType,
  UnitBehavior,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_SIZE,
  NUM_CITY,
  STARTING_ORE,
  STARTING_OIL,
  STARTING_TEXTILE,
  UNOWNED,
  configureMapDimensions,
  generateMap,
  initViewMap,
  scan,
  executeTurn,
  computeAITurn,
  isOnBoard,
  createPlayerInfo,
  initAllPlayerData,
  initKingdoms,
} from "@empire/shared";
import type {
  ClientMessage,
  ServerMessage,
  GamePhase,
  VisibleGameState,
  VisibleCity,
} from "@empire/shared";
import type { GameDatabase } from "./database.js";

// ─── Player Connection ──────────────────────────────────────────────────────

interface PlayerConnection {
  ws: WebSocket;
  owner: number; // PlayerId
  gameId: string;
}

// ─── Active Game ────────────────────────────────────────────────────────────

interface ActiveGame {
  id: string;
  phase: GamePhase;
  state: GameState;
  players: Map<number, WebSocket | null>; // PlayerId → ws (null = disconnected)
  pendingActions: Map<number, PlayerAction[]>;
  turnEnded: Set<number>;
  disconnectTimers: Map<number, ReturnType<typeof setTimeout>>;
  createdAt: number;
}

// ─── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: GameConfig = {
  mapWidth: MAP_WIDTH,
  mapHeight: MAP_HEIGHT,
  numCities: 70,
  waterRatio: 70,
  smoothPasses: 5,
  minCityDist: 2,
  seed: 0, // will be randomized
};

const DISCONNECT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_WINDOW_MS = 1000; // 1 second
const RATE_LIMIT_MAX_MSGS = 30; // max messages per window

// ─── Game Manager ───────────────────────────────────────────────────────────

export class GameManager {
  private games = new Map<string, ActiveGame>();
  private playerConnections = new Map<WebSocket, PlayerConnection>();
  private db: GameDatabase | null;
  private rateLimits = new Map<WebSocket, { count: number; resetAt: number }>();

  constructor(db?: GameDatabase) {
    this.db = db ?? null;
  }

  /**
   * @deprecated Use handleMessage/handleDisconnect directly. Kept for backward compatibility.
   */
  handleConnection(ws: WebSocket): void {
    this.send(ws, { type: "welcome", version: "0.1.0" });

    ws.on("message", (data) => {
      if (this.isRateLimited(ws)) {
        this.send(ws, { type: "error", message: "Rate limited — slow down" });
        return;
      }
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        this.handleMessage(ws, msg);
      } catch {
        this.send(ws, { type: "error", message: "Invalid message format" });
      }
    });

    ws.on("close", () => {
      this.rateLimits.delete(ws);
      this.handleDisconnect(ws);
    });
  }

  /** Check and increment rate limit for a WebSocket connection. */
  private isRateLimited(ws: WebSocket): boolean {
    const now = Date.now();
    let entry = this.rateLimits.get(ws);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
      this.rateLimits.set(ws, entry);
    }
    entry.count++;
    return entry.count > RATE_LIMIT_MAX_MSGS;
  }

  // ─── Message Router ─────────────────────────────────────────────────────

  handleMessage(ws: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case "create_game":
        this.handleCreateGame(ws, msg.config);
        break;
      case "join_game":
        this.handleJoinGame(ws, msg.gameId);
        break;
      case "action":
        this.handleAction(ws, msg.gameId, msg.action);
        break;
      case "end_turn":
        this.handleEndTurn(ws, msg.gameId);
        break;
      case "resign":
        this.handleResign(ws, msg.gameId);
        break;
      default:
        this.send(ws, { type: "error", message: "Unknown message type" });
    }
  }

  // ─── Create Game ────────────────────────────────────────────────────────

  private handleCreateGame(ws: WebSocket, configOverrides?: Partial<GameConfig>): void {
    const gameId = randomUUID().slice(0, 8);

    // Configure dimensions first so NUM_CITY scales correctly
    const w = configOverrides?.mapWidth ?? DEFAULT_CONFIG.mapWidth;
    const h = configOverrides?.mapHeight ?? DEFAULT_CONFIG.mapHeight;
    configureMapDimensions(w, h);

    const numPlayers = configOverrides?.numPlayers ?? 2;

    const config: GameConfig = {
      ...DEFAULT_CONFIG,
      numCities: NUM_CITY, // auto-scaled by configureMapDimensions
      seed: Math.floor(Math.random() * 2 ** 32),
      ...configOverrides,
      numPlayers,
    };
    const mapResult = generateMap(config);

    // Create player roster: player 1 = human creator, player 2 = AI (for classic 2-player)
    // For N-player, remaining slots are AI by default
    const playerInfos: PlayerInfo[] = [];
    for (let i = 1; i <= numPlayers; i++) {
      playerInfos.push(createPlayerInfo(i, undefined, i > 1));
    }

    // Build initial game state
    const state: GameState = {
      config,
      turn: 0,
      map: mapResult.map,
      cities: mapResult.cities,
      units: [],
      nextUnitId: 0,
      nextCityId: mapResult.cities.length,
      players: playerInfos,
      viewMaps: {},
      rngState: config.seed,
      resources: {},
      deposits: mapResult.deposits,
      nextDepositId: mapResult.deposits.length,
      buildings: [],
      nextBuildingId: 0,
      techResearch: {},
      kingdoms: {},
    };

    // Initialize per-player data (viewMaps, resources, tech)
    initAllPlayerData(state);

    // Assign starting cities
    for (let i = 0; i < numPlayers && i < mapResult.startingCities.length; i++) {
      const cityId = mapResult.startingCities[i];
      const playerId = i + 1;
      state.cities[cityId].owner = playerId as any;
      scan(state, playerId, state.cities[cityId].loc);
    }

    // Initialize kingdoms — starting cities become crown cities
    initKingdoms(state, mapResult.startingCities);

    // Set up WebSocket connections — only human creator initially
    // AI players don't get WS entries (they're managed server-side)
    const playerMap = new Map<number, WebSocket | null>();
    const pendingActions = new Map<number, PlayerAction[]>();
    playerMap.set(1, ws);
    for (let i = 1; i <= numPlayers; i++) {
      pendingActions.set(i, []);
    }

    const game: ActiveGame = {
      id: gameId,
      phase: "lobby",
      state,
      players: playerMap,
      pendingActions,
      turnEnded: new Set(),
      disconnectTimers: new Map(),
      createdAt: Date.now(),
    };

    this.games.set(gameId, game);
    this.playerConnections.set(ws, { ws, owner: 1, gameId });

    this.send(ws, { type: "game_created", gameId, owner: 1 as any });
    console.log(`Game ${gameId} created by Player 1 (${numPlayers} players)`);
  }

  // ─── Join Game ──────────────────────────────────────────────────────────

  private handleJoinGame(ws: WebSocket, gameId: string): void {
    const game = this.games.get(gameId);
    if (!game) {
      this.send(ws, { type: "error", message: `Game ${gameId} not found` });
      return;
    }

    // In-progress games: check for reconnection (disconnected player slots are null)
    if (game.phase !== "lobby") {
      for (const [owner, existingWs] of game.players) {
        if (existingWs === null) {
          // Reconnect
          game.players.set(owner, ws);
          this.playerConnections.set(ws, { ws, owner, gameId });

          // Clear disconnect timer
          const timer = game.disconnectTimers.get(owner);
          if (timer) {
            clearTimeout(timer);
            game.disconnectTimers.delete(owner);
          }

          this.send(ws, { type: "game_joined", gameId, owner: owner as any, phase: game.phase });
          this.broadcastToGame(game, { type: "player_reconnected", gameId }, owner);
          this.sendVisibleState(game, owner);

          console.log(`Player ${owner} reconnected to game ${gameId}`);
          return;
        }
      }
      this.send(ws, { type: "error", message: "Game already in progress" });
      return;
    }

    // Lobby: new player joining — find next available slot
    // AI players aren't in game.players yet, so find one from state.players
    let joinSlot: number | null = null;
    for (const p of game.state.players) {
      if (!game.players.has(p.id)) {
        joinSlot = p.id;
        break;
      }
    }

    if (joinSlot === null) {
      this.send(ws, { type: "error", message: "Game is full" });
      return;
    }

    // Mark this player as human
    const playerInfo = game.state.players.find(p => p.id === joinSlot);
    if (playerInfo) playerInfo.isAI = false;

    game.players.set(joinSlot, ws);
    this.playerConnections.set(ws, { ws, owner: joinSlot, gameId });

    // Scan vision for the joining player
    const joinCity = game.state.cities.find(c => c.owner === joinSlot);
    if (joinCity) {
      scan(game.state, joinSlot, joinCity.loc);
    }

    this.send(ws, { type: "game_joined", gameId, owner: joinSlot as any, phase: game.phase });

    // Check if all human slots are filled — start the game
    const humanPlayers = game.state.players.filter(p => !p.isAI);
    const allHumansConnected = humanPlayers.every(p => game.players.get(p.id) !== null);
    if (allHumansConnected && humanPlayers.length >= 2) {
      this.startGame(game);
    } else if (game.state.players.length === 2) {
      // Classic 2-player: start when second player joins
      this.startGame(game);
    }
  }

  // ─── Start Game ─────────────────────────────────────────────────────────

  private startGame(game: ActiveGame): void {
    game.phase = "playing";

    // Notify all connected players
    for (const [owner, ws] of game.players) {
      if (ws) {
        this.send(ws, { type: "game_started", gameId: game.id });
        this.sendVisibleState(game, owner);
      }
    }

    console.log(`Game ${game.id} started`);
  }

  // ─── Handle Action ──────────────────────────────────────────────────────

  private handleAction(ws: WebSocket, gameId: string, action: PlayerAction): void {
    const conn = this.playerConnections.get(ws);
    if (!conn || conn.gameId !== gameId) {
      this.send(ws, { type: "error", message: "Not in this game" });
      return;
    }

    const game = this.games.get(gameId);
    if (!game || game.phase !== "playing") {
      this.send(ws, { type: "error", message: "Game not active" });
      return;
    }

    if (game.turnEnded.has(conn.owner)) {
      this.send(ws, { type: "error", message: "Turn already ended" });
      return;
    }

    // Validate ownership of unit/city
    if (!this.validateAction(game.state, conn.owner, action)) {
      this.send(ws, { type: "error", message: "Invalid action" });
      return;
    }

    const actions = game.pendingActions.get(conn.owner)!;
    if (actions.length >= 500) {
      this.send(ws, { type: "error", message: "Too many actions queued" });
      return;
    }
    actions.push(action);
  }

  // ─── Validate Action ───────────────────────────────────────────────────

  private validateAction(state: GameState, owner: number, action: PlayerAction): boolean {
    switch (action.type) {
      case "move": {
        const unit = state.units.find((u) => u.id === action.unitId);
        if (!unit || unit.owner !== owner) return false;
        if (typeof action.loc !== "number" || action.loc < 0 || action.loc >= MAP_SIZE || !isOnBoard(action.loc)) return false;
        return true;
      }
      case "attack": {
        const unit = state.units.find((u) => u.id === action.unitId);
        if (!unit || unit.owner !== owner) return false;
        if (typeof action.targetLoc !== "number" || action.targetLoc < 0 || action.targetLoc >= MAP_SIZE || !isOnBoard(action.targetLoc)) return false;
        return true;
      }
      case "setBehavior": {
        const unit = state.units.find((u) => u.id === action.unitId);
        if (!unit || unit.owner !== owner) return false;
        const validBehaviors = Object.values(UnitBehavior);
        if (!validBehaviors.includes(action.behavior)) return false;
        return true;
      }
      case "setTarget": {
        const unit = state.units.find((u) => u.id === action.unitId);
        if (!unit || unit.owner !== owner) return false;
        if (typeof action.targetLoc !== "number" || action.targetLoc < 0 || action.targetLoc >= MAP_SIZE || !isOnBoard(action.targetLoc)) return false;
        return true;
      }
      case "embark": {
        const unit = state.units.find((u) => u.id === action.unitId);
        if (!unit || unit.owner !== owner) return false;
        const ship = state.units.find((u) => u.id === action.shipId);
        if (!ship || ship.owner !== owner) return false;
        return true;
      }
      case "disembark": {
        const unit = state.units.find((u) => u.id === action.unitId);
        return !!unit && unit.owner === owner;
      }
      case "setProduction": {
        const city = state.cities.find((c) => c.id === action.cityId);
        if (!city || city.owner !== owner) return false;
        const validUnitTypes = Object.values(UnitType).filter((v) => typeof v === "number");
        if (!validUnitTypes.includes(action.unitType)) return false;
        return true;
      }
      case "endTurn":
      case "resign":
        return true;
      default:
        return false;
    }
  }

  // ─── End Turn ───────────────────────────────────────────────────────────

  private handleEndTurn(ws: WebSocket, gameId: string): void {
    const conn = this.playerConnections.get(ws);
    if (!conn || conn.gameId !== gameId) {
      this.send(ws, { type: "error", message: "Not in this game" });
      return;
    }

    const game = this.games.get(gameId);
    if (!game || game.phase !== "playing") {
      this.send(ws, { type: "error", message: "Game not active" });
      return;
    }

    game.turnEnded.add(conn.owner);

    // Check if all human players have ended their turn
    const humanPlayers = game.state.players.filter(p => !p.isAI && p.status === "active");
    const allHumansEnded = humanPlayers.every(p => game.turnEnded.has(p.id));
    if (allHumansEnded) {
      this.executeTurn(game);
    }
  }

  // ─── Resign ─────────────────────────────────────────────────────────────

  private handleResign(ws: WebSocket, gameId: string): void {
    const conn = this.playerConnections.get(ws);
    if (!conn || conn.gameId !== gameId) {
      this.send(ws, { type: "error", message: "Not in this game" });
      return;
    }

    const game = this.games.get(gameId);
    if (!game || game.phase !== "playing") {
      this.send(ws, { type: "error", message: "Game not active" });
      return;
    }

    // Add resign action and force turn execution
    game.pendingActions.get(conn.owner)!.push({ type: "resign" });
    // Mark all players as ended to trigger execution
    for (const p of game.state.players) {
      if (p.status === "active") game.turnEnded.add(p.id);
    }
    this.executeTurn(game);
  }

  // ─── Execute Turn ───────────────────────────────────────────────────────

  private executeTurn(game: ActiveGame): void {
    // Compute AI actions for AI players
    for (const p of game.state.players) {
      if (p.isAI && p.status === "active") {
        const aiActions = computeAITurn(game.state, p.id);
        game.pendingActions.set(p.id, aiActions);
      }
    }

    // Build action map
    const allActions = new Map<number, PlayerAction[]>();
    for (const p of game.state.players) {
      allActions.set(p.id, game.pendingActions.get(p.id) ?? []);
    }

    const result: TurnResult = executeTurn(game.state, allActions);

    // Broadcast turn result
    for (const [owner, ws] of game.players) {
      if (ws) {
        const viewMap = game.state.viewMaps[owner];
        const visibleEvents = result.events.filter((e) => {
          return viewMap && viewMap[e.loc] && viewMap[e.loc].seen >= 0;
        });
        this.send(ws, {
          type: "turn_result",
          gameId: game.id,
          turn: result.turn,
          events: visibleEvents,
        });
      }
    }

    // Check game over
    if (result.winner !== null) {
      game.phase = "game_over";
      for (const [, ws] of game.players) {
        if (ws) {
          this.send(ws, {
            type: "game_over",
            gameId: game.id,
            winner: result.winner as any,
            winType: result.winType!,
          });
        }
      }
      this.persistGame(game);
      console.log(`Game ${game.id} over: Player ${result.winner} wins by ${result.winType}`);
      return;
    }

    // Reset turn state
    for (const p of game.state.players) {
      game.pendingActions.set(p.id, []);
    }
    game.turnEnded.clear();

    // Autosave after each turn
    this.persistGame(game);

    // Send updated visible state to each connected player
    for (const [owner, ws] of game.players) {
      if (ws) this.sendVisibleState(game, owner);
    }
  }

  // ─── Visible State ──────────────────────────────────────────────────────

  private getVisibleState(game: ActiveGame, owner: number): VisibleGameState {
    const { state } = game;
    const viewMap = state.viewMaps[owner];

    // Filter cities: all cities on the view map where seen >= 0
    const visibleCities: VisibleCity[] = [];
    for (const city of state.cities) {
      const cell = viewMap[city.loc];
      if (cell && cell.seen >= 0) {
        visibleCities.push({
          id: city.id,
          loc: city.loc,
          owner: city.owner,
          production: city.owner === owner ? city.production : null,
          work: city.owner === owner ? city.work : null,
        });
      }
    }

    // Filter units: only own units + units visible on view map
    const visibleUnits: UnitState[] = state.units.filter((u) => {
      if (u.owner === owner) return true;
      const cell = viewMap[u.loc];
      return cell && cell.seen === state.turn;
    });

    return {
      turn: state.turn,
      phase: game.phase,
      owner: owner as any,
      viewMap: [...viewMap],
      cities: visibleCities,
      units: visibleUnits,
      config: state.config,
    };
  }

  private sendVisibleState(game: ActiveGame, owner: number): void {
    const ws = game.players.get(owner);
    if (!ws) return;

    const visibleState = this.getVisibleState(game, owner);
    this.send(ws, { type: "state_update", gameId: game.id, state: visibleState });
  }

  // ─── Disconnect Handling ────────────────────────────────────────────────

  handleDisconnect(ws: WebSocket): void {
    const conn = this.playerConnections.get(ws);
    if (!conn) return;

    const game = this.games.get(conn.gameId);
    this.playerConnections.delete(ws);

    if (!game) return;

    if (game.phase === "lobby") {
      // Game hasn't started — remove player and clean up
      game.players.delete(conn.owner);
      if (game.players.size === 0) {
        this.games.delete(game.id);
        console.log(`Game ${game.id} removed (lobby empty)`);
      }
      return;
    }

    // Mark player as disconnected (hold game state)
    game.players.set(conn.owner, null);

    // Persist game immediately so state is safe even if server crashes
    this.persistGame(game);

    // Notify other players
    this.broadcastToGame(game, { type: "player_disconnected", gameId: game.id }, conn.owner);

    // Set reconnection timeout — remove game from memory after grace period
    const timer = setTimeout(() => {
      const allDisconnected = [...game.players.values()].every((ws) => ws === null);
      if (allDisconnected) {
        this.games.delete(game.id);
        console.log(`Game ${game.id} removed from memory (all players disconnected)`);
      }
    }, DISCONNECT_TIMEOUT_MS);

    game.disconnectTimers.set(conn.owner, timer);
    console.log(`Player ${conn.owner} disconnected from game ${game.id}`);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private broadcastToGame(game: ActiveGame, msg: ServerMessage, excludeOwner?: number): void {
    for (const [owner, ws] of game.players) {
      if (ws && owner !== excludeOwner) {
        this.send(ws, msg);
      }
    }
  }

  // ─── Public API (for REST endpoints) ────────────────────────────────────

  getActiveGames(): Array<{ id: string; phase: GamePhase; players: number; turn: number; createdAt: number }> {
    return [...this.games.values()].map((g) => ({
      id: g.id,
      phase: g.phase,
      players: [...g.players.values()].filter((ws) => ws !== null).length,
      turn: g.state.turn,
      createdAt: g.createdAt,
    }));
  }

  getGame(gameId: string): ActiveGame | undefined {
    return this.games.get(gameId);
  }

  // ─── Persistence ──────────────────────────────────────────────────────

  private persistGame(game: ActiveGame): void {
    if (!this.db) return;
    try {
      this.db.saveGame(game.id, game.phase, game.state);
    } catch (err) {
      console.error(`Failed to save game ${game.id}:`, err);
    }
  }

  /** Resume a saved game from the database into memory (no players connected yet). */
  resumeGame(gameId: string): boolean {
    if (!this.db) return false;

    // Already in memory?
    if (this.games.has(gameId)) return true;

    const saved = this.db.loadGame(gameId);
    if (!saved) return false;

    // Only resume games that were in progress (not completed lobby games)
    if (saved.phase === "lobby") return false;

    // Restore map dimensions from saved config
    configureMapDimensions(saved.state.config.mapWidth, saved.state.config.mapHeight);

    // Set up player connections (all disconnected initially)
    const playerMap = new Map<number, WebSocket | null>();
    const pendingActions = new Map<number, PlayerAction[]>();
    for (const p of saved.state.players) {
      playerMap.set(p.id, null);
      pendingActions.set(p.id, []);
    }

    const game: ActiveGame = {
      id: gameId,
      phase: saved.phase,
      state: saved.state,
      players: playerMap,
      pendingActions,
      turnEnded: new Set(),
      disconnectTimers: new Map(),
      createdAt: Date.now(),
    };

    this.games.set(gameId, game);
    console.log(`Game ${gameId} resumed from database (turn ${saved.state.turn})`);
    return true;
  }

  /** Get saved games from database (for REST API). */
  getSavedGames() {
    if (!this.db) return [];
    return this.db.listGames();
  }

  /** Delete a saved game from the database. */
  deleteSavedGame(gameId: string): boolean {
    if (!this.db) return false;
    return this.db.deleteGame(gameId);
  }

  /** Persist all active games and clear disconnect timers (for graceful shutdown). */
  shutdown(): void {
    for (const [id, game] of this.games) {
      // Clear any pending disconnect timers
      for (const [, timer] of game.disconnectTimers) {
        clearTimeout(timer);
      }
      game.disconnectTimers.clear();

      // Persist game state
      if (game.phase !== "lobby") {
        this.persistGame(game);
        console.log(`Game ${id} saved (shutdown)`);
      }
    }
    this.games.clear();
    this.playerConnections.clear();
    this.rateLimits.clear();
  }
}
