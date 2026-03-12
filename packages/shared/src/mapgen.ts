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
  DepositType,
} from "./constants.js";
import type { Loc, MapCell, CityState, DepositState, GameConfig } from "./types.js";
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

    map[i] = { terrain, onBoard, cityId: null, depositId: null };
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
    UnitBehavior.None,      // Construction — wait for build orders
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
      upgradeIds: [],
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
 * Select N starting cities spread across continents.
 * Returns array of city indices (one per player).
 */
export function selectStartingCities(
  continents: Continent[],
  cities: CityState[],
  rng: () => number,
  mapSize?: number,
  map?: MapCell[],
  mapWidth?: number,
  mapHeight?: number,
  numPlayers: number = 2,
): number[] {
  // Minimum continent area: 2% of map size ensures enough room to explore
  const minArea = mapSize ? Math.floor(mapSize * 0.02) : 100;

  // Score and filter viable continents
  const scored = continents
    .map((cont) => ({ cont, value: scoreContinentValue(cont, minArea) }))
    .filter((s) => s.value >= 0)
    .sort((a, b) => b.value - a.value);

  if (scored.length < 2 && numPlayers <= 2) {
    // Fallback: pick 2 distant ocean-shore cities
    const [c1, c2] = pickDistantCities(cities, rng, map, mapWidth, mapHeight, continents);
    return [c1, c2];
  }

  if (numPlayers <= 2) {
    // Legacy 2-player balanced pair selection
    const pairs: ContinentPair[] = [];
    for (let i = 0; i < scored.length; i++) {
      for (let j = i + 1; j < scored.length; j++) {
        let diff = Math.abs(scored[i].value - scored[j].value);
        const cities1 = scored[i].cont.cities.length;
        const cities2 = scored[j].cont.cities.length;
        const cityRatio = Math.max(cities1, cities2) / Math.max(Math.min(cities1, cities2), 1);
        if (cityRatio > 2) {
          diff += (cityRatio - 2) * 50000;
        }
        pairs.push({ cont1: scored[i].cont, cont2: scored[j].cont, diff });
      }
    }
    pairs.sort((a, b) => a.diff - b.diff);
    const pair = pairs[0];

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

  // N-player starting city selection: maximize minimum distance between all starts
  // Greedy approach: pick cities one at a time, each maximizing min-dist to all prior picks
  const candidates = scored.flatMap(s => s.cont.shoreCities);
  if (candidates.length < numPlayers) {
    // Not enough shore cities — fall back to all cities
    const allCandidates = cities.map((_, i) => i);
    return pickNDistantCities(allCandidates, cities, numPlayers, rng);
  }
  return pickNDistantCities(candidates, cities, numPlayers, rng);
}

/** Pick N cities from candidates that maximize minimum pairwise distance. */
function pickNDistantCities(
  candidates: number[],
  cities: CityState[],
  n: number,
  rng: () => number,
): number[] {
  if (candidates.length <= n) return candidates.slice(0, n);

  // Start with a random candidate
  const picked: number[] = [candidates[Math.floor(rng() * candidates.length)]];

  while (picked.length < n) {
    let bestCandidate = -1;
    let bestMinDist = -1;

    for (const c of candidates) {
      if (picked.includes(c)) continue;
      // Minimum distance from this candidate to any already-picked city
      let minDist = Infinity;
      for (const p of picked) {
        const d = dist(cities[c].loc, cities[p].loc);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestCandidate = c;
      }
    }

    if (bestCandidate === -1) break;
    picked.push(bestCandidate);
  }

  return picked;
}

/** Fallback: pick two cities that are maximally far apart, preferring ocean shore.
 *  Ensures each city's continent has at least 1 other neutral city reachable by land. */
function pickDistantCities(
  cities: CityState[],
  rng: () => number,
  map?: MapCell[],
  mapWidth?: number,
  mapHeight?: number,
  continents?: Continent[],
): [number, number] {
  // Build lookup: city index → continent
  const cityContinent = new Map<number, Continent>();
  if (continents) {
    for (const cont of continents) {
      for (const cIdx of cont.cities) {
        cityContinent.set(cIdx, cont);
      }
    }
  }

  // Filter to cities whose continent has at least 2 cities (1 neutral + the start)
  // and that are on ocean shore
  let candidates = cities.map((_, i) => i);
  if (continents) {
    const viableCandidates = candidates.filter(i => {
      const cont = cityContinent.get(i);
      return cont !== undefined && cont.cities.length >= 2;
    });
    if (viableCandidates.length >= 2) {
      candidates = viableCandidates;
    }
  }
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

// ─── Deposit Placement ──────────────────────────────────────────────────────

/**
 * Place resource deposits on the map.
 * Density: ~1 deposit per 3-4 cities.
 * Fair placement: equal types near each player's start.
 * Contested deposits in neutral middle ground.
 *
 * Deposit type is determined by terrain height:
 *   - Ore veins on high terrain (mountains)
 *   - Oil wells on low-medium terrain
 *   - Textile farms on medium terrain (fertile)
 *
 * When no height map is available (river maps), types are assigned
 * by rotating through the 3 types evenly.
 */
export function placeDeposits(
  map: MapCell[],
  cities: CityState[],
  startingCities: number[],
  width: number,
  height: number,
  rng: () => number,
  heights?: Int32Array,
  waterline?: number,
): DepositState[] {
  const deposits: DepositState[] = [];
  const numDeposits = Math.max(6, Math.floor(cities.length / 3.5));

  // Minimum distance between deposits and from cities
  const minDepositDist = Math.max(3, Math.floor(Math.sqrt((width * height) / numDeposits) * 0.5));
  const minCityDist = 2;

  // Find starting city locations
  const startLocs = startingCities.map(cid => cities[cid].loc);
  const numPlayers = startingCities.length;

  // Collect candidate land tiles (not cities, not map edges)
  const candidates: Loc[] = [];
  for (let i = 0; i < map.length; i++) {
    if (!map[i].onBoard) continue;
    if (map[i].terrain !== TerrainType.Land) continue;
    if (map[i].cityId !== null) continue;

    // Not too close to any city
    let nearCity = false;
    for (const city of cities) {
      if (dist(i, city.loc) < minCityDist) {
        nearCity = true;
        break;
      }
    }
    if (nearCity) continue;
    candidates.push(i);
  }

  if (candidates.length === 0) return deposits;

  // Categorize candidates by zone: one zone per player + contested middle
  // Each candidate belongs to the nearest player's zone if within 40% of inter-start distance
  const avgDist = numPlayers >= 2
    ? startLocs.reduce((sum, loc, i) => {
        for (let j = i + 1; j < startLocs.length; j++) sum += dist(loc, startLocs[j]);
        return sum;
      }, 0) / Math.max(1, numPlayers * (numPlayers - 1) / 2)
    : 50;
  const zoneRadius = avgDist * 0.4;

  const playerZones: Loc[][] = startLocs.map(() => []);
  const zoneM: Loc[] = [];  // contested middle

  for (const loc of candidates) {
    let nearest = -1;
    let nearestDist = Infinity;
    for (let p = 0; p < numPlayers; p++) {
      const d = dist(loc, startLocs[p]);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = p;
      }
    }
    if (nearestDist <= zoneRadius) {
      playerZones[nearest].push(loc);
    } else {
      zoneM.push(loc);
    }
  }

  // Plan deposit distribution: equal per player zone, rest contested
  const perZone = Math.max(2, Math.floor(numDeposits / (numPlayers + 1)));
  const contested = numDeposits - perZone * numPlayers;

  // Helper: pick a deposit location from a zone, respecting min distance to existing deposits
  function pickFromZone(zone: Loc[]): Loc | null {
    // Shuffle zone candidates
    for (let i = zone.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [zone[i], zone[j]] = [zone[j], zone[i]];
    }

    for (const loc of zone) {
      let tooClose = false;
      for (const dep of deposits) {
        if (dist(loc, dep.loc) < minDepositDist) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) return loc;
    }
    return null;
  }

  // Assign deposit type based on terrain height or rotation
  function assignType(loc: Loc, index: number): DepositType {
    if (heights && waterline !== undefined) {
      const h = heights[loc];
      const landRange = 999 - waterline;
      const relative = (h - waterline) / landRange; // 0 = just above water, 1 = highest peak
      if (relative > 0.6) return DepositType.OreVein;
      if (relative < 0.3) return DepositType.OilWell;
      return DepositType.TextileFarm;
    }
    // Fallback: rotate evenly
    return (index % 3) as DepositType;
  }

  // Place deposits in each zone, ensuring type balance
  function placeInZone(zone: Loc[], count: number): void {
    // Track types placed to ensure balance
    const typeCounts = [0, 0, 0];

    for (let i = 0; i < count; i++) {
      const loc = pickFromZone(zone);
      if (loc === null) break;

      let type = assignType(loc, deposits.length);

      // Rebalance: if one type is overrepresented in this zone, force underrepresented type
      const minCount = Math.min(...typeCounts);
      const maxCount = Math.max(...typeCounts);
      if (maxCount - minCount >= 2) {
        type = typeCounts.indexOf(minCount) as DepositType;
      }

      const deposit: DepositState = {
        id: deposits.length,
        loc,
        type,
        owner: Owner.Unowned,
        buildingComplete: false,
        buildingId: null,
      };
      deposits.push(deposit);
      map[loc].depositId = deposit.id;
      typeCounts[type]++;
    }
  }

  for (const zone of playerZones) {
    placeInZone(zone, perZone);
  }
  placeInZone(zoneM, contested);

  return deposits;
}

// ─── Integrated Map Generator ───────────────────────────────────────────────

export interface MapGenerationResult {
  map: MapCell[];
  cities: CityState[];
  startingCities: number[]; // city indices for each player (length = numPlayers)
  continents: Continent[];
  deposits: DepositState[];
}

/**
 * Generate a complete map: terrain, cities, and starting positions.
 * Dispatches to the appropriate generator based on config.mapType.
 */
export function generateMap(config: GameConfig): MapGenerationResult {
  if (config.mapType === "river") {
    return generateRiverMap(config);
  }
  return generateStandardMap(config);
}

/**
 * Standard height-map-based map generator.
 * Orchestrates Steps 2.1–2.4.
 */
function generateStandardMap(config: GameConfig): MapGenerationResult {
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
  const numPlayers = config.numPlayers ?? 2;
  const startingCities = selectStartingCities(continents, cities, rng, mapWidth * mapHeight, map, mapWidth, mapHeight, numPlayers);

  // Step 2.5: Deposit placement
  const deposits = placeDeposits(map, cities, startingCities, mapWidth, mapHeight, rng, heights, waterline);

  return { map, cities, startingCities, continents, deposits };
}

// ─── River War Map Generator ────────────────────────────────────────────────

/**
 * "War Between the River" map generator.
 *
 * Layout:
 * - Two equal landmasses (west and east) separated by a wide river (20-40 tiles)
 * - Small islands with neutral cities in the river
 * - Navigable tributaries extend from the river into each landmass, ending with cities
 * - Both sides get roughly equal cities and tributaries
 * - Starting cities placed on opposite sides for fairness
 */
function generateRiverMap(config: GameConfig): MapGenerationResult {
  const { mapWidth, mapHeight, seed } = config;
  const rng = createRng(seed);
  const size = mapWidth * mapHeight;

  // ─── Step 1: Initialize all-land map ───────────────────────────────────
  const map: MapCell[] = new Array(size);
  for (let i = 0; i < size; i++) {
    const row = Math.floor(i / mapWidth);
    const col = i % mapWidth;
    const onBoard = row > 0 && row < mapHeight - 1 && col > 0 && col < mapWidth - 1;
    map[i] = { terrain: onBoard ? TerrainType.Land : TerrainType.Sea, onBoard, cityId: null, depositId: null };
  }

  // ─── Step 2: Carve the main river down the center ──────────────────────
  // River width scales with map width: 20-40 tiles for standard, proportional otherwise
  const riverWidth = Math.max(12, Math.min(40, Math.round(mapWidth * 0.25 + irand(rng, Math.round(mapWidth * 0.08)))));
  const riverCenter = Math.floor(mapWidth / 2);
  const riverLeft = riverCenter - Math.floor(riverWidth / 2);
  const riverRight = riverLeft + riverWidth;

  // Carve river with meandering edges (Perlin-like wobble)
  const wobbleAmp = Math.max(2, Math.floor(riverWidth * 0.15)); // edge wobble amplitude
  const leftWobble = generateWobble(mapHeight, wobbleAmp, rng);
  const rightWobble = generateWobble(mapHeight, wobbleAmp, rng);

  for (let row = 1; row < mapHeight - 1; row++) {
    const left = Math.max(1, riverLeft + leftWobble[row]);
    const right = Math.min(mapWidth - 2, riverRight + rightWobble[row]);
    for (let col = left; col <= right; col++) {
      map[row * mapWidth + col].terrain = TerrainType.Sea;
    }
  }

  // ─── Step 3: Add small islands in the river ────────────────────────────
  // Islands are small land clusters (3-8 tiles) scattered in the river
  const numIslands = Math.max(2, Math.floor(mapHeight / 15));
  const islandLocs: Loc[] = []; // track island centers for city placement later

  for (let i = 0; i < numIslands; i++) {
    const islandRow = Math.floor(mapHeight * 0.15) + irand(rng, Math.floor(mapHeight * 0.7));
    const left = Math.max(2, riverLeft + leftWobble[islandRow] + 3);
    const right = Math.min(mapWidth - 3, riverRight + rightWobble[islandRow] - 3);
    if (right - left < 4) continue; // river too narrow here

    const islandCol = left + irand(rng, right - left);
    const islandSize = 3 + irand(rng, 6); // 3-8 tiles

    // BFS-grow the island from center
    const center = islandRow * mapWidth + islandCol;
    if (map[center].terrain !== TerrainType.Sea) continue;
    map[center].terrain = TerrainType.Land;
    islandLocs.push(center);

    const frontier = [center];
    let placed = 1;
    while (placed < islandSize && frontier.length > 0) {
      const idx = irand(rng, frontier.length);
      const loc = frontier[idx];
      const r = Math.floor(loc / mapWidth);
      const c = loc % mapWidth;
      // Try cardinal neighbors
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dr, dc] of dirs) {
        if (placed >= islandSize) break;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 2 || nr >= mapHeight - 2 || nc < 2 || nc >= mapWidth - 2) continue;
        const nloc = nr * mapWidth + nc;
        if (map[nloc].terrain === TerrainType.Sea) {
          map[nloc].terrain = TerrainType.Land;
          frontier.push(nloc);
          placed++;
        }
      }
      // Remove exhausted frontier tiles randomly to keep shape organic
      if (rng() < 0.3) frontier.splice(idx, 1);
    }
  }

  // ─── Step 4: Carve tributaries ─────────────────────────────────────────
  // Tributaries extend from the river into each landmass, navigable by transports (width 2-3)
  const numTributaries = Math.max(2, Math.floor(mapHeight / 12));
  const tributaryEndpoints: { loc: Loc; side: "west" | "east" }[] = [];

  // Space tributaries evenly down the map
  const spacing = Math.floor((mapHeight - 4) / (numTributaries + 1));

  for (let t = 0; t < numTributaries; t++) {
    const tribRow = spacing * (t + 1) + irand(rng, Math.max(1, Math.floor(spacing * 0.4))) - Math.floor(spacing * 0.2);
    const clampedRow = Math.max(3, Math.min(mapHeight - 4, tribRow));

    // West tributary: extends from river left edge westward
    const westEnd = carveRiverTributary(
      map, mapWidth, mapHeight, rng,
      clampedRow, riverLeft + leftWobble[clampedRow], "west",
    );
    if (westEnd !== null) {
      tributaryEndpoints.push({ loc: westEnd, side: "west" });
    }

    // East tributary: extends from river right edge eastward
    const eastEnd = carveRiverTributary(
      map, mapWidth, mapHeight, rng,
      clampedRow, riverRight + rightWobble[clampedRow], "east",
    );
    if (eastEnd !== null) {
      tributaryEndpoints.push({ loc: eastEnd, side: "east" });
    }
  }

  // ─── Step 5: Add terrain roughness to landmasses ───────────────────────
  // Scatter some small water pockets (lakes) to break up flat land
  const numLakes = Math.floor(size * 0.002);
  for (let i = 0; i < numLakes; i++) {
    const row = 2 + irand(rng, mapHeight - 4);
    const col = 2 + irand(rng, mapWidth - 4);
    const loc = row * mapWidth + col;
    // Only place lakes on land tiles away from river and tributaries
    if (map[loc].terrain === TerrainType.Land) {
      const distToCenter = Math.abs(col - riverCenter);
      if (distToCenter > riverWidth * 0.7) {
        map[loc].terrain = TerrainType.Sea;
        // Sometimes expand to 2-3 tiles
        if (rng() < 0.4) {
          const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
          const [dr, dc] = dirs[irand(rng, 4)];
          const nr = row + dr;
          const nc = col + dc;
          if (nr > 1 && nr < mapHeight - 2 && nc > 1 && nc < mapWidth - 2) {
            map[nr * mapWidth + nc].terrain = TerrainType.Sea;
          }
        }
      }
    }
  }

  // ─── Step 6: Place cities ──────────────────────────────────────────────
  const cities: CityState[] = [];
  const defaultFunc: UnitBehavior[] = [
    UnitBehavior.Explore, UnitBehavior.Explore, UnitBehavior.Explore,
    UnitBehavior.Explore, UnitBehavior.Explore, UnitBehavior.None,
    UnitBehavior.Explore, UnitBehavior.Explore, UnitBehavior.None,
    UnitBehavior.None,
  ];

  function placeCity(loc: Loc, owner: Owner): number {
    const cityId = cities.length;
    map[loc] = { ...map[loc], terrain: TerrainType.City, cityId };
    cities.push({
      id: cityId,
      loc,
      owner,
      production: UnitType.Army,
      work: 0,
      func: [...defaultFunc],
      upgradeIds: [],
    });
    return cityId;
  }

  // Place cities at tributary endpoints
  for (const ep of tributaryEndpoints) {
    placeCity(ep.loc, Owner.Unowned);
  }

  // Place cities on river islands
  for (const islandCenter of islandLocs) {
    // Find a land tile on this island (center may have been overwritten, check neighbors)
    let placed = false;
    const r = Math.floor(islandCenter / mapWidth);
    const c = islandCenter % mapWidth;
    for (let dr = 0; dr <= 1 && !placed; dr++) {
      for (let dc = 0; dc <= 1 && !placed; dc++) {
        const loc = (r + dr) * mapWidth + (c + dc);
        if (loc >= 0 && loc < size && map[loc].terrain === TerrainType.Land && map[loc].cityId === null) {
          placeCity(loc, Owner.Unowned);
          placed = true;
        }
      }
    }
  }

  // Place remaining cities across both landmasses, balanced between west and east
  const targetCities = Math.max(config.numCities, cities.length + 4); // at least 4 more
  const westCities: number[] = [];
  const eastCities: number[] = [];

  // Count existing cities per side
  for (let i = 0; i < cities.length; i++) {
    const col = cities[i].loc % mapWidth;
    if (col < riverCenter) westCities.push(i);
    else eastCities.push(i);
  }

  // Fill remaining cities, alternating sides for balance
  let remaining = targetCities - cities.length;
  let side: "west" | "east" = westCities.length <= eastCities.length ? "west" : "east";

  while (remaining > 0) {
    const candidates: Loc[] = [];
    const minDist = Math.max(3, Math.floor(Math.sqrt((mapWidth * mapHeight) / targetCities * 0.5)));

    for (let i = 0; i < size; i++) {
      if (map[i].terrain !== TerrainType.Land || !map[i].onBoard || map[i].cityId !== null) continue;
      const col = i % mapWidth;

      // Filter by side
      if (side === "west" && col >= riverLeft + (leftWobble[Math.floor(i / mapWidth)] || 0) - 2) continue;
      if (side === "east" && col <= riverRight + (rightWobble[Math.floor(i / mapWidth)] || 0) + 2) continue;

      // Check minimum distance to existing cities
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
      // If no candidates on preferred side, try the other
      if (side === "west") side = "east";
      else side = "west";
      // Try once more, then break
      remaining--;
      continue;
    }

    const loc = candidates[irand(rng, candidates.length)];
    placeCity(loc, Owner.Unowned);
    remaining--;

    // Alternate sides
    if (side === "west") {
      westCities.push(cities.length - 1);
      side = "east";
    } else {
      eastCities.push(cities.length - 1);
      side = "west";
    }
  }

  // ─── Step 7: Detect continents (before starting city selection) ────────
  const continents = findContinents(map, cities, mapWidth, mapHeight);

  // Build city→continent size lookup for filtering out islands
  const MIN_START_CONTINENT = 20; // minimum land tiles for a valid starting continent
  const cityContinentSize = new Map<number, number>();
  for (const cont of continents) {
    for (const cIdx of cont.cities) {
      cityContinentSize.set(cIdx, cont.cells.length);
    }
  }

  // ─── Step 8: Select starting cities ────────────────────────────────────
  // Pick one city from each side, on the main landmass (not islands), preferring inland near center
  const westStartCandidates = westCities.filter(i => {
    const col = cities[i].loc % mapWidth;
    if (col <= 3 || col >= riverLeft - 3) return false; // not too close to edge or river
    return (cityContinentSize.get(i) ?? 0) >= MIN_START_CONTINENT; // must be on main landmass
  });
  const eastStartCandidates = eastCities.filter(i => {
    const col = cities[i].loc % mapWidth;
    if (col <= riverRight + 3 || col >= mapWidth - 4) return false;
    return (cityContinentSize.get(i) ?? 0) >= MIN_START_CONTINENT; // must be on main landmass
  });

  // Pick the city closest to the vertical center on each side
  const midRow = Math.floor(mapHeight / 2);
  function closestToCenter(candidates: number[]): number {
    if (candidates.length === 0) return -1;
    let best = candidates[0];
    let bestDist = Math.abs(Math.floor(cities[best].loc / mapWidth) - midRow);
    for (let i = 1; i < candidates.length; i++) {
      const d = Math.abs(Math.floor(cities[candidates[i]].loc / mapWidth) - midRow);
      if (d < bestDist) {
        bestDist = d;
        best = candidates[i];
      }
    }
    return best;
  }

  let startWest = closestToCenter(westStartCandidates);
  let startEast = closestToCenter(eastStartCandidates);
  if (startWest === -1) startWest = westCities.length > 0 ? westCities[0] : 0;
  if (startEast === -1) startEast = eastCities.length > 0 ? eastCities[0] : Math.min(1, cities.length - 1);

  const startingCities: number[] = [startWest, startEast];

  // ─── Step 9: Place deposits ───────────────────────────────────────────
  const deposits = placeDeposits(map, cities, startingCities, mapWidth, mapHeight, rng);

  return { map, cities, startingCities, continents, deposits };
}

// ─── River Map Helpers ──────────────────────────────────────────────────────

/**
 * Generate a smooth wobble pattern for river edges.
 * Uses summed random walks with smoothing for natural-looking river banks.
 */
function generateWobble(length: number, amplitude: number, rng: () => number): number[] {
  const wobble = new Array<number>(length).fill(0);
  let pos = 0;
  for (let i = 0; i < length; i++) {
    pos += (rng() - 0.5) * 2; // random walk
    pos = Math.max(-amplitude, Math.min(amplitude, pos)); // clamp
    wobble[i] = Math.round(pos);
  }
  // Smooth the wobble
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < length - 1; i++) {
      wobble[i] = Math.round((wobble[i - 1] + wobble[i] + wobble[i + 1]) / 3);
    }
  }
  return wobble;
}

/**
 * Carve a navigable tributary from the river into land.
 * Minimum width 3 tiles so transports can always navigate and turn around.
 * Wider mouth at the river junction and turnaround basin at the end.
 * Returns the endpoint location (for city placement) or null if failed.
 */
function carveRiverTributary(
  map: MapCell[],
  mapWidth: number,
  mapHeight: number,
  rng: () => number,
  startRow: number,
  startCol: number,
  direction: "west" | "east",
): Loc | null {
  const tribWidth = 3 + (rng() < 0.3 ? 1 : 0); // 3-4 tiles wide (minimum 3 for navigation)
  // Tributary length: 80-95% of available land width (river edge to map edge)
  // Long tributaries create natural barriers with narrow land choke points between them
  const availableWidth = direction === "west"
    ? Math.max(4, startCol - 2)               // distance from river to west edge
    : Math.max(4, mapWidth - 3 - startCol);   // distance from river to east edge
  const minLength = Math.max(6, Math.floor(availableWidth * 0.80));
  const maxLength = Math.max(minLength + 1, Math.floor(availableWidth * 0.95));
  const length = minLength + irand(rng, Math.max(1, maxLength - minLength + 1));

  let row = startRow;
  let col = startCol;

  // Widen the mouth where tributary meets river (extra tiles for first few columns)
  const mouthWidth = tribWidth + 2;

  for (let step = 0; step < length; step++) {
    // Taper from wider mouth to normal width over first 4 steps
    const currentWidth = step < 4 ? mouthWidth - Math.floor((mouthWidth - tribWidth) * step / 4) : tribWidth;
    const halfW = Math.floor(currentWidth / 2);

    // Carve the tributary cross-section (vertical width)
    for (let w = -halfW; w <= halfW; w++) {
      const r = row + w;
      if (r < 1 || r >= mapHeight - 1 || col < 1 || col >= mapWidth - 1) continue;
      map[r * mapWidth + col].terrain = TerrainType.Sea;
    }

    // Move in primary direction with slight vertical wander
    if (direction === "west") col--;
    else col++;

    // Gentle vertical wobble (less than before to keep width consistent)
    if (rng() < 0.15) {
      row += rng() < 0.5 ? -1 : 1;
      row = Math.max(3, Math.min(mapHeight - 4, row));
    }

    // Stop if we reach the map edge
    if (col <= 3 || col >= mapWidth - 4) break;
  }

  // Carve a turnaround basin at the end (wider area so transports can reverse)
  const basinRadius = Math.max(2, Math.floor(tribWidth / 2) + 1);
  for (let dr = -basinRadius; dr <= basinRadius; dr++) {
    for (let dc = -basinRadius; dc <= basinRadius; dc++) {
      // Diamond shape for natural look
      if (Math.abs(dr) + Math.abs(dc) > basinRadius + 1) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 1 || r >= mapHeight - 1 || c < 1 || c >= mapWidth - 1) continue;
      map[r * mapWidth + c].terrain = TerrainType.Sea;
    }
  }

  // Find endpoint: land tile adjacent to the basin for city placement
  // Search outward from basin center in the direction away from river
  const searchDir = direction === "west" ? -1 : 1;
  for (let dc = 1; dc <= 3; dc++) {
    for (let dr = 0; dr <= 2; dr++) {
      for (const sr of [1, -1]) {
        const r = row + dr * sr;
        const c = col + dc * searchDir;
        if (r < 1 || r >= mapHeight - 1 || c < 1 || c >= mapWidth - 1) continue;
        const loc = r * mapWidth + c;
        if (map[loc].terrain === TerrainType.Land) {
          return loc;
        }
      }
    }
  }
  // Fallback: search any direction
  for (let dr = 0; dr <= 3; dr++) {
    for (let dc = 0; dc <= 3; dc++) {
      for (const sr of [1, -1]) {
        for (const sc of [1, -1]) {
          const r = row + dr * sr;
          const c = col + dc * sc;
          if (r < 1 || r >= mapHeight - 1 || c < 1 || c >= mapWidth - 1) continue;
          const loc = r * mapWidth + c;
          if (map[loc].terrain === TerrainType.Land) {
            return loc;
          }
        }
      }
    }
  }

  return null;
}
