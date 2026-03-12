// Empire Reborn — AI Shared Helpers

import { MAP_SIZE, DIR_OFFSET, Owner, UnitType, TerrainType, INFINITY } from "./constants.js";
import { UNIT_ATTRIBUTES, canTraverse } from "./units.js";
import type { Loc, ViewMapCell, GameState, UnitState } from "./types.js";
import { isOnBoard, getAdjacentLocs, dist } from "./utils.js";
import { createPathMap, findObjective, markPath, findDirection, landMoveInfo, waterMoveInfo, airMoveInfo, type MoveInfo } from "./pathfinding.js";
import { isLake } from "./continent.js";
import { VM_WATER, VM_UNOWNED_CITY, VM_ENEMY_CITY } from "./viewmap-chars.js";

export type { MoveInfo } from "./pathfinding.js";

// ─── AI Debug Logging ─────────────────────────────────────────────────────────

/** When true, AI logs production and movement decisions. */
export let aiDebugLog = false;

/** When true, logs verbose per-unit transport details. */
export let aiVerboseLog = false;

/** Buffer for capturing AI log messages (used by diagnostic system). */
let aiLogBuffer: string[] | null = null;

/** Toggle AI debug logging on/off. */
export function setAIDebugLog(enabled: boolean): void {
  aiDebugLog = enabled;
}

/** Toggle verbose per-unit logging (transport details, etc). */
export function setAIVerboseLog(enabled: boolean): void {
  aiVerboseLog = enabled;
}

/** Start capturing AI logs into a buffer. Returns the buffer. */
export function startAILogCapture(): string[] {
  aiLogBuffer = [];
  return aiLogBuffer;
}

/** Stop capturing AI logs and return the captured lines. */
export function stopAILogCapture(): string[] {
  const buf = aiLogBuffer ?? [];
  aiLogBuffer = null;
  return buf;
}

export function aiLog(...args: unknown[]): void {
  if (!aiDebugLog) return;
  const msg = "[AI] " + args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
  if (aiLogBuffer) aiLogBuffer.push(msg);
  else console.log(msg);
}

export function aiVLog(...args: unknown[]): void {
  if (!aiDebugLog || !aiVerboseLog) return;
  const msg = "[AI] " + args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
  if (aiLogBuffer) aiLogBuffer.push(msg);
  else console.log(msg);
}

// ─── Production Ratio Tables ───────────────────────────────────────────────────
// Index by UnitType: [Army, Fighter, Patrol, Destroyer, Submarine, Transport, Carrier, Battleship, Satellite, Construction, Artillery, SpecialForces, AWACS, MissileCruiser, EngineerBoat]
// Construction is handled specially in decideProduction (not by ratio table).
// New Phase 7 units (Artillery, SpecForces, AWACS, MissileCruiser, EngineerBoat) are
// added to ratios at mid/late game tiers where they become available via tech.

/** 2–3 cities: fighter-heavy early game */
const RATIO_EARLY = [50, 20, 0, 0, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0];
/** 4–10 cities: introduce patrol boats and submarines for naval presence */
const RATIO_1 = [50, 10, 15, 5, 5, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0];
/** 11–20 cities: artillery and AWACS enter the mix */
const RATIO_2 = [60, 15, 15, 15, 10, 40, 0, 5, 0, 0, 10, 0, 5, 0, 0];
/** 21–30 cities: special forces and heavier naval */
const RATIO_3 = [75, 20, 20, 20, 15, 50, 0, 15, 0, 0, 15, 10, 5, 5, 0];
/** >30 cities: full fleet with missile cruisers */
const RATIO_4 = [90, 25, 25, 25, 20, 60, 0, 15, 0, 0, 20, 15, 8, 10, 0];

export function getRatioTable(cityCount: number): number[] {
  if (cityCount <= 3) return RATIO_EARLY;
  if (cityCount <= 10) return RATIO_1;
  if (cityCount <= 20) return RATIO_2;
  if (cityCount <= 30) return RATIO_3;
  return RATIO_4;
}

// ─── MoveInfo Factories ────────────────────────────────────────────────────────

// Army fight objectives: *=unowned, X=enemy-city, a=enemy-army, ' '=explore
// No '+' (explored land) or 'O' (own city) — idle armies on secure, explored
// continents should head toward transports, not wander aimlessly.
export function armyFightMoveInfo(): MoveInfo {
  return landMoveInfo("*Xa ", new Map([
    ["*", 1], ["X", 1], ["a", 1], [" ", 11],
  ]));
}

// Army load: $ = loading transport, special weight for TT-producing cities
export function armyLoadMoveInfo(viewMap: ViewMapCell[], loadingTransportLocs: Set<Loc>): MoveInfo {
  // Mark loading transport locations on objectives
  return {
    canMove: (t) => t !== 0, // can traverse land, water (for boarding), air
    objectives: "$",
    weights: new Map([["$", 1]]),
  };
}

// Transport loading: search for armies to pick up ($)
export function ttLoadMoveInfo(): MoveInfo {
  // '%' = army cluster (2+), '$' = single army; clusters are strongly preferred
  return waterMoveInfo("%$", new Map([["%", 1], ["$", 2]]));
}

// Transport exploring: search for open water
export function ttExploreMoveInfo(): MoveInfo {
  return waterMoveInfo(" ", new Map([[" ", 1]]));
}

// Transport unloading: search for continent targets (0-9 = value, ' '=explore)
// Higher digit = better target; weights inversely proportional
export function ttUnloadMoveInfo(): MoveInfo {
  return waterMoveInfo("9876543210 ", new Map([
    ["9", 1], ["8", 1], ["7", 1], ["6", 1], ["5", 1],
    ["4", 1], ["3", 11], ["2", 21], ["1", 41], ["0", 101], [" ", 61],
  ]));
}

// Fighter fight objectives: enemy units, exploration, and own cities (for base-hopping)
export function fighterFightMoveInfo(): MoveInfo {
  return airMoveInfo("tcfbsdpa O", new Map([
    ["t", 1], ["c", 1], ["f", 5], ["b", 5], ["s", 5],
    ["d", 5], ["p", 5], ["a", 5], [" ", 9], ["O", 21],
  ]));
}

// Ship repair: find own port (O)
export function shipRepairMoveInfo(): MoveInfo {
  return waterMoveInfo("O", new Map([["O", 1]]));
}

// Ship fight objectives: enemy units and exploration
// Exploration weight lowered from 21→7 so ships actively seek unknown waters
export function shipFightMoveInfo(): MoveInfo {
  return waterMoveInfo("tcbsdp ", new Map([
    ["t", 1], ["c", 1], ["b", 3], ["s", 3], ["d", 3], ["p", 3], [" ", 7],
  ]));
}

// ─── Attack / Movement Helpers ─────────────────────────────────────────────────

/**
 * Convert an attack list from unit.ts conventions to view map characters.
 * Our view map: 'X' = enemy city, '*' = unowned city, lowercase = enemy units.
 * Original attack lists use uppercase unit chars + 'O' for unowned, '*' for any city.
 * We convert: 'O' → '*' (unowned city), '*' → 'X' (enemy city),
 * uppercase unit chars → lowercase (enemy units on view map).
 */
export function attackListToViewChars(attackList: string): string {
  let result = "";
  for (const ch of attackList) {
    if (ch === "O") result += VM_UNOWNED_CITY; // unowned city
    else if (ch === "*") result += VM_ENEMY_CITY; // enemy city
    else result += ch.toLowerCase(); // enemy units are lowercase on view map
  }
  return result;
}

/**
 * Find the best adjacent target for an attack.
 * Returns the target location and the character found, or null if no target.
 * Prioritized by position in the attackList string.
 */
export function findAdjacentAttack(
  viewMap: ViewMapCell[],
  loc: Loc,
  attackList: string,
): { targetLoc: Loc; contents: string } | null {
  const viewChars = attackListToViewChars(attackList);
  let bestLoc: Loc | null = null;
  let bestPriority = Infinity;

  const adjacent = getAdjacentLocs(loc);
  for (const adj of adjacent) {
    const contents = viewMap[adj].contents;
    const priority = viewChars.indexOf(contents);
    if (priority >= 0 && priority < bestPriority) {
      bestPriority = priority;
      bestLoc = adj;
    }
  }

  if (bestLoc !== null) {
    return { targetLoc: bestLoc, contents: viewMap[bestLoc].contents };
  }
  return null;
}

/**
 * Find the direction toward an objective from pathfinding.
 * Returns the adjacent Loc to move to, or null.
 */
export function findMoveToward(
  viewMap: ViewMapCell[],
  from: Loc,
  moveInfo: MoveInfo,
): Loc | null {
  const result = findMoveTowardWithObjective(viewMap, from, moveInfo);
  return result ? result.nextStep : null;
}

/**
 * Like findMoveToward but also returns the objective location.
 * Used by transport coordination to claim the target zone.
 */
export function findMoveTowardWithObjective(
  viewMap: ViewMapCell[],
  from: Loc,
  moveInfo: MoveInfo,
): { nextStep: Loc; objective: Loc } | null {
  const pathMap = createPathMap();
  const objective = findObjective(pathMap, viewMap, from, moveInfo);
  if (objective === null) return null;

  markPath(pathMap, objective);
  const dir = findDirection(pathMap, from);
  if (dir === null) return null;

  const newLoc = from + DIR_OFFSET[dir];
  if (newLoc < 0 || newLoc >= MAP_SIZE || !isOnBoard(newLoc)) return null;
  return { nextStep: newLoc, objective };
}

// ─── Lake Detection ──────────────────────────────────────────────────────────────

/** Check if a city has any adjacent water tiles. */
export function isCityCoastal(viewMap: ViewMapCell[], cityLoc: Loc): boolean {
  const adjacent = getAdjacentLocs(cityLoc);
  for (const adj of adjacent) {
    if (viewMap[adj].contents === VM_WATER) return true;
  }
  return false;
}

/**
 * Check if a coastal city is on a lake (not open ocean).
 * Uses actual terrain data (not viewMap) to avoid false negatives from unexplored cells.
 * A water body < 5% of map size is considered a lake.
 */
export function isCityOnLake(viewMap: ViewMapCell[], cityLoc: Loc, state?: GameState): boolean {
  // If we have game state, use actual terrain for reliable detection
  if (state) {
    const oceanThreshold = Math.floor(MAP_SIZE * 0.05);
    const adjacent = getAdjacentLocs(cityLoc);
    for (const adj of adjacent) {
      if (state.map[adj].terrain === TerrainType.Sea) {
        // BFS flood-fill water using actual terrain
        const visited = new Uint8Array(MAP_SIZE);
        const queue: Loc[] = [adj];
        visited[adj] = 1;
        let count = 0;
        while (queue.length > 0) {
          const loc = queue.shift()!;
          count++;
          if (count >= oceanThreshold) return false; // large enough = ocean
          for (const a of getAdjacentLocs(loc)) {
            if (!visited[a] && state.map[a].terrain === TerrainType.Sea) {
              visited[a] = 1;
              queue.push(a);
            }
          }
        }
        // Small water body = lake
        return true;
      }
    }
    return false;
  }
  // Fallback: viewMap-based detection
  const adjacent = getAdjacentLocs(cityLoc);
  for (const adj of adjacent) {
    if (viewMap[adj].contents === VM_WATER) {
      return isLake(viewMap, adj);
    }
  }
  return false;
}

// ─── moveAway ─────────────────────────────────────────────────────────────────

export function moveAway(
  state: GameState,
  unit: UnitState,
  viewMap: ViewMapCell[],
): Loc | null {
  const adjacent = getAdjacentLocs(unit.loc);
  for (const adj of adjacent) {
    const cell = state.map[adj];
    if (canTraverse(unit.type, cell.terrain)) {
      // Don't move into enemy-occupied squares
      const enemyUnit = state.units.find(
        u => u.loc === adj && u.owner !== unit.owner && u.shipId === null,
      );
      if (!enemyUnit) return adj;
    }
  }
  return null;
}

// ─── findNearestCityDist ──────────────────────────────────────────────────────

export function findNearestCityDist(state: GameState, loc: Loc, owner: Owner): number {
  let minDist = INFINITY;
  for (const city of state.cities) {
    if (city.owner === owner) {
      const d = dist(loc, city.loc);
      if (d < minDist) minDist = d;
    }
  }
  return minDist;
}
