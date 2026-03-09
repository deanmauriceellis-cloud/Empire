// Empire Reborn — Pathfinding Engine
// Phase 3, Step 3.6: Perimeter-list BFS with weighted objectives
// Ported from VMS-Empire map.c

import {
  MAP_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  DIR_OFFSET,
  Direction,
  TerrainFlag,
  TerrainType,
} from "./constants.js";
import type { Loc, ViewMapCell } from "./types.js";
import { isOnBoard, locCol } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

/** A cell in the path map. */
export interface PathCell {
  cost: number;      // cumulative BFS cost from origin (-1 = unvisited)
  incCost: number;   // incremental cost to reach this cell
  terrain: TerrainFlag;
}

/** Movement info for pathfinding — defines what we're looking for and the cost weights. */
export interface MoveInfo {
  /** Terrain types this unit can traverse. */
  canMove: (terrain: TerrainFlag) => boolean;
  /** Objective characters to search for on the view map. */
  objectives: string;
  /** Weight for each objective character. Lower weight = higher priority. 0 = skip. */
  weights: Map<string, number>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Convert a view map cell's contents to a TerrainFlag. */
export function viewCellToTerrain(contents: string): TerrainFlag {
  switch (contents) {
    case "+": return TerrainFlag.Land;
    case ".": return TerrainFlag.Water;
    case " ": return TerrainFlag.Unknown;
    default:
      // Cities, units, etc. are on either land or water
      // Uppercase = own, lowercase = enemy, * = unowned city, O = own city, X = enemy city
      if (contents === "*" || contents === "O" || contents === "X") return TerrainFlag.Land;
      // Unit chars on water or land — for pathfinding, treat as passable terrain
      return TerrainFlag.Air; // most permissive; the canMove function handles specifics
  }
}

/** Check if two locations are adjacent (not wrapping). */
function isAdjacent(a: Loc, b: Loc): boolean {
  const colDiff = Math.abs(locCol(a) - locCol(b));
  return colDiff <= 1;
}

// ─── Path Map ───────────────────────────────────────────────────────────────────

/** Create a fresh path map (all cells unvisited). */
export function createPathMap(): PathCell[] {
  const pm: PathCell[] = new Array(MAP_SIZE);
  for (let i = 0; i < MAP_SIZE; i++) {
    pm[i] = { cost: -1, incCost: 0, terrain: TerrainFlag.Unknown };
  }
  return pm;
}

// ─── BFS Pathfinding ────────────────────────────────────────────────────────────

/**
 * Find the best objective reachable from `from` via BFS.
 * Returns the location of the best objective, or null if none found.
 * The pathMap is populated with costs for backtracking.
 */
export function findObjective(
  pathMap: PathCell[],
  viewMap: ViewMapCell[],
  from: Loc,
  moveInfo: MoveInfo,
): Loc | null {
  // Initialize origin
  pathMap[from].cost = 0;
  pathMap[from].incCost = 0;
  pathMap[from].terrain = viewCellToTerrain(viewMap[from].contents);

  let currentPerimeter: Loc[] = [from];
  let nextPerimeter: Loc[] = [];
  let bestLoc: Loc | null = null;
  let bestCost = Infinity;
  let curCost = 0;

  while (currentPerimeter.length > 0) {
    // If we already found something and current cost exceeds best, stop
    if (bestCost <= curCost) break;

    nextPerimeter = [];

    for (const loc of currentPerimeter) {
      // Check all 8 neighbors
      for (let d = 0; d < 8; d++) {
        const adj = loc + DIR_OFFSET[d];
        if (adj < 0 || adj >= MAP_SIZE) continue;
        if (!isOnBoard(adj)) continue;
        if (!isAdjacent(loc, adj)) continue;
        if (pathMap[adj].cost >= 0) continue; // already visited

        const contents = viewMap[adj].contents;
        const terrain = viewCellToTerrain(contents);

        // Check if this terrain is traversable
        if (!moveInfo.canMove(terrain) && terrain !== TerrainFlag.Unknown) continue;

        const newCost = curCost + 1;
        pathMap[adj].cost = newCost;
        pathMap[adj].incCost = 1;
        pathMap[adj].terrain = terrain;

        // Check if this is an objective
        if (moveInfo.objectives.includes(contents)) {
          const weight = moveInfo.weights.get(contents) ?? 1;
          const totalCost = newCost * weight;
          if (totalCost < bestCost) {
            bestCost = totalCost;
            bestLoc = adj;
          }
        }

        // Only expand further into traversable terrain
        if (moveInfo.canMove(terrain)) {
          nextPerimeter.push(adj);
        }
      }
    }

    currentPerimeter = nextPerimeter;
    curCost += 1;
  }

  return bestLoc;
}

/**
 * Mark the shortest path from origin to dest on the pathMap.
 * Sets terrain to TerrainFlag.Path for cells on the path.
 * Call after findObjective has populated the pathMap.
 */
export function markPath(pathMap: PathCell[], dest: Loc): void {
  if (pathMap[dest].cost <= 0) return;
  if (pathMap[dest].terrain === TerrainFlag.Path) return;

  pathMap[dest].terrain = TerrainFlag.Path;

  // Backtrack: find an adjacent cell with cost = current cost - incCost
  const targetCost = pathMap[dest].cost - pathMap[dest].incCost;

  for (let d = 0; d < 8; d++) {
    const adj = dest + DIR_OFFSET[d];
    if (adj < 0 || adj >= MAP_SIZE) continue;
    if (!isAdjacent(dest, adj)) continue;
    if (pathMap[adj].cost === targetCost) {
      markPath(pathMap, adj);
      return; // only follow one backtrack path
    }
  }
}

/**
 * Find the best direction to move from `loc` along a marked path.
 * Returns the Direction to move, or null if no path found.
 * Prefers diagonal moves (corners first), then cardinals.
 */
export function findDirection(pathMap: PathCell[], loc: Loc): Direction | null {
  // Priority: corners first (keep unit centered in path), then cardinals
  const order = [
    Direction.NorthWest, Direction.NorthEast,
    Direction.SouthWest, Direction.SouthEast,
    Direction.West, Direction.East,
    Direction.North, Direction.South,
  ];

  let bestDir: Direction | null = null;
  let bestScore = -1;

  for (const dir of order) {
    const adj = loc + DIR_OFFSET[dir];
    if (adj < 0 || adj >= MAP_SIZE) continue;
    if (!isOnBoard(adj)) continue;
    if (!isAdjacent(loc, adj)) continue;

    if (pathMap[adj].terrain !== TerrainFlag.Path) continue;

    // Score: count how many adjacent cells are also on the path
    // This keeps the unit centered in the valid path corridor
    let score = 0;
    for (let d2 = 0; d2 < 8; d2++) {
      const adj2 = adj + DIR_OFFSET[d2];
      if (adj2 >= 0 && adj2 < MAP_SIZE && isAdjacent(adj, adj2)) {
        if (pathMap[adj2].terrain === TerrainFlag.Path) score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestDir = dir;
    }
  }

  return bestDir;
}

// ─── Pre-built MoveInfo Factories ───────────────────────────────────────────────

/** MoveInfo for land units (armies). */
export function landMoveInfo(objectives: string, weights: Map<string, number>): MoveInfo {
  return {
    canMove: (t) => t === TerrainFlag.Land || t === TerrainFlag.Air,
    objectives,
    weights,
  };
}

/** MoveInfo for water units (ships). */
export function waterMoveInfo(objectives: string, weights: Map<string, number>): MoveInfo {
  return {
    canMove: (t) => t === TerrainFlag.Water || t === TerrainFlag.Air,
    objectives,
    weights,
  };
}

/** MoveInfo for air units (fighters, satellites). */
export function airMoveInfo(objectives: string, weights: Map<string, number>): MoveInfo {
  return {
    canMove: (_t) => true, // can traverse everything
    objectives,
    weights,
  };
}
