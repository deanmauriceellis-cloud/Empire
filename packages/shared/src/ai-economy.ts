// Empire Reborn — AI Economy & Construction Strategy (Phase 8)
// AI management of construction units, deposit targeting, city upgrades,
// defensive structures, and bombard tactics.

import {
  MAP_SIZE,
  Owner,
  UnitType,
  UnitBehavior,
  TerrainType,
  BuildingType,
  DepositType,
  CITY_UPGRADE_TYPES,
  DEFENSIVE_STRUCTURE_TYPES,
  MAX_CITY_UPGRADES,
  TechType,
  NUM_RESOURCE_TYPES,
} from "./constants.js";
import { UNIT_ATTRIBUTES, UNIT_COSTS, canAffordUnit } from "./units.js";
import {
  BUILDING_ATTRIBUTES,
  canAffordBuilding,
  cityHasUpgradeSlot,
  cityHasUpgradeType,
  isStructureType,
} from "./buildings.js";
import { canProduceUnit, canBuildStructure, getPlayerTechLevels, getTechLevel } from "./tech.js";
import type { Loc, ViewMapCell, GameState, UnitState, CityState, PlayerAction } from "./types.js";
import { getAdjacentLocs, dist, isOnBoard } from "./utils.js";
import { findUnit, chebyshevDist } from "./game.js";
import { aiLog, aiVLog, findMoveToward } from "./ai-helpers.js";
import { landMoveInfo } from "./pathfinding.js";

// ─── AI Construction Unit Movement ──────────────────────────────────────────

/**
 * Decide what a construction unit should do this turn.
 * Priority order:
 * 1. If at a deposit with no building → build on deposit
 * 2. If at an owned city needing upgrades → build city upgrade
 * 3. If at a location needing a defensive structure → build structure
 * 4. Navigate toward nearest unclaimed deposit
 * 5. Navigate toward nearest city needing upgrades
 * 6. Stay put (nowhere to go)
 */
export function aiConstructionMove(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];

  // Check if already assigned to an active building (constructor is locked)
  const activeBuilding = state.buildings.find(
    b => b.constructorId === unit.id && !b.complete,
  );
  if (activeBuilding) {
    aiVLog(`  Construction #${unit.id}: building ${BUILDING_ATTRIBUTES[activeBuilding.type].name} (${activeBuilding.work}/${activeBuilding.buildTime})`);
    return actions; // stay put, tick will advance building
  }

  // 1. At a deposit with no building? Build on it
  const cell = state.map[unit.loc];
  if (cell.depositId !== null) {
    const deposit = state.deposits[cell.depositId];
    if (!deposit.buildingComplete && deposit.buildingId === null) {
      const buildingType = deposit.type as number as BuildingType;
      if (canAffordBuilding(state.resources[aiOwner], buildingType, 1)) {
        aiLog(`  Construction #${unit.id}: building on deposit (${BUILDING_ATTRIBUTES[buildingType].name}) at ${unit.loc}`);
        actions.push({ type: "buildOnDeposit", unitId: unit.id });
        return actions;
      }
      aiVLog(`  Construction #${unit.id}: can't afford deposit building, waiting`);
      return actions;
    }
  }

  // 2. At an owned city? Try to build an upgrade
  if (cell.cityId !== null) {
    const city = state.cities[cell.cityId];
    if (city.owner === aiOwner) {
      const upgradeType = pickCityUpgrade(state, city, aiOwner);
      if (upgradeType !== null) {
        if (canAffordBuilding(state.resources[aiOwner], upgradeType, 1)) {
          aiLog(`  Construction #${unit.id}: building ${BUILDING_ATTRIBUTES[upgradeType].name} at city #${city.id}`);
          actions.push({
            type: "buildCityUpgrade",
            unitId: unit.id,
            cityId: city.id,
            buildingType: upgradeType,
          });
          return actions;
        }
        aiVLog(`  Construction #${unit.id}: can't afford upgrade ${BUILDING_ATTRIBUTES[upgradeType].name}, waiting`);
        return actions;
      }
    }
  }

  // 3. At a land tile suitable for a defensive structure?
  const defStructure = pickDefensiveStructure(state, unit.loc, aiOwner);
  if (defStructure !== null) {
    if (canAffordBuilding(state.resources[aiOwner], defStructure, 1)) {
      aiLog(`  Construction #${unit.id}: building ${BUILDING_ATTRIBUTES[defStructure].name} at ${unit.loc}`);
      actions.push({ type: "buildStructure", unitId: unit.id, buildingType: defStructure });
      return actions;
    }
  }

  // 4. Navigate toward nearest target (deposit > city upgrade)
  const target = findConstructionTarget(state, unit, aiOwner, viewMap);
  if (target !== null) {
    actions.push({ type: "move", unitId: unit.id, loc: target });
    return actions;
  }

  aiVLog(`  Construction #${unit.id}: no targets, idle`);
  return actions;
}

// ─── Construction Target Finding ────────────────────────────────────────────

/**
 * Find the best target for a construction unit to move toward.
 * Returns the first step (adjacent loc) toward the target, or null.
 */
function findConstructionTarget(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): Loc | null {
  // Collect potential targets with priorities
  type Target = { loc: Loc; priority: number; label: string };
  const targets: Target[] = [];

  // Track which deposits are already being targeted by other construction units
  const claimedDepositLocs = new Set<Loc>();
  const claimedCityIds = new Set<number>();
  for (const u of state.units) {
    if (u.owner === aiOwner && u.type === UnitType.Construction && u.id !== unit.id) {
      // Check if this constructor is heading toward a deposit
      if (u.func === UnitBehavior.GoTo && u.targetLoc !== null) {
        claimedDepositLocs.add(u.targetLoc);
      }
      // Check if at a deposit already building
      const c = state.map[u.loc];
      if (c.depositId !== null) claimedDepositLocs.add(u.loc);
      if (c.cityId !== null) claimedCityIds.add(c.cityId);
    }
  }
  // Also claim deposits that already have buildings being constructed
  for (const b of state.buildings) {
    if (b.constructorId !== null && !b.complete) {
      claimedDepositLocs.add(b.loc);
      const bc = state.map[b.loc];
      if (bc.cityId !== null) claimedCityIds.add(bc.cityId);
    }
  }

  // Unclaimed deposits (visible and reachable)
  for (const deposit of state.deposits) {
    if (deposit.buildingComplete) continue;
    if (deposit.buildingId !== null) continue;
    if (claimedDepositLocs.has(deposit.loc)) continue;
    // Only target visible deposits (fog of war)
    if (viewMap[deposit.loc].contents === " ") continue; // unexplored
    const d = dist(unit.loc, deposit.loc);
    // Priority: closer deposits are better, slight preference by resource scarcity
    const scarcityBonus = getResourceScarcity(state, aiOwner, deposit.type);
    targets.push({ loc: deposit.loc, priority: 1000 - d + scarcityBonus, label: `deposit:${deposit.type}` });
  }

  // Cities needing upgrades
  for (const city of state.cities) {
    if (city.owner !== aiOwner) continue;
    if (claimedCityIds.has(city.id)) continue;
    const upgradeType = pickCityUpgrade(state, city, aiOwner);
    if (upgradeType === null) continue;
    const d = dist(unit.loc, city.loc);
    targets.push({ loc: city.loc, priority: 500 - d, label: `upgrade:${BUILDING_ATTRIBUTES[upgradeType].name}` });
  }

  if (targets.length === 0) return null;

  // Sort by priority (highest first)
  targets.sort((a, b) => b.priority - a.priority);
  const best = targets[0];
  aiLog(`  Construction #${unit.id}: heading to ${best.label} at ${best.loc} (dist=${dist(unit.loc, best.loc)})`);

  // Use BFS pathfinding to find the first step toward target
  const moveInfo = landMoveInfo("+*", new Map([["+", 1], ["*", 1]]));
  // Create a temp viewMap marking the target as an objective
  const tempMap = viewMap.map(c => ({ ...c }));
  tempMap[best.loc] = { ...tempMap[best.loc], contents: "+" };
  const step = findMoveToward(tempMap, unit.loc, moveInfo);
  if (step !== null) return step;

  // Fallback: direct BFS on actual terrain
  return bfsFirstStep(state, unit.loc, best.loc);
}

/**
 * Simple BFS on actual terrain to find first step from start toward goal.
 */
function bfsFirstStep(state: GameState, start: Loc, goal: Loc): Loc | null {
  const visited = new Uint8Array(MAP_SIZE);
  const parent = new Int32Array(MAP_SIZE).fill(-1);
  const queue: Loc[] = [start];
  visited[start] = 1;

  while (queue.length > 0) {
    const loc = queue.shift()!;
    if (loc === goal) {
      // Trace back
      let cur = loc;
      while (parent[cur] !== start && parent[cur] !== -1) {
        cur = parent[cur];
      }
      return cur as Loc;
    }
    for (const adj of getAdjacentLocs(loc)) {
      if (visited[adj]) continue;
      const terrain = state.map[adj].terrain;
      if (terrain === TerrainType.Land || terrain === TerrainType.City) {
        visited[adj] = 1;
        parent[adj] = loc;
        queue.push(adj);
      }
    }
  }
  return null;
}

// ─── Resource Scarcity ──────────────────────────────────────────────────────

/**
 * Return a bonus (0-50) for how scarce a resource is for the AI.
 * Higher = more scarce = more urgently needed.
 */
function getResourceScarcity(state: GameState, aiOwner: Owner, depositType: DepositType): number {
  const res = state.resources[aiOwner];
  const resourceIdx = depositType as number;
  const stockpile = res[resourceIdx];
  // Count existing income for this resource
  let income = 0;
  for (const deposit of state.deposits) {
    if (deposit.owner === aiOwner && deposit.buildingComplete) {
      if (deposit.type === depositType) income += 3;
    }
  }
  // Lower stockpile + lower income = higher scarcity bonus
  if (stockpile < 20 && income === 0) return 50;
  if (stockpile < 50 && income <= 3) return 30;
  if (stockpile < 100) return 15;
  return 0;
}

// ─── City Upgrade Selection ─────────────────────────────────────────────────

/**
 * AI priority order for city upgrades:
 * 1. MilitaryAcademy (War research → unit unlocks)
 * 2. University (Science → vision, construction speed)
 * 3. TechLab (Electronics → AWACS, fighter range)
 * 4. Hospital (Health → HP, healing)
 * 5. Shipyard (ship build reduction — only coastal cities)
 * 6. Airfield (fighter range bonus)
 */
/**
 * Get dynamic tech upgrade priority based on military situation.
 * Default: Academy → University → TechLab → Hospital → Shipyard → Airfield
 * Shifts: War when losing militarily, Electronics when losing navally.
 */
function getUpgradePriority(state: GameState, aiOwner: Owner): BuildingType[] {
  const enemyOwner = aiOwner === Owner.Player1 ? Owner.Player2 : Owner.Player1;
  const aiArmies = state.units.filter(u => u.owner === aiOwner && u.type === UnitType.Army).length;
  const enemyArmies = state.units.filter(u => u.owner === enemyOwner && u.type === UnitType.Army).length;
  const aiShips = state.units.filter(u => u.owner === aiOwner &&
    (u.type === UnitType.Patrol || u.type === UnitType.Destroyer || u.type === UnitType.Submarine ||
     u.type === UnitType.Battleship || u.type === UnitType.MissileCruiser)).length;
  const enemyShips = state.units.filter(u => u.owner === enemyOwner &&
    (u.type === UnitType.Patrol || u.type === UnitType.Destroyer || u.type === UnitType.Submarine ||
     u.type === UnitType.Battleship || u.type === UnitType.MissileCruiser)).length;

  // Losing militarily → prioritize War research (MilitaryAcademy first)
  if (enemyArmies > aiArmies * 2) {
    return [
      BuildingType.MilitaryAcademy, BuildingType.Hospital,
      BuildingType.University, BuildingType.TechLab,
      BuildingType.Shipyard, BuildingType.Airfield,
    ];
  }

  // Losing navally → prioritize Electronics (TechLab first for AWACS/missile cruiser unlock)
  if (enemyShips > aiShips * 2 && enemyShips >= 3) {
    return [
      BuildingType.TechLab, BuildingType.MilitaryAcademy,
      BuildingType.University, BuildingType.Shipyard,
      BuildingType.Hospital, BuildingType.Airfield,
    ];
  }

  // Default priority
  return [
    BuildingType.MilitaryAcademy, BuildingType.University,
    BuildingType.TechLab, BuildingType.Hospital,
    BuildingType.Shipyard, BuildingType.Airfield,
  ];
}

/**
 * Pick the best upgrade for a city. Returns null if no upgrade is available/needed.
 */
export function pickCityUpgrade(
  state: GameState,
  city: CityState,
  aiOwner: Owner,
): BuildingType | null {
  if (!cityHasUpgradeSlot(city.upgradeIds)) return null;

  // Check if there's already a building under construction at this city
  for (const bid of city.upgradeIds) {
    const b = state.buildings.find(building => building.id === bid);
    if (b && !b.complete) return null; // wait for current to finish
  }

  const upgradePriority = getUpgradePriority(state, aiOwner);
  for (const upgradeType of upgradePriority) {
    // Already has this type?
    if (cityHasUpgradeType(city.upgradeIds, state.buildings, upgradeType)) continue;
    // Can afford?
    if (!canAffordBuilding(state.resources[aiOwner], upgradeType, 1)) continue;
    // Shipyard only makes sense at coastal cities
    if (upgradeType === BuildingType.Shipyard) {
      const adj = getAdjacentLocs(city.loc);
      const isCoastal = adj.some(a => state.map[a].terrain === TerrainType.Sea);
      if (!isCoastal) continue;
    }
    return upgradeType;
  }
  return null;
}

// ─── Defensive Structure Placement ──────────────────────────────────────────

/**
 * Decide whether to build a defensive structure at a location.
 * Only for construction units on land tiles (not cities, not deposits).
 */
function pickDefensiveStructure(
  state: GameState,
  loc: Loc,
  aiOwner: Owner,
): BuildingType | null {
  const cell = state.map[loc];
  // Must be plain land (not city, not deposit)
  if (cell.terrain !== TerrainType.Land) return null;
  if (cell.cityId !== null) return null;
  if (cell.depositId !== null) return null;

  // Don't build if there's already a structure here
  if (state.buildings.some(b => b.loc === loc && isStructureType(b.type))) return null;

  const enemyOwner = aiOwner === Owner.Player1 ? Owner.Player2 : Owner.Player1;
  const adj = getAdjacentLocs(loc);

  // Evaluate location context
  let nearOwnCity = false;
  let nearCoast = false;
  let isChokepoint = false;
  let adjacentLandCount = 0;
  for (const a of adj) {
    if (state.map[a].cityId !== null && state.cities[state.map[a].cityId!].owner === aiOwner) {
      nearOwnCity = true;
    }
    if (state.map[a].terrain === TerrainType.Sea) {
      nearCoast = true;
    }
    if (state.map[a].terrain === TerrainType.Land || state.map[a].terrain === TerrainType.City) {
      adjacentLandCount++;
    }
  }
  // Chokepoint: land tile with ≤3 adjacent land tiles (narrow passage between water/edges)
  isChokepoint = adjacentLandCount <= 3 && nearCoast;

  // Check if this is a frontier location (enemy units or cities visible on same continent)
  const viewMap = state.viewMaps[aiOwner];
  let isFrontier = false;
  let enemyLandNearby = false;
  let enemyAirNearby = false;
  let enemySeaNearby = false;

  for (const u of state.units) {
    if (u.owner !== enemyOwner) continue;
    const d = dist(loc, u.loc);
    if (d <= 8) isFrontier = true;
    if (d <= 5) {
      if (u.type === UnitType.Army || u.type === UnitType.Artillery || u.type === UnitType.SpecialForces) {
        enemyLandNearby = true;
      }
      if (u.type === UnitType.Fighter || u.type === UnitType.AWACS) {
        enemyAirNearby = true;
      }
      if (u.type === UnitType.Patrol || u.type === UnitType.Destroyer || u.type === UnitType.Submarine ||
          u.type === UnitType.Battleship || u.type === UnitType.MissileCruiser || u.type === UnitType.Transport) {
        enemySeaNearby = true;
      }
    }
  }
  // Also check enemy cities visible within 10 tiles
  for (const city of state.cities) {
    if (city.owner === enemyOwner && dist(loc, city.loc) <= 10) {
      isFrontier = true;
      break;
    }
  }

  // Must be near own city OR at a frontier/chokepoint
  if (!nearOwnCity && !isFrontier && !isChokepoint) return null;

  // Minefield at chokepoints (bridge approaches, narrow passages) — War 1
  if (isChokepoint && canBuildStructure(state, aiOwner, BuildingType.Minefield)) {
    if (canAffordBuilding(state.resources[aiOwner], BuildingType.Minefield, 1)) {
      return BuildingType.Minefield;
    }
  }

  // Bunker at frontier or near threatened city
  if ((isFrontier || enemyLandNearby) && canBuildStructure(state, aiOwner, BuildingType.Bunker)) {
    if (canAffordBuilding(state.resources[aiOwner], BuildingType.Bunker, 1)) {
      return BuildingType.Bunker;
    }
  }

  // Anti-Air when air threats detected
  if (enemyAirNearby && canBuildStructure(state, aiOwner, BuildingType.AntiAir)) {
    if (canAffordBuilding(state.resources[aiOwner], BuildingType.AntiAir, 1)) {
      return BuildingType.AntiAir;
    }
  }

  // Coastal Battery at shore locations with enemy naval presence
  if (nearCoast && enemySeaNearby && canBuildStructure(state, aiOwner, BuildingType.CoastalBattery)) {
    if (canAffordBuilding(state.resources[aiOwner], BuildingType.CoastalBattery, 1)) {
      return BuildingType.CoastalBattery;
    }
  }

  return null;
}

// ─── AI Artillery/Bombard Movement ──────────────────────────────────────────

/**
 * AI movement for Artillery units.
 * Artillery can only bombard (range 2), never melee.
 * Strategy: find enemies within bombard range, bombard them.
 * Otherwise move toward nearest enemy.
 */
export function aiArtilleryMove(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const enemyOwner = aiOwner === Owner.Player1 ? Owner.Player2 : Owner.Player1;
  const movesLeft = UNIT_ATTRIBUTES[unit.type].speed - unit.moved;
  if (movesLeft <= 0) return actions;

  // 1. Try to bombard an enemy in range
  const bombardTarget = findBombardTarget(state, unit, aiOwner);
  if (bombardTarget !== null) {
    aiLog(`  Artillery #${unit.id}: bombarding target at ${bombardTarget}`);
    actions.push({ type: "bombard", unitId: unit.id, targetLoc: bombardTarget });
    return actions;
  }

  // 2. Move toward nearest enemy but avoid walking into melee range.
  // Artillery should position ~2 tiles from enemy (bombard range), not adjacent.
  // Check if any enemy is adjacent — if so, don't move closer
  const adj = getAdjacentLocs(unit.loc);
  const enemyAdjacent = adj.some(a =>
    state.units.some(u => u.owner === enemyOwner && u.loc === a && u.shipId === null),
  );
  if (enemyAdjacent) {
    // Already in danger zone — try to move away
    for (const a of adj) {
      if (state.map[a].terrain === TerrainType.Land && !state.units.some(u => u.loc === a && u.shipId === null)) {
        // Check if this moves us further from enemy
        const nearestEnemy = state.units.find(u => u.owner === enemyOwner && u.shipId === null && dist(unit.loc, u.loc) <= 2);
        if (nearestEnemy && dist(a, nearestEnemy.loc) > dist(unit.loc, nearestEnemy.loc)) {
          aiLog(`  Artillery #${unit.id}: retreating from adjacent enemy`);
          actions.push({ type: "move", unitId: unit.id, loc: a });
          return actions;
        }
      }
    }
    aiVLog(`  Artillery #${unit.id}: stuck adjacent to enemy, holding position`);
    return actions;
  }

  // 3. Move toward objectives (enemy cities, enemy armies, unexplored)
  const moveTarget = findMoveToward(viewMap, unit.loc, landMoveInfo("aXr*", new Map([
    ["a", 1], ["X", 1], ["r", 1], ["*", 1],
  ])));
  if (moveTarget !== null) {
    actions.push({ type: "move", unitId: unit.id, loc: moveTarget });
  }

  return actions;
}

/**
 * AI movement for Missile Cruiser.
 * Bombard range 3, targets priority: structures > units.
 * Otherwise behave like a ship.
 */
export function aiMissileCruiserMove(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const movesLeft = UNIT_ATTRIBUTES[unit.type].speed - unit.moved;
  if (movesLeft <= 0) return actions;

  // 1. Try to bombard an enemy in range
  const bombardTarget = findBombardTarget(state, unit, aiOwner);
  if (bombardTarget !== null) {
    aiLog(`  MissileCruiser #${unit.id}: bombarding target at ${bombardTarget}`);
    actions.push({ type: "bombard", unitId: unit.id, targetLoc: bombardTarget });
    return actions;
  }

  // 2. Fall through to normal ship movement (handled by caller)
  return actions;
}

/**
 * AI movement for Special Forces.
 * Uses army movement for combat but prioritizes scouting: explore toward unexplored
 * territory and enemy cities (leverage speed 2 + invisibility for deep recon).
 * Dispatched from ai.ts — falls through to aiArmyMove for standard army behavior,
 * but Special Forces are preferentially assigned Explore behavior in assignIdleBehaviors
 * (never sentry) to keep them mobile for scouting.
 */
// Special Forces dispatched to aiArmyMove in ai.ts (same combat logic, invisibility is passive)

// ─── Bombard Target Finding ─────────────────────────────────────────────────

/**
 * Find the best bombard target for a unit.
 * Returns the target location or null.
 */
function findBombardTarget(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
): Loc | null {
  const attrs = UNIT_ATTRIBUTES[unit.type];
  const range = attrs.attackRange;
  if (range <= 0) return null;
  if (unit.moved >= attrs.speed) return null; // no moves left

  const enemyOwner = aiOwner === Owner.Player1 ? Owner.Player2 : Owner.Player1;

  // Scan for enemy targets within bombard range (1 < dist <= range)
  type BombardCandidate = { loc: Loc; priority: number };
  const candidates: BombardCandidate[] = [];

  // Enemy structures first (high value)
  for (const b of state.buildings) {
    if (b.owner !== enemyOwner || !b.complete) continue;
    if (!isStructureType(b.type)) continue;
    const d = chebyshevDist(state, unit.loc, b.loc);
    if (d > 0 && d <= range) {
      candidates.push({ loc: b.loc, priority: 100 + BUILDING_ATTRIBUTES[b.type].strength });
    }
  }

  // Enemy units
  for (const u of state.units) {
    if (u.owner !== enemyOwner || u.shipId !== null) continue;
    const d = chebyshevDist(state, unit.loc, u.loc);
    if (d > 0 && d <= range) {
      // Prioritize by strength (higher = more valuable target)
      candidates.push({ loc: u.loc, priority: 50 + UNIT_ATTRIBUTES[u.type].strength });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0].loc;
}

// ─── AI Resource Awareness ──────────────────────────────────────────────────

/**
 * Check if the AI should build construction units based on economic needs.
 * Returns true if there are unclaimed deposits or cities needing upgrades.
 */
export function needsConstruction(state: GameState, aiOwner: Owner): boolean {
  // Count existing and in-production construction units
  const existingConstructors = state.units.filter(
    u => u.owner === aiOwner && u.type === UnitType.Construction,
  ).length;
  const producingConstructors = state.cities.filter(
    c => c.owner === aiOwner && c.production === UnitType.Construction,
  ).length;
  const totalConstructors = existingConstructors + producingConstructors;

  // Limit: 1 per 4 cities (minimum 1 if needed, max 3)
  const cityCount = state.cities.filter(c => c.owner === aiOwner).length;
  const maxConstructors = Math.min(3, Math.max(1, Math.floor(cityCount / 4)));
  if (totalConstructors >= maxConstructors) return false;

  // Check for unclaimed visible deposits
  const viewMap = state.viewMaps[aiOwner];
  let unclaimedDeposits = 0;
  for (const deposit of state.deposits) {
    if (deposit.buildingComplete) continue;
    if (deposit.buildingId !== null) continue;
    // Only count visible deposits
    if (viewMap && viewMap[deposit.loc].contents !== " ") {
      unclaimedDeposits++;
    }
  }

  // Check for cities needing upgrades
  let citiesNeedUpgrades = 0;
  for (const city of state.cities) {
    if (city.owner !== aiOwner) continue;
    if (pickCityUpgrade(state, city, aiOwner) !== null) {
      citiesNeedUpgrades++;
    }
  }

  return unclaimedDeposits > 0 || citiesNeedUpgrades > 0;
}

/**
 * Check if the AI can afford to produce a unit given current resources and income.
 * More conservative than canAffordUnit — also checks if stockpile is healthy.
 */
export function canAffordProduction(state: GameState, aiOwner: Owner, unitType: UnitType): boolean {
  const res = state.resources[aiOwner];
  const cost = UNIT_COSTS[unitType];
  // Must be able to afford the unit outright
  for (let i = 0; i < NUM_RESOURCE_TYPES; i++) {
    if (res[i] < cost[i]) return false;
  }
  // Don't drain resources below minimum safety margin
  const MIN_SAFETY = 20;
  for (let i = 0; i < NUM_RESOURCE_TYPES; i++) {
    if (res[i] - cost[i] < MIN_SAFETY && cost[i] > 0) return false;
  }
  return true;
}

// ─── AI Surrender Enhancement ───────────────────────────────────────────────

/**
 * Enhanced surrender check that factors in economic hopelessness.
 */
export function shouldSurrenderEconomic(state: GameState, aiOwner: Owner): boolean {
  const enemyOwner = aiOwner === Owner.Player1 ? Owner.Player2 : Owner.Player1;

  const aiCities = state.cities.filter(c => c.owner === aiOwner).length;
  const enemyCities = state.cities.filter(c => c.owner === enemyOwner).length;
  if (aiCities === 0) return true;
  if (enemyCities === 0) return false;

  // Factor: no deposits, no income, depleted stockpile
  const aiDeposits = state.deposits.filter(d => d.owner === aiOwner && d.buildingComplete).length;
  const aiRes = state.resources[aiOwner];
  const totalStockpile = aiRes[0] + aiRes[1] + aiRes[2];

  // Factor: tech disadvantage
  const aiTech = state.techResearch[aiOwner];
  const enemyTech = state.techResearch[enemyOwner];
  const aiTechTotal = aiTech.reduce((a, b) => a + b, 0);
  const enemyTechTotal = enemyTech.reduce((a, b) => a + b, 0);

  // Surrender if economically hopeless
  if (aiCities <= 2 && aiDeposits === 0 && totalStockpile < 50 && enemyCities > aiCities * 3) {
    return true;
  }

  // Surrender if tech disadvantage is massive and military weak
  const aiArmies = state.units.filter(u => u.owner === aiOwner && u.type === UnitType.Army).length;
  const enemyArmies = state.units.filter(u => u.owner === enemyOwner && u.type === UnitType.Army).length;
  if (enemyTechTotal > aiTechTotal * 3 && aiArmies < enemyArmies / 4 && aiCities < enemyCities / 3) {
    return true;
  }

  return false;
}

// ─── AI Engineer Boat Movement ──────────────────────────────────────────────

/**
 * AI movement for Engineer Boats.
 * Builds bridges between landmasses (river crossings), sea mines near enemies.
 * Falls back to exploration when no building targets exist.
 */
export function aiEngineerBoatMove(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const enemyOwner = aiOwner === Owner.Player1 ? Owner.Player2 : Owner.Player1;
  const movesLeft = UNIT_ATTRIBUTES[unit.type].speed - unit.moved;
  if (movesLeft <= 0) return actions;

  // Check if already building
  const activeBuilding = state.buildings.find(
    b => b.constructorId === unit.id && !b.complete,
  );
  if (activeBuilding) {
    aiVLog(`  EngineerBoat #${unit.id}: building ${BUILDING_ATTRIBUTES[activeBuilding.type].name}`);
    return actions; // stay put
  }

  // 1. Build bridge: if on water tile between two landmasses
  if (canBuildStructure(state, aiOwner, BuildingType.Bridge)) {
    const adj = getAdjacentLocs(unit.loc);
    const adjLand = adj.filter(a => state.map[a].terrain === TerrainType.Land || state.map[a].terrain === TerrainType.City);
    const noExistingStructure = !state.buildings.some(b => b.loc === unit.loc && isStructureType(b.type));
    // Good bridge spot: water tile with land on at least 2 sides (connecting landmasses)
    if (adjLand.length >= 2 && noExistingStructure) {
      if (canAffordBuilding(state.resources[aiOwner], BuildingType.Bridge, 1)) {
        aiLog(`  EngineerBoat #${unit.id}: building Bridge at ${unit.loc}`);
        actions.push({ type: "buildStructure", unitId: unit.id, buildingType: BuildingType.Bridge });
        return actions;
      }
    }
  }

  // 2. Build sea mine near enemy ships/cities
  if (canBuildStructure(state, aiOwner, BuildingType.SeaMine)) {
    const nearEnemy = state.units.some(u =>
      u.owner === enemyOwner && dist(unit.loc, u.loc) <= 3,
    ) || state.cities.some(c =>
      c.owner === enemyOwner && dist(unit.loc, c.loc) <= 3,
    );
    const noExistingStructure = !state.buildings.some(b => b.loc === unit.loc && isStructureType(b.type));
    if (nearEnemy && noExistingStructure) {
      if (canAffordBuilding(state.resources[aiOwner], BuildingType.SeaMine, 1)) {
        aiLog(`  EngineerBoat #${unit.id}: placing Sea Mine at ${unit.loc}`);
        actions.push({ type: "buildStructure", unitId: unit.id, buildingType: BuildingType.SeaMine });
        return actions;
      }
    }
  }

  // 3. No building targets — idle (will be assigned Explore behavior)
  return actions;
}
