import { describe, it, expect } from "vitest";
import {
  gridSizeForRadius,
  ringDistance,
  worldDimensions,
  kingdomWorldOffset,
  generateWorldMap,
  findAvailableKingdom,
  claimKingdom,
  expandWorldToRing,
  ringSlotCount,
  isSpawnProtected,
  getKingdomTileAtLoc,
  isBlockedBySpawnProtection,
  getWorldRingInfo,
  DEFAULT_WORLD_CONFIG,
} from "../world-map.js";
import type { WorldConfig, KingdomTilePos } from "../world-map.js";
import { TerrainType, SPAWN_PROTECTION_TICKS, UnitType } from "../constants.js";

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

describe("ringSlotCount", () => {
  it("ring 0 = 1 slot", () => {
    expect(ringSlotCount(0)).toBe(1);
  });

  it("ring 1 = 8 slots", () => {
    expect(ringSlotCount(1)).toBe(8);
  });

  it("ring 2 = 16 slots", () => {
    expect(ringSlotCount(2)).toBe(16);
  });

  it("ring 3 = 24 slots", () => {
    expect(ringSlotCount(3)).toBe(24);
  });
});

// ─── World Map Generation ──────────────────────────────────────────────────

describe("generateWorldMap", () => {
  // Use small tiles for fast tests, maxRadius=initialRadius to keep grid tight
  const smallConfig: WorldConfig = {
    tileSize: 30,
    channelWidth: 4,
    initialRadius: 1,
    maxRadius: 1,
    seed: 42,
    tickIntervalMs: 60_000,
    lifespanDays: 30,
    waterRatio: 60,
    smoothPasses: 3,
  };

  it("creates a world with correct grid size", () => {
    const world = generateWorldMap(smallConfig);
    expect(world.gridSize).toBe(3); // maxRadius 1 = 3x3
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

  it("tracks populatedRadius", () => {
    const world = generateWorldMap(smallConfig);
    expect(world.populatedRadius).toBe(1);
  });

  it("all kingdom tiles have spawnProtectionEndTick 0 (AI default)", () => {
    const world = generateWorldMap(smallConfig);
    for (const k of world.kingdoms) {
      expect(k.spawnProtectionEndTick).toBe(0);
    }
  });
});

// ─── AI Strength Gradient ─────────────────────────────────────────────────

describe("AI strength gradient", () => {
  const smallConfig: WorldConfig = {
    tileSize: 30,
    channelWidth: 4,
    initialRadius: 1,
    maxRadius: 1,
    seed: 42,
    tickIntervalMs: 60_000,
    lifespanDays: 30,
    waterRatio: 60,
    smoothPasses: 3,
  };

  it("origin AI has more starting armies than ring 1", () => {
    const world = generateWorldMap(smallConfig);
    const origin = world.kingdoms.find(k => k.ring === 0)!;
    const ring1 = world.kingdoms.find(k => k.ring === 1)!;

    const originArmies = world.gameState.units.filter(
      u => u.owner === origin.owner && u.type === UnitType.Army,
    ).length;
    const ring1Armies = world.gameState.units.filter(
      u => u.owner === ring1.owner && u.type === UnitType.Army,
    ).length;

    expect(originArmies).toBeGreaterThan(ring1Armies);
  });

  it("origin AI has higher tech than ring 1", () => {
    const world = generateWorldMap(smallConfig);
    const origin = world.kingdoms.find(k => k.ring === 0)!;
    const ring1 = world.kingdoms.find(k => k.ring === 1)!;

    const originTech = world.gameState.techResearch[origin.owner];
    const ring1Tech = world.gameState.techResearch[ring1.owner];

    // Origin should have tech bonuses (war/science > 0)
    expect(originTech[0]).toBeGreaterThan(ring1Tech[0]); // science
    expect(originTech[3]).toBeGreaterThan(ring1Tech[3]); // war
  });

  it("origin AI has higher starting resources", () => {
    const world = generateWorldMap(smallConfig);
    const origin = world.kingdoms.find(k => k.ring === 0)!;
    const ring1 = world.kingdoms.find(k => k.ring === 1)!;

    const originRes = world.gameState.resources[origin.owner];
    const ring1Res = world.gameState.resources[ring1.owner];

    expect(originRes[0]).toBeGreaterThan(ring1Res[0]); // ore
  });
});

// ─── Pre-allocated Grid & Expansion ───────────────────────────────────────

describe("pre-allocated grid", () => {
  it("grid is sized by maxRadius, tiles populated by initialRadius", () => {
    const config: WorldConfig = {
      tileSize: 30,
      channelWidth: 4,
      initialRadius: 1,
      maxRadius: 3,
      seed: 42,
      tickIntervalMs: 60_000,
      lifespanDays: 30,
      waterRatio: 60,
      smoothPasses: 3,
    };
    const world = generateWorldMap(config);
    expect(world.gridSize).toBe(7); // maxRadius 3 = 7x7
    expect(world.kingdoms.length).toBe(9); // only rings 0-1 populated
    expect(world.populatedRadius).toBe(1);
    // Map is pre-allocated for full 7x7 grid
    const { width, height } = worldDimensions(7, 30, 4);
    expect(world.worldWidth).toBe(width);
    expect(world.worldHeight).toBe(height);
    expect(world.gameState.map.length).toBe(width * height);
  });
});

describe("expandWorldToRing", () => {
  const expandConfig: WorldConfig = {
    tileSize: 30,
    channelWidth: 4,
    initialRadius: 1,
    maxRadius: 3,
    seed: 42,
    tickIntervalMs: 60_000,
    lifespanDays: 30,
    waterRatio: 60,
    smoothPasses: 3,
  };

  it("adds ring 2 kingdoms", () => {
    const world = generateWorldMap(expandConfig);
    expect(world.kingdoms.length).toBe(9);
    const added = expandWorldToRing(world, 2);
    expect(added).toBe(16); // ring 2 = 16 slots
    expect(world.kingdoms.length).toBe(25);
    expect(world.populatedRadius).toBe(2);
  });

  it("new kingdoms have terrain and cities", () => {
    const world = generateWorldMap(expandConfig);
    const beforeCities = world.gameState.cities.length;
    expandWorldToRing(world, 2);
    expect(world.gameState.cities.length).toBeGreaterThan(beforeCities);
    // New kingdoms' starting cities should be owned
    for (const k of world.kingdoms.filter(k => k.ring === 2)) {
      const city = world.gameState.cities[k.startingCityId];
      expect(city).toBeDefined();
      expect(city.owner).toBe(k.owner);
    }
  });

  it("no-op when target <= populatedRadius", () => {
    const world = generateWorldMap(expandConfig);
    const added = expandWorldToRing(world, 1);
    expect(added).toBe(0);
    expect(world.kingdoms.length).toBe(9);
  });

  it("clamps to maxRadius", () => {
    const world = generateWorldMap(expandConfig);
    expandWorldToRing(world, 10); // beyond maxRadius 3
    expect(world.populatedRadius).toBe(3);
    // rings 0-3 populated: 1 + 8 + 16 + 24 = 49
    expect(world.kingdoms.length).toBe(49);
  });

  it("expansion is deterministic", () => {
    const world1 = generateWorldMap(expandConfig);
    const world2 = generateWorldMap(expandConfig);
    expandWorldToRing(world1, 2);
    expandWorldToRing(world2, 2);
    expect(world1.kingdoms.length).toBe(world2.kingdoms.length);
    // Same city locations for expansion tiles
    for (let i = 9; i < world1.gameState.cities.length; i++) {
      expect(world1.gameState.cities[i].loc).toBe(world2.gameState.cities[i].loc);
    }
  });

  it("new players get viewMaps and resources", () => {
    const world = generateWorldMap(expandConfig);
    expandWorldToRing(world, 2);
    for (const k of world.kingdoms.filter(k => k.ring === 2)) {
      expect(world.gameState.viewMaps[k.owner]).toBeDefined();
      expect(world.gameState.resources[k.owner]).toBeDefined();
      expect(world.gameState.techResearch[k.owner]).toBeDefined();
    }
  });

  it("outer ring AI kingdoms get fewer starting armies", () => {
    const world = generateWorldMap(expandConfig);
    expandWorldToRing(world, 3);
    const ring3 = world.kingdoms.find(k => k.ring === 3)!;
    const ring3Armies = world.gameState.units.filter(
      u => u.owner === ring3.owner && u.type === UnitType.Army,
    ).length;
    // Ring 3 = 1 army (weakest)
    expect(ring3Armies).toBe(1);
  });
});

// ─── Kingdom Claiming ──────────────────────────────────────────────────────

describe("findAvailableKingdom", () => {
  const smallConfig: WorldConfig = {
    tileSize: 30,
    channelWidth: 4,
    initialRadius: 1,
    maxRadius: 1,
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

  it("returns null when world is full (maxRadius reached)", () => {
    const world = generateWorldMap(smallConfig);
    // Mark all players as human
    for (const p of world.gameState.players) {
      p.isAI = false;
    }
    const tile = findAvailableKingdom(world, 1);
    expect(tile).toBeNull();
  });

  it("auto-expands when no AI kingdoms available and room exists", () => {
    const expandConfig: WorldConfig = {
      ...smallConfig,
      maxRadius: 2,
    };
    const world = generateWorldMap(expandConfig);
    // Claim all existing kingdoms
    for (const p of world.gameState.players) {
      p.isAI = false;
    }
    // Should expand to ring 2 and find a tile there
    const tile = findAvailableKingdom(world, 2);
    expect(tile).toBeDefined();
    expect(tile!.ring).toBe(2);
    expect(world.populatedRadius).toBe(2);
  });
});

describe("claimKingdom", () => {
  const smallConfig: WorldConfig = {
    tileSize: 30,
    channelWidth: 4,
    initialRadius: 1,
    maxRadius: 1,
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

  it("sets spawn protection when currentTick provided", () => {
    const world = generateWorldMap(smallConfig);
    const tile = findAvailableKingdom(world, 1)!;
    claimKingdom(world, tile, "TestPlayer", 50);
    expect(tile.spawnProtectionEndTick).toBe(50 + SPAWN_PROTECTION_TICKS);
  });

  it("does not set spawn protection when currentTick omitted", () => {
    const world = generateWorldMap(smallConfig);
    const tile = findAvailableKingdom(world, 1)!;
    claimKingdom(world, tile, "TestPlayer");
    expect(tile.spawnProtectionEndTick).toBe(0);
  });
});

// ─── Spawn Protection ─────────────────────────────────────────────────────

describe("spawn protection", () => {
  const smallConfig: WorldConfig = {
    tileSize: 30,
    channelWidth: 4,
    initialRadius: 1,
    maxRadius: 1,
    seed: 42,
    tickIntervalMs: 60_000,
    lifespanDays: 30,
    waterRatio: 60,
    smoothPasses: 3,
  };

  it("isSpawnProtected returns true before expiry", () => {
    const world = generateWorldMap(smallConfig);
    const tile = findAvailableKingdom(world, 1)!;
    claimKingdom(world, tile, "Player", 10);
    expect(isSpawnProtected(tile, 50)).toBe(true);
  });

  it("isSpawnProtected returns false after expiry", () => {
    const world = generateWorldMap(smallConfig);
    const tile = findAvailableKingdom(world, 1)!;
    claimKingdom(world, tile, "Player", 10);
    expect(isSpawnProtected(tile, 10 + SPAWN_PROTECTION_TICKS)).toBe(false);
    expect(isSpawnProtected(tile, 10 + SPAWN_PROTECTION_TICKS + 1)).toBe(false);
  });

  it("getKingdomTileAtLoc finds tile for a city location", () => {
    const world = generateWorldMap(smallConfig);
    const tile = world.kingdoms[0];
    const city = world.gameState.cities[tile.startingCityId];
    const found = getKingdomTileAtLoc(world, city.loc);
    expect(found).toBeDefined();
    expect(found!.owner).toBe(tile.owner);
  });

  it("getKingdomTileAtLoc returns null for ocean channel", () => {
    const world = generateWorldMap(smallConfig);
    // Row 0 is the off-board border, row 1 is ocean channel
    const found = getKingdomTileAtLoc(world, 1 * world.worldWidth + 1);
    expect(found).toBeNull();
  });

  it("isBlockedBySpawnProtection blocks foreign units", () => {
    const world = generateWorldMap(smallConfig);
    const tile = world.kingdoms[0]; // ring 0
    const ring1Tile = world.kingdoms.find(k => k.ring === 1)!;
    claimKingdom(world, tile, "Player", 0);

    const cityLoc = world.gameState.cities[tile.startingCityId].loc;
    // Foreign unit (ring1 owner) trying to enter protected tile
    expect(
      isBlockedBySpawnProtection(world, ring1Tile.owner, cityLoc, 50),
    ).toBe(true);
  });

  it("isBlockedBySpawnProtection allows own units", () => {
    const world = generateWorldMap(smallConfig);
    const tile = world.kingdoms[0];
    claimKingdom(world, tile, "Player", 0);

    const cityLoc = world.gameState.cities[tile.startingCityId].loc;
    expect(
      isBlockedBySpawnProtection(world, tile.owner, cityLoc, 50),
    ).toBe(false);
  });

  it("isBlockedBySpawnProtection allows after expiry", () => {
    const world = generateWorldMap(smallConfig);
    const tile = world.kingdoms[0];
    const ring1Tile = world.kingdoms.find(k => k.ring === 1)!;
    claimKingdom(world, tile, "Player", 0);

    const cityLoc = world.gameState.cities[tile.startingCityId].loc;
    expect(
      isBlockedBySpawnProtection(world, ring1Tile.owner, cityLoc, SPAWN_PROTECTION_TICKS + 1),
    ).toBe(false);
  });
});

// ─── World Browser Info ───────────────────────────────────────────────────

describe("getWorldRingInfo", () => {
  it("returns info for all rings up to maxRadius", () => {
    const config: WorldConfig = {
      tileSize: 30,
      channelWidth: 4,
      initialRadius: 1,
      maxRadius: 3,
      seed: 42,
      tickIntervalMs: 60_000,
      lifespanDays: 30,
      waterRatio: 60,
      smoothPasses: 3,
    };
    const world = generateWorldMap(config);
    const rings = getWorldRingInfo(world);
    expect(rings.length).toBe(4); // rings 0-3
    expect(rings[0].ring).toBe(0);
    expect(rings[0].totalSlots).toBe(1);
    expect(rings[0].aiSlots).toBe(1);
    expect(rings[0].humanSlots).toBe(0);
    expect(rings[1].ring).toBe(1);
    expect(rings[1].totalSlots).toBe(8);
    expect(rings[1].aiSlots).toBe(8);
    // Unpopulated rings still show total available
    expect(rings[2].totalSlots).toBe(16);
    expect(rings[3].totalSlots).toBe(24);
  });

  it("reflects human claims", () => {
    const config: WorldConfig = {
      tileSize: 30,
      channelWidth: 4,
      initialRadius: 1,
      maxRadius: 1,
      seed: 42,
      tickIntervalMs: 60_000,
      lifespanDays: 30,
      waterRatio: 60,
      smoothPasses: 3,
    };
    const world = generateWorldMap(config);
    const tile = findAvailableKingdom(world, 1)!;
    claimKingdom(world, tile, "Human");
    const rings = getWorldRingInfo(world);
    expect(rings[1].humanSlots).toBe(1);
    expect(rings[1].aiSlots).toBe(7);
  });

  it("includes descriptions for each ring", () => {
    const config: WorldConfig = {
      tileSize: 30,
      channelWidth: 4,
      initialRadius: 1,
      maxRadius: 2,
      seed: 42,
      tickIntervalMs: 60_000,
      lifespanDays: 30,
      waterRatio: 60,
      smoothPasses: 3,
    };
    const world = generateWorldMap(config);
    const rings = getWorldRingInfo(world);
    for (const ring of rings) {
      expect(ring.description).toBeTruthy();
      expect(ring.description.length).toBeGreaterThan(0);
    }
  });
});
