// Empire Reborn — Core Game State Interfaces

import type { Owner, UnitType, UnitBehavior, TerrainType, DepositType } from "./constants.js";

// ─── Coordinates ─────────────────────────────────────────────────────────────

/** A flat-array index into the map (row * MAP_WIDTH + col). */
export type Loc = number;

/** Row/col coordinate pair. */
export interface Position {
  row: number;
  col: number;
}

// ─── Map Cells ───────────────────────────────────────────────────────────────

/** A cell of the actual (ground truth) map. */
export interface MapCell {
  terrain: TerrainType;
  onBoard: boolean;
  cityId: number | null;     // index into cities array, or null
  depositId: number | null;  // index into deposits array, or null
}

/** A cell of a player's view map. */
export interface ViewMapCell {
  contents: string;  // terrain char, unit char, or city
  seen: number;      // turn number when last updated (-1 = never)
}

// ─── Deposit State ───────────────────────────────────────────────────────────

export interface DepositState {
  id: number;
  loc: Loc;
  type: DepositType;
  owner: Owner;                // who controls it (Unowned until a building is placed)
  buildingComplete: boolean;   // true once a mine/well/farm is built on it
}

// ─── City State ──────────────────────────────────────────────────────────────

export interface CityState {
  id: number;
  loc: Loc;
  owner: Owner;
  production: UnitType;        // what the city is building
  work: number;                // work units accumulated toward current production
  func: UnitBehavior[];        // default behavior for each unit type produced (length 9)
}

// ─── Unit State ──────────────────────────────────────────────────────────────

export interface UnitState {
  id: number;
  type: UnitType;
  owner: Owner;
  loc: Loc;
  hits: number;                // current hit points
  moved: number;               // moves made this turn
  func: UnitBehavior;          // current programmed behavior
  shipId: number | null;       // id of containing ship (if embarked)
  cargoIds: number[];          // ids of cargo units (if this is a transport/carrier)
  range: number;               // remaining range (for fighters/satellites)
  targetLoc: Loc | null;       // navigation waypoint (for GoTo behavior)
  prevLocs?: Loc[];            // recent turn-end locations (transports, max 4, for cross-turn oscillation detection)
}

// ─── Game Config ─────────────────────────────────────────────────────────────

export interface GameConfig {
  mapWidth: number;
  mapHeight: number;
  numCities: number;
  waterRatio: number;          // percentage of map that is water (0-100)
  smoothPasses: number;        // number of height map smoothing passes
  minCityDist: number;         // minimum distance between cities
  seed: number;                // RNG seed for map generation
  mapType?: string;            // map generation type: "standard" (default) or "river"
}

// ─── Game State ──────────────────────────────────────────────────────────────

export interface GameState {
  config: GameConfig;
  turn: number;
  map: MapCell[];              // ground truth map (length = width * height)
  cities: CityState[];
  units: UnitState[];
  nextUnitId: number;
  nextCityId: number;

  // Per-player view maps
  viewMaps: Record<Owner, ViewMapCell[]>;

  // Seedable PRNG state for game logic (combat, satellite directions)
  rngState: number;

  // Economy — resource stockpiles per player [ore, oil, textile]
  resources: Record<Owner, number[]>;

  // Map deposits (ore veins, oil wells, textile farms)
  deposits: DepositState[];
  nextDepositId: number;
}

// ─── Player Actions ──────────────────────────────────────────────────────────

export type PlayerAction =
  | { type: "move"; unitId: number; loc: Loc }
  | { type: "attack"; unitId: number; targetLoc: Loc }
  | { type: "setProduction"; cityId: number; unitType: UnitType }
  | { type: "setBehavior"; unitId: number; behavior: UnitBehavior }
  | { type: "setTarget"; unitId: number; targetLoc: Loc }
  | { type: "embark"; unitId: number; shipId: number }
  | { type: "disembark"; unitId: number }
  | { type: "endTurn" }
  | { type: "resign" };

// ─── Turn Result ─────────────────────────────────────────────────────────────

export interface TurnEvent {
  type: "combat" | "capture" | "production" | "death" | "discovery" | "stall" | "income";
  loc: Loc;
  description: string;
  data?: Record<string, unknown>;
}

export interface TurnResult {
  turn: number;
  events: TurnEvent[];
  winner: Owner | null;        // null if game continues
  winType: "elimination" | "resignation" | null;
}

// ─── Continent Analysis ──────────────────────────────────────────────────────

export interface ScanCounts {
  playerCities: Record<Owner, number>;
  playerUnits: Record<Owner, Record<UnitType, number>>;
  size: number;
  unownedCities: number;
  unexplored: number;
}
