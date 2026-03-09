// Empire Reborn — WebSocket Message Protocol

import type { Owner, UnitType, UnitBehavior, Loc } from "@empire/shared";
import type { ViewMapCell, CityState, UnitState, TurnEvent, GameConfig } from "@empire/shared";

// ─── Game Phases ────────────────────────────────────────────────────────────

export type GamePhase = "lobby" | "playing" | "game_over";

// ─── Client → Server Messages ───────────────────────────────────────────────

export type ClientMessage =
  | { type: "create_game"; config?: Partial<GameConfig> }
  | { type: "join_game"; gameId: string }
  | { type: "action"; gameId: string; action: ClientAction }
  | { type: "end_turn"; gameId: string }
  | { type: "resign"; gameId: string };

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
  | { type: "error"; message: string };

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
