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
  ScanCounts,
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
  scanContinent,
  isLake,
} from "./continent.js";

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

// Army fight objectives: O=own-city, *=unowned, X=enemy-city, a=enemy-army, ' '=explore
// Weight 11 for exploration encourages armies to find things to do
function armyFightMoveInfo(): MoveInfo {
  return landMoveInfo("O*Xa +", new Map([
    ["O", 1], ["*", 1], ["X", 1], ["a", 1], [" ", 11], ["+", 11],
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
function isCityOnLake(viewMap: ViewMapCell[], cityLoc: Loc): boolean {
  // Check if any adjacent cell is water
  const adjacent = getAdjacentLocs(cityLoc);
  let hasWater = false;
  for (const adj of adjacent) {
    const contents = viewMap[adj].contents;
    if (contents === ".") {
      hasWater = true;
      break;
    }
  }
  if (!hasWater) return false; // no water nearby, not on a lake

  // Check if adjacent water is a lake
  for (const adj of adjacent) {
    const contents = viewMap[adj].contents;
    if (contents === ".") {
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
    // Lake cities can't build ships (except fighters and armies)
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
  const onLake = isCityOnLake(viewMap, city.loc);

  // Map the city's continent
  const continent = mapContinent(viewMap, city.loc, ".");
  const census = scanContinent(viewMap, continent);

  const enemyOwner = aiOwner === Owner.Player1 ? Owner.Player2 : Owner.Player1;
  const enemyCities = census.playerCities[enemyOwner];
  const aiArmies = census.playerUnits[aiOwner][UnitType.Army];
  const hasInterest = census.unexplored > 0 || enemyCities > 0 || census.unownedCities > 0;

  // Priority 1: Defend against enemy presence on continent
  let armiesNeeded = enemyCities - aiArmies;
  if (hasInterest) armiesNeeded++;
  if (enemyCities > 0) armiesNeeded++;

  if (armiesNeeded > 0 && city.production !== UnitType.Army) {
    return UnitType.Army;
  }

  // Priority 2: Ensure transport production (first non-lake coastal city)
  if (!onLake && prodCounts[UnitType.Transport] === 0) {
    return UnitType.Transport;
  }

  // Priority 3: Follow ratio tables if current production is overproduced
  const aiCityCount = state.cities.filter(c => c.owner === aiOwner).length;
  const ratio = getRatioTable(aiCityCount);

  if (overproduced(prodCounts, ratio, city.production)) {
    return needMore(prodCounts, ratio, onLake);
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
      // Use cross-cost heuristic: prefer land fight unless water target is much closer
      const fightDist = dist(unit.loc, fightTarget);
      const loadDist = dist(unit.loc, loadTarget);
      // Cross cost: boarding costs more unless there are good targets overseas
      const crossCost = 30; // moderate bias toward staying on land
      if (loadDist * 2 < fightDist - crossCost) {
        actions.push({ type: "move", unitId: unit.id, loc: loadTarget });
      } else {
        actions.push({ type: "move", unitId: unit.id, loc: fightTarget });
      }
    } else if (fightTarget !== null) {
      actions.push({ type: "move", unitId: unit.id, loc: fightTarget });
    } else if (loadTarget !== null) {
      actions.push({ type: "move", unitId: unit.id, loc: loadTarget });
    } else {
      // Try to move away from city if stuck
      const awayLoc = moveAway(state, unit, viewMap);
      if (awayLoc !== null) {
        actions.push({ type: "move", unitId: unit.id, loc: awayLoc });
      }
      break; // no more moves if truly stuck
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
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const movesLeft = objMoves(unit) - unit.moved;
  if (movesLeft <= 0) return actions;

  const capacity = objCapacity(unit);
  const isFull = unit.cargoIds.length >= capacity;
  const isEmpty = unit.cargoIds.length === 0;

  for (let step = 0; step < movesLeft; step++) {
    if (findUnit(state, unit.id) === undefined) break;

    // Decide mode: loading vs unloading
    if (isFull || (!isEmpty && shouldUnload(state, unit, aiOwner, viewMap))) {
      // UNLOADING MODE: head toward enemy continents

      // Check for adjacent attack (transports can attack other transports)
      const attack = findAdjacentAttack(viewMap, unit.loc, TT_ATTACK);
      if (attack) {
        actions.push({ type: "attack", unitId: unit.id, targetLoc: attack.targetLoc });
        return actions;
      }

      // Check if we should unload armies (adjacent to land with enemy nearby)
      const unloadAction = tryUnloadArmies(state, unit, aiOwner, viewMap);
      if (unloadAction.length > 0) {
        actions.push(...unloadAction);
        return actions;
      }

      // Navigate toward enemy continent
      const unloadMap = createUnloadViewMap(viewMap, state, aiOwner);
      const target = findMoveToward(unloadMap, unit.loc, ttUnloadMoveInfo());
      if (target !== null) {
        actions.push({ type: "move", unitId: unit.id, loc: target });
      } else {
        break;
      }
    } else {
      // LOADING MODE: seek armies to load

      // Check for adjacent armies to load
      const loaded = tryLoadArmies(state, unit, aiOwner);
      if (loaded) {
        // Don't spend a move, just loaded
        if (unit.cargoIds.length >= capacity) continue; // switch to unload mode
        // Stay here if more armies nearby
      }

      // Navigate toward waiting armies
      const loadMap = createTTLoadViewMap(viewMap, state, aiOwner);
      const target = findMoveToward(loadMap, unit.loc, ttLoadMoveInfo());
      if (target !== null) {
        actions.push({ type: "move", unitId: unit.id, loc: target });
      } else {
        // No armies to find, explore
        const exploreTarget = findMoveToward(viewMap, unit.loc, ttExploreMoveInfo());
        if (exploreTarget !== null) {
          actions.push({ type: "move", unitId: unit.id, loc: exploreTarget });
        } else {
          break;
        }
      }
    }
  }

  return actions;
}

/**
 * Decide if a partially-loaded transport should start unloading.
 */
function shouldUnload(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): boolean {
  // If more than half full and near enemy coast, start unloading
  const capacity = objCapacity(unit);
  if (unit.cargoIds.length >= capacity / 2) {
    // Check if near enemy territory
    const adjacent = getAdjacentLocs(unit.loc);
    for (const adj of adjacent) {
      const contents = viewMap[adj].contents;
      if (contents === "X" || contents === "+" || contents === "*") {
        return true;
      }
    }
  }
  return false;
}

/**
 * Try to unload armies from transport onto adjacent land.
 */
function tryUnloadArmies(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const adjacent = getAdjacentLocs(unit.loc);

  // Find adjacent land tiles that are interesting (enemy cities, unowned cities, or plain land)
  const landTargets: Loc[] = [];
  for (const adj of adjacent) {
    const cell = state.map[adj];
    if (cell.terrain === TerrainType.Land || cell.terrain === TerrainType.City) {
      // Prefer tiles near enemy/unowned cities
      landTargets.push(adj);
    }
  }

  if (landTargets.length === 0) return actions;

  // Unload all cargo onto the best land tile
  const bestLand = landTargets[0]; // simple: first available
  for (const cargoId of [...unit.cargoIds]) {
    const cargo = findUnit(state, cargoId);
    if (cargo) {
      actions.push({ type: "disembark", unitId: cargoId });
      actions.push({ type: "move", unitId: cargoId, loc: bestLand });
    }
  }

  return actions;
}

/**
 * Try to load adjacent armies onto the transport.
 */
function tryLoadArmies(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
): boolean {
  let loaded = false;
  const cap = objCapacity(unit);

  // Look for armies at the same location
  for (const u of state.units) {
    if (unit.cargoIds.length >= cap) break;
    if (u.owner === aiOwner && u.type === UnitType.Army && u.loc === unit.loc && u.shipId === null) {
      // Army is here and not embarked — it should auto-embark via moveUnit
      // but we can explicitly embark it
      loaded = true;
    }
  }

  return loaded;
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
  const enemyOwner = aiOwner === Owner.Player1 ? Owner.Player2 : Owner.Player1;

  // Find coastal cells and mark them based on continent value
  const evaluated = new Set<Loc>();

  for (let loc = 0; loc < MAP_SIZE; loc++) {
    if (!isOnBoard(loc)) continue;
    const contents = viewMap[loc].contents;
    // Look for land cells that haven't been evaluated
    if (contents !== "+" && contents !== "*" && contents !== "X" && contents !== "O") continue;
    if (evaluated.has(loc)) continue;

    const continent = mapContinent(viewMap, loc, ".");
    const census = scanContinent(viewMap, continent);

    for (const cLoc of continent) {
      evaluated.add(cLoc);
    }

    // Calculate continent value (0-9)
    const totalCities = census.playerCities[enemyOwner] + census.unownedCities;
    const value = Math.min(totalCities, 9);

    // Only mark if there's something worth attacking
    if (value === 0 && census.unexplored === 0) continue;

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
 */
function createTTLoadViewMap(
  viewMap: ViewMapCell[],
  state: GameState,
  aiOwner: Owner,
): ViewMapCell[] {
  const tempMap = viewMap.map(cell => ({ ...cell }));

  // Mark armies that are waiting for transport
  for (const u of state.units) {
    if (u.owner === aiOwner && u.type === UnitType.Army && u.shipId === null) {
      // Check if the army is on a coastal tile (adjacent to water)
      const adjacent = getAdjacentLocs(u.loc);
      for (const adj of adjacent) {
        if (viewMap[adj].contents === ".") {
          // Mark adjacent water cells so transport can path to them
          tempMap[adj] = { ...tempMap[adj], contents: "$" };
          break;
        }
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
  actions.push(...aiProduction(state, aiOwner, viewMap));

  // 3. Move units in MOVE_ORDER priority
  for (const unitType of MOVE_ORDER) {
    // Skip satellites — they move automatically in executeTurn
    if (unitType === UnitType.Satellite) continue;

    // Collect all AI units of this type (copy list since it may change during movement)
    const unitsOfType = state.units
      .filter(u => u.owner === aiOwner && u.type === unitType)
      .map(u => u.id);

    for (const unitId of unitsOfType) {
      const unit = findUnit(state, unitId);
      if (!unit) continue; // unit may have died

      const moveActions = moveAIUnit(state, unit, aiOwner, viewMap);
      actions.push(...moveActions);
    }
  }

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
): PlayerAction[] {
  switch (unit.type) {
    case UnitType.Army:
      return aiArmyMove(state, unit, aiOwner, viewMap);
    case UnitType.Transport:
      return aiTransportMove(state, unit, aiOwner, viewMap);
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
