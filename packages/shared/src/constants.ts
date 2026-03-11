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

/** Numeric player ID. 0 = Unowned/neutral, 1+ = active players. */
export type PlayerId = number;

/** Sentinel for unowned/neutral entities. */
export const UNOWNED: PlayerId = 0;

/**
 * @deprecated Use PlayerId type + UNOWNED constant instead.
 * Kept for backward compatibility during migration.
 */
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
  Construction = 9,
  Artillery = 10,
  SpecialForces = 11,
  AWACS = 12,
  MissileCruiser = 13,
  EngineerBoat = 14,
}

export const NUM_UNIT_TYPES = 15;

export const UNIT_TYPE_CHARS = "AFPDSTCBZERXWMG";

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
  UnitType.AWACS,
  UnitType.Transport,
  UnitType.Carrier,
  UnitType.MissileCruiser,
  UnitType.Battleship,
  UnitType.Patrol,
  UnitType.Submarine,
  UnitType.Destroyer,
  UnitType.EngineerBoat,
  UnitType.Artillery,
  UnitType.Army,
  UnitType.SpecialForces,
  UnitType.Fighter,
  UnitType.Construction,
] as const;

// ─── Resource Types ─────────────────────────────────────────────────────────

export enum ResourceType {
  Ore = 0,
  Oil = 1,
  Textile = 2,
}

export const NUM_RESOURCE_TYPES = 3;

export const RESOURCE_NAMES: readonly string[] = ["Ore", "Oil", "Textile"] as const;

// ─── Deposit Types ──────────────────────────────────────────────────────────

export enum DepositType {
  OreVein = 0,   // found on/near mountains (high terrain)
  OilWell = 1,   // found on lowland (dark pools)
  TextileFarm = 2, // found on fertile grassland
}

export const DEPOSIT_NAMES: readonly string[] = ["Ore Vein", "Oil Well", "Textile Farm"] as const;

/** Which resource each deposit type produces */
export const DEPOSIT_RESOURCE: readonly ResourceType[] = [
  ResourceType.Ore,
  ResourceType.Oil,
  ResourceType.Textile,
] as const;

/** Per-turn income from a completed mine/well/farm on a deposit */
export const DEPOSIT_INCOME = 3;

/** Per-turn passive income per owned city: [ore, oil, textile] */
export const CITY_INCOME: readonly number[] = [2, 1, 2] as const;

// ─── Building Types ───────────────────────────────────────────────────────

export enum BuildingType {
  // Deposit buildings (built by construction unit on deposit tiles)
  Mine = 0,           // on OreVein
  OilWell = 1,        // on OilWell
  TextileFarm = 2,    // on TextileFarm
  // City upgrades (built by construction unit at owned city, max 4 per city)
  University = 3,     // +science/turn
  Hospital = 4,       // +health/turn
  TechLab = 5,        // +electronics/turn
  MilitaryAcademy = 6, // +war research/turn
  Shipyard = 7,       // ship build time reduction
  Airfield = 8,       // fighter range bonus
  // Defensive structures (built by construction unit on land)
  Bunker = 9,         // armies inside get +2 defense, auto-attacks adjacent
  AntiAir = 10,       // attacks fighters/AWACS within 2 tiles
  CoastalBattery = 11, // attacks ships within 2 tiles
  RadarStation = 12,  // 5-tile permanent reveal, detects subs within 3
  ArtilleryFort = 13, // long-range land bombardment, range 3
  Minefield = 14,     // invisible, damages first enemy to enter, single-use
  SAMSite = 15,       // anti-air, 3-tile range
  // Naval structures (built by engineer boat on water)
  Bridge = 16,        // armies cross water, destroyable
  SeaMine = 17,       // invisible, damages first ship, single-use
  OffshorePlatform = 18, // +1 oil/turn, must be adjacent to coast
}

export const NUM_BUILDING_TYPES = 19;

/** First 3 are deposit buildings, rest are city upgrades */
export const DEPOSIT_BUILDING_TYPES: readonly BuildingType[] = [
  BuildingType.Mine, BuildingType.OilWell, BuildingType.TextileFarm,
] as const;

export const CITY_UPGRADE_TYPES: readonly BuildingType[] = [
  BuildingType.University, BuildingType.Hospital, BuildingType.TechLab,
  BuildingType.MilitaryAcademy, BuildingType.Shipyard, BuildingType.Airfield,
] as const;

export const DEFENSIVE_STRUCTURE_TYPES: readonly BuildingType[] = [
  BuildingType.Bunker, BuildingType.AntiAir, BuildingType.CoastalBattery,
  BuildingType.RadarStation, BuildingType.ArtilleryFort, BuildingType.Minefield,
  BuildingType.SAMSite,
] as const;

export const NAVAL_STRUCTURE_TYPES: readonly BuildingType[] = [
  BuildingType.Bridge, BuildingType.SeaMine, BuildingType.OffshorePlatform,
] as const;

export const BUILDING_NAMES: readonly string[] = [
  "Mine", "Oil Well", "Textile Farm",
  "University", "Hospital", "Tech Lab",
  "Military Academy", "Shipyard", "Airfield",
  "Bunker", "Anti-Air Battery", "Coastal Battery",
  "Radar Station", "Artillery Fort", "Minefield",
  "SAM Site", "Bridge", "Sea Mine", "Offshore Platform",
] as const;

/** Max upgrade slots per city */
export const MAX_CITY_UPGRADES = 4;

// ─── Tech Research Types ─────────────────────────────────────────────────

export enum TechType {
  Science = 0,
  Health = 1,
  Electronics = 2,
  War = 3,
}

export const NUM_TECH_TYPES = 4;

export const TECH_NAMES: readonly string[] = [
  "Science", "Health", "Electronics", "War Research",
] as const;

// ─── Starting Resources ────────────────────────────────────────────────────

export const STARTING_ORE = 150;
export const STARTING_OIL = 100;
export const STARTING_TEXTILE = 150;

// ─── Kingdom Constants ────────────────────────────────────────────────────

/** Default tribute rate (30% of income paid to overlord). */
export const TRIBUTE_RATE = 0.3;

/** Crown city production speed bonus (50% faster — work ticks 1.5x). */
export const CROWN_PRODUCTION_BONUS = 0.5;

/** Crown city defense bonus (+3 effective strength for defenders in crown city). */
export const CROWN_DEFENSE_BONUS = 3;

/** Crown city healing bonus (+2 HP per turn for units in the crown city). */
export const CROWN_HEAL_BONUS = 2;

/** Crown city permanent vision radius (tiles). */
export const CROWN_VISION_RADIUS = 4;

/** Crown city garrison bonus (attacker strength penalty when attacking a crown). */
export const CROWN_GARRISON_BONUS = 5;

/** Cooldown in turns before a player can relocate their crown city. */
export const CROWN_RELOCATE_COOLDOWN = 50;

// ─── Shield Constants ─────────────────────────────────────────────────────

/** Maximum shield charge in milliseconds (8 hours). */
export const SHIELD_MAX_MS = 8 * 60 * 60 * 1000;

/** Initial shield charge for new players (2 hours). */
export const SHIELD_INITIAL_MS = 2 * 60 * 60 * 1000;

/** Shield charge ratio: 1 hour online = 1 hour shield. */
export const SHIELD_CHARGE_RATIO = 1.0;

// ─── Spawn Protection ────────────────────────────────────────────────────────

/** Number of ticks new players are protected from foreign attacks. */
export const SPAWN_PROTECTION_TICKS = 100;

// ─── World Expansion ─────────────────────────────────────────────────────────

/** Maximum world grid radius (5 → 11x11 grid = 121 kingdoms). */
export const WORLD_MAX_RADIUS = 5;

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
  mapType?: string;           // "river" for River War, undefined for standard height-map generation
}

export const TERRAIN_PRESETS: readonly TerrainPreset[] = [
  { name: "Continents",  waterRatio: 70, smoothPasses: 5, description: "Large landmasses with oceans" },
  { name: "Pangaea",     waterRatio: 45, smoothPasses: 8, description: "One huge continent, coastal seas" },
  { name: "Archipelago", waterRatio: 80, smoothPasses: 2, description: "Many small scattered islands" },
  { name: "Islands",     waterRatio: 75, smoothPasses: 3, description: "Medium islands, open water" },
  { name: "River War",   waterRatio: 30, smoothPasses: 5, description: "Two lands split by a great river", mapType: "river" },
] as const;
