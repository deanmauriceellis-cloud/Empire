import { describe, it, expect } from "vitest";
import {
  MAP_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  TerrainFlag,
} from "../constants.js";
import type { ViewMapCell } from "../types.js";
import {
  createPathMap,
  findObjective,
  markPath,
  findDirection,
  landMoveInfo,
  waterMoveInfo,
  airMoveInfo,
  viewCellToTerrain,
} from "../pathfinding.js";
import { rowColLoc } from "../utils.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Create a view map with all land. */
function createLandViewMap(): ViewMapCell[] {
  const vm: ViewMapCell[] = new Array(MAP_SIZE);
  for (let i = 0; i < MAP_SIZE; i++) {
    const row = Math.floor(i / MAP_WIDTH);
    const col = i % MAP_WIDTH;
    const onBoard = row > 0 && row < MAP_HEIGHT - 1 && col > 0 && col < MAP_WIDTH - 1;
    vm[i] = { contents: onBoard ? "+" : " ", seen: onBoard ? 0 : -1 };
  }
  return vm;
}

/** Create a mixed view map with a sea channel. */
function createMixedViewMap(): ViewMapCell[] {
  const vm = createLandViewMap();
  // Create a vertical sea channel at col=15
  for (let row = 1; row < MAP_HEIGHT - 1; row++) {
    vm[rowColLoc(row, 15)].contents = ".";
  }
  return vm;
}

// ─── viewCellToTerrain Tests ────────────────────────────────────────────────────

describe("viewCellToTerrain", () => {
  it("maps land correctly", () => {
    expect(viewCellToTerrain("+")).toBe(TerrainFlag.Land);
  });

  it("maps water correctly", () => {
    expect(viewCellToTerrain(".")).toBe(TerrainFlag.Water);
  });

  it("maps unexplored correctly", () => {
    expect(viewCellToTerrain(" ")).toBe(TerrainFlag.Unknown);
  });

  it("maps cities as land", () => {
    expect(viewCellToTerrain("O")).toBe(TerrainFlag.Land);
    expect(viewCellToTerrain("X")).toBe(TerrainFlag.Land);
    expect(viewCellToTerrain("*")).toBe(TerrainFlag.Land);
  });
});

// ─── Pathfinding Tests ──────────────────────────────────────────────────────────

describe("Pathfinding", () => {
  it("findObjective finds nearby city on land map", () => {
    const vm = createLandViewMap();
    const from = rowColLoc(10, 10);
    const cityLoc = rowColLoc(10, 15);
    vm[cityLoc].contents = "*"; // unowned city

    const pathMap = createPathMap();
    const moveInfo = landMoveInfo("*", new Map([["*", 1]]));
    const result = findObjective(pathMap, vm, from, moveInfo);

    expect(result).toBe(cityLoc);
    expect(pathMap[cityLoc].cost).toBe(5); // 5 cells away
  });

  it("findObjective returns null when no objective reachable", () => {
    const vm = createLandViewMap();
    const from = rowColLoc(10, 10);

    const pathMap = createPathMap();
    const moveInfo = landMoveInfo("*", new Map([["*", 1]]));
    const result = findObjective(pathMap, vm, from, moveInfo);

    expect(result).toBeNull();
  });

  it("land pathfinding cannot cross sea", () => {
    const vm = createMixedViewMap();
    const from = rowColLoc(10, 10); // west of channel
    const cityLoc = rowColLoc(10, 20); // east of channel
    vm[cityLoc].contents = "*";

    const pathMap = createPathMap();
    const moveInfo = landMoveInfo("*", new Map([["*", 1]]));
    const result = findObjective(pathMap, vm, from, moveInfo);

    // Can't reach across sea
    expect(result).toBeNull();
  });

  it("water pathfinding can cross sea", () => {
    const vm = createMixedViewMap();
    // Place start and end on the sea channel
    const from = rowColLoc(5, 15);
    const targetLoc = rowColLoc(20, 15);
    vm[targetLoc].contents = "T"; // enemy transport (objective)

    const pathMap = createPathMap();
    const moveInfo = waterMoveInfo("t", new Map([["T", 1]])); // looking for transport
    // Actually let's search for "T" uppercase
    const moveInfo2 = waterMoveInfo("T", new Map([["T", 1]]));
    const result = findObjective(pathMap, vm, from, moveInfo2);

    expect(result).toBe(targetLoc);
  });

  it("air pathfinding crosses all terrain", () => {
    const vm = createMixedViewMap();
    const from = rowColLoc(10, 10);
    const targetLoc = rowColLoc(10, 20);
    vm[targetLoc].contents = "X"; // enemy city

    const pathMap = createPathMap();
    const moveInfo = airMoveInfo("X", new Map([["X", 1]]));
    const result = findObjective(pathMap, vm, from, moveInfo);

    expect(result).toBe(targetLoc);
  });

  it("markPath marks cells between origin and destination", () => {
    const vm = createLandViewMap();
    const from = rowColLoc(10, 10);
    const cityLoc = rowColLoc(10, 15);
    vm[cityLoc].contents = "*";

    const pathMap = createPathMap();
    const moveInfo = landMoveInfo("*", new Map([["*", 1]]));
    findObjective(pathMap, vm, from, moveInfo);
    markPath(pathMap, cityLoc);

    // Cells between origin and dest should be marked as Path
    expect(pathMap[cityLoc].terrain).toBe(TerrainFlag.Path);
    // At least some intermediate cells should be marked
    let pathCells = 0;
    for (let col = 10; col <= 15; col++) {
      if (pathMap[rowColLoc(10, col)].terrain === TerrainFlag.Path) pathCells++;
    }
    expect(pathCells).toBeGreaterThan(0);
  });

  it("findDirection returns direction toward marked path", () => {
    const vm = createLandViewMap();
    const from = rowColLoc(10, 10);
    const cityLoc = rowColLoc(10, 15);
    vm[cityLoc].contents = "*";

    const pathMap = createPathMap();
    const moveInfo = landMoveInfo("*", new Map([["*", 1]]));
    findObjective(pathMap, vm, from, moveInfo);
    markPath(pathMap, cityLoc);

    const dir = findDirection(pathMap, from);
    expect(dir).not.toBeNull();
  });

  it("weighted objectives prefer closer targets", () => {
    const vm = createLandViewMap();
    const from = rowColLoc(10, 10);

    // Near city at distance 3
    const nearCity = rowColLoc(10, 13);
    vm[nearCity].contents = "*";

    // Far city at distance 8
    const farCity = rowColLoc(10, 18);
    vm[farCity].contents = "X";

    const pathMap = createPathMap();
    const moveInfo = landMoveInfo("*X", new Map([["*", 1], ["X", 1]]));
    const result = findObjective(pathMap, vm, from, moveInfo);

    expect(result).toBe(nearCity); // closer target wins with equal weights
  });
});
