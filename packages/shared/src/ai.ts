// Empire Reborn — AI System
// Phase 4: AI production strategy, army/transport/fighter/ship movement, turn orchestrator
// Ported from VMS-Empire compmove.c

import {
  MAP_SIZE,
  DIR_OFFSET,
  Owner,
  UnitType,
  UnitBehavior,
  TerrainType,
  MOVE_ORDER,
  INFINITY,
  NUM_UNIT_TYPES,
  BEHAVIOR_NAMES,
  behaviorIndex,
} from "./constants.js";
import {
  UNIT_ATTRIBUTES,
  getUnitAttributes,
  canTraverse,
  ARMY_ATTACK,
  FIGHTER_ATTACK,
  SHIP_ATTACK,
  TT_ATTACK,
} from "./units.js";
import type {
  Loc,
  ViewMapCell,
  CityState,
  UnitState,
  GameState,
  PlayerAction,
} from "./types.js";
import {
  isOnBoard,
  getAdjacentLocs,
  dist,
  locCol,
} from "./utils.js";
import {
  findUnit,
  findUnitsAtLoc,
  findUnitAtLoc,
  findNonFullShip,
  objMoves,
  objCapacity,
  scan,
} from "./game.js";
import {
  createPathMap,
  findObjective,
  markPath,
  findDirection,
  landMoveInfo,
  waterMoveInfo,
  airMoveInfo,
  viewCellToTerrain,
  type PathCell,
  type MoveInfo,
} from "./pathfinding.js";
import {
  mapContinent,
  isLake,
} from "./continent.js";

// ─── AI Debug Logging ─────────────────────────────────────────────────────────

/** When true, AI logs production and movement decisions to console. */
export let aiDebugLog = false;

/** Toggle AI debug logging on/off. */
export function setAIDebugLog(enabled: boolean): void {
  aiDebugLog = enabled;
}

function aiLog(...args: unknown[]): void {
  if (aiDebugLog) console.log("[AI]", ...args);
}

// ─── Production Ratio Tables ───────────────────────────────────────────────────
// Index by UnitType: [Army, Fighter, Patrol, Destroyer, Submarine, Transport, Carrier, Battleship, Satellite]

/** ≤10 cities */
const RATIO_1 = [60, 0, 10, 0, 0, 20, 0, 0, 0];
/** 11–20 cities */
const RATIO_2 = [90, 10, 10, 10, 10, 40, 0, 0, 0];
/** 21–30 cities */
const RATIO_3 = [120, 20, 20, 10, 10, 60, 10, 10, 0];
/** >30 cities */
const RATIO_4 = [150, 30, 30, 20, 20, 70, 10, 10, 0];

function getRatioTable(cityCount: number): number[] {
  if (cityCount <= 10) return RATIO_1;
  if (cityCount <= 20) return RATIO_2;
  if (cityCount <= 30) return RATIO_3;
  return RATIO_4;
}

// ─── AI Movement Weights (ported from compmove.c move_info structs) ────────────

// Army fight objectives: *=unowned, X=enemy-city, a=enemy-army, ' '=explore
// No '+' (explored land) or 'O' (own city) — idle armies on secure, explored
// continents should head toward transports, not wander aimlessly.
function armyFightMoveInfo(): MoveInfo {
  return landMoveInfo("*Xa ", new Map([
    ["*", 1], ["X", 1], ["a", 1], [" ", 11],
  ]));
}

// Army load: $ = loading transport, special weight for TT-producing cities
function armyLoadMoveInfo(viewMap: ViewMapCell[], loadingTransportLocs: Set<Loc>): MoveInfo {
  // Mark loading transport locations on objectives
  return {
    canMove: (t) => t !== 0, // can traverse land, water (for boarding), air
    objectives: "$",
    weights: new Map([["$", 1]]),
  };
}

// Transport loading: search for armies to pick up ($)
function ttLoadMoveInfo(): MoveInfo {
  return waterMoveInfo("$", new Map([["$", 1]]));
}

// Transport exploring: search for open water
function ttExploreMoveInfo(): MoveInfo {
  return waterMoveInfo(" ", new Map([[" ", 1]]));
}

// Transport unloading: search for continent targets (0-9 = value, ' '=explore)
// Higher digit = better target; weights inversely proportional
function ttUnloadMoveInfo(): MoveInfo {
  return waterMoveInfo("9876543210 ", new Map([
    ["9", 1], ["8", 1], ["7", 1], ["6", 1], ["5", 1],
    ["4", 1], ["3", 11], ["2", 21], ["1", 41], ["0", 101], [" ", 61],
  ]));
}

// Fighter fight objectives: enemy units and exploration
function fighterFightMoveInfo(): MoveInfo {
  return airMoveInfo("tcfbsdpa ", new Map([
    ["t", 1], ["c", 1], ["f", 5], ["b", 5], ["s", 5],
    ["d", 5], ["p", 5], ["a", 5], [" ", 9],
  ]));
}

// Ship repair: find own port (O)
function shipRepairMoveInfo(): MoveInfo {
  return waterMoveInfo("O", new Map([["O", 1]]));
}

// Ship fight objectives: enemy units and exploration
function shipFightMoveInfo(): MoveInfo {
  return waterMoveInfo("tcbsdp ", new Map([
    ["t", 1], ["c", 1], ["b", 3], ["s", 3], ["d", 3], ["p", 3], [" ", 21],
  ]));
}

// ─── Adjacency Attack Helper ───────────────────────────────────────────────────

/**
 * Convert an attack list from unit.ts conventions to view map characters.
 * Our view map: 'X' = enemy city, '*' = unowned city, lowercase = enemy units.
 * Original attack lists use uppercase unit chars + 'O' for unowned, '*' for any city.
 * We convert: 'O' → '*' (unowned city), '*' → 'X' (enemy city),
 * uppercase unit chars → lowercase (enemy units on view map).
 */
function attackListToViewChars(attackList: string): string {
  let result = "";
  for (const ch of attackList) {
    if (ch === "O") result += "*"; // unowned city
    else if (ch === "*") result += "X"; // enemy city
    else result += ch.toLowerCase(); // enemy units are lowercase on view map
  }
  return result;
}

/**
 * Find the best adjacent target for an attack.
 * Returns the target location and the character found, or null if no target.
 * Prioritized by position in the attackList string.
 */
function findAdjacentAttack(
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
function findMoveToward(
  viewMap: ViewMapCell[],
  from: Loc,
  moveInfo: MoveInfo,
): Loc | null {
  const pathMap = createPathMap();
  const objective = findObjective(pathMap, viewMap, from, moveInfo);
  if (objective === null) return null;

  markPath(pathMap, objective);
  const dir = findDirection(pathMap, from);
  if (dir === null) return null;

  const newLoc = from + DIR_OFFSET[dir];
  if (newLoc < 0 || newLoc >= MAP_SIZE || !isOnBoard(newLoc)) return null;
  return newLoc;
}

// ─── Lake Detection ──────────────────────────────────────────────────────────────

/**
 * Check if a city is on a lake (surrounded by water with no strategic value).
 * Lake cities can only build armies or fighters.
 */
/** Check if a city has any adjacent water tiles. */
function isCityCoastal(viewMap: ViewMapCell[], cityLoc: Loc): boolean {
  const adjacent = getAdjacentLocs(cityLoc);
  for (const adj of adjacent) {
    if (viewMap[adj].contents === ".") return true;
  }
  return false;
}

/**
 * Check if a coastal city is on a lake (not open ocean).
 * Uses actual terrain data (not viewMap) to avoid false negatives from unexplored cells.
 * A water body < 5% of map size is considered a lake.
 */
function isCityOnLake(viewMap: ViewMapCell[], cityLoc: Loc, state?: GameState): boolean {
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
    if (viewMap[adj].contents === ".") {
      return isLake(viewMap, adj);
    }
  }
  return false;
}

// ─── Step 4.1: AI Production Strategy ──────────────────────────────────────────

/**
 * Count how many AI cities are producing each unit type.
 */
function countProduction(state: GameState, aiOwner: Owner): number[] {
  const counts = new Array(NUM_UNIT_TYPES).fill(0);
  for (const city of state.cities) {
    if (city.owner === aiOwner) {
      counts[city.production]++;
    }
  }
  return counts;
}

/**
 * Check if a type is overproduced relative to the ratio table.
 * Returns true if we should switch away from this type.
 */
function overproduced(prodCounts: number[], ratio: number[], unitType: UnitType): boolean {
  if (ratio[unitType] === 0) return true; // never want this type
  // Check if this type has more than its fair share
  const totalProd = prodCounts.reduce((a, b) => a + b, 0);
  if (totalProd === 0) return false;
  const actualRatio = prodCounts[unitType] / totalProd;
  const targetRatio = ratio[unitType] / ratio.reduce((a, b) => a + b, 0);
  return actualRatio > targetRatio * 1.5; // 50% overshoot tolerance
}

/**
 * Find the unit type most needed based on ratio table.
 * Returns the UnitType with the greatest deficit.
 */
function needMore(prodCounts: number[], ratio: number[], onLake: boolean): UnitType {
  let bestType = UnitType.Army;
  let bestDeficit = -Infinity;
  const totalRatio = ratio.reduce((a, b) => a + b, 0);
  const totalProd = Math.max(prodCounts.reduce((a, b) => a + b, 0), 1);

  for (let i = 0; i < NUM_UNIT_TYPES; i++) {
    if (ratio[i] === 0) continue;
    // Inland/lake cities can't build ships — only armies and fighters
    if (onLake && i !== UnitType.Army && i !== UnitType.Fighter) continue;
    // Never build carriers or satellites (following original AI)
    if (i === UnitType.Carrier || i === UnitType.Satellite) continue;

    const targetFraction = ratio[i] / totalRatio;
    const actualFraction = prodCounts[i] / totalProd;
    const deficit = targetFraction - actualFraction;

    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      bestType = i as UnitType;
    }
  }

  return bestType;
}

/**
 * Decide what a city should produce.
 * Implements the original's hierarchical production strategy:
 * 1. Defend continents with armies
 * 2. Ensure transport production
 * 3. Follow ratio tables
 */
function decideProduction(
  state: GameState,
  city: CityState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
  prodCounts: number[],
): UnitType | null {
  const currentAttrs = UNIT_ATTRIBUTES[city.production];
  const coastal = isCityCoastal(viewMap, city.loc);
  const onLake = coastal && isCityOnLake(viewMap, city.loc, state);
  // Can this city build ships? Only coastal, non-lake cities
  const canBuildShips = coastal && !onLake;

  // Map the city's continent and count threats directly from viewMap
  // (scanContinent hardcodes O=P1/X=P2, which is wrong for P2's viewMap
  //  where O=own and X=enemy regardless of player)
  const continent = mapContinent(viewMap, city.loc, ".");
  let enemyCities = 0;
  let enemyArmies = 0;
  let aiArmies = 0;
  let unownedCities = 0;
  let unexplored = 0;
  for (const cLoc of continent) {
    const c = viewMap[cLoc].contents;
    if (c === "X") enemyCities++;
    else if (c === "*") unownedCities++;
    else if (c === " ") unexplored++;
    else if (c === "a") enemyArmies++;   // lowercase = enemy army on viewMap
    else if (c === "A") aiArmies++;      // uppercase = own army on viewMap
  }
  const hasInterest = unexplored > 0 || enemyCities > 0 || unownedCities > 0;

  // How far along is current production? (0.0 to 1.0, can be negative during penalty)
  const progress = city.work / currentAttrs.buildTime;

  // Guard: never switch away from Transport if this is the only transport producer.
  // Other cities handle defense — the AI needs at least one transport to expand.
  if (city.production === UnitType.Transport && prodCounts[UnitType.Transport] <= 1) {
    aiLog(`City #${city.id}: keeping Transport (only transport producer)`);
    return null;
  }

  // Priority 1: Defend against enemy presence on continent
  let armiesNeeded = enemyCities - aiArmies;
  if (hasInterest) armiesNeeded++;
  if (enemyCities > 0) armiesNeeded++;

  if (armiesNeeded > 0 && city.production !== UnitType.Army) {
    // Only switch for defense if enemy armies are present or production barely started
    if (enemyArmies > 0 || progress < 0.25) {
      aiLog(`City #${city.id}: switch to Army (defense: ${armiesNeeded} needed, enemyArmies=${enemyArmies}, progress=${Math.round(progress * 100)}%)`);
      return UnitType.Army;
    }
    aiLog(`City #${city.id}: keeping ${currentAttrs.name} (${Math.round(progress * 100)}% done, no enemy armies on continent)`);
  }

  // Priority 2: Ensure transport production (first ship-capable city)
  // Never switch away from army production when we have only 1 city —
  // the AI needs to build armies to capture more cities first.
  const aiCityCount = state.cities.filter(c => c.owner === aiOwner).length;
  if (aiCityCount <= 1) {
    // Exception: if all our armies are WaitForTransport and city is coastal,
    // we're stuck on an island — build a transport to escape
    if (canBuildShips) {
      const aiArmyUnits = state.units.filter(u => u.owner === aiOwner && u.type === UnitType.Army);
      const allWaiting = aiArmyUnits.length > 0
        && aiArmyUnits.every(u => u.func === UnitBehavior.WaitForTransport);
      if (allWaiting && city.production !== UnitType.Transport) {
        aiLog(`City #${city.id}: switch to Transport (island escape — all ${aiArmyUnits.length} armies waiting)`);
        return UnitType.Transport;
      }
      // Already building transport for island escape — keep going
      if (allWaiting && city.production === UnitType.Transport) {
        aiLog(`City #${city.id}: keeping Transport (island escape)`);
        return null;
      }
    }
    // With 1 city, always build armies — no transport or ratio switching
    if (city.production !== UnitType.Army) {
      aiLog(`City #${city.id}: switch to Army (only 1 city)`);
      return UnitType.Army;
    }
    return null;
  }

  // Only coastal non-lake cities can build transports/ships
  if (canBuildShips && prodCounts[UnitType.Transport] === 0) {
    if (!(armiesNeeded > 0 && prodCounts[UnitType.Army] <= 1)) {
      aiLog(`City #${city.id}: switch to Transport (none being built)`);
      return UnitType.Transport;
    }
  }

  // Priority 2b: Build more transports when army surplus is overwhelming
  // Each transport carries 6 armies; if wait:transport count far exceeds capacity, add more
  if (canBuildShips && city.production !== UnitType.Transport) {
    const waitingArmies = state.units.filter(
      u => u.owner === aiOwner && u.type === UnitType.Army
        && u.func === UnitBehavior.WaitForTransport && u.shipId === null
    ).length;
    const existingTransports = state.units.filter(
      u => u.owner === aiOwner && u.type === UnitType.Transport
    ).length;
    const transportCapacity = (existingTransports + prodCounts[UnitType.Transport]) * 6;
    if (waitingArmies > transportCapacity + 6 && progress < 0.5) {
      aiLog(`City #${city.id}: switch to Transport (army surplus: ${waitingArmies} waiting, capacity=${transportCapacity})`);
      return UnitType.Transport;
    }
  }

  // Priority 3: Follow ratio tables if current production is overproduced
  const ratio = getRatioTable(aiCityCount);

  if (overproduced(prodCounts, ratio, city.production)) {
    // Don't switch if >50% done
    if (progress >= 0.5) {
      aiLog(`City #${city.id}: ${currentAttrs.name} overproduced but ${Math.round(progress * 100)}% done, finishing`);
      return null;
    }
    const needed = needMore(prodCounts, ratio, !canBuildShips);
    aiLog(`City #${city.id}: switch from ${currentAttrs.name} to ${UNIT_ATTRIBUTES[needed].name} (ratio rebalance)`);
    return needed;
  }

  // Keep current production
  return null;
}

/**
 * Run AI production for all cities.
 * Returns setProduction actions.
 */
function aiProduction(
  state: GameState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const prodCounts = countProduction(state, aiOwner);

  for (const city of state.cities) {
    if (city.owner !== aiOwner) continue;

    const newProd = decideProduction(state, city, aiOwner, viewMap, prodCounts);
    if (newProd !== null && newProd !== city.production) {
      const oldName = UNIT_ATTRIBUTES[city.production].name;
      const newName = UNIT_ATTRIBUTES[newProd].name;
      aiLog(`City #${city.id}: SWITCHING ${oldName} → ${newName} (work=${city.work}/${UNIT_ATTRIBUTES[city.production].buildTime})`);
      actions.push({ type: "setProduction", cityId: city.id, unitType: newProd });
      // Update counts for subsequent city decisions
      prodCounts[city.production]--;
      prodCounts[newProd]++;
    }
  }

  return actions;
}

// ─── Step 4.2: AI Army Movement ────────────────────────────────────────────────

function aiArmyMove(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const enemyOwner = aiOwner === Owner.Player1 ? Owner.Player2 : Owner.Player1;
  const movesLeft = objMoves(unit) - unit.moved;
  if (movesLeft <= 0) return actions;

  // If on a transport, wait for unloading (transport handles this)
  if (unit.shipId !== null) return actions;

  for (let step = 0; step < movesLeft; step++) {
    // 1. Check for adjacent attack targets
    const attack = findAdjacentAttack(viewMap, unit.loc, ARMY_ATTACK);
    if (attack) {
      actions.push({ type: "attack", unitId: unit.id, targetLoc: attack.targetLoc });
      return actions; // army dies or captures, done
    }

    // 2. Check if we should board a transport
    const transport = findNonFullShip(state, UnitType.Transport, unit.loc, aiOwner);
    if (transport) {
      actions.push({ type: "embark", unitId: unit.id, shipId: transport.id });
      return actions;
    }

    // 3. Find land objective (enemy cities, unowned cities, exploration)
    const fightTarget = findMoveToward(viewMap, unit.loc, armyFightMoveInfo());

    // 4. Consider loading onto a nearby transport
    // Find nearest loading transport via pathfinding
    const loadMap = createTempViewMap(viewMap, state, aiOwner);
    const loadTarget = findMoveToward(loadMap, unit.loc, armyLoadMoveInfo(viewMap, new Set()));

    // Decide: fight on land or board transport?
    if (fightTarget !== null && loadTarget !== null) {
      // Prefer land fight unless transport is closer
      const fightDist = dist(unit.loc, fightTarget);
      const loadDist = dist(unit.loc, loadTarget);
      // Small bias toward fighting — but armies readily head to transports
      if (loadDist < fightDist) {
        actions.push({ type: "move", unitId: unit.id, loc: loadTarget });
      } else {
        actions.push({ type: "move", unitId: unit.id, loc: fightTarget });
      }
    } else if (fightTarget !== null) {
      actions.push({ type: "move", unitId: unit.id, loc: fightTarget });
    } else if (loadTarget !== null) {
      actions.push({ type: "move", unitId: unit.id, loc: loadTarget });
    } else {
      // No fight and no transport reachable — move toward nearest coast for pickup
      const adjacent = getAdjacentLocs(unit.loc);
      const isAtCoast = adjacent.some(adj => state.map[adj].terrain === TerrainType.Sea);
      if (isAtCoast) {
        aiLog(`  Army #${unit.id}: at coast, waiting for transport`);
      } else {
        // Try to move toward water (BFS for nearest coastal land tile)
        const coastMove = findNearestCoast(state, unit.loc);
        if (coastMove !== null) {
          aiLog(`  Army #${unit.id}: moving toward coast`);
          actions.push({ type: "move", unitId: unit.id, loc: coastMove });
        } else {
          aiLog(`  Army #${unit.id}: no objectives, no coast reachable`);
        }
      }
      break;
    }

    // Check if we can still move (unit might have been consumed by attack)
    if (findUnit(state, unit.id) === undefined) break;
  }

  return actions;
}

/**
 * Create a temporary view map with loading transport locations marked as '$'.
 */
function createTempViewMap(
  viewMap: ViewMapCell[],
  state: GameState,
  aiOwner: Owner,
): ViewMapCell[] {
  const tempMap = viewMap.map(cell => ({ ...cell }));

  // Mark non-full transports that are loading
  for (const u of state.units) {
    if (u.owner === aiOwner && u.type === UnitType.Transport) {
      const cap = objCapacity(u);
      if (u.cargoIds.length < cap) {
        tempMap[u.loc] = { ...tempMap[u.loc], contents: "$" };
      }
    }
  }

  // Mark cities producing transports
  for (const city of state.cities) {
    if (city.owner === aiOwner && city.production === UnitType.Transport) {
      tempMap[city.loc] = { ...tempMap[city.loc], contents: "$" };
    }
  }

  return tempMap;
}

/**
 * BFS to find the first step toward the nearest coastal land tile (adjacent to water).
 * Returns the first move toward coast, or null if already at coast or unreachable.
 */
function findNearestCoast(state: GameState, startLoc: Loc): Loc | null {
  const visited = new Uint8Array(MAP_SIZE);
  const parent = new Int32Array(MAP_SIZE).fill(-1);
  const queue: Loc[] = [startLoc];
  visited[startLoc] = 1;

  while (queue.length > 0) {
    const loc = queue.shift()!;
    const adj = getAdjacentLocs(loc);

    // Check if this land tile is adjacent to water
    if (loc !== startLoc && state.map[loc].terrain === TerrainType.Land) {
      const isCoastal = adj.some(a => state.map[a].terrain === TerrainType.Sea);
      if (isCoastal) {
        // Trace back to find the first step from startLoc
        let cur = loc;
        while (parent[cur] !== startLoc && parent[cur] !== -1) {
          cur = parent[cur];
        }
        return cur;
      }
    }

    for (const a of adj) {
      if (!visited[a] && (state.map[a].terrain === TerrainType.Land || state.map[a].terrain === TerrainType.City)) {
        visited[a] = 1;
        parent[a] = loc;
        queue.push(a);
      }
    }
  }
  return null;
}

/**
 * Try to move a unit away from its current location (leave a city).
 */
function moveAway(
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

// ─── Step 4.3: AI Transport Movement ───────────────────────────────────────────

function aiTransportMove(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
  claimedUnitIds: Set<number>,
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const movesLeft = objMoves(unit) - unit.moved;
  if (movesLeft <= 0) return actions;

  const capacity = objCapacity(unit);
  // Track projected cargo across steps (actions are batched, cargoIds doesn't update mid-turn)
  let projectedCargo = unit.cargoIds.length;
  let justUnloaded = false;
  // Track position across steps (unit.loc doesn't update mid-turn)
  let currentLoc = unit.loc;

  aiLog(`  Transport #${unit.id}: loc=${unit.loc} cargo=${projectedCargo}/${capacity} moves=${movesLeft}`);

  for (let step = 0; step < movesLeft; step++) {
    if (findUnit(state, unit.id) === undefined) break;

    const isFull = projectedCargo >= capacity;
    const isEmpty = projectedCargo === 0;

    // After unloading, sail away (don't sit and reload)
    if (justUnloaded) {
      const exploreTarget = findMoveToward(viewMap, currentLoc, ttExploreMoveInfo());
      if (exploreTarget !== null) {
        aiLog(`    Transport #${unit.id}: sailing away after unloading`);
        actions.push({ type: "move", unitId: unit.id, loc: exploreTarget });
        currentLoc = exploreTarget;
      }
      break;
    }

    // UNLOAD MODE: full, or partially loaded near enemy territory
    if (isFull || (!isEmpty && shouldUnload(state, unit, aiOwner, viewMap))) {
      // Check for adjacent attack
      const attack = findAdjacentAttack(viewMap, currentLoc, TT_ATTACK);
      if (attack) {
        actions.push({ type: "attack", unitId: unit.id, targetLoc: attack.targetLoc });
        return actions;
      }

      // Try to unload onto enemy/unowned land
      const unloadAction = tryUnloadArmies(state, unit, aiOwner, viewMap);
      if (unloadAction.length > 0) {
        actions.push(...unloadAction);
        projectedCargo = 0;
        justUnloaded = true;
        aiLog(`    Transport #${unit.id}: unloaded, will sail away`);
        continue; // use remaining move to sail away
      }

      // Navigate toward enemy continent
      const unloadMap = createUnloadViewMap(viewMap, state, aiOwner);
      const target = findMoveToward(unloadMap, currentLoc, ttUnloadMoveInfo());
      if (target !== null) {
        aiLog(`    Transport #${unit.id}: full, navigating toward target at ${target}`);
        actions.push({ type: "move", unitId: unit.id, loc: target });
        currentLoc = target;
      } else {
        // No unload targets found — explore to discover enemy territory
        const exploreTarget = findMoveToward(viewMap, currentLoc, ttExploreMoveInfo());
        if (exploreTarget !== null) {
          aiLog(`    Transport #${unit.id}: full, no targets found, exploring at ${exploreTarget}`);
          actions.push({ type: "move", unitId: unit.id, loc: exploreTarget });
          currentLoc = exploreTarget;
        } else {
          break;
        }
      }
    } else {
      // LOADING MODE: seek armies to load

      // Only try loading on the FIRST step (prevents double-loading from batched actions)
      if (step === 0) {
        const loadActions = tryLoadArmies(state, unit, aiOwner, claimedUnitIds);
        if (loadActions.length > 0) {
          actions.push(...loadActions);
          const willLoad = loadActions.filter(a => a.type === "move" || a.type === "embark").length;
          projectedCargo += willLoad;
          if (projectedCargo >= capacity) {
            aiLog(`    Transport #${unit.id}: will be full after loading ${willLoad}, switching to unload mode`);
            continue; // switch to unload mode next iteration
          }
          // If we loaded some but not full, check if more armies are nearby — wait for them
          if (projectedCargo > 0) {
            const nearbyArmies = countNearbyArmies(state, currentLoc, aiOwner, claimedUnitIds);
            if (nearbyArmies > 0) {
              aiLog(`    Transport #${unit.id}: loaded ${willLoad}, waiting for ${nearbyArmies} more nearby armies`);
              break; // stay put and wait
            }
          }
        } else if (projectedCargo > 0) {
          // Already carrying armies but couldn't load more — deliver what we have
          aiLog(`    Transport #${unit.id}: cargo=${projectedCargo}/${capacity}, no more loadable armies, heading to deliver`);
          const unloadMap = createUnloadViewMap(viewMap, state, aiOwner);
          const deliverTarget = findMoveToward(unloadMap, currentLoc, ttUnloadMoveInfo());
          if (deliverTarget !== null) {
            actions.push({ type: "move", unitId: unit.id, loc: deliverTarget });
            currentLoc = deliverTarget;
            continue;
          }
          // No unload targets — explore to find enemy territory
          const exploreTarget2 = findMoveToward(viewMap, currentLoc, ttExploreMoveInfo());
          if (exploreTarget2 !== null) {
            actions.push({ type: "move", unitId: unit.id, loc: exploreTarget2 });
            currentLoc = exploreTarget2;
            continue;
          }
          break;
        }
      }

      // Navigate toward waiting armies or targets
      const loadMap = createTTLoadViewMap(viewMap, state, aiOwner);
      const target = findMoveToward(loadMap, currentLoc, ttLoadMoveInfo());
      if (target !== null) {
        aiLog(`    Transport #${unit.id}: loading mode, moving toward armies at ${target}`);
        actions.push({ type: "move", unitId: unit.id, loc: target });
        currentLoc = target;
      } else if (projectedCargo > 0) {
        // Partially loaded with no armies to find — head toward enemy territory
        aiLog(`    Transport #${unit.id}: no more armies, sailing with ${projectedCargo}/${capacity} toward targets`);
        const unloadMap = createUnloadViewMap(viewMap, state, aiOwner);
        const unloadTarget = findMoveToward(unloadMap, currentLoc, ttUnloadMoveInfo());
        if (unloadTarget !== null) {
          actions.push({ type: "move", unitId: unit.id, loc: unloadTarget });
          currentLoc = unloadTarget;
        } else {
          const exploreTarget = findMoveToward(viewMap, currentLoc, ttExploreMoveInfo());
          if (exploreTarget !== null) {
            actions.push({ type: "move", unitId: unit.id, loc: exploreTarget });
            currentLoc = exploreTarget;
          } else {
            break;
          }
        }
      } else {
        // Empty with no targets — explore
        aiLog(`    Transport #${unit.id}: empty, no armies found, exploring`);
        const exploreTarget = findMoveToward(viewMap, currentLoc, ttExploreMoveInfo());
        if (exploreTarget !== null) {
          actions.push({ type: "move", unitId: unit.id, loc: exploreTarget });
          currentLoc = exploreTarget;
        } else {
          aiLog(`    Transport #${unit.id}: no explore target either, stuck`);
          break;
        }
      }
    }
  }

  return actions;
}

/**
 * Decide if a partially-loaded transport should start unloading.
 * Only trigger near enemy/unowned territory — NOT near own cities.
 */
function shouldUnload(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): boolean {
  // Need at least a third full to start unloading early
  const capacity = objCapacity(unit);
  if (unit.cargoIds.length < capacity / 3) return false;

  // Check if near enemy or unowned territory
  const adjacent = getAdjacentLocs(unit.loc);
  for (const adj of adjacent) {
    const contents = viewMap[adj].contents;
    // 'X' = enemy city, '*' = unowned city
    if (contents === "X" || contents === "*") {
      return true;
    }
    // '+' = land — only if not near our own cities
    if (contents === "+") {
      const cell = state.map[adj];
      if (cell.cityId !== null) continue; // skip city tiles handled above
      const nearOwnCity = getAdjacentLocs(adj).some(a2 => {
        const c = state.map[a2];
        return c.cityId !== null && state.cities[c.cityId].owner === aiOwner;
      });
      if (!nearOwnCity) return true;
    }
  }
  return false;
}

/**
 * Try to unload armies from transport onto adjacent land near enemy/unowned territory.
 * Will NOT unload onto friendly territory (home island).
 */
function tryUnloadArmies(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const adjacent = getAdjacentLocs(unit.loc);

  // Only unload onto land that is enemy, unowned, or near enemy/unowned cities
  // viewMap contents: 'X'=enemy city, 'O'=own city, '*'=unowned city, '+'=land
  const landTargets: { loc: Loc; priority: number }[] = [];
  for (const adj of adjacent) {
    const cell = state.map[adj];
    if (cell.terrain !== TerrainType.Land && cell.terrain !== TerrainType.City) continue;

    const contents = viewMap[adj].contents;
    if (contents === "X") {
      // Enemy city — highest priority
      landTargets.push({ loc: adj, priority: 3 });
    } else if (contents === "*") {
      // Unowned city — high priority
      landTargets.push({ loc: adj, priority: 2 });
    } else if (contents === "+" || contents === " ") {
      // Land or unexplored — check if near enemy territory (not home)
      // Only unload if this tile is NOT adjacent to our own cities
      const isNearOwnCity = getAdjacentLocs(adj).some(a2 => {
        const c = state.map[a2];
        return c.cityId !== null && state.cities[c.cityId].owner === aiOwner;
      });
      if (!isNearOwnCity) {
        landTargets.push({ loc: adj, priority: 1 });
      }
    }
    // Skip 'O' (own city) — never unload at home
  }

  if (landTargets.length === 0) return actions;

  // Sort by priority (highest first)
  landTargets.sort((a, b) => b.priority - a.priority);
  const bestLand = landTargets[0].loc;

  aiLog(`    Transport #${unit.id}: unloading ${unit.cargoIds.length} armies at ${bestLand}`);

  for (const cargoId of [...unit.cargoIds]) {
    const cargo = findUnit(state, cargoId);
    if (cargo) {
      actions.push({ type: "disembark", unitId: cargoId });
      actions.push({ type: "move", unitId: cargoId, loc: bestLand });
      // Set unloaded armies to Explore so they march inland (not sit on beach)
      actions.push({ type: "setBehavior", unitId: cargoId, behavior: UnitBehavior.Explore });
    }
  }

  return actions;
}

/**
 * Try to load adjacent armies onto the transport.
 * Returns embark actions for armies at the transport's location.
 */
function tryLoadArmies(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  claimedUnitIds: Set<number>,
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const cap = objCapacity(unit);
  let loadCount = unit.cargoIds.length;

  // First: embark armies already at the transport's location
  for (const u of state.units) {
    if (loadCount >= cap) break;
    if (u.owner === aiOwner && u.type === UnitType.Army && u.loc === unit.loc
        && u.shipId === null
        && (u.func === UnitBehavior.None || u.func === UnitBehavior.Explore || u.func === UnitBehavior.WaitForTransport)) {
      // Cancel behavior on embark — army is now dedicated to transport mission
      if (u.func !== UnitBehavior.None) {
        actions.push({ type: "setBehavior", unitId: u.id, behavior: UnitBehavior.None });
      }
      actions.push({ type: "embark", unitId: u.id, shipId: unit.id });
      claimedUnitIds.add(u.id);
      loadCount++;
    }
  }

  // Second: move adjacent idle/exploring armies onto the transport (they auto-embark via moveUnit)
  const adjacent = getAdjacentLocs(unit.loc);
  for (const adj of adjacent) {
    if (loadCount >= cap) break;
    for (const u of state.units) {
      if (loadCount >= cap) break;
      if (u.owner === aiOwner && u.type === UnitType.Army && u.loc === adj && u.shipId === null
          && (u.func === UnitBehavior.None || u.func === UnitBehavior.Explore || u.func === UnitBehavior.WaitForTransport)
          && u.moved < objMoves(u) && !claimedUnitIds.has(u.id)) {
        aiLog(`    Loading army #${u.id} from adjacent tile ${adj} onto transport #${unit.id}`);
        // Cancel behavior — army is now dedicated to transport mission
        if (u.func !== UnitBehavior.None) {
          actions.push({ type: "setBehavior", unitId: u.id, behavior: UnitBehavior.None });
        }
        actions.push({ type: "move", unitId: u.id, loc: unit.loc });
        claimedUnitIds.add(u.id);
        loadCount++;
      }
    }
  }

  return actions;
}

/**
 * Count armies within a few tiles of a location that could be loaded (not already claimed).
 */
function countNearbyArmies(
  state: GameState,
  loc: Loc,
  aiOwner: Owner,
  claimedUnitIds: Set<number>,
): number {
  let count = 0;
  // Check tiles within BFS distance 1 (armies that can board next turn)
  const visited = new Set<Loc>([loc]);
  let frontier = getAdjacentLocs(loc);
  for (let depth = 0; depth < 1; depth++) {
    const nextFrontier: Loc[] = [];
    for (const adj of frontier) {
      if (visited.has(adj)) continue;
      visited.add(adj);
      const cell = state.map[adj];
      if (cell.terrain === TerrainType.Land || cell.terrain === TerrainType.City) {
        for (const u of state.units) {
          if (u.owner === aiOwner && u.type === UnitType.Army && u.loc === adj
              && u.shipId === null && !claimedUnitIds.has(u.id)) {
            count++;
          }
        }
        nextFrontier.push(...getAdjacentLocs(adj));
      }
    }
    frontier = nextFrontier;
  }
  return count;
}

/**
 * Create a view map marked with continent values for transport unloading targets.
 * Continents with more cities get higher marks (0-9).
 */
function createUnloadViewMap(
  viewMap: ViewMapCell[],
  state: GameState,
  aiOwner: Owner,
): ViewMapCell[] {
  const tempMap = viewMap.map(cell => ({ ...cell }));

  // Find coastal cells and mark them based on continent value
  const evaluated = new Set<Loc>();

  for (let loc = 0; loc < MAP_SIZE; loc++) {
    if (!isOnBoard(loc)) continue;
    const contents = viewMap[loc].contents;
    // Look for land cells that haven't been evaluated
    if (contents !== "+" && contents !== "*" && contents !== "X" && contents !== "O") continue;
    if (evaluated.has(loc)) continue;

    const continent = mapContinent(viewMap, loc, ".");

    // Count targets directly from viewMap characters — NOT scanContinent
    // (scanContinent hardcodes O=P1, X=P2, which is wrong for P2's viewMap
    //  where O=own city and X=enemy city regardless of player)
    let targetCities = 0;
    let hasOwnCity = false;
    let unexplored = 0;
    for (const cLoc of continent) {
      evaluated.add(cLoc);
      const c = viewMap[cLoc].contents;
      if (c === "X") targetCities++;       // enemy city (correct for any player's viewMap)
      else if (c === "*") targetCities++;   // unowned city
      else if (c === "O") hasOwnCity = true;
      else if (c === " ") unexplored++;
    }

    // Calculate continent value (0-9)
    const value = Math.min(targetCities, 9);

    // Skip our own continent when it has no targets (don't sail home)
    if (value === 0 && hasOwnCity) continue;
    // Skip continents with nothing interesting
    if (value === 0 && unexplored === 0) continue;

    // Mark coastal water cells adjacent to this continent
    for (const cLoc of continent) {
      const adjacent = getAdjacentLocs(cLoc);
      for (const adj of adjacent) {
        if (viewMap[adj].contents === "." || viewMap[adj].contents === " ") {
          const currentMark = tempMap[adj].contents;
          const newMark = String(value);
          // Keep the higher value
          if (currentMark < "0" || currentMark > "9" || newMark > currentMark) {
            tempMap[adj] = { ...tempMap[adj], contents: newMark };
          }
        }
      }
    }
  }

  return tempMap;
}

/**
 * Create a view map with waiting armies marked as '$' for transport loading.
 * Marks ALL water tiles adjacent to own coastal armies so the transport can path to them.
 */
function createTTLoadViewMap(
  viewMap: ViewMapCell[],
  state: GameState,
  aiOwner: Owner,
): ViewMapCell[] {
  const tempMap = viewMap.map(cell => ({ ...cell }));

  for (const u of state.units) {
    if (u.owner !== aiOwner || u.type !== UnitType.Army || u.shipId !== null) continue;
    // Mark idle, exploring, and waiting-for-transport armies as pickup targets
    if (u.func !== UnitBehavior.None && u.func !== UnitBehavior.Explore && u.func !== UnitBehavior.WaitForTransport) continue;

    // Mark ALL adjacent water cells (not just one) so BFS has consistent targets
    const adjacent = getAdjacentLocs(u.loc);
    for (const adj of adjacent) {
      if (viewMap[adj].contents === ".") {
        tempMap[adj] = { ...tempMap[adj], contents: "$" };
      }
    }
  }

  return tempMap;
}

// ─── Step 4.4: AI Fighter Movement ────────────────────────────────────────────

function aiFighterMove(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const movesLeft = objMoves(unit) - unit.moved;
  if (movesLeft <= 0) return actions;

  for (let step = 0; step < movesLeft; step++) {
    if (findUnit(state, unit.id) === undefined) break;

    // 1. Check for adjacent attack targets
    const attack = findAdjacentAttack(viewMap, unit.loc, FIGHTER_ATTACK);
    if (attack) {
      actions.push({ type: "attack", unitId: unit.id, targetLoc: attack.targetLoc });
      return actions;
    }

    // 2. Fuel check — return to base if low on range
    const nearestCityDist = findNearestCityDist(state, unit.loc, aiOwner);
    if (unit.range <= nearestCityDist + 2) {
      // Return to nearest city
      const cityTarget = findMoveToward(viewMap, unit.loc, airMoveInfo("O", new Map([["O", 1]])));
      if (cityTarget !== null) {
        actions.push({ type: "move", unitId: unit.id, loc: cityTarget });
        continue;
      }
      // No city reachable — find carrier
      const carrierTarget = findMoveToward(viewMap, unit.loc, airMoveInfo("C", new Map([["C", 1]])));
      if (carrierTarget !== null) {
        actions.push({ type: "move", unitId: unit.id, loc: carrierTarget });
        continue;
      }
      break; // stranded, nothing we can do
    }

    // 3. Seek objectives — enemy units, exploration
    const fightTarget = findMoveToward(viewMap, unit.loc, fighterFightMoveInfo());
    if (fightTarget !== null) {
      actions.push({ type: "move", unitId: unit.id, loc: fightTarget });
    } else {
      break;
    }
  }

  return actions;
}

/**
 * Find the distance to the nearest owned city.
 */
function findNearestCityDist(state: GameState, loc: Loc, owner: Owner): number {
  let minDist = INFINITY;
  for (const city of state.cities) {
    if (city.owner === owner) {
      const d = dist(loc, city.loc);
      if (d < minDist) minDist = d;
    }
  }
  return minDist;
}

// ─── Step 4.4 (cont.): AI Ship Movement ───────────────────────────────────────

function aiShipMove(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const movesLeft = objMoves(unit) - unit.moved;
  if (movesLeft <= 0) return actions;

  const attrs = getUnitAttributes(unit.type);

  for (let step = 0; step < movesLeft; step++) {
    if (findUnit(state, unit.id) === undefined) break;

    // 1. If damaged, go to port for repair
    if (unit.hits < attrs.maxHits) {
      // Check if already in port
      const cell = state.map[unit.loc];
      if (cell.cityId !== null) {
        const city = state.cities[cell.cityId];
        if (city.owner === aiOwner) {
          // Stay in port for repair
          return actions;
        }
      }

      // Navigate to nearest port
      const portTarget = findMoveToward(viewMap, unit.loc, shipRepairMoveInfo());
      if (portTarget !== null) {
        actions.push({ type: "move", unitId: unit.id, loc: portTarget });
        continue;
      }
    }

    // 2. Check for adjacent attack targets
    const attack = findAdjacentAttack(viewMap, unit.loc, SHIP_ATTACK);
    if (attack) {
      actions.push({ type: "attack", unitId: unit.id, targetLoc: attack.targetLoc });
      return actions; // combat resolves, done for this ship
    }

    // 3. Seek objectives — enemy ships and exploration
    const fightTarget = findMoveToward(viewMap, unit.loc, shipFightMoveInfo());
    if (fightTarget !== null) {
      actions.push({ type: "move", unitId: unit.id, loc: fightTarget });
    } else {
      break;
    }
  }

  return actions;
}

// ─── Idle Behavior Assignment ─────────────────────────────────────────────────

/**
 * Assign behaviors to idle units that the AI didn't move.
 * - Armies: max 1 sentry per city, rest explore
 * - Ships/fighters: explore
 */
function assignIdleBehaviors(
  state: GameState,
  aiOwner: Owner,
  actions: PlayerAction[],
): void {
  // Track which units already have actions
  const unitsWithActions = new Set<number>();
  for (const a of actions) {
    if ("unitId" in a) unitsWithActions.add((a as any).unitId);
  }

  // Track sentry count per city location
  const sentryCounts = new Map<number, number>();
  for (const unit of state.units) {
    if (unit.owner === aiOwner && unit.func === UnitBehavior.Sentry) {
      const count = sentryCounts.get(unit.loc) ?? 0;
      sentryCounts.set(unit.loc, count + 1);
    }
  }

  for (const unit of state.units) {
    if (unit.owner !== aiOwner) continue;
    if (unit.func !== UnitBehavior.None) continue;
    if (unit.shipId !== null) continue;
    if (unit.type === UnitType.Satellite) continue;
    // Transports must stay idle (func=None) so aiTransportMove handles them each turn
    if (unit.type === UnitType.Transport) continue;
    if (unitsWithActions.has(unit.id)) continue;

    // Check if this unit is at one of our cities
    const cell = state.map[unit.loc];
    const atOwnCity = cell.cityId !== null && state.cities[cell.cityId].owner === aiOwner;

    if (atOwnCity) {
      const currentSentries = sentryCounts.get(unit.loc) ?? 0;
      if (currentSentries < 1) {
        // First idle unit at this city becomes sentry
        actions.push({ type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.Sentry });
        sentryCounts.set(unit.loc, currentSentries + 1);
      } else {
        // Additional units at city explore
        actions.push({ type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.Explore });
      }
    } else {
      // Not at a city — explore
      actions.push({ type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.Explore });
    }
  }
}

// ─── Step 4.5: AI Turn Orchestrator ────────────────────────────────────────────

/**
 * Compute all AI actions for a turn.
 * Implements the full AI decision loop:
 * 1. Refresh vision (scan all pieces)
 * 2. Run production decisions
 * 3. Move units in MOVE_ORDER priority
 */
export function computeAITurn(
  state: GameState,
  aiOwner: Owner,
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const viewMap = state.viewMaps[aiOwner];
  if (!viewMap) return actions;

  // 1. Refresh vision — scan all AI pieces
  for (const unit of state.units) {
    if (unit.owner === aiOwner) {
      scan(state, aiOwner, unit.loc);
    }
  }
  for (const city of state.cities) {
    if (city.owner === aiOwner) {
      scan(state, aiOwner, city.loc);
    }
  }

  // 2. Production decisions
  {
    const ownCities = state.cities.filter(c => c.owner === aiOwner);
    aiLog(`=== Turn ${state.turn} (${aiOwner === Owner.Player1 ? "P1" : "P2"}) — ${ownCities.length} cities, ${state.units.filter(u => u.owner === aiOwner).length} units ===`);
    for (const c of ownCities) {
      const a = UNIT_ATTRIBUTES[c.production];
      aiLog(`  City #${c.id}: building ${a.name} (work=${c.work}/${a.buildTime})`);
    }
  }
  actions.push(...aiProduction(state, aiOwner, viewMap));

  // Log unit behavior summary
  {
    const behaviorCounts: Record<string, number> = {};
    for (const u of state.units) {
      if (u.owner !== aiOwner) continue;
      const bName = u.func === UnitBehavior.None ? "idle" : BEHAVIOR_NAMES[behaviorIndex(u.func)];
      const label = `${UNIT_ATTRIBUTES[u.type].char}:${bName}`;
      behaviorCounts[label] = (behaviorCounts[label] || 0) + 1;
    }
    const parts = Object.entries(behaviorCounts).map(([k, v]) => `${k}(${v})`);
    if (parts.length > 0) aiLog(`  Units: ${parts.join(" ")}`);
  }

  // 3. Move units in MOVE_ORDER priority
  // Track armies claimed by transports so aiArmyMove doesn't generate conflicting actions
  const claimedUnitIds = new Set<number>();

  for (const unitType of MOVE_ORDER) {
    // Skip satellites — they move automatically in executeTurn
    if (unitType === UnitType.Satellite) continue;

    // Collect all AI units of this type (copy list since it may change during movement)
    const unitsOfType = state.units
      .filter(u => u.owner === aiOwner && u.type === unitType)
      .map(u => u.id);

    for (const unitId of unitsOfType) {
      if (claimedUnitIds.has(unitId)) continue; // claimed by a transport
      const unit = findUnit(state, unitId);
      if (!unit) continue; // unit may have died

      // Skip units that already have a behavior — let processUnitBehaviors handle them
      if (unit.func !== UnitBehavior.None) continue;

      const moveActions = moveAIUnit(state, unit, aiOwner, viewMap, claimedUnitIds);
      actions.push(...moveActions);
    }
  }

  // 5. Assign behaviors to idle units (no objectives found by AI movement)
  assignIdleBehaviors(state, aiOwner, actions);

  // 4. Check for surrender
  const aiCities = state.cities.filter(c => c.owner === aiOwner).length;
  const aiArmies = state.units.filter(u => u.owner === aiOwner && u.type === UnitType.Army).length;
  const enemyOwner = aiOwner === Owner.Player1 ? Owner.Player2 : Owner.Player1;
  const enemyCities = state.cities.filter(c => c.owner === enemyOwner).length;
  const enemyArmies = state.units.filter(u => u.owner === enemyOwner && u.type === UnitType.Army).length;

  if (aiCities === 0 && aiArmies === 0) {
    actions.push({ type: "resign" });
  } else if (
    enemyCities > 0 &&
    aiCities < enemyCities / 3 &&
    aiArmies < enemyArmies / 3
  ) {
    actions.push({ type: "resign" });
  }

  return actions;
}

/**
 * Move a single AI unit based on its type.
 */
function moveAIUnit(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
  claimedUnitIds: Set<number>,
): PlayerAction[] {
  switch (unit.type) {
    case UnitType.Army:
      return aiArmyMove(state, unit, aiOwner, viewMap);
    case UnitType.Transport:
      return aiTransportMove(state, unit, aiOwner, viewMap, claimedUnitIds);
    case UnitType.Fighter:
      return aiFighterMove(state, unit, aiOwner, viewMap);
    case UnitType.Patrol:
    case UnitType.Destroyer:
    case UnitType.Submarine:
    case UnitType.Battleship:
    case UnitType.Carrier:
      return aiShipMove(state, unit, aiOwner, viewMap);
    default:
      return [];
  }
}
