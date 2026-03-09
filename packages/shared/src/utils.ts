// Empire Reborn — Utility Functions
// Ported from VMS-Empire (extern.h macros, math.c)

import {
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_SIZE,
  DIR_OFFSET,
  Direction,
  SECTOR_ROWS,
  SECTOR_COLS,
  ROWS_PER_SECTOR,
  COLS_PER_SECTOR,
} from "./constants.js";
import type { Loc, Position } from "./types.js";

// ─── Coordinate Math ─────────────────────────────────────────────────────────

/** Get the row of a flat-array location. */
export function locRow(loc: Loc): number {
  return Math.floor(loc / MAP_WIDTH);
}

/** Get the column of a flat-array location. */
export function locCol(loc: Loc): number {
  return loc % MAP_WIDTH;
}

/** Convert row/col to a flat-array location. */
export function rowColLoc(row: number, col: number): Loc {
  return row * MAP_WIDTH + col;
}

/** Convert a Loc to a Position. */
export function locToPosition(loc: Loc): Position {
  return { row: locRow(loc), col: locCol(loc) };
}

/** Convert a Position to a Loc. */
export function positionToLoc(pos: Position): Loc {
  return rowColLoc(pos.row, pos.col);
}

// ─── Board Validation ────────────────────────────────────────────────────────

/** Check if a location is within the map bounds (not on the edge). */
export function isOnBoard(loc: Loc): boolean {
  if (loc < 0 || loc >= MAP_SIZE) return false;
  const row = locRow(loc);
  const col = locCol(loc);
  return row > 0 && row < MAP_HEIGHT - 1 && col > 0 && col < MAP_WIDTH - 1;
}

/** Check if row/col are within the map bounds (not on the edge). */
export function isRowColOnBoard(row: number, col: number): boolean {
  return row > 0 && row < MAP_HEIGHT - 1 && col > 0 && col < MAP_WIDTH - 1;
}

// ─── Distance ────────────────────────────────────────────────────────────────

/** Chebyshev distance between two locations (max of abs differences). */
export function dist(a: Loc, b: Loc): number {
  const ar = locRow(a);
  const ac = locCol(a);
  const br = locRow(b);
  const bc = locCol(b);
  return Math.max(Math.abs(ar - br), Math.abs(ac - bc));
}

// ─── Adjacency ───────────────────────────────────────────────────────────────

/** Get all valid adjacent locations (up to 8). */
export function getAdjacentLocs(loc: Loc): Loc[] {
  const result: Loc[] = [];
  for (let i = 0; i < 8; i++) {
    const newLoc = loc + DIR_OFFSET[i];
    if (newLoc >= 0 && newLoc < MAP_SIZE && isOnBoard(newLoc)) {
      // Guard against wrapping: check column distance
      const colDiff = Math.abs(locCol(newLoc) - locCol(loc));
      if (colDiff <= 1) {
        result.push(newLoc);
      }
    }
  }
  return result;
}

/** Move a location in a direction, or return null if off-board. */
export function moveInDirection(loc: Loc, dir: Direction): Loc | null {
  const newLoc = loc + DIR_OFFSET[dir];
  if (newLoc < 0 || newLoc >= MAP_SIZE) return null;
  // Guard against column wrapping
  const colDiff = Math.abs(locCol(newLoc) - locCol(loc));
  if (colDiff > 1) return null;
  return newLoc;
}

// ─── Sectors ─────────────────────────────────────────────────────────────────

/** Get the sector number for a location. */
export function locSector(loc: Loc): number {
  const row = locRow(loc);
  const col = locCol(loc);
  const sectorRow = Math.floor(row / ROWS_PER_SECTOR);
  const sectorCol = Math.floor(col / COLS_PER_SECTOR);
  // Original uses col*SECTOR_ROWS + row ordering
  return sectorCol * SECTOR_ROWS + sectorRow;
}

/** Get the center location of a sector. */
export function sectorCenter(sector: number): Loc {
  const sectorRow = sector % SECTOR_ROWS;
  const sectorCol = Math.floor(sector / SECTOR_ROWS);
  const row = sectorRow * ROWS_PER_SECTOR + Math.floor(ROWS_PER_SECTOR / 2);
  const col = sectorCol * COLS_PER_SECTOR + Math.floor(COLS_PER_SECTOR / 2);
  return rowColLoc(row, col);
}
