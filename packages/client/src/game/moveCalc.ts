// Empire Reborn — Move Calculator
// Computes valid move and attack targets for a selected unit.

import {
  Owner,
  UnitType,
  getAdjacentLocs,
  goodLoc,
  objMoves,
} from "@empire/shared";
import type { GameState, UnitState, Loc } from "@empire/shared";
import type { TileHighlight } from "../types.js";

/**
 * Compute all valid move and attack targets for a unit.
 * Returns an array of TileHighlights showing where the unit can go.
 */
export function computeHighlights(
  unit: UnitState,
  state: GameState,
): TileHighlight[] {
  if (unit.moved >= objMoves(unit)) return [];

  const highlights: TileHighlight[] = [];
  const adjacentLocs = getAdjacentLocs(unit.loc);

  for (const loc of adjacentLocs) {
    // Check for enemy units (attack target)
    const enemyUnit = state.units.find(
      (u) => u.loc === loc && u.owner !== unit.owner && u.shipId === null,
    );
    if (enemyUnit) {
      highlights.push({ loc, type: "attack" });
      continue;
    }

    // Check for enemy/unowned city (attack/capture target)
    const cell = state.map[loc];
    if (cell && cell.cityId !== null) {
      const city = state.cities[cell.cityId];
      if (city.owner !== unit.owner && city.owner !== Owner.Unowned) {
        highlights.push({ loc, type: "attack" });
        continue;
      }
      // Unowned city — army can capture
      if (city.owner === Owner.Unowned && unit.type === UnitType.Army) {
        highlights.push({ loc, type: "attack" });
        continue;
      }
    }

    // Check for valid move
    if (goodLoc(state, unit, loc)) {
      highlights.push({ loc, type: "move" });
    }
  }

  return highlights;
}

/**
 * Determine what clicking a highlighted tile should do.
 * Returns the action type and direction offset.
 */
export function getClickAction(
  unit: UnitState,
  targetLoc: Loc,
  highlights: TileHighlight[],
): TileHighlight | null {
  return highlights.find((h) => h.loc === targetLoc) ?? null;
}
