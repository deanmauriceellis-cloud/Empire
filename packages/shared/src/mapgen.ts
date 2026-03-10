// Empire Reborn — Map Generation
// Ported from VMS-Empire (game.c: make_map, place_cities, select_cities)

import {
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_SIZE,
  NUM_CITY,
  DEFAULT_SMOOTH,
  DEFAULT_WATER_RATIO,
  TerrainType,
  Owner,
  UnitType,
  UnitBehavior,
} from "./constants.js";
import type { Loc, MapCell, CityState, GameConfig } from "./types.js";
import { locRow, locCol, rowColLoc, dist, isOnBoard } from "./utils.js";

// ─── Seedable RNG ───────────────────────────────────────────────────────────

/** Simple seedable PRNG (mulberry32). Fast, good distribution, deterministic. */
export function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Return random integer in [0, max) */
function irand(rng: () => number, max: number): number {
  return Math.floor(rng() * max);
}

// ─── Height Map ─────────────────────────────────────────────────────────────

const MAX_HEIGHT = 999;

/**
 * Generate a smoothed height map.
 * Matches original: random heights 0..998, then 9-point averaging for `smooth` passes.
 */
export function generateHeightMap(
  width: number,
  height: number,
  smooth: number,
  rng: () => number,
): Int32Array {
  const size = width * height;
  let src = new Int32Array(size);
  let dst = new Int32Array(size);

  // Fill with random heights
  for (let i = 0; i < size; i++) {
    src[i] = irand(rng, MAX_HEIGHT);
  }

  // Smooth: average each cell with its 8 neighbors
  for (let pass = 0; pass < smooth; pass++) {
    for (let i = 0; i < size; i++) {
      let sum = 0;
      let count = 0;
      const row = Math.floor(i / width);
      const col = i % width;

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
            sum += src[nr * width + nc];
          } else {
            // Original uses cell's own height for out-of-bounds neighbors
            sum += src[i];
          }
          count++;
        }
      }
      dst[i] = Math.floor(sum / count);
    }
    // Swap buffers
    [src, dst] = [dst, src];
  }

  return src;
}

// ─── Terrain Assignment ─────────────────────────────────────────────────────

/**
 * Calculate waterline from height map so that approximately `waterRatio`% of cells are water.
 * Matches original: histogram-based threshold finding.
 */
export function calculateWaterline(
  heights: Int32Array,
  waterRatio: number,
  numCities: number,
): number {
  const size = heights.length;

  // Build histogram
  const counts = new Int32Array(MAX_HEIGHT);
  for (let i = 0; i < size; i++) {
    counts[heights[i]]++;
  }

  // Find waterline: accumulate until we exceed waterRatio% AND have enough land for cities
  let cumulative = 0;
  for (let h = 0; h < MAX_HEIGHT; h++) {
    cumulative += counts[h];
    if ((cumulative * 100) / size > waterRatio && cumulative >= numCities) {
      return h;
    }
  }
  return MAX_HEIGHT - 1;
}

/**
 * Assign terrain to map cells based on height map and waterline.
 * Marks edge cells as off-board.
 */
export function assignTerrain(
  heights: Int32Array,
  waterline: number,
  width: number,
  height: number,
): MapCell[] {
  const size = width * height;
  const map: MapCell[] = new Array(size);

  for (let i = 0; i < size; i++) {
    const row = Math.floor(i / width);
    const col = i % width;
    const onBoard = row > 0 && row < height - 1 && col > 0 && col < width - 1;
    const terrain = heights[i] > waterline ? TerrainType.Land : TerrainType.Sea;

    map[i] = { terrain, onBoard, cityId: null };
  }

  return map;
}

// ─── City Placement ─────────────────────────────────────────────────────────

/**
 * Calculate initial minimum city distance.
 * Matches original: sqrt(landArea / numCities)
 */
function calcMinCityDist(
  map: MapCell[],
  numCities: number,
): number {
  let landCount = 0;
  for (const cell of map) {
    if (cell.onBoard && cell.terrain === TerrainType.Land) landCount++;
  }
  const landPerCity = Math.floor(landCount / numCities);
  return Math.max(2, Math.floor(Math.sqrt(landPerCity)));
}

/**
 * Place cities on land cells with minimum distance constraints.
 * Matches original: random selection with adaptive distance reduction.
 */
export function placeCities(
  map: MapCell[],
  numCities: number,
  rng: () => number,
): CityState[] {
  const cities: CityState[] = [];
  let minDist = calcMinCityDist(map, numCities);

  // Default city behaviors for each unit type produced
  const defaultFunc: UnitBehavior[] = [
    UnitBehavior.Explore,   // Army — go find cities
    UnitBehavior.Explore,   // Fighter — scout
    UnitBehavior.Explore,   // Patrol — patrol waters
    UnitBehavior.Explore,   // Destroyer — patrol waters
    UnitBehavior.Explore,   // Submarine — patrol waters
    UnitBehavior.None,      // Transport — wait for loading orders
    UnitBehavior.Explore,   // Carrier — patrol waters
    UnitBehavior.Explore,   // Battleship — patrol waters
    UnitBehavior.None,      // Satellite — gets random diagonal in createUnit
  ];

  while (cities.length < numCities) {
    // Build list of candidate land cells respecting min distance
    const candidates: Loc[] = [];
    for (let i = 0; i < map.length; i++) {
      if (!map[i].onBoard || map[i].terrain !== TerrainType.Land) continue;
      if (map[i].cityId !== null) continue;

      let tooClose = false;
      for (const city of cities) {
        if (dist(i, city.loc) < minDist) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) candidates.push(i);
    }

    if (candidates.length === 0) {
      // Reduce minimum distance and retry
      minDist = Math.max(1, minDist - 1);
      continue;
    }

    // Pick a random candidate
    const loc = candidates[irand(rng, candidates.length)];
    const cityId = cities.length;

    map[loc] = { ...map[loc], terrain: TerrainType.City, cityId };

    cities.push({
      id: cityId,
      loc,
      owner: Owner.Unowned,
      production: UnitType.Army,
      work: 0,
      func: [...defaultFunc],
    });
  }

  return cities;
}

// ─── Continent Detection & Starting City Selection ──────────────────────────

interface Continent {
  id: number;
  cells: Set<Loc>;
  cities: number[];      // city indices
  shoreCities: number[]; // city indices adjacent to water
  landArea: number;
}

/** Check if a land cell is adjacent to water. */
function isShore(loc: Loc, map: MapCell[], width: number, height: number): boolean {
  const row = Math.floor(loc / width);
  const col = loc % width;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
        const nloc = nr * width + nc;
        if (map[nloc].terrain === TerrainType.Sea) return true;
      }
    }
  }
  return false;
}

/**
 * Check if a land cell is adjacent to OCEAN (large water body), not just a lake.
 * Uses BFS flood-fill on water to measure the connected water body size.
 * Ocean threshold: 5% of map size (e.g., 300 tiles on 100x60 map).
 */
function isOceanShore(loc: Loc, map: MapCell[], width: number, height: number): boolean {
  const size = width * height;
  const oceanThreshold = Math.floor(size * 0.05);
  const row = Math.floor(loc / width);
  const col = loc % width;

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
      const nloc = nr * width + nc;
      if (map[nloc].terrain !== TerrainType.Sea) continue;

      // BFS flood-fill water from this tile
      const waterSize = floodWaterSize(nloc, map, width, height, oceanThreshold);
      if (waterSize >= oceanThreshold) return true;
    }
  }
  return false;
}

/**
 * BFS flood-fill water tiles. Returns count, stopping early if >= limit.
 */
function floodWaterSize(start: Loc, map: MapCell[], width: number, height: number, limit: number): number {
  const size = width * height;
  const visited = new Uint8Array(size);
  const queue: Loc[] = [start];
  visited[start] = 1;
  let count = 0;

  while (queue.length > 0) {
    const loc = queue.shift()!;
    count++;
    if (count >= limit) return count; // early exit

    const r = Math.floor(loc / width);
    const c = loc % width;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
        const nloc = nr * width + nc;
        if (!visited[nloc] && map[nloc].terrain === TerrainType.Sea) {
          visited[nloc] = 1;
          queue.push(nloc);
        }
      }
    }
  }
  return count;
}

/**
 * BFS flood-fill to find all connected land/city cells from a starting location.
 */
function floodFill(
  start: Loc,
  map: MapCell[],
  visited: Uint8Array,
  width: number,
  height: number,
): Set<Loc> {
  const cells = new Set<Loc>();
  const queue: Loc[] = [start];
  visited[start] = 1;

  while (queue.length > 0) {
    const loc = queue.shift()!;
    cells.add(loc);

    const row = Math.floor(loc / width);
    const col = loc % width;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
        const nloc = nr * width + nc;
        if (visited[nloc]) continue;
        if (map[nloc].terrain === TerrainType.Sea) continue;
        visited[nloc] = 1;
        queue.push(nloc);
      }
    }
  }

  return cells;
}

/**
 * Detect all continents via flood fill.
 */
export function findContinents(
  map: MapCell[],
  cities: CityState[],
  width: number,
  height: number,
): Continent[] {
  const size = width * height;
  const visited = new Uint8Array(size);
  const continents: Continent[] = [];

  // Build city location lookup
  const cityByLoc = new Map<Loc, number>();
  for (let i = 0; i < cities.length; i++) {
    cityByLoc.set(cities[i].loc, i);
  }

  for (let i = 0; i < size; i++) {
    if (visited[i] || map[i].terrain === TerrainType.Sea) continue;

    const cells = floodFill(i, map, visited, width, height);
    const contCities: number[] = [];
    const shoreCities: number[] = [];

    for (const loc of cells) {
      const cityIdx = cityByLoc.get(loc);
      if (cityIdx !== undefined) {
        contCities.push(cityIdx);
        if (isOceanShore(loc, map, width, height)) {
          shoreCities.push(cityIdx);
        }
      }
    }

    continents.push({
      id: continents.length,
      cells,
      cities: contCities,
      shoreCities,
      landArea: cells.size,
    });
  }

  return continents;
}

/**
 * Score a continent for starting city selection.
 * Matches original: (shore_cities*3 + inland_cities*2) * 1000 + area
 * @param minArea - minimum land area to be viable as a starting continent
 */
function scoreContinentValue(cont: Continent, minArea: number): number {
  const nshore = cont.shoreCities.length;
  const ncity = cont.cities.length;

  if (ncity < 2 || nshore === 0 || cont.landArea < minArea) return -1; // not viable

  let value: number;
  if (ncity === nshore) {
    // All cities are shore cities
    value = (nshore - 2) * 3;
  } else {
    value = (nshore - 1) * 3 + (ncity - nshore - 1) * 2;
  }

  value *= 1000;
  value += cont.landArea;
  return value;
}

interface ContinentPair {
  cont1: Continent;
  cont2: Continent;
  diff: number; // absolute difference in value (lower = more balanced)
}

/**
 * Select two starting cities on appropriate continents.
 * Returns [player1StartCity, player2StartCity] indices.
 */
export function selectStartingCities(
  continents: Continent[],
  cities: CityState[],
  rng: () => number,
  mapSize?: number,
  map?: MapCell[],
  mapWidth?: number,
  mapHeight?: number,
): [number, number] {
  // Minimum continent area: 2% of map size ensures enough room to explore
  // while waiting for transports (e.g., 120 tiles on a 100x60 map)
  const minArea = mapSize ? Math.floor(mapSize * 0.02) : 100;

  // Score and filter viable continents
  const scored = continents
    .map((cont) => ({ cont, value: scoreContinentValue(cont, minArea) }))
    .filter((s) => s.value >= 0)
    .sort((a, b) => b.value - a.value);

  if (scored.length < 2) {
    // Fallback: if fewer than 2 viable continents, pick 2 distant ocean-shore cities
    return pickDistantCities(cities, rng, map, mapWidth, mapHeight);
  }

  // Create pairs ranked by balance (smallest diff first = easiest)
  const pairs: ContinentPair[] = [];
  for (let i = 0; i < scored.length; i++) {
    for (let j = i + 1; j < scored.length; j++) {
      pairs.push({
        cont1: scored[i].cont,
        cont2: scored[j].cont,
        diff: Math.abs(scored[i].value - scored[j].value),
      });
    }
  }
  pairs.sort((a, b) => a.diff - b.diff);

  // Pick the most balanced pair (easiest start)
  const pair = pairs[0];

  // Pick the pair of shore cities (one per continent) that maximizes distance
  let bestDist = -1;
  let bestC1 = pair.cont1.shoreCities[0];
  let bestC2 = pair.cont2.shoreCities[0];
  for (const c1 of pair.cont1.shoreCities) {
    for (const c2 of pair.cont2.shoreCities) {
      const d = dist(cities[c1].loc, cities[c2].loc);
      if (d > bestDist) {
        bestDist = d;
        bestC1 = c1;
        bestC2 = c2;
      }
    }
  }

  return [bestC1, bestC2];
}

/** Fallback: pick two cities that are maximally far apart, preferring ocean shore. */
function pickDistantCities(
  cities: CityState[],
  rng: () => number,
  map?: MapCell[],
  mapWidth?: number,
  mapHeight?: number,
): [number, number] {
  // Filter to ocean-shore cities when map data is available
  let candidates = cities.map((_, i) => i);
  if (map && mapWidth && mapHeight) {
    const shoreCandidates = candidates.filter(i =>
      isOceanShore(cities[i].loc, map, mapWidth, mapHeight),
    );
    // Only use shore filter if we have at least 2 candidates
    if (shoreCandidates.length >= 2) {
      candidates = shoreCandidates;
    }
  }

  let bestDist = 0;
  let bestPair: [number, number] = [candidates[0], candidates[Math.min(1, candidates.length - 1)]];

  // Sample up to 200 random pairs to find a distant pair
  const n = candidates.length;
  const samples = Math.min(200, (n * (n - 1)) / 2);
  for (let s = 0; s < samples; s++) {
    const ii = irand(rng, n);
    let jj = irand(rng, n - 1);
    if (jj >= ii) jj++;
    const i = candidates[ii];
    const j = candidates[jj];
    const d = dist(cities[i].loc, cities[j].loc);
    if (d > bestDist) {
      bestDist = d;
      bestPair = [i, j];
    }
  }
  return bestPair;
}

// ─── Integrated Map Generator ───────────────────────────────────────────────

export interface MapGenerationResult {
  map: MapCell[];
  cities: CityState[];
  startingCities: [number, number]; // [player1CityId, player2CityId]
  continents: Continent[];
}

/**
 * Generate a complete map: terrain, cities, and starting positions.
 * Orchestrates Steps 2.1–2.4.
 */
export function generateMap(config: GameConfig): MapGenerationResult {
  const { mapWidth, mapHeight, numCities, waterRatio, smoothPasses, seed } = config;
  const rng = createRng(seed);

  // Step 2.1: Height map
  const heights = generateHeightMap(mapWidth, mapHeight, smoothPasses, rng);

  // Step 2.2: Terrain assignment
  const waterline = calculateWaterline(heights, waterRatio, numCities);
  const map = assignTerrain(heights, waterline, mapWidth, mapHeight);

  // Step 2.3: City placement
  const cities = placeCities(map, numCities, rng);

  // Step 2.4: Continent detection & starting cities
  const continents = findContinents(map, cities, mapWidth, mapHeight);
  const startingCities = selectStartingCities(continents, cities, rng, mapWidth * mapHeight, map, mapWidth, mapHeight);

  return { map, cities, startingCities, continents };
}
