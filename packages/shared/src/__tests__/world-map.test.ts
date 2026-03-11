import { describe, it, expect } from "vitest";
import {
  gridSizeForRadius,
  ringDistance,
  worldDimensions,
  kingdomWorldOffset,
  generateWorldMap,
  findAvailableKingdom,
  claimKingdom,
  DEFAULT_WORLD_CONFIG,
} from "../world-map.js";
import type { WorldConfig, KingdomTilePos } from "../world-map.js";
import { TerrainType } from "../constants.js";

// ─── Grid Geometry ─────────────────────────────────────────────────────────

describe("gridSizeForRadius", () => {
  it("radius 0 = 1x1 grid", () => {
    expect(gridSizeForRadius(0)).toBe(1);
  });

  it("radius 1 = 3x3 grid", () => {
    expect(gridSizeForRadius(1)).toBe(3);
  });

  it("radius 2 = 5x5 grid", () => {
    expect(gridSizeForRadius(2)).toBe(5);
  });
});

describe("ringDistance", () => {
  it("center is ring 0", () => {
    expect(ringDistance({ row: 2, col: 2 }, 2)).toBe(0);
  });

  it("adjacent is ring 1", () => {
    expect(ringDistance({ row: 1, col: 2 }, 2)).toBe(1);
    expect(ringDistance({ row: 2, col: 3 }, 2)).toBe(1);
    expect(ringDistance({ row: 1, col: 1 }, 2)).toBe(1); // diagonal
  });

  it("corner is ring 2", () => {
    expect(ringDistance({ row: 0, col: 0 }, 2)).toBe(2);
    expect(ringDistance({ row: 4, col: 4 }, 2)).toBe(2);
  });
});

describe("worldDimensions", () => {
  it("calculates correct world size", () => {
    const { width, height } = worldDimensions(5, 100, 12);
    // 5 tiles * (100+12) + 12 = 5*112 + 12 = 572
    expect(width).toBe(572);
    expect(height).toBe(572);
  });

  it("1x1 grid with channel border", () => {
    const { width, height } = worldDimensions(1, 100, 12);
    // 1 * 112 + 12 = 124
    expect(width).toBe(124);
    expect(height).toBe(124);
  });
});

describe("kingdomWorldOffset", () => {
  it("first tile starts after channel border", () => {
    const off = kingdomWorldOffset({ row: 0, col: 0 }, 100, 12);
    expect(off.row).toBe(12);
    expect(off.col).toBe(12);
  });

  it("second tile is offset by tileSize + channelWidth", () => {
    const off = kingdomWorldOffset({ row: 0, col: 1 }, 100, 12);
    expect(off.row).toBe(12);
    expect(off.col).toBe(12 + 112);
  });

  it("diagonal tile offset", () => {
    const off = kingdomWorldOffset({ row: 1, col: 1 }, 100, 12);
    expect(off.row).toBe(12 + 112);
    expect(off.col).toBe(12 + 112);
  });
});

// ─── World Map Generation ──────────────────────────────────────────────────

describe("generateWorldMap", () => {
  // Use small tiles for fast tests
  const smallConfig: WorldConfig = {
    tileSize: 30,
    channelWidth: 4,
    initialRadius: 1,
    seed: 42,
    tickIntervalMs: 60_000,
    lifespanDays: 30,
    waterRatio: 60,
    smoothPasses: 3,
  };

  it("creates a world with correct grid size", () => {
    const world = generateWorldMap(smallConfig);
    expect(world.gridSize).toBe(3); // radius 1 = 3x3
    expect(world.kingdoms.length).toBe(9); // 3x3 = 9 kingdoms
  });

  it("creates players for each kingdom", () => {
    const world = generateWorldMap(smallConfig);
    expect(world.gameState.players.length).toBe(9);
    // All should be AI initially
    expect(world.gameState.players.every(p => p.isAI)).toBe(true);
  });

  it("marks the center tile as origin", () => {
    const world = generateWorldMap(smallConfig);
    const origin = world.kingdoms.find(k => k.isOrigin);
    expect(origin).toBeDefined();
    expect(origin!.pos.row).toBe(1);
    expect(origin!.pos.col).toBe(1);
    expect(origin!.ring).toBe(0);
  });

  it("assigns correct ring distances", () => {
    const world = generateWorldMap(smallConfig);
    const ringCounts = [0, 0, 0];
    for (const k of world.kingdoms) {
      ringCounts[k.ring]++;
    }
    expect(ringCounts[0]).toBe(1); // center
    expect(ringCounts[1]).toBe(8); // ring 1
  });

  it("world map dimensions match expected", () => {
    const world = generateWorldMap(smallConfig);
    const { width, height } = worldDimensions(3, 30, 4);
    expect(world.worldWidth).toBe(width);
    expect(world.worldHeight).toBe(height);
    expect(world.gameState.map.length).toBe(width * height);
  });

  it("ocean channels between kingdom tiles are water", () => {
    const world = generateWorldMap(smallConfig);
    const { worldWidth } = world;
    // First channel rows (0..channelWidth-1) should be all water
    for (let c = 0; c < worldWidth; c++) {
      const cell = world.gameState.map[1 * worldWidth + c]; // row 1 (inside border)
      expect(cell.terrain).toBe(TerrainType.Sea);
    }
  });

  it("each kingdom has cities", () => {
    const world = generateWorldMap(smallConfig);
    // Total cities should be > 0
    expect(world.gameState.cities.length).toBeGreaterThan(0);
    // Each kingdom's starting city should exist and be owned
    for (const k of world.kingdoms) {
      const city = world.gameState.cities[k.startingCityId];
      expect(city).toBeDefined();
      expect(city.owner).toBe(k.owner);
    }
  });

  it("each kingdom has deposits", () => {
    const world = generateWorldMap(smallConfig);
    expect(world.gameState.deposits.length).toBeGreaterThan(0);
  });

  it("initializes kingdoms with crown cities", () => {
    const world = generateWorldMap(smallConfig);
    for (const k of world.kingdoms) {
      const kingdom = world.gameState.kingdoms[k.owner];
      expect(kingdom).toBeDefined();
      expect(kingdom.crownCityId).toBe(k.startingCityId);
    }
  });

  it("initializes per-player resources", () => {
    const world = generateWorldMap(smallConfig);
    for (const p of world.gameState.players) {
      expect(world.gameState.resources[p.id]).toBeDefined();
      expect(world.gameState.resources[p.id].length).toBe(3);
    }
  });

  it("initializes per-player viewMaps", () => {
    const world = generateWorldMap(smallConfig);
    for (const p of world.gameState.players) {
      expect(world.gameState.viewMaps[p.id]).toBeDefined();
      expect(world.gameState.viewMaps[p.id].length).toBe(
        world.worldWidth * world.worldHeight,
      );
    }
  });

  it("sets season end timestamp", () => {
    const world = generateWorldMap(smallConfig);
    const expectedDuration = 30 * 24 * 60 * 60 * 1000;
    expect(world.seasonEndsAt - world.createdAt).toBe(expectedDuration);
  });

  it("deterministic — same seed produces same world", () => {
    const world1 = generateWorldMap(smallConfig);
    const world2 = generateWorldMap(smallConfig);
    expect(world1.kingdoms.length).toBe(world2.kingdoms.length);
    expect(world1.gameState.cities.length).toBe(world2.gameState.cities.length);
    expect(world1.gameState.deposits.length).toBe(world2.gameState.deposits.length);
    // Same city locations
    for (let i = 0; i < world1.gameState.cities.length; i++) {
      expect(world1.gameState.cities[i].loc).toBe(world2.gameState.cities[i].loc);
    }
  });

  it("different seeds produce different worlds", () => {
    const config2 = { ...smallConfig, seed: 999 };
    const world1 = generateWorldMap(smallConfig);
    const world2 = generateWorldMap(config2);
    // Cities should be at different locations (extremely likely with different seeds)
    const locs1 = world1.gameState.cities.map(c => c.loc).sort();
    const locs2 = world2.gameState.cities.map(c => c.loc).sort();
    expect(locs1).not.toEqual(locs2);
  });
});

// ─── Kingdom Claiming ──────────────────────────────────────────────────────

describe("findAvailableKingdom", () => {
  const smallConfig: WorldConfig = {
    tileSize: 30,
    channelWidth: 4,
    initialRadius: 1,
    seed: 42,
    tickIntervalMs: 60_000,
    lifespanDays: 30,
    waterRatio: 60,
    smoothPasses: 3,
  };

  it("finds a kingdom at preferred ring", () => {
    const world = generateWorldMap(smallConfig);
    const tile = findAvailableKingdom(world, 1);
    expect(tile).toBeDefined();
    expect(tile!.ring).toBe(1);
  });

  it("finds center kingdom when ring 0 requested", () => {
    const world = generateWorldMap(smallConfig);
    const tile = findAvailableKingdom(world, 0);
    expect(tile).toBeDefined();
    expect(tile!.ring).toBe(0);
    expect(tile!.isOrigin).toBe(true);
  });

  it("returns null when all kingdoms are human-claimed", () => {
    const world = generateWorldMap(smallConfig);
    // Mark all players as human
    for (const p of world.gameState.players) {
      p.isAI = false;
    }
    const tile = findAvailableKingdom(world, 1);
    expect(tile).toBeNull();
  });
});

describe("claimKingdom", () => {
  const smallConfig: WorldConfig = {
    tileSize: 30,
    channelWidth: 4,
    initialRadius: 1,
    seed: 42,
    tickIntervalMs: 60_000,
    lifespanDays: 30,
    waterRatio: 60,
    smoothPasses: 3,
  };

  it("converts AI player to human", () => {
    const world = generateWorldMap(smallConfig);
    const tile = findAvailableKingdom(world, 1)!;
    const playerId = claimKingdom(world, tile, "TestPlayer");
    const player = world.gameState.players.find(p => p.id === playerId)!;
    expect(player.isAI).toBe(false);
    expect(player.name).toBe("TestPlayer");
  });

  it("returns the correct player ID", () => {
    const world = generateWorldMap(smallConfig);
    const tile = findAvailableKingdom(world, 0)!;
    const playerId = claimKingdom(world, tile, "King");
    expect(playerId).toBe(tile.owner);
  });
});
