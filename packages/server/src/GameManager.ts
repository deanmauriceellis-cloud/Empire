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
  Owner,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_SIZE,
  generateMap,
  initViewMap,
  scan,
  executeTurn,
  computeAITurn,
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
  owner: Owner;
  gameId: string;
}

// ─── Active Game ────────────────────────────────────────────────────────────

interface ActiveGame {
  id: string;
  phase: GamePhase;
  state: GameState;
  players: Map<Owner, WebSocket | null>; // null = disconnected
  pendingActions: Map<Owner, PlayerAction[]>;
  turnEnded: Set<Owner>;
  disconnectTimers: Map<Owner, ReturnType<typeof setTimeout>>;
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

// ─── Game Manager ───────────────────────────────────────────────────────────

export class GameManager {
  private games = new Map<string, ActiveGame>();
  private playerConnections = new Map<WebSocket, PlayerConnection>();
  private db: GameDatabase | null;

  constructor(db?: GameDatabase) {
    this.db = db ?? null;
  }

  handleConnection(ws: WebSocket): void {
    this.send(ws, { type: "welcome", version: "0.1.0" });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        this.handleMessage(ws, msg);
      } catch {
        this.send(ws, { type: "error", message: "Invalid message format" });
      }
    });

    ws.on("close", () => {
      this.handleDisconnect(ws);
    });
  }

  // ─── Message Router ─────────────────────────────────────────────────────

  private handleMessage(ws: WebSocket, msg: ClientMessage): void {
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
    const config: GameConfig = {
      ...DEFAULT_CONFIG,
      seed: Math.floor(Math.random() * 2 ** 32),
      ...configOverrides,
    };

    // Generate map
    const mapResult = generateMap(config);

    // Build initial game state
    const state: GameState = {
      config,
      turn: 0,
      map: mapResult.map,
      cities: mapResult.cities,
      units: [],
      nextUnitId: 0,
      nextCityId: mapResult.cities.length,
      viewMaps: {
        [Owner.Unowned]: [],
        [Owner.Player1]: initViewMap(),
        [Owner.Player2]: initViewMap(),
      },
      rngState: config.seed,
    };

    // Assign starting cities
    const [city1Id, city2Id] = mapResult.startingCities;
    state.cities[city1Id].owner = Owner.Player1;
    state.cities[city2Id].owner = Owner.Player2;

    // Initial vision scan for player 1 (player 2 scanned when they join)
    scan(state, Owner.Player1, state.cities[city1Id].loc);

    const game: ActiveGame = {
      id: gameId,
      phase: "lobby",
      state,
      players: new Map([[Owner.Player1, ws]]),
      pendingActions: new Map([
        [Owner.Player1, []],
        [Owner.Player2, []],
      ]),
      turnEnded: new Set(),
      disconnectTimers: new Map(),
      createdAt: Date.now(),
    };

    this.games.set(gameId, game);
    this.playerConnections.set(ws, { ws, owner: Owner.Player1, gameId });

    this.send(ws, { type: "game_created", gameId, owner: Owner.Player1 });
    console.log(`Game ${gameId} created by Player 1`);
  }

  // ─── Join Game ──────────────────────────────────────────────────────────

  private handleJoinGame(ws: WebSocket, gameId: string): void {
    const game = this.games.get(gameId);
    if (!game) {
      this.send(ws, { type: "error", message: `Game ${gameId} not found` });
      return;
    }

    // Check if this is a reconnection
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

        this.send(ws, { type: "game_joined", gameId, owner, phase: game.phase });

        // Notify other player
        this.broadcastToGame(game, { type: "player_reconnected", gameId }, owner);

        // Send current state
        this.sendVisibleState(game, owner);

        console.log(`Player ${owner} reconnected to game ${gameId}`);
        return;
      }
    }

    // New player joining
    if (game.phase !== "lobby") {
      this.send(ws, { type: "error", message: "Game already in progress" });
      return;
    }

    if (game.players.size >= 2) {
      this.send(ws, { type: "error", message: "Game is full" });
      return;
    }

    game.players.set(Owner.Player2, ws);
    this.playerConnections.set(ws, { ws, owner: Owner.Player2, gameId });

    // Initial vision scan for player 2
    const p2City = game.state.cities.find((c) => c.owner === Owner.Player2);
    if (p2City) {
      scan(game.state, Owner.Player2, p2City.loc);
    }

    this.send(ws, { type: "game_joined", gameId, owner: Owner.Player2, phase: game.phase });

    // Start the game
    this.startGame(game);
  }

  // ─── Start Game ─────────────────────────────────────────────────────────

  private startGame(game: ActiveGame): void {
    game.phase = "playing";

    // Notify both players
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
    actions.push(action);
  }

  // ─── Validate Action ───────────────────────────────────────────────────

  private validateAction(state: GameState, owner: Owner, action: PlayerAction): boolean {
    switch (action.type) {
      case "move":
      case "attack":
      case "setBehavior":
      case "embark":
      case "disembark": {
        const unit = state.units.find((u) => u.id === action.unitId);
        return !!unit && unit.owner === owner;
      }
      case "setProduction": {
        const city = state.cities.find((c) => c.id === action.cityId);
        return !!city && city.owner === owner;
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

    // Check if both players have ended their turn
    if (game.turnEnded.has(Owner.Player1) && game.turnEnded.has(Owner.Player2)) {
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
    game.turnEnded.add(Owner.Player1);
    game.turnEnded.add(Owner.Player2);
    this.executeTurn(game);
  }

  // ─── Execute Turn ───────────────────────────────────────────────────────

  private executeTurn(game: ActiveGame): void {
    const p1Actions = game.pendingActions.get(Owner.Player1) || [];
    const p2Actions = game.pendingActions.get(Owner.Player2) || [];

    const result: TurnResult = executeTurn(game.state, p1Actions, p2Actions);

    // Broadcast turn result
    for (const [owner, ws] of game.players) {
      if (ws) {
        // Filter events: only send events the player can see
        const visibleEvents = result.events.filter((e) => {
          const viewMap = game.state.viewMaps[owner];
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
            winner: result.winner,
            winType: result.winType!,
          });
        }
      }
      // Persist completed game
      this.persistGame(game);
      console.log(`Game ${game.id} over: Player ${result.winner} wins by ${result.winType}`);
      return;
    }

    // Reset turn state
    game.pendingActions.set(Owner.Player1, []);
    game.pendingActions.set(Owner.Player2, []);
    game.turnEnded.clear();

    // Autosave after each turn
    this.persistGame(game);

    // Send updated visible state to each player
    for (const [owner] of game.players) {
      this.sendVisibleState(game, owner);
    }
  }

  // ─── Visible State ──────────────────────────────────────────────────────

  private getVisibleState(game: ActiveGame, owner: Owner): VisibleGameState {
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
      owner,
      viewMap: [...viewMap], // shallow copy
      cities: visibleCities,
      units: visibleUnits,
      config: state.config,
    };
  }

  private sendVisibleState(game: ActiveGame, owner: Owner): void {
    const ws = game.players.get(owner);
    if (!ws) return;

    const visibleState = this.getVisibleState(game, owner);
    this.send(ws, { type: "state_update", gameId: game.id, state: visibleState });
  }

  // ─── Disconnect Handling ────────────────────────────────────────────────

  private handleDisconnect(ws: WebSocket): void {
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

    // Notify other player
    this.broadcastToGame(game, { type: "player_disconnected", gameId: game.id }, conn.owner);

    // Set reconnection timeout
    const timer = setTimeout(() => {
      // If both players are gone, persist and clean up
      const allDisconnected = [...game.players.values()].every((ws) => ws === null);
      if (allDisconnected) {
        this.persistGame(game);
        this.games.delete(game.id);
        console.log(`Game ${game.id} saved and removed (all players disconnected)`);
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

  private broadcastToGame(game: ActiveGame, msg: ServerMessage, excludeOwner?: Owner): void {
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

    const game: ActiveGame = {
      id: gameId,
      phase: saved.phase,
      state: saved.state,
      players: new Map([
        [Owner.Player1, null],
        [Owner.Player2, null],
      ]),
      pendingActions: new Map([
        [Owner.Player1, []],
        [Owner.Player2, []],
      ]),
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
}
