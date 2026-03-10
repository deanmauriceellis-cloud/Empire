// Empire Reborn — AI System (Orchestrator)
// Coordinates AI turn execution: scan → production → movement → idle assignment → surrender check
// Ported from VMS-Empire compmove.c

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
import {
  aiLog,
  aiVLog,
} from "./ai-helpers.js";
import { aiProduction } from "./ai-production.js";
import { aiTransportMove } from "./ai-transport.js";
import { aiArmyMove, aiFighterMove, aiShipMove } from "./ai-movement.js";

// ─── Re-exports ──────────────────────────────────────────────────────────────────
// Preserve the public API — consumers import from ai.ts

export {
  setAIDebugLog,
  setAIVerboseLog,
  startAILogCapture,
  stopAILogCapture,
  aiDebugLog,
  aiVerboseLog,
} from "./ai-helpers.js";

// ─── Idle Behavior Assignment ─────────────────────────────────────────────────

/**
 * Check if a non-full transport is within ~3 water tiles of a land location.
 * Used to shortcut idle armies to WaitForTransport instead of Explore.
 */
function hasNearbyTransport(state: GameState, loc: Loc, aiOwner: Owner): boolean {
  // BFS outward from loc through land tiles, then check adjacent water for transports
  const visited = new Set<Loc>([loc]);
  let frontier: Loc[] = [loc];
  // Search land tiles within 2 steps, then check water neighbors
  for (let depth = 0; depth < 3; depth++) {
    const next: Loc[] = [];
    for (const cur of frontier) {
      for (const adj of getAdjacentLocs(cur)) {
        if (visited.has(adj)) continue;
        visited.add(adj);
        const terrain = state.map[adj].terrain;
        if (terrain === TerrainType.Sea) {
          // Check for non-full transport at this water tile
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
      // Fighters and combat ships should always explore — fighters are too fragile for sentry
      // and ships are too valuable sitting in port when they could be patrolling
      const isShip = unit.type === UnitType.Patrol || unit.type === UnitType.Destroyer
        || unit.type === UnitType.Submarine || unit.type === UnitType.Carrier
        || unit.type === UnitType.Battleship;
      if (unit.type === UnitType.Fighter || isShip) {
        actions.push({ type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.Explore });
      } else {
        const currentSentries = sentryCounts.get(unit.loc) ?? 0;
        if (currentSentries < 1) {
          // First idle unit at this city becomes sentry
          actions.push({ type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.Sentry });
          sentryCounts.set(unit.loc, currentSentries + 1);
        } else {
          // Additional units at city explore
          actions.push({ type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.Explore });
        }
      }
    } else if (unit.type === UnitType.Army && hasNearbyTransport(state, unit.loc, aiOwner)) {
      // Army near a non-full transport — go to coast for pickup (skip explore→wait cycle)
      actions.push({ type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.WaitForTransport });
    } else {
      // Not at a city — explore
      actions.push({ type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.Explore });
    }
  }
}

// ─── AI Turn Orchestrator ────────────────────────────────────────────────────────

/**
 * Compute all AI actions for a turn.
 * Implements the full AI decision loop:
 * 1. Refresh vision (scan all pieces)
 * 2. Run production decisions
 * 3. Move units in MOVE_ORDER priority
 * 4. Assign behaviors to idle units
 * 5. Check for surrender
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
  // Track water tiles claimed by transports for pickup — prevents multiple transports competing
  const claimedPickupLocs = new Set<Loc>();

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

      const moveActions = moveAIUnit(state, unit, aiOwner, viewMap, claimedUnitIds, claimedPickupLocs);
      actions.push(...moveActions);
    }
  }

  // 4. Assign behaviors to idle units (no objectives found by AI movement)
  assignIdleBehaviors(state, aiOwner, actions);

  // 5. Check for surrender
  const aiCities = state.cities.filter(c => c.owner === aiOwner).length;
  const aiArmies = state.units.filter(u => u.owner === aiOwner && u.type === UnitType.Army).length;
  const enemyOwner = aiOwner === Owner.Player1 ? Owner.Player2 : Owner.Player1;
  const enemyCities = state.cities.filter(c => c.owner === enemyOwner).length;
  const enemyArmies = state.units.filter(u => u.owner === enemyOwner && u.type === UnitType.Army).length;

  if (aiCities === 0 && aiArmies === 0) {
    actions.push({ type: "resign" });
  } else if (
    enemyCities > 0 &&
    aiCities < enemyCities / 5 &&
    aiArmies < enemyArmies / 5
  ) {
    actions.push({ type: "resign" });
  }

  // Summary log (always shown when aiDebugLog is on)
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
  claimedPickupLocs?: Set<Loc>,
): PlayerAction[] {
  switch (unit.type) {
    case UnitType.Army:
      return aiArmyMove(state, unit, aiOwner, viewMap);
    case UnitType.Transport:
      return aiTransportMove(state, unit, aiOwner, viewMap, claimedUnitIds, claimedPickupLocs);
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
