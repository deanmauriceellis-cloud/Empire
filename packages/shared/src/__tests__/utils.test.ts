import { describe, it, expect } from "vitest";
import {
  MAP_WIDTH, MAP_HEIGHT, MAP_SIZE,
  locRow, locCol, rowColLoc, locToPosition, positionToLoc,
  isOnBoard, isRowColOnBoard, dist,
  getAdjacentLocs, moveInDirection,
  locSector, sectorCenter,
  Direction,
} from "../index.js";

describe("coordinate math", () => {
  it("locRow and locCol are inverses of rowColLoc", () => {
    const loc = rowColLoc(15, 42);
    expect(locRow(loc)).toBe(15);
    expect(locCol(loc)).toBe(42);
  });

  it("round-trips through Position", () => {
    const loc = rowColLoc(30, 50);
    const pos = locToPosition(loc);
    expect(pos.row).toBe(30);
    expect(pos.col).toBe(50);
    expect(positionToLoc(pos)).toBe(loc);
  });

  it("first cell is row 0, col 0", () => {
    expect(locRow(0)).toBe(0);
    expect(locCol(0)).toBe(0);
  });

  it("last cell is row 59, col 99", () => {
    const last = MAP_SIZE - 1;
    expect(locRow(last)).toBe(MAP_HEIGHT - 1);
    expect(locCol(last)).toBe(MAP_WIDTH - 1);
  });
});

describe("isOnBoard", () => {
  it("rejects negative locations", () => {
    expect(isOnBoard(-1)).toBe(false);
  });

  it("rejects locations beyond map", () => {
    expect(isOnBoard(MAP_SIZE)).toBe(false);
  });

  it("rejects edge cells (row 0, col 0, last row, last col)", () => {
    expect(isOnBoard(rowColLoc(0, 50))).toBe(false);   // top edge
    expect(isOnBoard(rowColLoc(59, 50))).toBe(false);   // bottom edge
    expect(isOnBoard(rowColLoc(30, 0))).toBe(false);    // left edge
    expect(isOnBoard(rowColLoc(30, 99))).toBe(false);   // right edge
  });

  it("accepts interior cells", () => {
    expect(isOnBoard(rowColLoc(1, 1))).toBe(true);
    expect(isOnBoard(rowColLoc(30, 50))).toBe(true);
    expect(isOnBoard(rowColLoc(58, 98))).toBe(true);
  });
});

describe("dist (Chebyshev)", () => {
  it("same location = 0", () => {
    const loc = rowColLoc(10, 10);
    expect(dist(loc, loc)).toBe(0);
  });

  it("adjacent = 1", () => {
    const a = rowColLoc(10, 10);
    const b = rowColLoc(11, 11);
    expect(dist(a, b)).toBe(1);
  });

  it("diagonal distance = max of row/col diff", () => {
    const a = rowColLoc(5, 5);
    const b = rowColLoc(10, 20);
    expect(dist(a, b)).toBe(15); // max(5, 15) = 15
  });

  it("horizontal distance", () => {
    const a = rowColLoc(10, 0);
    const b = rowColLoc(10, 50);
    expect(dist(a, b)).toBe(50);
  });
});

describe("getAdjacentLocs", () => {
  it("interior cell has 8 neighbors", () => {
    const loc = rowColLoc(30, 50);
    const adj = getAdjacentLocs(loc);
    expect(adj).toHaveLength(8);
  });

  it("cell near edge has fewer neighbors", () => {
    const loc = rowColLoc(1, 1); // near corner, only some neighbors are on board
    const adj = getAdjacentLocs(loc);
    // (0,0), (0,1), (0,2) are off-board (row 0), (1,0) is off-board (col 0)
    // only (1,2), (2,0)=off, (2,1), (2,2) → some filtered
    expect(adj.length).toBeGreaterThan(0);
    expect(adj.length).toBeLessThan(8);
  });

  it("all returned locs are on board", () => {
    const loc = rowColLoc(2, 2);
    const adj = getAdjacentLocs(loc);
    for (const a of adj) {
      expect(isOnBoard(a)).toBe(true);
    }
  });
});

describe("moveInDirection", () => {
  it("moves north correctly", () => {
    const loc = rowColLoc(10, 10);
    const newLoc = moveInDirection(loc, Direction.North);
    expect(newLoc).toBe(rowColLoc(9, 10));
  });

  it("moves southeast correctly", () => {
    const loc = rowColLoc(10, 10);
    const newLoc = moveInDirection(loc, Direction.SouthEast);
    expect(newLoc).toBe(rowColLoc(11, 11));
  });

  it("returns null for off-map moves", () => {
    const loc = rowColLoc(0, 50);
    expect(moveInDirection(loc, Direction.North)).toBeNull();
  });
});

describe("sectors", () => {
  it("locSector for center of map", () => {
    const loc = rowColLoc(30, 50);
    const sector = locSector(loc);
    expect(sector).toBeGreaterThanOrEqual(0);
    expect(sector).toBeLessThan(10);
  });

  it("sectorCenter returns valid location", () => {
    for (let s = 0; s < 10; s++) {
      const center = sectorCenter(s);
      expect(center).toBeGreaterThanOrEqual(0);
      expect(center).toBeLessThan(MAP_SIZE);
    }
  });

  it("locSector round-trips approximately through sectorCenter", () => {
    // The center of a sector should map back to the same sector
    for (let s = 0; s < 10; s++) {
      const center = sectorCenter(s);
      expect(locSector(center)).toBe(s);
    }
  });
});
