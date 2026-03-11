// Empire Reborn — Client-Side Interfaces

import type { Owner, UnitType, TerrainType, DepositType } from "@empire/shared";
import type { Loc, UnitState, CityState, DepositState, TurnEvent, PlayerAction } from "@empire/shared";

// ─── Renderable State ───────────────────────────────────────────────────────

/** A tile ready for rendering (combines ground truth terrain + view map info). */
export interface RenderableTile {
  terrain: TerrainType;
  seen: number;         // turn last seen (-1 = never)
  cityOwner: Owner | null;
  depositType: DepositType | null;  // null if no deposit or not seen
  depositOwner: Owner | null;       // who controls the deposit
  depositComplete: boolean;         // true if building built on deposit
}

/** A city visible to the player. */
export interface RenderableCity {
  id: number;
  loc: Loc;
  owner: Owner;
  production: UnitType | null;
}

/** Everything the renderer needs to draw one frame. */
export interface RenderableState {
  turn: number;
  tiles: RenderableTile[];
  cities: RenderableCity[];
  units: UnitState[];
  deposits: DepositState[];
  resources: number[];        // player's [ore, oil, textile]
  mapWidth: number;
  mapHeight: number;
  owner: Owner;
  crownCityLocs: Set<number>; // locations of crown cities (for minimap/tilemap rendering)
}

// ─── Selection State ────────────────────────────────────────────────────────

export interface SelectionState {
  selectedUnitId: number | null;
  selectedCityId: number | null;
  hoveredTile: { row: number; col: number } | null;
}

// ─── UI State ───────────────────────────────────────────────────────────────

/** High-level UI state built each frame for the HTML overlay. */
export interface UIState {
  turn: number;
  owner: Owner;
  playerCityCount: number;
  playerUnitCount: number;
  enemyCityCount: number;
  /** Count of player units by UnitType index */
  unitCountsByType: number[];
  selectedUnit: UnitState | null;
  selectedCity: CityState | null;
  pendingActionCount: number;
  events: TurnEvent[];
  isGameOver: boolean;
  winner: Owner | null;
  resources: number[];  // player's [ore, oil, textile]
  resourceIncome: number[];  // per-turn income [ore, oil, textile]
  techResearch: number[];  // player's [science, health, electronics, war]
}

// ─── Tile Highlights ────────────────────────────────────────────────────

export interface TileHighlight {
  loc: Loc;
  type: "move" | "attack";
}

// ─── Asset Bundle ───────────────────────────────────────────────────────────

import type { Texture } from "pixi.js";

export interface AssetBundle {
  terrain: {
    land: Texture;
    sea: Texture;
    seaDeep: Texture;
    seaCoastal: Texture;
    seaShore: Texture;
    shoreFoam: Texture;
    cityNeutral: Texture;
    cityPlayer1: Texture;
    cityPlayer2: Texture;
  };
  fog: Texture;
  selection: Texture;
  hover: Texture;
  moveHighlight: Texture;
  attackHighlight: Texture;
  units: Map<string, Texture>;
  deposits: Map<string, Texture>;  // "ore", "oil", "textile"
  cityTextures?: Map<number, Texture>;  // owner ID → city texture (N-player)
}
