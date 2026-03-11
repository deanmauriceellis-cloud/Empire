// Empire Reborn — WebSocket Message Protocol
// Shared between client and server.

import type { Owner, UnitType, UnitBehavior } from "./constants.js";
import type { Loc, ViewMapCell, UnitState, TurnEvent, GameConfig } from "./types.js";
import type { WorldConfig, KingdomTilePos } from "./world-map.js";

// ─── Game Phases ────────────────────────────────────────────────────────────

export type GamePhase = "lobby" | "playing" | "game_over";

// ─── Client → Server Messages ───────────────────────────────────────────────

export type ClientMessage =
  | { type: "create_game"; config?: Partial<GameConfig> }
  | { type: "join_game"; gameId: string }
  | { type: "action"; gameId: string; action: ClientAction }
  | { type: "end_turn"; gameId: string }
  | { type: "resign"; gameId: string }
  // World mode messages
  | { type: "create_world"; config?: Partial<WorldConfig> }
  | { type: "join_world"; worldId: string; preferredRing?: number; playerName?: string }
  | { type: "reconnect_world"; worldId: string; playerId: number }
  | { type: "world_action"; worldId: string; action: ClientAction }
  | { type: "cancel_actions"; worldId: string }
  | { type: "leave_world"; worldId: string }
  | { type: "list_worlds" };

export type ClientAction =
  | { type: "move"; unitId: number; loc: Loc }
  | { type: "attack"; unitId: number; targetLoc: Loc }
  | { type: "setProduction"; cityId: number; unitType: UnitType }
  | { type: "setBehavior"; unitId: number; behavior: UnitBehavior }
  | { type: "embark"; unitId: number; shipId: number }
  | { type: "disembark"; unitId: number };

// ─── Server → Client Messages ───────────────────────────────────────────────

export type ServerMessage =
  | { type: "welcome"; version: string }
  | { type: "game_created"; gameId: string; owner: Owner }
  | { type: "game_joined"; gameId: string; owner: Owner; phase: GamePhase }
  | { type: "game_started"; gameId: string }
  | { type: "state_update"; gameId: string; state: VisibleGameState }
  | { type: "turn_result"; gameId: string; turn: number; events: TurnEvent[] }
  | { type: "game_over"; gameId: string; winner: Owner; winType: "elimination" | "resignation" }
  | { type: "player_disconnected"; gameId: string }
  | { type: "player_reconnected"; gameId: string }
  | { type: "error"; message: string }
  // World mode messages
  | { type: "world_created"; worldId: string }
  | { type: "world_joined"; worldId: string; owner: Owner; kingdom: KingdomTilePos }
  | { type: "world_state"; worldId: string; state: VisibleGameState; tickInfo: TickInfo }
  | { type: "tick_result"; worldId: string; turn: number; events: TurnEvent[]; tickInfo: TickInfo }
  | { type: "actions_queued"; worldId: string; count: number }
  | { type: "actions_cancelled"; worldId: string }
  | { type: "world_list"; worlds: WorldSummary[] }
  | { type: "reconnect_failed"; worldId: string; reason: string };

// ─── Visible Game State (per-player, fog-of-war filtered) ───────────────────

export interface VisibleGameState {
  turn: number;
  phase: GamePhase;
  owner: Owner;                    // which player this state is for
  viewMap: ViewMapCell[];          // player's fog-of-war view
  cities: VisibleCity[];           // cities visible to this player
  units: UnitState[];              // units visible to this player
  config: GameConfig;
}

export interface VisibleCity {
  id: number;
  loc: Loc;
  owner: Owner;
  production: UnitType | null;     // null if enemy city (hidden)
  work: number | null;             // null if enemy city (hidden)
}

// ─── World Mode Types ──────────────────────────────────────────────────────

/** Tick timing info sent to clients. */
export interface TickInfo {
  /** Current turn number. */
  turn: number;
  /** Milliseconds until next tick. */
  nextTickMs: number;
  /** Tick interval in milliseconds. */
  tickIntervalMs: number;
  /** Seconds remaining in the season. */
  seasonRemainingS: number;
  /** Milliseconds of shield remaining for this player (undefined if no shield). */
  shieldRemainingMs?: number;
  /** Number of actions currently queued for this player. */
  actionsQueued?: number;
}

/** Summary of a world for the world list. */
export interface WorldSummary {
  id: string;
  /** Number of human players currently connected. */
  humanPlayers: number;
  /** Total kingdoms (AI + human). */
  totalKingdoms: number;
  /** Current turn. */
  turn: number;
  /** Tick interval. */
  tickIntervalMs: number;
  /** Seconds remaining in the season. */
  seasonRemainingS: number;
}
