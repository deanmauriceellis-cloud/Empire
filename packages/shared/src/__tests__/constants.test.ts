import { describe, it, expect } from "vitest";
import {
  MAP_WIDTH, MAP_HEIGHT, MAP_SIZE, NUM_CITY,
  Direction, DIR_OFFSET, Owner, UnitType, UnitBehavior,
  MOVE_ORDER, UNIT_TYPE_CHARS, NUM_UNIT_TYPES,
  behaviorIndex, behaviorToDirection,
  SECTOR_ROWS, SECTOR_COLS, NUM_SECTORS,
  ROWS_PER_SECTOR, COLS_PER_SECTOR,
} from "../index.js";

describe("map constants", () => {
  it("has correct dimensions", () => {
    expect(MAP_WIDTH).toBe(100);
    expect(MAP_HEIGHT).toBe(60);
    expect(MAP_SIZE).toBe(6000);
  });

  it("computes NUM_CITY from formula", () => {
    // ((100 * (100 + 60)) / 228) = 70.175... → 70
    expect(NUM_CITY).toBe(70);
  });
});

describe("directions", () => {
  it("has 8 directions", () => {
    expect(DIR_OFFSET).toHaveLength(8);
  });

  it("north moves up one row", () => {
    expect(DIR_OFFSET[Direction.North]).toBe(-MAP_WIDTH);
  });

  it("south moves down one row", () => {
    expect(DIR_OFFSET[Direction.South]).toBe(MAP_WIDTH);
  });

  it("east moves right one column", () => {
    expect(DIR_OFFSET[Direction.East]).toBe(1);
  });

  it("offsets are consistent with directions", () => {
    expect(DIR_OFFSET[Direction.NorthEast]).toBe(-MAP_WIDTH + 1);
    expect(DIR_OFFSET[Direction.SouthWest]).toBe(MAP_WIDTH - 1);
  });
});

describe("unit types", () => {
  it("has 15 unit types", () => {
    expect(NUM_UNIT_TYPES).toBe(15);
    expect(UNIT_TYPE_CHARS).toBe("AFPDSTCBZERXWMG");
  });

  it("MOVE_ORDER contains all 15 types", () => {
    expect(MOVE_ORDER).toHaveLength(15);
    const sorted = [...MOVE_ORDER].sort((a, b) => a - b);
    expect(sorted).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });
});

describe("behaviors", () => {
  it("behaviorIndex maps correctly", () => {
    expect(behaviorIndex(UnitBehavior.None)).toBe(0);
    expect(behaviorIndex(UnitBehavior.Random)).toBe(1);
    expect(behaviorIndex(UnitBehavior.Sentry)).toBe(2);
    expect(behaviorIndex(UnitBehavior.Explore)).toBe(5);
  });

  it("behaviorToDirection maps move behaviors to directions", () => {
    expect(behaviorToDirection(UnitBehavior.MoveN)).toBe(Direction.North);
    expect(behaviorToDirection(UnitBehavior.MoveE)).toBe(Direction.East);
    expect(behaviorToDirection(UnitBehavior.MoveNW)).toBe(Direction.NorthWest);
  });
});

describe("sectors", () => {
  it("has correct sector layout", () => {
    expect(SECTOR_ROWS).toBe(5);
    expect(SECTOR_COLS).toBe(2);
    expect(NUM_SECTORS).toBe(10);
  });

  it("sector dimensions cover the map", () => {
    expect(ROWS_PER_SECTOR * SECTOR_ROWS).toBeGreaterThanOrEqual(MAP_HEIGHT);
    expect(COLS_PER_SECTOR * SECTOR_COLS).toBeGreaterThanOrEqual(MAP_WIDTH);
  });
});
