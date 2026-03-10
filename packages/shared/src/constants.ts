// Empire Reborn — Core Constants
// Ported from VMS-Empire (empire.h, data.c, extern.h)

// ─── Map Constants (mutable — call configureMapDimensions before game start) ─

export let MAP_WIDTH = 100;
export let MAP_HEIGHT = 60;
export let MAP_SIZE = MAP_WIDTH * MAP_HEIGHT;

// NUM_CITY formula from original: ((100 * (MAP_WIDTH + MAP_HEIGHT)) / 228)
export let NUM_CITY = Math.floor((100 * (MAP_WIDTH + MAP_HEIGHT)) / 228); // 70

export const LIST_SIZE = 5000; // max pieces on board

export const INFINITY = 10_000_000;

// ─── Directions ──────────────────────────────────────────────────────────────

export enum Direction {
  North = 0,
  NorthEast = 1,
  East = 2,
  SouthEast = 3,
  South = 4,
  SouthWest = 5,
  West = 6,
  NorthWest = 7,
}

/** Offset to add to a flat-array location to move in each direction. */
export let DIR_OFFSET: readonly number[] = [
  -MAP_WIDTH,     // North
  -MAP_WIDTH + 1, // NorthEast
  1,              // East
  MAP_WIDTH + 1,  // SouthEast
  MAP_WIDTH,      // South
  MAP_WIDTH - 1,  // SouthWest
  -1,             // West
  -MAP_WIDTH - 1, // NorthWest
] as const;

/**
 * Reconfigure map dimensions. Must be called before generating a map.
 * Updates all derived constants (MAP_SIZE, NUM_CITY, DIR_OFFSET, sectors).
 */
export function configureMapDimensions(width: number, height: number): void {
  MAP_WIDTH = width;
  MAP_HEIGHT = height;
  MAP_SIZE = width * height;
  NUM_CITY = Math.floor((100 * (width + height)) / 228);
  DIR_OFFSET = [
    -width,     // North
    -width + 1, // NorthEast
    1,          // East
    width + 1,  // SouthEast
    width,      // South
    width - 1,  // SouthWest
    -1,         // West
    -width - 1, // NorthWest
  ];
  ROWS_PER_SECTOR = Math.ceil(height / SECTOR_ROWS);
  COLS_PER_SECTOR = Math.ceil(width / SECTOR_COLS);
}

// ─── Ownership ───────────────────────────────────────────────────────────────

export enum Owner {
  Unowned = 0,
  Player1 = 1, // "USER" in original
  Player2 = 2, // "COMP" in original
}

// ─── Terrain ─────────────────────────────────────────────────────────────────

export enum TerrainType {
  Land = "+",
  Sea = ".",
  City = "*",
}

/** Terrain flags for pathfinding */
export enum TerrainFlag {
  Unknown = 0,
  Path = 1,
  Land = 2,
  Water = 4,
  Air = Land | Water, // 6
}

// ─── Unit Types ──────────────────────────────────────────────────────────────

export enum UnitType {
  Army = 0,
  Fighter = 1,
  Patrol = 2,
  Destroyer = 3,
  Submarine = 4,
  Transport = 5,
  Carrier = 6,
  Battleship = 7,
  Satellite = 8,
}

export const NUM_UNIT_TYPES = 9;

export const UNIT_TYPE_CHARS = "AFPDSTCBZ";

// ─── Unit Behaviors ──────────────────────────────────────────────────────────

export enum UnitBehavior {
  None = -1,
  Random = -2,
  Sentry = -3,
  Fill = -4,
  Land = -5,
  Explore = -6,
  ArmyLoad = -7,
  ArmyAttack = -8,
  TransportLoad = -9,
  Repair = -10,
  WaitForTransport = -11,
  GoTo = -20,
  Aggressive = -21,
  Cautious = -22,
  MoveN = -12,
  MoveNE = -13,
  MoveE = -14,
  MoveSE = -15,
  MoveS = -16,
  MoveSW = -17,
  MoveW = -18,
  MoveNW = -19,
}

export const BEHAVIOR_NAMES = [
  "none", "random", "sentry", "fill", "land",
  "explore", "load", "attack", "load", "repair",
  "wait:transport", "W", "E", "D", "C",
  "X", "Z", "A", "Q",
  "goto", "aggressive", "cautious",
] as const;

/** Convert behavior enum to index into BEHAVIOR_NAMES */
export function behaviorIndex(behavior: UnitBehavior): number {
  return -behavior - 1;
}

/** Convert directional behavior to a Direction */
export function behaviorToDirection(behavior: UnitBehavior): Direction {
  return -behavior + UnitBehavior.MoveN;
}

// ─── Sector Constants ────────────────────────────────────────────────────────

export const SECTOR_ROWS = 5;
export const SECTOR_COLS = 2;
export const NUM_SECTORS = SECTOR_ROWS * SECTOR_COLS;
export let ROWS_PER_SECTOR = Math.ceil(MAP_HEIGHT / SECTOR_ROWS); // 12
export let COLS_PER_SECTOR = Math.ceil(MAP_WIDTH / SECTOR_COLS);  // 50

// ─── Map Generation Defaults ─────────────────────────────────────────────────

export const DEFAULT_SMOOTH = 5;
export const DEFAULT_WATER_RATIO = 70;
export const DEFAULT_MIN_CITY_DIST = 2;

// ─── Move Order ──────────────────────────────────────────────────────────────

/** Order in which pieces should be moved (AI uses this). */
export const MOVE_ORDER: readonly UnitType[] = [
  UnitType.Satellite,
  UnitType.Transport,
  UnitType.Carrier,
  UnitType.Battleship,
  UnitType.Patrol,
  UnitType.Submarine,
  UnitType.Destroyer,
  UnitType.Army,
  UnitType.Fighter,
] as const;

// ─── Map Size Presets ───────────────────────────────────────────────────────

export interface MapSizePreset {
  name: string;
  width: number;
  height: number;
  description: string;
}

export const MAP_SIZE_PRESETS: readonly MapSizePreset[] = [
  { name: "Small",    width: 60,  height: 40,  description: "Quick game (~30 min)" },
  { name: "Standard", width: 100, height: 60,  description: "Classic size (~1 hr)" },
  { name: "Large",    width: 150, height: 90,  description: "Epic battles (~2 hr)" },
  { name: "Huge",     width: 200, height: 120, description: "Marathon (~3+ hr)" },
] as const;

// ─── Terrain Presets ────────────────────────────────────────────────────────

export interface TerrainPreset {
  name: string;
  waterRatio: number;
  smoothPasses: number;
  description: string;
}

export const TERRAIN_PRESETS: readonly TerrainPreset[] = [
  { name: "Continents",  waterRatio: 70, smoothPasses: 5, description: "Large landmasses with oceans" },
  { name: "Pangaea",     waterRatio: 45, smoothPasses: 8, description: "One huge continent, coastal seas" },
  { name: "Archipelago", waterRatio: 80, smoothPasses: 2, description: "Many small scattered islands" },
  { name: "Islands",     waterRatio: 75, smoothPasses: 3, description: "Medium islands, open water" },
] as const;
