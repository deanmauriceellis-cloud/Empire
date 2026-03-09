import { describe, it, expect } from "vitest";
import {
  MAP_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  Owner,
  UnitType,
} from "../constants.js";
import type { ViewMapCell } from "../types.js";
import {
  mapContinent,
  scanContinent,
  isLake,
  findExploreLocs,
} from "../continent.js";
import { rowColLoc } from "../utils.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Create a view map with configurable terrain. */
function createViewMap(defaultContents: string = "+"): ViewMapCell[] {
  const vm: ViewMapCell[] = new Array(MAP_SIZE);
  for (let i = 0; i < MAP_SIZE; i++) {
    const row = Math.floor(i / MAP_WIDTH);
    const col = i % MAP_WIDTH;
    const onBoard = row > 0 && row < MAP_HEIGHT - 1 && col > 0 && col < MAP_WIDTH - 1;
    vm[i] = {
      contents: onBoard ? defaultContents : " ",
      seen: onBoard ? 0 : -1,
    };
  }
  return vm;
}

/** Set a rectangular area of cells to specific contents. */
function setArea(
  vm: ViewMapCell[],
  row1: number, col1: number,
  row2: number, col2: number,
  contents: string,
): void {
  for (let r = row1; r <= row2; r++) {
    for (let c = col1; c <= col2; c++) {
      vm[rowColLoc(r, c)].contents = contents;
    }
  }
}

// ─── Continent Mapping Tests ────────────────────────────────────────────────────

describe("mapContinent", () => {
  it("maps a land continent surrounded by water", () => {
    const vm = createViewMap(".");
    // Create a small land island (rows 10-12, cols 10-12)
    setArea(vm, 10, 10, 12, 12, "+");

    const continent = mapContinent(vm, rowColLoc(11, 11), ".");
    // Should include all 9 land cells
    expect(continent.size).toBe(9);
    expect(continent.has(rowColLoc(10, 10))).toBe(true);
    expect(continent.has(rowColLoc(12, 12))).toBe(true);
  });

  it("does not cross bad terrain", () => {
    const vm = createViewMap(".");
    // Two land masses separated by water
    setArea(vm, 10, 10, 12, 12, "+"); // island 1
    setArea(vm, 10, 20, 12, 22, "+"); // island 2

    const continent = mapContinent(vm, rowColLoc(11, 11), ".");
    // Should only include island 1
    expect(continent.has(rowColLoc(11, 11))).toBe(true);
    expect(continent.has(rowColLoc(11, 21))).toBe(false);
  });

  it("includes unexplored cells but doesn't expand through them", () => {
    const vm = createViewMap(".");
    setArea(vm, 10, 10, 12, 14, "+");
    // Place unexplored cell in the middle
    vm[rowColLoc(11, 12)].contents = " ";

    const continent = mapContinent(vm, rowColLoc(11, 10), ".");
    // Unexplored cell should be included
    expect(continent.has(rowColLoc(11, 12))).toBe(true);
  });

  it("maps a water body with land as bad terrain", () => {
    const vm = createViewMap("+");
    // Create a sea lake
    setArea(vm, 10, 10, 14, 14, ".");

    const waterBody = mapContinent(vm, rowColLoc(12, 12), "+");
    expect(waterBody.size).toBe(25);
  });

  it("returns empty set for off-board location", () => {
    const vm = createViewMap("+");
    const continent = mapContinent(vm, 0, "."); // corner, off-board
    expect(continent.size).toBe(0);
  });
});

// ─── Continent Scan Tests ───────────────────────────────────────────────────────

describe("scanContinent", () => {
  it("counts cities correctly", () => {
    const vm = createViewMap(".");
    setArea(vm, 10, 10, 14, 14, "+");
    vm[rowColLoc(11, 11)].contents = "O"; // Player1 city
    vm[rowColLoc(12, 12)].contents = "X"; // Player2 city
    vm[rowColLoc(13, 13)].contents = "*"; // Unowned city

    const continent = mapContinent(vm, rowColLoc(12, 12), ".");
    const counts = scanContinent(vm, continent);

    expect(counts.playerCities[Owner.Player1]).toBe(1);
    expect(counts.playerCities[Owner.Player2]).toBe(1);
    expect(counts.unownedCities).toBe(1);
  });

  it("counts units correctly", () => {
    const vm = createViewMap(".");
    setArea(vm, 10, 10, 14, 14, "+");
    vm[rowColLoc(11, 11)].contents = "A"; // Player1 army
    vm[rowColLoc(11, 12)].contents = "A"; // Player1 army
    vm[rowColLoc(13, 13)].contents = "a"; // Player2 army (lowercase)

    const continent = mapContinent(vm, rowColLoc(12, 12), ".");
    const counts = scanContinent(vm, continent);

    expect(counts.playerUnits[Owner.Player1][UnitType.Army]).toBe(2);
    expect(counts.playerUnits[Owner.Player2][UnitType.Army]).toBe(1);
  });

  it("counts unexplored cells", () => {
    const vm = createViewMap(".");
    setArea(vm, 10, 10, 14, 14, "+");
    vm[rowColLoc(11, 11)].contents = " "; // unexplored
    vm[rowColLoc(11, 12)].contents = " "; // unexplored

    const continent = mapContinent(vm, rowColLoc(12, 12), ".");
    const counts = scanContinent(vm, continent);

    expect(counts.unexplored).toBe(2);
  });

  it("reports correct size", () => {
    const vm = createViewMap(".");
    setArea(vm, 10, 10, 12, 12, "+");

    const continent = mapContinent(vm, rowColLoc(11, 11), ".");
    const counts = scanContinent(vm, continent);

    expect(counts.size).toBe(9);
  });
});

// ─── Lake Detection Tests ───────────────────────────────────────────────────────

describe("isLake", () => {
  it("detects a lake (enclosed water with no objectives)", () => {
    const vm = createViewMap("+");
    // Small lake
    setArea(vm, 10, 10, 12, 12, ".");

    expect(isLake(vm, rowColLoc(11, 11))).toBe(true);
  });

  it("water body with unowned city is not a lake", () => {
    const vm = createViewMap("+");
    setArea(vm, 10, 10, 12, 12, ".");
    vm[rowColLoc(11, 11)].contents = "*"; // unowned city in water

    expect(isLake(vm, rowColLoc(11, 10))).toBe(false);
  });

  it("water body with unexplored cells is not a lake", () => {
    const vm = createViewMap("+");
    setArea(vm, 10, 10, 12, 12, ".");
    vm[rowColLoc(11, 11)].contents = " "; // unexplored

    expect(isLake(vm, rowColLoc(11, 10))).toBe(false);
  });
});

// ─── Explore Location Tests ─────────────────────────────────────────────────────

describe("findExploreLocs", () => {
  it("finds cells adjacent to unexplored territory", () => {
    const vm = createViewMap(".");
    // Land continent with some unexplored areas
    setArea(vm, 10, 10, 14, 14, "+");
    // Make some cells unexplored
    setArea(vm, 14, 10, 14, 14, " ");

    const continent = mapContinent(vm, rowColLoc(12, 12), ".");
    const exploreLocs = findExploreLocs(vm, continent);

    expect(exploreLocs.length).toBeGreaterThan(0);
    // Should include cells adjacent to the unexplored row
    expect(exploreLocs).toContain(rowColLoc(13, 10));
  });

  it("returns empty when no unexplored territory nearby", () => {
    const vm = createViewMap(".");
    setArea(vm, 10, 10, 14, 14, "+");

    const continent = mapContinent(vm, rowColLoc(12, 12), ".");
    const exploreLocs = findExploreLocs(vm, continent);

    expect(exploreLocs).toHaveLength(0);
  });
});
