import { describe, it, expect } from "vitest";
import {
  createRng,
  generateHeightMap,
  calculateWaterline,
  assignTerrain,
  placeCities,
  findContinents,
  selectStartingCities,
  generateMap,
} from "../mapgen.js";
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_SIZE,
  NUM_CITY,
  DEFAULT_SMOOTH,
  DEFAULT_WATER_RATIO,
  TerrainType,
  Owner,
} from "../constants.js";
import { dist } from "../utils.js";
import type { GameConfig } from "../types.js";

const DEFAULT_CONFIG: GameConfig = {
  mapWidth: MAP_WIDTH,
  mapHeight: MAP_HEIGHT,
  numCities: NUM_CITY,
  waterRatio: DEFAULT_WATER_RATIO,
  smoothPasses: DEFAULT_SMOOTH,
  minCityDist: 2,
  seed: 42,
};

// ─── RNG ────────────────────────────────────────────────────────────────────

describe("createRng", () => {
  it("produces deterministic output for same seed", () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const seq1 = Array.from({ length: 100 }, () => rng1());
    const seq2 = Array.from({ length: 100 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it("produces different output for different seeds", () => {
    const rng1 = createRng(42);
    const rng2 = createRng(99);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });

  it("produces values in [0, 1)", () => {
    const rng = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

// ─── Height Map ─────────────────────────────────────────────────────────────

describe("generateHeightMap", () => {
  it("returns array of correct size", () => {
    const rng = createRng(42);
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, rng);
    expect(heights.length).toBe(MAP_SIZE);
  });

  it("is deterministic with same seed", () => {
    const h1 = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const h2 = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    expect(h1).toEqual(h2);
  });

  it("all heights are non-negative", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    for (let i = 0; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it("smoothing reduces variance", () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const unsmoothed = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, 0, rng1);
    const smoothed = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, 5, rng2);

    const variance = (arr: Int32Array) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
    };

    expect(variance(smoothed)).toBeLessThan(variance(unsmoothed));
  });
});

// ─── Terrain Assignment ─────────────────────────────────────────────────────

describe("calculateWaterline & assignTerrain", () => {
  it("produces approximately correct water ratio", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const waterline = calculateWaterline(heights, DEFAULT_WATER_RATIO, NUM_CITY);
    const map = assignTerrain(heights, waterline, MAP_WIDTH, MAP_HEIGHT);

    let seaCount = 0;
    let onBoardCount = 0;
    for (const cell of map) {
      if (cell.onBoard) {
        onBoardCount++;
        if (cell.terrain === TerrainType.Sea) seaCount++;
      }
    }

    const actualRatio = (seaCount / onBoardCount) * 100;
    // Should be within ±10% of target (smoothing can shift things)
    expect(actualRatio).toBeGreaterThan(DEFAULT_WATER_RATIO - 15);
    expect(actualRatio).toBeLessThan(DEFAULT_WATER_RATIO + 15);
  });

  it("marks edge cells as off-board", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const waterline = calculateWaterline(heights, DEFAULT_WATER_RATIO, NUM_CITY);
    const map = assignTerrain(heights, waterline, MAP_WIDTH, MAP_HEIGHT);

    // Top row
    for (let col = 0; col < MAP_WIDTH; col++) {
      expect(map[col].onBoard).toBe(false);
    }
    // Bottom row
    for (let col = 0; col < MAP_WIDTH; col++) {
      expect(map[(MAP_HEIGHT - 1) * MAP_WIDTH + col].onBoard).toBe(false);
    }
    // Left column
    for (let row = 0; row < MAP_HEIGHT; row++) {
      expect(map[row * MAP_WIDTH].onBoard).toBe(false);
    }
    // Right column
    for (let row = 0; row < MAP_HEIGHT; row++) {
      expect(map[row * MAP_WIDTH + MAP_WIDTH - 1].onBoard).toBe(false);
    }
  });

  it("interior cells are on-board", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const waterline = calculateWaterline(heights, DEFAULT_WATER_RATIO, NUM_CITY);
    const map = assignTerrain(heights, waterline, MAP_WIDTH, MAP_HEIGHT);

    // Center cell should be on-board
    const center = 30 * MAP_WIDTH + 50;
    expect(map[center].onBoard).toBe(true);
  });
});

// ─── City Placement ─────────────────────────────────────────────────────────

describe("placeCities", () => {
  it("places the correct number of cities", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const waterline = calculateWaterline(heights, DEFAULT_WATER_RATIO, NUM_CITY);
    const map = assignTerrain(heights, waterline, MAP_WIDTH, MAP_HEIGHT);
    const cities = placeCities(map, NUM_CITY, createRng(42));

    expect(cities.length).toBe(NUM_CITY);
  });

  it("all cities are on board", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const waterline = calculateWaterline(heights, DEFAULT_WATER_RATIO, NUM_CITY);
    const map = assignTerrain(heights, waterline, MAP_WIDTH, MAP_HEIGHT);
    const cities = placeCities(map, NUM_CITY, createRng(42));

    for (const city of cities) {
      expect(map[city.loc].onBoard).toBe(true);
    }
  });

  it("city cells have City terrain type", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const waterline = calculateWaterline(heights, DEFAULT_WATER_RATIO, NUM_CITY);
    const map = assignTerrain(heights, waterline, MAP_WIDTH, MAP_HEIGHT);
    placeCities(map, NUM_CITY, createRng(42));

    let cityCellCount = 0;
    for (const cell of map) {
      if (cell.terrain === TerrainType.City) cityCellCount++;
    }
    expect(cityCellCount).toBe(NUM_CITY);
  });

  it("all cities are unowned initially", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const waterline = calculateWaterline(heights, DEFAULT_WATER_RATIO, NUM_CITY);
    const map = assignTerrain(heights, waterline, MAP_WIDTH, MAP_HEIGHT);
    const cities = placeCities(map, NUM_CITY, createRng(42));

    for (const city of cities) {
      expect(city.owner).toBe(Owner.Unowned);
    }
  });

  it("no two cities occupy the same cell", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const waterline = calculateWaterline(heights, DEFAULT_WATER_RATIO, NUM_CITY);
    const map = assignTerrain(heights, waterline, MAP_WIDTH, MAP_HEIGHT);
    const cities = placeCities(map, NUM_CITY, createRng(42));

    const locs = new Set(cities.map((c) => c.loc));
    expect(locs.size).toBe(cities.length);
  });
});

// ─── Continent Detection ────────────────────────────────────────────────────

describe("findContinents", () => {
  it("finds at least one continent", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const waterline = calculateWaterline(heights, DEFAULT_WATER_RATIO, NUM_CITY);
    const map = assignTerrain(heights, waterline, MAP_WIDTH, MAP_HEIGHT);
    const cities = placeCities(map, NUM_CITY, createRng(42));
    const continents = findContinents(map, cities, MAP_WIDTH, MAP_HEIGHT);

    expect(continents.length).toBeGreaterThan(0);
  });

  it("every land/city cell belongs to exactly one continent", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const waterline = calculateWaterline(heights, DEFAULT_WATER_RATIO, NUM_CITY);
    const map = assignTerrain(heights, waterline, MAP_WIDTH, MAP_HEIGHT);
    const cities = placeCities(map, NUM_CITY, createRng(42));
    const continents = findContinents(map, cities, MAP_WIDTH, MAP_HEIGHT);

    const allCells = new Set<number>();
    for (const cont of continents) {
      for (const loc of cont.cells) {
        expect(allCells.has(loc)).toBe(false);
        allCells.add(loc);
      }
    }

    // Every non-sea cell should be in a continent
    for (let i = 0; i < map.length; i++) {
      if (map[i].terrain !== TerrainType.Sea) {
        expect(allCells.has(i)).toBe(true);
      }
    }
  });

  it("every city is assigned to a continent", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const waterline = calculateWaterline(heights, DEFAULT_WATER_RATIO, NUM_CITY);
    const map = assignTerrain(heights, waterline, MAP_WIDTH, MAP_HEIGHT);
    const cities = placeCities(map, NUM_CITY, createRng(42));
    const continents = findContinents(map, cities, MAP_WIDTH, MAP_HEIGHT);

    const allCityIndices = new Set<number>();
    for (const cont of continents) {
      for (const ci of cont.cities) allCityIndices.add(ci);
    }
    expect(allCityIndices.size).toBe(cities.length);
  });
});

// ─── Starting City Selection ────────────────────────────────────────────────

describe("selectStartingCities", () => {
  it("returns two distinct city indices", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const waterline = calculateWaterline(heights, DEFAULT_WATER_RATIO, NUM_CITY);
    const map = assignTerrain(heights, waterline, MAP_WIDTH, MAP_HEIGHT);
    const cities = placeCities(map, NUM_CITY, createRng(42));
    const continents = findContinents(map, cities, MAP_WIDTH, MAP_HEIGHT);
    const [c1, c2] = selectStartingCities(continents, cities, createRng(42));

    expect(c1).not.toBe(c2);
    expect(c1).toBeGreaterThanOrEqual(0);
    expect(c1).toBeLessThan(cities.length);
    expect(c2).toBeGreaterThanOrEqual(0);
    expect(c2).toBeLessThan(cities.length);
  });

  it("starting cities are on different continents (when possible)", () => {
    const heights = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, DEFAULT_SMOOTH, createRng(42));
    const waterline = calculateWaterline(heights, DEFAULT_WATER_RATIO, NUM_CITY);
    const map = assignTerrain(heights, waterline, MAP_WIDTH, MAP_HEIGHT);
    const cities = placeCities(map, NUM_CITY, createRng(42));
    const continents = findContinents(map, cities, MAP_WIDTH, MAP_HEIGHT);

    // Only test if there are 2+ viable continents
    const viable = continents.filter(
      (c) => c.cities.length >= 2 && c.shoreCities.length > 0,
    );
    if (viable.length >= 2) {
      const [c1, c2] = selectStartingCities(continents, cities, createRng(42));
      const cont1 = continents.find((c) => c.cities.includes(c1));
      const cont2 = continents.find((c) => c.cities.includes(c2));
      expect(cont1?.id).not.toBe(cont2?.id);
    }
  });
});

// ─── Integrated Generator ───────────────────────────────────────────────────

describe("generateMap", () => {
  it("produces deterministic output for same seed", () => {
    const r1 = generateMap(DEFAULT_CONFIG);
    const r2 = generateMap(DEFAULT_CONFIG);

    expect(r1.cities.length).toBe(r2.cities.length);
    expect(r1.startingCities).toEqual(r2.startingCities);
    for (let i = 0; i < r1.map.length; i++) {
      expect(r1.map[i].terrain).toBe(r2.map[i].terrain);
    }
  });

  it("different seeds produce different maps", () => {
    const r1 = generateMap(DEFAULT_CONFIG);
    const r2 = generateMap({ ...DEFAULT_CONFIG, seed: 999 });

    let differences = 0;
    for (let i = 0; i < r1.map.length; i++) {
      if (r1.map[i].terrain !== r2.map[i].terrain) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  it("has correct number of cities", () => {
    const result = generateMap(DEFAULT_CONFIG);
    expect(result.cities.length).toBe(NUM_CITY);
  });

  it("starting cities are valid", () => {
    const result = generateMap(DEFAULT_CONFIG);
    const [c1, c2] = result.startingCities;

    expect(c1).not.toBe(c2);
    expect(result.cities[c1]).toBeDefined();
    expect(result.cities[c2]).toBeDefined();
    expect(result.map[result.cities[c1].loc].terrain).toBe(TerrainType.City);
    expect(result.map[result.cities[c2].loc].terrain).toBe(TerrainType.City);
  });

  it("starting cities are on ocean shore across multiple seeds", { timeout: 30_000 }, () => {
    // Test 10 different seeds to catch edge cases
    for (let seed = 1; seed <= 10; seed++) {
      const config = { ...DEFAULT_CONFIG, seed };
      const result = generateMap(config);
      const [c1, c2] = result.startingCities;
      const city1 = result.cities[c1];
      const city2 = result.cities[c2];

      // Each starting city should have at least one adjacent sea tile
      const hasAdjacentSea = (loc: number): boolean => {
        const row = Math.floor(loc / config.mapWidth);
        const col = loc % config.mapWidth;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (nr < 0 || nr >= config.mapHeight || nc < 0 || nc >= config.mapWidth) continue;
            if (result.map[nr * config.mapWidth + nc].terrain === TerrainType.Sea) return true;
          }
        }
        return false;
      };

      expect(hasAdjacentSea(city1.loc)).toBe(true);
      expect(hasAdjacentSea(city2.loc)).toBe(true);
    }
  });

  it("all map cells have valid terrain", () => {
    const result = generateMap(DEFAULT_CONFIG);
    const validTerrains = new Set([TerrainType.Land, TerrainType.Sea, TerrainType.City]);
    for (const cell of result.map) {
      expect(validTerrains.has(cell.terrain)).toBe(true);
    }
  });

  it("cityId references are consistent", () => {
    const result = generateMap(DEFAULT_CONFIG);
    for (const city of result.cities) {
      expect(result.map[city.loc].cityId).toBe(city.id);
    }
    for (let i = 0; i < result.map.length; i++) {
      if (result.map[i].cityId !== null) {
        expect(result.map[i].terrain).toBe(TerrainType.City);
      }
    }
  });

  it("works with different water ratios", () => {
    for (const ratio of [30, 50, 70, 90]) {
      const result = generateMap({ ...DEFAULT_CONFIG, waterRatio: ratio });
      expect(result.cities.length).toBe(NUM_CITY);
    }
  });
});
