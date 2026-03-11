// Empire Reborn — Tech System
// Phase 6: Tech levels, bonuses, and unlock gating

import {
  TechType,
  NUM_TECH_TYPES,
  UnitType,
  Owner,
} from "./constants.js";
import type { GameState } from "./types.js";

// ─── Tech Thresholds ──────────────────────────────────────────────────────────

/** Cumulative points needed for each tech level (1-5). Level 0 = no tech. */
export const TECH_THRESHOLDS: readonly number[] = [10, 30, 60, 100, 150] as const;
export const MAX_TECH_LEVEL = 5;

/** Get the current tech level (0-5) for a given track based on accumulated points. */
export function getTechLevel(points: number): number {
  for (let i = TECH_THRESHOLDS.length - 1; i >= 0; i--) {
    if (points >= TECH_THRESHOLDS[i]) return i + 1;
  }
  return 0;
}

/** Get all 4 tech levels for a player. Returns [sci, health, elec, war]. */
export function getPlayerTechLevels(state: GameState, owner: Owner): readonly [number, number, number, number] {
  const tech = state.techResearch[owner];
  return [
    getTechLevel(tech[TechType.Science]),
    getTechLevel(tech[TechType.Health]),
    getTechLevel(tech[TechType.Electronics]),
    getTechLevel(tech[TechType.War]),
  ];
}

/** Points needed for next level (0 if already max). */
export function pointsToNextLevel(points: number): number {
  const level = getTechLevel(points);
  if (level >= MAX_TECH_LEVEL) return 0;
  return TECH_THRESHOLDS[level] - points;
}

// ─── Tech Bonuses ─────────────────────────────────────────────────────────────

/** Bonus vision range for a unit based on owner's tech levels. */
export function techVisionBonus(sciLevel: number, elecLevel: number, unitType: UnitType): number {
  let bonus = 0;
  // Science 2: +1 vision range for all units
  if (sciLevel >= 2) bonus += 1;
  // Electronics 1: +1 vision range for ships
  if (elecLevel >= 1) {
    if (unitType === UnitType.Patrol || unitType === UnitType.Destroyer ||
        unitType === UnitType.Submarine || unitType === UnitType.Transport ||
        unitType === UnitType.Carrier || unitType === UnitType.Battleship ||
        unitType === UnitType.MissileCruiser || unitType === UnitType.EngineerBoat) {
      bonus += 1;
    }
  }
  return bonus;
}

/** Bonus max HP for a unit based on owner's health tech level. */
export function techMaxHpBonus(healthLevel: number, unitType: UnitType): number {
  let bonus = 0;
  // Health 2: Army max HP +1 (1→2)
  if (healthLevel >= 2 && unitType === UnitType.Army) bonus += 1;
  // Health 3: All land units +1 max HP (Army, Construction, Artillery, SpecialForces)
  if (healthLevel >= 3) {
    if (unitType === UnitType.Army || unitType === UnitType.Construction ||
        unitType === UnitType.Artillery || unitType === UnitType.SpecialForces) bonus += 1;
  }
  // Health 5: All units +1 max HP
  if (healthLevel >= 5) bonus += 1;
  return bonus;
}

/** Bonus strength for a unit based on owner's war tech level. */
export function techStrengthBonus(warLevel: number, unitType: UnitType): number {
  let bonus = 0;
  // War 1: Army strength +1 (1→2)
  if (warLevel >= 1 && unitType === UnitType.Army) bonus += 1;
  // War 2: All ship strength +1
  if (warLevel >= 2) {
    if (unitType === UnitType.Patrol || unitType === UnitType.Destroyer ||
        unitType === UnitType.Submarine || unitType === UnitType.Transport ||
        unitType === UnitType.Carrier || unitType === UnitType.Battleship ||
        unitType === UnitType.MissileCruiser || unitType === UnitType.EngineerBoat) {
      bonus += 1;
    }
  }
  // War 3: Fighter strength +1 (1→2)
  if (warLevel >= 3 && unitType === UnitType.Fighter) bonus += 1;
  // War 4: All units +1 strength
  if (warLevel >= 4) bonus += 1;
  // War 5: All units +1 strength (cumulative with War 4)
  if (warLevel >= 5) bonus += 1;
  return bonus;
}

/** City healing rate (HP per turn) for units in own cities. */
export function techCityHealRate(healthLevel: number): number {
  // Default: 1 HP/turn in own city
  // Health 1: 2 HP/turn in own cities
  return healthLevel >= 1 ? 2 : 1;
}

/** Whether ships heal 1 HP/turn at sea (Health 4). */
export function techShipsHealAtSea(healthLevel: number): boolean {
  return healthLevel >= 4;
}

/** Bonus fighter range from Electronics 3. */
export function techFighterRangeBonus(elecLevel: number): number {
  // Electronics 3: +2 fighter range (applied additively when refueled)
  return elecLevel >= 3 ? 2 : 0;
}

/** Bonus satellite range from Electronics 4. */
export function techSatelliteRangeBonus(elecLevel: number): number {
  // Electronics 4: +100 satellite range
  return elecLevel >= 4 ? 100 : 0;
}

/** Construction unit speed bonus from Science 4. */
export function techConstructionSpeedBonus(sciLevel: number): number {
  return sciLevel >= 4 ? 1 : 0;
}

// ─── Unit Unlock Gating ───────────────────────────────────────────────────────

/** Tech requirements for unit production. Returns null if always available. */
export interface TechRequirement {
  track: TechType;
  level: number;
}

/** Unit tech requirements (only for units that require tech). */
export const UNIT_TECH_REQUIREMENTS: Partial<Record<UnitType, TechRequirement[]>> = {
  [UnitType.Artillery]: [{ track: TechType.War, level: 2 }],
  [UnitType.SpecialForces]: [{ track: TechType.War, level: 3 }],
  [UnitType.AWACS]: [{ track: TechType.Electronics, level: 2 }],
  [UnitType.EngineerBoat]: [{ track: TechType.Science, level: 2 }],
  [UnitType.MissileCruiser]: [
    { track: TechType.War, level: 4 },
    { track: TechType.Electronics, level: 3 },
  ],
};

/** Check if a player has the tech to produce a given unit type. */
export function canProduceUnit(state: GameState, owner: Owner, unitType: UnitType): boolean {
  const reqs = UNIT_TECH_REQUIREMENTS[unitType];
  if (!reqs || reqs.length === 0) return true;

  const tech = state.techResearch[owner];
  for (const req of reqs) {
    if (getTechLevel(tech[req.track]) < req.level) return false;
  }
  return true;
}

// ─── Structure Tech Gating ───────────────────────────────────────────────────

import { BuildingType } from "./constants.js";
import { STRUCTURE_TECH_REQUIREMENTS } from "./buildings.js";

/** Check if a player has the tech to build a given structure type. */
export function canBuildStructure(state: GameState, owner: Owner, buildingType: BuildingType): boolean {
  const reqs = STRUCTURE_TECH_REQUIREMENTS[buildingType];
  if (!reqs || reqs.length === 0) return true;

  const tech = state.techResearch[owner];
  for (const req of reqs) {
    if (getTechLevel(tech[req.track]) < req.level) return false;
  }
  return true;
}

// ─── Effective Unit Stats ─────────────────────────────────────────────────────

import { UNIT_ATTRIBUTES } from "./units.js";

/** Get effective strength for a unit (base + tech bonus). */
export function getEffectiveStrength(state: GameState, unit: { type: UnitType; owner: Owner }): number {
  const base = UNIT_ATTRIBUTES[unit.type].strength;
  const levels = getPlayerTechLevels(state, unit.owner);
  return base + techStrengthBonus(levels[TechType.War], unit.type);
}

/** Get effective max HP for a unit (base + tech bonus). */
export function getEffectiveMaxHp(state: GameState, unit: { type: UnitType; owner: Owner }): number {
  const base = UNIT_ATTRIBUTES[unit.type].maxHits;
  const levels = getPlayerTechLevels(state, unit.owner);
  return base + techMaxHpBonus(levels[TechType.Health], unit.type);
}

/** Get effective speed for a unit (base + tech bonus). */
export function getEffectiveSpeed(state: GameState, unit: { type: UnitType; owner: Owner }): number {
  const base = UNIT_ATTRIBUTES[unit.type].speed;
  const levels = getPlayerTechLevels(state, unit.owner);
  let bonus = 0;
  if (unit.type === UnitType.Construction) {
    bonus += techConstructionSpeedBonus(levels[TechType.Science]);
  }
  return base + bonus;
}

/** Get effective fighter range (base + tech bonus). */
export function getEffectiveFighterRange(state: GameState, owner: Owner): number {
  const base = UNIT_ATTRIBUTES[UnitType.Fighter].range;
  const levels = getPlayerTechLevels(state, owner);
  return base + techFighterRangeBonus(levels[TechType.Electronics]);
}

/** Get effective satellite range (base + tech bonus). */
export function getEffectiveSatelliteRange(state: GameState, owner: Owner): number {
  const base = UNIT_ATTRIBUTES[UnitType.Satellite].range;
  const levels = getPlayerTechLevels(state, owner);
  return base + techSatelliteRangeBonus(levels[TechType.Electronics]);
}

// ─── Tech Bonus Summary (for UI) ─────────────────────────────────────────────

export interface TechBonusSummary {
  name: string;
  level: number;
  description: string;
}

/** Get active tech bonuses for a player (for display in economy review). */
export function getActiveTechBonuses(state: GameState, owner: Owner): TechBonusSummary[] {
  const levels = getPlayerTechLevels(state, owner);
  const [sci, health, elec, war] = levels;
  const bonuses: TechBonusSummary[] = [];

  // Science bonuses
  if (sci >= 2) bonuses.push({ name: "Science", level: 2, description: "+1 vision range (all units)" });
  if (sci >= 4) bonuses.push({ name: "Science", level: 4, description: "Construction unit +1 speed" });
  if (sci >= 5) bonuses.push({ name: "Science", level: 5, description: "All buildings +3 HP" });

  // Health bonuses
  if (health >= 1) bonuses.push({ name: "Health", level: 1, description: "City healing: 2 HP/turn" });
  if (health >= 2) bonuses.push({ name: "Health", level: 2, description: "Army max HP +1" });
  if (health >= 3) bonuses.push({ name: "Health", level: 3, description: "All land units +1 max HP" });
  if (health >= 4) bonuses.push({ name: "Health", level: 4, description: "Ships heal 1 HP/turn at sea" });
  if (health >= 5) bonuses.push({ name: "Health", level: 5, description: "All units +1 max HP" });

  // Electronics bonuses
  if (elec >= 1) bonuses.push({ name: "Electronics", level: 1, description: "+1 vision range (ships)" });
  if (elec >= 2) bonuses.push({ name: "Electronics", level: 2, description: "Subs visible when adjacent" });
  if (elec >= 3) bonuses.push({ name: "Electronics", level: 3, description: "+2 fighter range" });
  if (elec >= 4) bonuses.push({ name: "Electronics", level: 4, description: "+100 satellite range" });
  if (elec >= 5) bonuses.push({ name: "Electronics", level: 5, description: "See enemies on explored tiles" });

  // War bonuses
  if (war >= 1) bonuses.push({ name: "War", level: 1, description: "Army strength +1" });
  if (war >= 2) bonuses.push({ name: "War", level: 2, description: "All ship strength +1" });
  if (war >= 3) bonuses.push({ name: "War", level: 3, description: "Fighter strength +1" });
  if (war >= 4) bonuses.push({ name: "War", level: 4, description: "All units +1 strength" });
  if (war >= 5) bonuses.push({ name: "War", level: 5, description: "All units +1 strength (cumul.)" });

  return bonuses;
}

/** Get description of what the next level in a track unlocks. */
export function getNextLevelPreview(track: TechType, currentLevel: number): string | null {
  const previews: Record<TechType, string[]> = {
    [TechType.Science]: [
      "Unlock Hospital & Tech Lab",
      "+1 vision range (all units)",
      "Unlock Military Academy, Anti-Air",
      "Construction +1 speed, Coastal Battery",
      "All buildings +3 HP",
    ],
    [TechType.Health]: [
      "City healing: 2 HP/turn",
      "Army max HP +1",
      "Land units +1 max HP",
      "Ships heal at sea",
      "All units +1 max HP",
    ],
    [TechType.Electronics]: [
      "+1 vision (ships)",
      "Subs visible near own units",
      "+2 fighter range",
      "+100 satellite range, SAM Site",
      "Intel: see enemies on explored",
    ],
    [TechType.War]: [
      "Army str +1, Minefield",
      "Ship str +1, Artillery",
      "Fighter str +1, Special Forces",
      "All units +1 str, Missile Cruiser",
      "All units +1 str (cumulative)",
    ],
  };

  if (currentLevel >= MAX_TECH_LEVEL) return null;
  return previews[track]?.[currentLevel] ?? null;
}
