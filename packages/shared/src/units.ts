// Empire Reborn — Unit Attributes
// Ported from VMS-Empire data.c piece_attr[]

import { INFINITY, UnitType, TerrainType, NUM_RESOURCE_TYPES } from "./constants.js";

// ─── Unit Attributes Interface ───────────────────────────────────────────────

export interface UnitAttributes {
  type: UnitType;
  char: string;          // single-char identifier (A, F, P, D, S, T, C, B, Z, E, R, X, W, M, G)
  name: string;          // full name
  nickname: string;      // short name
  article: string;       // name with article
  plural: string;        // plural name
  terrain: string;       // terrain the unit can traverse ("+" land, "." water, ".+" both)
  buildTime: number;     // turns to produce
  strength: number;      // attack strength
  maxHits: number;       // hit points when fully repaired
  speed: number;         // squares moved per turn
  capacity: number;      // max cargo (0 = no cargo)
  range: number;         // movement range (INFINITY = unlimited)
  attackRange: number;   // bombard range (0 = melee only, >0 = ranged)
  visionRadius: number;  // extra vision beyond default 1-tile (0 = standard)
  invisible: boolean;    // true if unit is invisible until adjacent to enemy
}

// ─── Unit Attribute Data ─────────────────────────────────────────────────────

export const UNIT_ATTRIBUTES: readonly UnitAttributes[] = [
  {
    type: UnitType.Army, char: "A", name: "army", nickname: "army",
    article: "an army", plural: "armies", terrain: "+",
    buildTime: 5, strength: 1, maxHits: 1, speed: 1, capacity: 0, range: INFINITY,
    attackRange: 0, visionRadius: 0, invisible: false,
  },
  {
    type: UnitType.Fighter, char: "F", name: "fighter", nickname: "fighter",
    article: "a fighter", plural: "fighters", terrain: ".+",
    buildTime: 10, strength: 1, maxHits: 1, speed: 8, capacity: 0, range: 32,
    attackRange: 0, visionRadius: 0, invisible: false,
  },
  {
    type: UnitType.Patrol, char: "P", name: "patrol boat", nickname: "patrol",
    article: "a patrol boat", plural: "patrol boats", terrain: ".",
    buildTime: 15, strength: 1, maxHits: 1, speed: 4, capacity: 0, range: INFINITY,
    attackRange: 0, visionRadius: 0, invisible: false,
  },
  {
    type: UnitType.Destroyer, char: "D", name: "destroyer", nickname: "destroyer",
    article: "a destroyer", plural: "destroyers", terrain: ".",
    buildTime: 20, strength: 1, maxHits: 3, speed: 2, capacity: 0, range: INFINITY,
    attackRange: 0, visionRadius: 0, invisible: false,
  },
  {
    type: UnitType.Submarine, char: "S", name: "submarine", nickname: "submarine",
    article: "a submarine", plural: "submarines", terrain: ".",
    buildTime: 20, strength: 3, maxHits: 2, speed: 2, capacity: 0, range: INFINITY,
    attackRange: 0, visionRadius: 0, invisible: false,
  },
  {
    type: UnitType.Transport, char: "T", name: "troop transport", nickname: "transport",
    article: "a troop transport", plural: "troop transports", terrain: ".",
    buildTime: 30, strength: 1, maxHits: 1, speed: 2, capacity: 6, range: INFINITY,
    attackRange: 0, visionRadius: 0, invisible: false,
  },
  {
    type: UnitType.Carrier, char: "C", name: "aircraft carrier", nickname: "carrier",
    article: "an aircraft carrier", plural: "aircraft carriers", terrain: ".",
    buildTime: 30, strength: 1, maxHits: 8, speed: 2, capacity: 8, range: INFINITY,
    attackRange: 0, visionRadius: 0, invisible: false,
  },
  {
    type: UnitType.Battleship, char: "B", name: "battleship", nickname: "battleship",
    article: "a battleship", plural: "battleships", terrain: ".",
    buildTime: 40, strength: 2, maxHits: 10, speed: 2, capacity: 0, range: INFINITY,
    attackRange: 0, visionRadius: 0, invisible: false,
  },
  {
    type: UnitType.Satellite, char: "Z", name: "satellite", nickname: "satellite",
    article: "a satellite", plural: "satellites", terrain: ".+",
    buildTime: 50, strength: 0, maxHits: 1, speed: 10, capacity: 0, range: 500,
    attackRange: 0, visionRadius: 0, invisible: false,
  },
  {
    type: UnitType.Construction, char: "E", name: "construction unit", nickname: "engineer",
    article: "a construction unit", plural: "construction units", terrain: "+",
    buildTime: 10, strength: 0, maxHits: 1, speed: 1, capacity: 0, range: INFINITY,
    attackRange: 0, visionRadius: 0, invisible: false,
  },
  {
    type: UnitType.Artillery, char: "R", name: "artillery", nickname: "artillery",
    article: "an artillery", plural: "artillery", terrain: "+",
    buildTime: 20, strength: 3, maxHits: 2, speed: 1, capacity: 0, range: INFINITY,
    attackRange: 2, visionRadius: 0, invisible: false,
  },
  {
    type: UnitType.SpecialForces, char: "X", name: "special forces", nickname: "spec ops",
    article: "a special forces", plural: "special forces", terrain: "+",
    buildTime: 15, strength: 2, maxHits: 1, speed: 2, capacity: 0, range: INFINITY,
    attackRange: 0, visionRadius: 0, invisible: true,
  },
  {
    type: UnitType.AWACS, char: "W", name: "AWACS", nickname: "AWACS",
    article: "an AWACS", plural: "AWACS", terrain: ".+",
    buildTime: 20, strength: 0, maxHits: 1, speed: 6, capacity: 0, range: 48,
    attackRange: 0, visionRadius: 5, invisible: false,
  },
  {
    type: UnitType.MissileCruiser, char: "M", name: "missile cruiser", nickname: "cruiser",
    article: "a missile cruiser", plural: "missile cruisers", terrain: ".",
    buildTime: 40, strength: 4, maxHits: 6, speed: 2, capacity: 0, range: INFINITY,
    attackRange: 3, visionRadius: 0, invisible: false,
  },
  {
    type: UnitType.EngineerBoat, char: "G", name: "engineer boat", nickname: "engineer",
    article: "an engineer boat", plural: "engineer boats", terrain: ".",
    buildTime: 15, strength: 0, maxHits: 1, speed: 2, capacity: 0, range: INFINITY,
    attackRange: 0, visionRadius: 0, invisible: false,
  },
] as const;

// ─── Unit Resource Costs ─────────────────────────────────────────────────────

/** Resource cost to produce each unit type: [ore, oil, textile] */
export const UNIT_COSTS: readonly (readonly [number, number, number])[] = [
  [5,  0,  5],   // Army
  [15, 10, 0],   // Fighter
  [10, 5,  0],   // Patrol
  [20, 10, 0],   // Destroyer
  [25, 15, 0],   // Submarine
  [15, 10, 5],   // Transport
  [30, 20, 5],   // Carrier
  [40, 25, 0],   // Battleship
  [20, 5,  10],  // Satellite
  [10, 0,  5],   // Construction
  [25, 10, 0],   // Artillery
  [15, 5,  10],  // Special Forces
  [20, 15, 0],   // AWACS
  [35, 30, 0],   // Missile Cruiser
  [15, 5,  5],   // Engineer Boat
] as const;

/** Get resource cost for a unit type */
export function getUnitCost(type: UnitType): readonly [number, number, number] {
  return UNIT_COSTS[type];
}

/** Check if player can afford a unit (resources >= cost for all 3 types) */
export function canAffordUnit(resources: readonly number[], type: UnitType): boolean {
  const cost = UNIT_COSTS[type];
  for (let i = 0; i < NUM_RESOURCE_TYPES; i++) {
    if (resources[i] < cost[i]) return false;
  }
  return true;
}

// ─── Attack Target Lists ─────────────────────────────────────────────────────

/** What a transport can attack when adjacent */
export const TT_ATTACK = "T";

/** What an army can attack when adjacent (O=unowned city) */
export const ARMY_ATTACK = "O*TACFBSDPEXRG";

/** What a fighter can attack when adjacent */
export const FIGHTER_ATTACK = "TCFBSDPAEXRMG";

/** What a ship can attack when adjacent */
export const SHIP_ATTACK = "TCBSDPMG";

/** What special forces can attack when adjacent (same as army) */
export const SPEC_FORCES_ATTACK = "O*TACFBSDPERG";

/** What a missile cruiser can attack when adjacent */
export const MISSILE_CRUISER_ATTACK = "TCBSDPMG";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Get attributes for a unit type. */
export function getUnitAttributes(type: UnitType): UnitAttributes {
  return UNIT_ATTRIBUTES[type];
}

/** Check if a unit can traverse the given terrain. */
export function canTraverse(type: UnitType, terrain: TerrainType): boolean {
  const attrs = UNIT_ATTRIBUTES[type];
  if (terrain === TerrainType.City) return true; // all units can be in cities
  return attrs.terrain.includes(terrain);
}
