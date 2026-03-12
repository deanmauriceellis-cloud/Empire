// Empire Reborn — Incremental AI Planner (Phase 18A)
// Processes AI turn one unit at a time via step() calls.
// Enables spreading AI work across tick windows (server) or animation frames (client).

import {
  Owner,
  UnitType,
  UnitBehavior,
  TerrainType,
  MOVE_ORDER,
  BEHAVIOR_NAMES,
  behaviorIndex,
} from "./constants.js";
import { UNIT_ATTRIBUTES } from "./units.js";
import type {
  Loc,
  ViewMapCell,
  UnitState,
  GameState,
  PlayerAction,
} from "./types.js";
import { getAdjacentLocs } from "./utils.js";
import { findUnit, objCapacity, scan } from "./game.js";
import { aiLog, aiVLog } from "./ai-helpers.js";
import { aiProduction } from "./ai-production.js";
import { aiTransportMove } from "./ai-transport.js";
import { aiArmyMove, aiFighterMove, aiShipMove } from "./ai-movement.js";
import {
  aiConstructionMove,
  aiArtilleryMove,
  aiMissileCruiserMove,
  aiEngineerBoatMove,
  shouldSurrenderEconomic,
} from "./ai-economy.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface AIPlanner {
  /** Process next unit's AI. Returns true if more work remains. */
  step(): boolean;
  /** Get accumulated actions when complete. */
  getActions(): PlayerAction[];
  /** Progress for UI/logging. */
  progress(): { done: number; total: number };
  /** True when all phases complete. */
  isDone(): boolean;
}

// ─── Helpers (shared with ai.ts) ────────────────────────────────────────────────

function hasNearbyTransport(state: GameState, loc: Loc, aiOwner: Owner): boolean {
  const visited = new Set<Loc>([loc]);
  let frontier: Loc[] = [loc];
  for (let depth = 0; depth < 3; depth++) {
    const next: Loc[] = [];
    for (const cur of frontier) {
      for (const adj of getAdjacentLocs(cur)) {
        if (visited.has(adj)) continue;
        visited.add(adj);
        const terrain = state.map[adj].terrain;
        if (terrain === TerrainType.Sea) {
          for (const u of state.units) {
            if (u.owner === aiOwner && u.type === UnitType.Transport
                && u.loc === adj && u.cargoIds.length < objCapacity(u)) {
              return true;
            }
          }
        } else {
          next.push(adj);
        }
      }
    }
    frontier = next;
  }
  return false;
}

function assignIdleBehaviors(
  state: GameState,
  aiOwner: Owner,
  actions: PlayerAction[],
): void {
  const unitsWithActions = new Set<number>();
  for (const a of actions) {
    if ("unitId" in a) unitsWithActions.add((a as any).unitId);
  }

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
    if (unit.type === UnitType.Transport) continue;
    if (unit.type === UnitType.Construction) continue;
    if (unitsWithActions.has(unit.id)) continue;

    const cell = state.map[unit.loc];
    const atOwnCity = cell.cityId !== null && state.cities[cell.cityId].owner === aiOwner;

    if (atOwnCity) {
      const isShip = unit.type === UnitType.Patrol || unit.type === UnitType.Destroyer
        || unit.type === UnitType.Submarine || unit.type === UnitType.Carrier
        || unit.type === UnitType.Battleship || unit.type === UnitType.MissileCruiser
        || unit.type === UnitType.EngineerBoat;
      const isAir = unit.type === UnitType.Fighter || unit.type === UnitType.AWACS;
      if (isAir || isShip || unit.type === UnitType.Artillery || unit.type === UnitType.SpecialForces) {
        actions.push({ type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.Explore });
      } else {
        const currentSentries = sentryCounts.get(unit.loc) ?? 0;
        if (currentSentries < 1) {
          actions.push({ type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.Sentry });
          sentryCounts.set(unit.loc, currentSentries + 1);
        } else {
          actions.push({ type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.Explore });
        }
      }
    } else if (unit.type === UnitType.Army && hasNearbyTransport(state, unit.loc, aiOwner)) {
      actions.push({ type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.WaitForTransport });
    } else {
      actions.push({ type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.Explore });
    }
  }
}

function moveAIUnit(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
  claimedUnitIds: Set<number>,
  claimedPickupLocs?: Set<Loc>,
): PlayerAction[] {
  switch (unit.type) {
    case UnitType.Army:
    case UnitType.SpecialForces:
      return aiArmyMove(state, unit, aiOwner, viewMap);
    case UnitType.Transport:
      return aiTransportMove(state, unit, aiOwner, viewMap, claimedUnitIds, claimedPickupLocs);
    case UnitType.Fighter:
    case UnitType.AWACS:
      return aiFighterMove(state, unit, aiOwner, viewMap);
    case UnitType.Construction:
      return aiConstructionMove(state, unit, aiOwner, viewMap);
    case UnitType.Artillery:
      return aiArtilleryMove(state, unit, aiOwner, viewMap);
    case UnitType.Destroyer:
    case UnitType.Submarine:
    case UnitType.Battleship:
    case UnitType.MissileCruiser: {
      const shipActions = aiShipMove(state, unit, aiOwner, viewMap);
      if (shipActions.length > 0) return shipActions;
      return aiMissileCruiserMove(state, unit, aiOwner, viewMap);
    }
    case UnitType.EngineerBoat:
      return aiEngineerBoatMove(state, unit, aiOwner, viewMap);
    case UnitType.Patrol:
    case UnitType.Carrier:
      return aiShipMove(state, unit, aiOwner, viewMap);
    default:
      return [];
  }
}

// ─── Planner Implementation ─────────────────────────────────────────────────────

const enum PlannerPhase {
  Movement = 0,
  Finalize = 1,
  Done = 2,
}

/**
 * Create an incremental AI planner that processes one unit per step() call.
 *
 * Scan and production run immediately in the constructor (fast, <2ms).
 * Movement is the expensive phase — one unit per step().
 * Finalize (idle behaviors + surrender) runs on the last step.
 */
export function createAIPlanner(state: GameState, aiOwner: Owner): AIPlanner {
  const actions: PlayerAction[] = [];
  const viewMap = state.viewMaps[aiOwner];

  // If no viewMap, planner is immediately done (no actions)
  if (!viewMap) {
    return {
      step: () => false,
      getActions: () => actions,
      progress: () => ({ done: 0, total: 0 }),
      isDone: () => true,
    };
  }

  // ── Phase 1: Scan (immediate) ──
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

  // ── Phase 2: Production (immediate) ──
  {
    const ownCities = state.cities.filter(c => c.owner === aiOwner);
    aiLog(`=== Turn ${state.turn} (P${aiOwner}) — ${ownCities.length} cities, ${state.units.filter(u => u.owner === aiOwner).length} units ===`);
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

  // ── Phase 3: Movement (incremental) ──
  // Build the ordered list of unit IDs to process
  const claimedUnitIds = new Set<number>();
  const claimedPickupLocs = new Set<Loc>();

  // Build flat list of (unitId) in MOVE_ORDER priority
  const unitQueue: number[] = [];
  for (const unitType of MOVE_ORDER) {
    if (unitType === UnitType.Satellite) continue;
    const unitsOfType = state.units
      .filter(u => u.owner === aiOwner && u.type === unitType)
      .map(u => u.id);
    unitQueue.push(...unitsOfType);
  }

  const totalUnits = unitQueue.length;
  let queueIndex = 0;
  let phase: PlannerPhase = PlannerPhase.Movement;

  function step(): boolean {
    if (phase === PlannerPhase.Done) return false;

    if (phase === PlannerPhase.Movement) {
      // Process next unit in queue
      while (queueIndex < unitQueue.length) {
        const unitId = unitQueue[queueIndex++];
        if (claimedUnitIds.has(unitId)) continue;
        const unit = findUnit(state, unitId);
        if (!unit) continue;
        if (unit.func !== UnitBehavior.None) continue;

        const moveActions = moveAIUnit(state, unit, aiOwner, viewMap, claimedUnitIds, claimedPickupLocs);
        actions.push(...moveActions);
        return true; // more work remains
      }
      // Movement complete, advance to finalize
      phase = PlannerPhase.Finalize;
      return true; // one more step for finalize
    }

    if (phase === PlannerPhase.Finalize) {
      // Assign idle behaviors
      assignIdleBehaviors(state, aiOwner, actions);

      // Surrender check
      const aiCities = state.cities.filter(c => c.owner === aiOwner).length;
      const aiArmies = state.units.filter(u => u.owner === aiOwner && u.type === UnitType.Army).length;
      const enemyCities = state.cities.filter(c => c.owner !== aiOwner && c.owner !== 0).length;
      const enemyArmies = state.units.filter(u => u.owner !== aiOwner && u.owner !== 0 && u.type === UnitType.Army).length;

      if (aiCities === 0 && aiArmies === 0) {
        actions.push({ type: "resign" });
      } else if (
        enemyCities > 0 &&
        aiCities < enemyCities / 5 &&
        aiArmies < enemyArmies / 5
      ) {
        actions.push({ type: "resign" });
      } else if (shouldSurrenderEconomic(state, aiOwner)) {
        aiLog(`  Surrendering: economic hopelessness`);
        actions.push({ type: "resign" });
      }

      // Summary log
      {
        const moveCt = actions.filter(a => a.type === "move").length;
        const atkCt = actions.filter(a => a.type === "attack").length;
        const prodCt = actions.filter(a => a.type === "setProduction").length;
        const behavCt = actions.filter(a => a.type === "setBehavior").length;
        const aiUnits = state.units.filter(u => u.owner === aiOwner).length;
        const transports = state.units.filter(u => u.owner === aiOwner && u.type === UnitType.Transport);
        const totalCargo = transports.reduce((s, t) => s + t.cargoIds.length, 0);
        aiLog(`  Summary: ${actions.length} actions (${moveCt} moves, ${atkCt} attacks, ${prodCt} prod, ${behavCt} behav) | ${aiUnits} units, ${transports.length} transports carrying ${totalCargo}`);
      }

      phase = PlannerPhase.Done;
      return false; // all done
    }

    return false;
  }

  return {
    step,
    getActions: () => actions,
    progress: () => ({ done: Math.min(queueIndex, totalUnits), total: totalUnits }),
    isDone: () => phase === PlannerPhase.Done,
  };
}
