// Empire Reborn — Continent Analysis (View Map)
// Phase 3, Step 3.7: BFS flood-fill on view maps, census, lake detection
// Ported from VMS-Empire map.c (vmap_cont, vmap_cont_scan)

import {
  MAP_SIZE,
  DIR_OFFSET,
  Owner,
  UnitType,
  UNIT_TYPE_CHARS,
} from "./constants.js";
import type { Loc, ViewMapCell, ScanCounts } from "./types.js";
import { isOnBoard, locCol } from "./utils.js";
import { VM_UNEXPLORED, VM_LAND, VM_UNOWNED_CITY, VM_OWN_CITY, VM_ENEMY_CITY } from "./viewmap-chars.js";

// ─── Continent Mapping ──────────────────────────────────────────────────────────

/**
 * BFS flood-fill from a location on the view map.
 * Returns the set of all connected locations that are NOT the badTerrain.
 * Unexplored cells (' ') are included in the continent but not expanded.
 *
 * @param viewMap - a player's view map
 * @param loc - starting location
 * @param badTerrain - terrain character to stop at ('.' for land continents, '+' for water bodies)
 */
export function mapContinent(
  viewMap: ViewMapCell[],
  loc: Loc,
  badTerrain: string,
): Set<Loc> {
  const continent = new Set<Loc>();
  if (!isOnBoard(loc)) return continent;

  const queue: Loc[] = [loc];
  continent.add(loc);

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (let d = 0; d < 8; d++) {
      const adj = current + DIR_OFFSET[d];
      if (adj < 0 || adj >= MAP_SIZE) continue;
      if (!isOnBoard(adj)) continue;
      if (continent.has(adj)) continue;

      // Column wrapping guard
      const colDiff = Math.abs(locCol(adj) - locCol(current));
      if (colDiff > 1) continue;

      const contents = viewMap[adj].contents;

      // Skip bad terrain
      if (contents === badTerrain) continue;

      continent.add(adj);

      // Unexplored cells are part of the continent but don't expand from them
      if (contents !== VM_UNEXPLORED) {
        queue.push(adj);
      }
    }
  }

  return continent;
}

// ─── Continent Census ───────────────────────────────────────────────────────────

/**
 * Scan a continent (set of locations) and count what's on it.
 * Returns a ScanCounts summary.
 */
export function scanContinent(
  viewMap: ViewMapCell[],
  continent: Set<Loc>,
): ScanCounts {
  const counts: ScanCounts = {
    playerCities: { [Owner.Unowned]: 0, [Owner.Player1]: 0, [Owner.Player2]: 0 },
    playerUnits: {
      [Owner.Unowned]: createUnitCounts(),
      [Owner.Player1]: createUnitCounts(),
      [Owner.Player2]: createUnitCounts(),
    },
    size: continent.size,
    unownedCities: 0,
    unexplored: 0,
  };

  for (const loc of continent) {
    const contents = viewMap[loc].contents;

    switch (contents) {
      case VM_UNEXPLORED:
        counts.unexplored++;
        break;
      case VM_UNOWNED_CITY:
        counts.unownedCities++;
        counts.playerCities[Owner.Unowned]++;
        break;
      case VM_OWN_CITY:
        counts.playerCities[Owner.Player1]++;
        break;
      case VM_ENEMY_CITY:
        counts.playerCities[Owner.Player2]++;
        break;
      default: {
        // Unit characters: uppercase = Player1, lowercase = Player2
        const upper = contents.toUpperCase();
        const idx = UNIT_TYPE_CHARS.indexOf(upper);
        if (idx >= 0) {
          const owner = contents === upper ? Owner.Player1 : Owner.Player2;
          counts.playerUnits[owner][idx as UnitType]++;
        }
        break;
      }
    }
  }

  return counts;
}

/** Create a zeroed unit count record. */
function createUnitCounts(): Record<UnitType, number> {
  return {
    [UnitType.Army]: 0,
    [UnitType.Fighter]: 0,
    [UnitType.Patrol]: 0,
    [UnitType.Destroyer]: 0,
    [UnitType.Submarine]: 0,
    [UnitType.Transport]: 0,
    [UnitType.Carrier]: 0,
    [UnitType.Battleship]: 0,
    [UnitType.Satellite]: 0,
    [UnitType.Construction]: 0,
    [UnitType.Artillery]: 0,
    [UnitType.SpecialForces]: 0,
    [UnitType.AWACS]: 0,
    [UnitType.MissileCruiser]: 0,
    [UnitType.EngineerBoat]: 0,
  };
}

// ─── Lake Detection ─────────────────────────────────────────────────────────────

/**
 * Check if a water body is a lake (no strategic value).
 * A lake has no unowned cities, no enemy cities, and no unexplored cells.
 */
export function isLake(viewMap: ViewMapCell[], loc: Loc): boolean {
  const waterBody = mapContinent(viewMap, loc, VM_LAND); // stop at land
  const counts = scanContinent(viewMap, waterBody);

  return counts.unownedCities === 0 &&
    counts.playerCities[Owner.Player1] === 0 &&
    counts.playerCities[Owner.Player2] === 0 &&
    counts.unexplored === 0;
}

// ─── Explore Location Pruning ───────────────────────────────────────────────────

/**
 * Find locations worth exploring on a continent.
 * Returns cells that are adjacent to unexplored territory.
 */
export function findExploreLocs(
  viewMap: ViewMapCell[],
  continent: Set<Loc>,
): Loc[] {
  const exploreLocs: Loc[] = [];

  for (const loc of continent) {
    if (viewMap[loc].contents === VM_UNEXPLORED) continue; // skip unexplored cells themselves

    // Check if any neighbor is unexplored
    for (let d = 0; d < 8; d++) {
      const adj = loc + DIR_OFFSET[d];
      if (adj < 0 || adj >= MAP_SIZE) continue;
      if (!isOnBoard(adj)) continue;
      const colDiff = Math.abs(locCol(adj) - locCol(loc));
      if (colDiff > 1) continue;

      if (viewMap[adj].contents === VM_UNEXPLORED) {
        exploreLocs.push(loc);
        break;
      }
    }
  }

  return exploreLocs;
}
