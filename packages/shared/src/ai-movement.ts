// Empire Reborn — AI Unit Movement (Army, Fighter, Ship)

import { MAP_SIZE, DIR_OFFSET, Owner, UnitType, UnitBehavior, TerrainType, INFINITY } from "./constants.js";
import { UNIT_ATTRIBUTES, getUnitAttributes, ARMY_ATTACK, FIGHTER_ATTACK, SHIP_ATTACK } from "./units.js";
import type { Loc, ViewMapCell, UnitState, GameState, PlayerAction } from "./types.js";
import { isOnBoard, getAdjacentLocs, dist, locRow, locCol, rowColLoc } from "./utils.js";
import { findUnit, findNonFullShip, objMoves, objCapacity } from "./game.js";
import { airMoveInfo } from "./pathfinding.js";
import { VM_PICKUP_SINGLE } from "./viewmap-chars.js";
import {
  aiLog, aiVLog, findAdjacentAttack, findMoveToward, moveAway,
  armyFightMoveInfo, armyLoadMoveInfo, fighterFightMoveInfo,
  shipRepairMoveInfo, shipFightMoveInfo, findNearestCityDist,
} from "./ai-helpers.js";

// ─── AI Army Movement ──────────────────────────────────────────────────────────

export function aiArmyMove(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  // In N-player, "enemy" means any non-self, non-unowned player
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

// ─── Army Helpers ───────────────────────────────────────────────────────────────

/**
 * Create a temporary view map with loading transport locations marked as '$'.
 */
export function createTempViewMap(
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
        tempMap[u.loc] = { ...tempMap[u.loc], contents: VM_PICKUP_SINGLE };
      }
    }
  }

  // Mark cities producing transports
  for (const city of state.cities) {
    if (city.owner === aiOwner && city.production === UnitType.Transport) {
      tempMap[city.loc] = { ...tempMap[city.loc], contents: VM_PICKUP_SINGLE };
    }
  }

  return tempMap;
}

/**
 * BFS to find the first step toward the nearest coastal land tile (adjacent to water).
 * Returns the first move toward coast, or null if already at coast or unreachable.
 */
export function findNearestCoast(state: GameState, startLoc: Loc): Loc | null {
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

// ─── AI Fighter Movement ───────────────────────────────────────────────────────

export function aiFighterMove(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const movesLeft = objMoves(unit) - unit.moved;
  if (movesLeft <= 0) return actions;

  const speed = getUnitAttributes(unit.type).speed;

  for (let step = 0; step < movesLeft; step++) {
    if (findUnit(state, unit.id) === undefined) break;

    // 1. Check for adjacent attack targets
    const attack = findAdjacentAttack(viewMap, unit.loc, FIGHTER_ATTACK);
    if (attack) {
      actions.push({ type: "attack", unitId: unit.id, targetLoc: attack.targetLoc });
      return actions;
    }

    // 2. Fuel check — return to base if low on range
    // Use speed as buffer so the fighter has a full turn of margin
    const nearestCityDist = findNearestCityDist(state, unit.loc, aiOwner);
    if (unit.range <= nearestCityDist + speed) {
      // Return to nearest city (could be a different one = base hopping)
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

    // 3. Seek objectives — enemy units, exploration, own cities (for base-hopping)
    // Own cities ('O') are low-weight objectives so fighters naturally arc toward
    // other bases when no unexplored tiles are nearby, enabling base-to-base exploration.
    const fightTarget = findMoveToward(viewMap, unit.loc, fighterFightMoveInfo());
    if (fightTarget !== null) {
      actions.push({ type: "move", unitId: unit.id, loc: fightTarget });
    } else {
      // No BFS targets — fly toward farthest own city to reposition (base-hopping).
      // This breaks the "stuck at home city" pattern by sending fighters across the map
      // toward cities that may have unexplored territory nearby.
      let farthestCityLoc: Loc = -1 as Loc;
      let farthestDist = 0;
      for (const city of state.cities) {
        if (city.owner === aiOwner) {
          const d = dist(unit.loc, city.loc);
          if (d > farthestDist) {
            farthestDist = d;
            farthestCityLoc = city.loc;
          }
        }
      }
      if (farthestCityLoc >= 0 && farthestDist > 0) {
        const unitRow = locRow(unit.loc);
        const unitCol = locCol(unit.loc);
        const cityRow = locRow(farthestCityLoc);
        const cityCol = locCol(farthestCityLoc);
        const dr = Math.sign(cityRow - unitRow);
        const dc = Math.sign(cityCol - unitCol);
        const flyTarget = rowColLoc(unitRow + dr, unitCol + dc) as Loc;
        if (flyTarget >= 0 && flyTarget < MAP_SIZE && isOnBoard(flyTarget)) {
          actions.push({ type: "move", unitId: unit.id, loc: flyTarget });
          continue;
        }
      }
      break;
    }
  }

  return actions;
}

// ─── AI Ship Movement ──────────────────────────────────────────────────────────

export function aiShipMove(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const movesLeft = objMoves(unit) - unit.moved;
  if (movesLeft <= 0) return actions;

  const attrs = getUnitAttributes(unit.type);
  aiVLog(`  Ship #${unit.id} (${attrs.name}): loc=${unit.loc} hits=${unit.hits}/${attrs.maxHits} moves=${movesLeft}`);

  for (let step = 0; step < movesLeft; step++) {
    if (findUnit(state, unit.id) === undefined) break;

    // 1. If damaged, go to port for repair
    if (unit.hits < attrs.maxHits) {
      // Check if already in port
      const cell = state.map[unit.loc];
      if (cell.cityId !== null) {
        const city = state.cities[cell.cityId];
        if (city.owner === aiOwner) {
          aiVLog(`    Ship #${unit.id}: repairing in port at ${unit.loc}`);
          return actions;
        }
      }

      // Navigate to nearest port
      const portTarget = findMoveToward(viewMap, unit.loc, shipRepairMoveInfo());
      if (portTarget !== null) {
        aiVLog(`    Ship #${unit.id}: damaged, heading to port via ${portTarget}`);
        actions.push({ type: "move", unitId: unit.id, loc: portTarget });
        continue;
      }
    }

    // 2. Check for adjacent attack targets
    const attack = findAdjacentAttack(viewMap, unit.loc, SHIP_ATTACK);
    if (attack) {
      aiVLog(`    Ship #${unit.id}: attacking target at ${attack.targetLoc} (${attack.contents})`);
      actions.push({ type: "attack", unitId: unit.id, targetLoc: attack.targetLoc });
      return actions; // combat resolves, done for this ship
    }

    // 3. Seek objectives — enemy ships and exploration
    const fightTarget = findMoveToward(viewMap, unit.loc, shipFightMoveInfo());
    if (fightTarget !== null) {
      aiVLog(`    Ship #${unit.id}: moving toward objective at ${fightTarget}`);
      actions.push({ type: "move", unitId: unit.id, loc: fightTarget });
    } else {
      aiVLog(`    Ship #${unit.id}: no objectives found, idle`);
      break;
    }
  }

  return actions;
}
