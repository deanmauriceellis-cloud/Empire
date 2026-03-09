// Empire Reborn — Turn Flow Manager
// Manages the "unit needs orders" cycle: auto-cycles through units,
// focuses camera, tracks which units have been given orders.

import { Owner, UnitBehavior, objMoves } from "@empire/shared";
import type { UnitState, GameState } from "@empire/shared";
import { locRow, locCol } from "@empire/shared";
import type { Camera } from "../core/camera.js";

export interface TurnFlow {
  /** The unit currently awaiting orders, or null. */
  readonly currentUnitId: number | null;
  /** Number of units still needing orders. */
  readonly remaining: number;
  /** Set which player we're controlling. */
  setOwner(owner: Owner): void;

  /** Start a new turn: scan for units needing orders. */
  startTurn(gameState: GameState): void;
  /** Mark a unit as having received orders. Advances to next unit. */
  markDone(unitId: number): void;
  /** Skip the current unit (keep it in the "needs orders" pool for later). */
  skipUnit(): void;
  /** Advance to the next unit needing orders. Focuses camera. */
  nextUnit(gameState: GameState, camera: Camera): void;
  /** Check if all units have orders or have been skipped. */
  canEndTurn(): boolean;
}

export function createTurnFlow(): TurnFlow {
  let needsOrders: number[] = [];    // unit IDs
  let doneUnits = new Set<number>(); // units that got orders this turn
  let currentIndex = -1;
  let currentUnitId: number | null = null;
  let playerOwner: Owner = Owner.Player1;

  function findUnitsNeedingOrders(state: GameState): number[] {
    return state.units
      .filter((u) =>
        u.owner === playerOwner &&
        u.shipId === null &&
        u.func === UnitBehavior.None &&
        u.moved < objMoves(u),
      )
      .map((u) => u.id);
  }

  function focusOnUnit(unitId: number, state: GameState, camera: Camera): void {
    const unit = state.units.find((u) => u.id === unitId);
    if (unit) {
      camera.panToTile(locCol(unit.loc), locRow(unit.loc));
    }
  }

  return {
    get currentUnitId() { return currentUnitId; },
    get remaining() {
      return needsOrders.filter((id) => !doneUnits.has(id)).length;
    },

    setOwner(owner: Owner): void {
      playerOwner = owner;
    },

    startTurn(gameState: GameState): void {
      doneUnits.clear();
      needsOrders = findUnitsNeedingOrders(gameState);
      currentIndex = -1;
      currentUnitId = null;
    },

    markDone(unitId: number): void {
      doneUnits.add(unitId);
      if (currentUnitId === unitId) {
        currentUnitId = null;
      }
    },

    skipUnit(): void {
      // Just advance past current without marking done
      // The unit stays in needsOrders but we move on
      if (currentUnitId !== null) {
        doneUnits.add(currentUnitId);
      }
      currentUnitId = null;
    },

    nextUnit(gameState: GameState, camera: Camera): void {
      // Re-scan to pick up units that may have become idle
      needsOrders = findUnitsNeedingOrders(gameState);

      // Find next unit not yet done
      let found = false;
      for (let i = 0; i < needsOrders.length; i++) {
        currentIndex = (currentIndex + 1) % needsOrders.length;
        const id = needsOrders[currentIndex];
        if (!doneUnits.has(id)) {
          currentUnitId = id;
          focusOnUnit(id, gameState, camera);
          found = true;
          break;
        }
      }

      if (!found) {
        currentUnitId = null;
      }
    },

    canEndTurn(): boolean {
      return needsOrders.every((id) => doneUnits.has(id)) || needsOrders.length === 0;
    },
  };
}
