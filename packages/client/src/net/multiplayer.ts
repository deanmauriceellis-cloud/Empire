// Empire Reborn — Multiplayer Game Manager
// Manages multiplayer game state, dispatches actions to server, receives state updates.

import {
  Owner,
  UnitBehavior,
  UnitType,
  Direction,
  DIR_OFFSET,
  locRow,
  locCol,
  configureMapDimensions,
  type Loc,
  type TurnEvent,
  type VisibleGameState,
  type VisibleCity,
  type ServerMessage,
  type ClientAction,
  type GamePhase,
} from "@empire/shared";
import type { Connection } from "./connection.js";
import type { RenderableState, RenderableTile } from "../types.js";

// ─── Lobby Game Info ─────────────────────────────────────────────────────────

export interface LobbyGame {
  id: string;
  phase: GamePhase;
  players: number;
  turn: number;
  createdAt: number;
}

// ─── Multiplayer Events ──────────────────────────────────────────────────────

export interface MultiplayerEvents {
  onGameCreated: (gameId: string, owner: Owner) => void;
  onGameJoined: (gameId: string, owner: Owner, phase: GamePhase) => void;
  onGameStarted: (gameId: string) => void;
  onStateUpdate: (state: VisibleGameState) => void;
  onTurnResult: (turn: number, events: TurnEvent[]) => void;
  onGameOver: (winner: Owner, winType: "elimination" | "resignation") => void;
  onPlayerDisconnected: () => void;
  onPlayerReconnected: () => void;
  onError: (message: string) => void;
}

// ─── Multiplayer Game ────────────────────────────────────────────────────────

export interface MultiplayerGame {
  /** Current visible state from server, or null if not yet received. */
  readonly visibleState: VisibleGameState | null;
  /** Our player owner assignment. */
  readonly owner: Owner | null;
  /** Current game ID. */
  readonly gameId: string | null;
  /** Whether the game is actively playing. */
  readonly isPlaying: boolean;
  /** Whether game is over. */
  readonly isGameOver: boolean;
  /** Winner if game over. */
  readonly winner: Owner | null;
  /** Events from the latest turn result. */
  readonly turnEvents: ReadonlyArray<TurnEvent>;

  /** Create a new multiplayer game on the server. */
  createGame(options?: { mapSize: { width: number; height: number }; terrain: { waterRatio: number; smoothPasses: number; mapType?: string } }): void;
  /** Join an existing game by ID. */
  joinGame(gameId: string): void;
  /** Send a move action to the server. */
  moveUnit(unitId: number, direction: Direction): void;
  /** Send an attack action to the server. */
  attackTarget(unitId: number, targetLoc: Loc): void;
  /** Send a set production action. */
  setProduction(cityId: number, unitType: UnitType): void;
  /** Send a set behavior action. */
  setBehavior(unitId: number, behavior: UnitBehavior): void;
  /** End turn. */
  endTurn(): void;
  /** Resign. */
  resign(): void;
  /** Build RenderableState from current visible state. */
  buildRenderableState(): RenderableState | null;
  /** Handle an incoming server message. */
  handleMessage(msg: ServerMessage): void;
  /** Reset state (for returning to menu). */
  reset(): void;
}

export function createMultiplayerGame(
  conn: Connection,
  events: MultiplayerEvents,
): MultiplayerGame {
  let visibleState: VisibleGameState | null = null;
  let owner: Owner | null = null;
  let gameId: string | null = null;
  let isPlaying = false;
  let isGameOver = false;
  let winner: Owner | null = null;
  let turnEvents: TurnEvent[] = [];

  function sendAction(action: ClientAction): void {
    if (!gameId) return;
    conn.send({ type: "action", gameId, action });
  }

  return {
    get visibleState() { return visibleState; },
    get owner() { return owner; },
    get gameId() { return gameId; },
    get isPlaying() { return isPlaying; },
    get isGameOver() { return isGameOver; },
    get winner() { return winner; },
    get turnEvents() { return turnEvents; },

    createGame(options?: { mapSize: { width: number; height: number }; terrain: { waterRatio: number; smoothPasses: number; mapType?: string } }): void {
      if (options) {
        const config: Record<string, unknown> = {
            mapWidth: options.mapSize.width,
            mapHeight: options.mapSize.height,
            waterRatio: options.terrain.waterRatio,
            smoothPasses: options.terrain.smoothPasses,
        };
        if (options.terrain.mapType) {
          config.mapType = options.terrain.mapType;
        }
        conn.send({ type: "create_game", config });
      } else {
        conn.send({ type: "create_game" });
      }
    },

    joinGame(id: string): void {
      conn.send({ type: "join_game", gameId: id });
    },

    moveUnit(unitId: number, direction: Direction): void {
      if (!visibleState) return;
      const unit = visibleState.units.find((u) => u.id === unitId);
      if (!unit) return;
      const targetLoc = unit.loc + DIR_OFFSET[direction];
      sendAction({ type: "move", unitId, loc: targetLoc });
    },

    attackTarget(unitId: number, targetLoc: Loc): void {
      sendAction({ type: "attack", unitId, targetLoc });
    },

    setProduction(cityId: number, unitType: UnitType): void {
      sendAction({ type: "setProduction", cityId, unitType });
    },

    setBehavior(unitId: number, behavior: UnitBehavior): void {
      sendAction({ type: "setBehavior", unitId, behavior });
    },

    endTurn(): void {
      if (!gameId) return;
      conn.send({ type: "end_turn", gameId });
    },

    resign(): void {
      if (!gameId) return;
      conn.send({ type: "resign", gameId });
    },

    buildRenderableState(): RenderableState | null {
      if (!visibleState || owner === null) return null;

      const { viewMap, cities, units, config } = visibleState;
      const mapSize = config.mapWidth * config.mapHeight;

      // Build tiles from view map
      const tiles: RenderableTile[] = new Array(mapSize);
      for (let i = 0; i < mapSize; i++) {
        const view = viewMap[i];
        // Determine terrain from view character
        const terrain = viewCharToTerrain(view.contents);
        const cityOwner = getCityOwner(i, cities);
        tiles[i] = {
          terrain,
          seen: view.seen,
          cityOwner,
          depositType: null,   // TODO: server needs to send deposit data
          depositOwner: null,
          depositComplete: false,
        };
      }

      // Filter units: don't show embarked units
      const visibleUnits = units.filter((u) => u.shipId === null);

      return {
        turn: visibleState.turn,
        tiles,
        cities: cities.map((c) => ({
          id: c.id,
          loc: c.loc,
          owner: c.owner,
          production: c.owner === owner ? c.production : null,
        })),
        units: visibleUnits,
        deposits: [],           // TODO: server needs to send deposit data
        resources: [0, 0, 0],   // TODO: server needs to send resource data
        mapWidth: config.mapWidth,
        mapHeight: config.mapHeight,
        owner,
        crownCityLocs: new Set<number>(), // TODO: server needs to send kingdom data
      };
    },

    handleMessage(msg: ServerMessage): void {
      switch (msg.type) {
        case "game_created":
          gameId = msg.gameId;
          owner = msg.owner;
          events.onGameCreated(msg.gameId, msg.owner);
          break;

        case "game_joined":
          gameId = msg.gameId;
          owner = msg.owner;
          if (msg.phase === "playing") isPlaying = true;
          events.onGameJoined(msg.gameId, msg.owner, msg.phase);
          break;

        case "game_started":
          isPlaying = true;
          events.onGameStarted(msg.gameId);
          break;

        case "state_update":
          visibleState = msg.state;
          turnEvents = []; // clear previous turn events on new state
          // Ensure map dimensions match server's config
          configureMapDimensions(msg.state.config.mapWidth, msg.state.config.mapHeight);
          events.onStateUpdate(msg.state);
          break;

        case "turn_result":
          turnEvents = msg.events;
          events.onTurnResult(msg.turn, msg.events);
          break;

        case "game_over":
          isGameOver = true;
          isPlaying = false;
          winner = msg.winner;
          events.onGameOver(msg.winner, msg.winType);
          break;

        case "player_disconnected":
          events.onPlayerDisconnected();
          break;

        case "player_reconnected":
          events.onPlayerReconnected();
          break;

        case "error":
          events.onError(msg.message);
          break;
      }
    },

    reset(): void {
      visibleState = null;
      owner = null;
      gameId = null;
      isPlaying = false;
      isGameOver = false;
      winner = null;
      turnEvents = [];
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { TerrainType } from "@empire/shared";

/** Convert view cell contents character to a terrain type for rendering. */
function viewCharToTerrain(contents: string): TerrainType {
  switch (contents) {
    case ".": return TerrainType.Sea;
    case "+": return TerrainType.Land;
    case "*": return TerrainType.Land; // city (neutral)
    case "O": return TerrainType.Land; // own city
    case "X": return TerrainType.Land; // enemy city
    case " ": return TerrainType.Sea;  // unseen — default to sea
    default:
      // Unit characters (A, a, F, f, etc.) are on land or sea
      // Upper = own, lower = enemy. The terrain is determined by context.
      // For rendering, we rely on the `seen` field to handle fog.
      return TerrainType.Land;
  }
}

/** Find city owner for a given location. */
function getCityOwner(loc: number, cities: VisibleCity[]): Owner | null {
  const city = cities.find((c) => c.loc === loc);
  return city ? city.owner : null;
}

/** Fetch lobby game list from REST API. */
export async function fetchLobbyGames(baseUrl?: string): Promise<{ active: LobbyGame[]; saved: LobbyGame[] }> {
  const base = baseUrl || "";
  try {
    const res = await fetch(`${base}/api/games`);
    if (!res.ok) return { active: [], saved: [] };
    return await res.json();
  } catch {
    return { active: [], saved: [] };
  }
}
