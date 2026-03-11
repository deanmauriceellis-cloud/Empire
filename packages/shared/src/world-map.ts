// Empire Reborn — World Map Generator
// Composes a world from kingdom tiles arranged in a grid with ocean channels.
// Phase 12: Dynamic expansion, AI strength gradient, spawn protection.

import type { GameState, GameConfig, MapCell, CityState, DepositState, PlayerInfo } from "./types.js";
import type { PlayerId } from "./constants.js";
import {
  TerrainType, UnitType, UnitBehavior,
  configureMapDimensions, UNOWNED,
  STARTING_ORE, STARTING_OIL, STARTING_TEXTILE,
  WORLD_MAX_RADIUS, SPAWN_PROTECTION_TICKS,
} from "./constants.js";
import { generateMap, createRng } from "./mapgen.js";
import { initViewMap, scan, createUnit } from "./game.js";
import { createPlayerInfo, initAllPlayerData, initPlayerData } from "./player.js";
import { initKingdoms, createKingdomState } from "./kingdom.js";

// ─── World Config ──────────────────────────────────────────────────────────

/** Configuration for a kingdom world. */
export interface WorldConfig {
  /** Kingdom tile size in tiles (each kingdom is tileSize x tileSize). */
  tileSize: number;
  /** Ocean channel width between kingdom tiles. */
  channelWidth: number;
  /** Initial grid radius (0=center only, 1=center+ring1, 2=center+ring1+ring2). */
  initialRadius: number;
  /** Maximum grid radius for pre-allocation (default WORLD_MAX_RADIUS). */
  maxRadius: number;
  /** RNG seed for world generation. */
  seed: number;
  /** Tick interval in milliseconds (60000=1min, 300000=5min, etc). */
  tickIntervalMs: number;
  /** World lifespan in days (default 30). */
  lifespanDays: number;
  /** Water ratio for kingdom tile terrain (0-100). */
  waterRatio: number;
  /** Smoothing passes for kingdom tile terrain. */
  smoothPasses: number;
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  tileSize: 100,
  channelWidth: 12,
  initialRadius: 2,
  maxRadius: WORLD_MAX_RADIUS,
  seed: 0,
  tickIntervalMs: 60_000,
  lifespanDays: 30,
  waterRatio: 65,
  smoothPasses: 5,
};

/** Position of a kingdom tile in the world grid. */
export interface KingdomTilePos {
  row: number;
  col: number;
}

/** Metadata for a kingdom tile in the world. */
export interface KingdomTile {
  /** Grid position (0,0 = top-left of allocated grid). */
  pos: KingdomTilePos;
  /** PlayerId who owns this kingdom (0 = unoccupied). */
  owner: PlayerId;
  /** Whether this tile is the origin (center) kingdom. */
  isOrigin: boolean;
  /** Ring distance from center (0 = center, 1 = adjacent, 2+ = far). */
  ring: number;
  /** Top-left corner of this tile in world coordinates. */
  worldOffset: { row: number; col: number };
  /** Starting city index in the world cities array. */
  startingCityId: number;
  /** Tick at which spawn protection expires (0 = no protection / AI). */
  spawnProtectionEndTick: number;
}

/** Per-ring info for the world browser. */
export interface RingInfo {
  ring: number;
  totalSlots: number;
  aiSlots: number;
  humanSlots: number;
  description: string;
}

/** World state extending GameState with world-specific data. */
export interface WorldState {
  /** Underlying game state (the combined world map). */
  gameState: GameState;
  /** World configuration. */
  worldConfig: WorldConfig;
  /** Grid of kingdom tiles. */
  kingdoms: KingdomTile[];
  /** World grid diameter (in kingdom tiles) — based on maxRadius for pre-allocation. */
  gridSize: number;
  /** Current populated radius (kingdoms exist up to this ring). */
  populatedRadius: number;
  /** Total world dimensions. */
  worldWidth: number;
  worldHeight: number;
  /** World creation timestamp. */
  createdAt: number;
  /** Season end timestamp. */
  seasonEndsAt: number;
  /** RNG state seed for deterministic expansion. */
  expansionSeed: number;
}

// ─── Grid Geometry ─────────────────────────────────────────────────────────

/**
 * Calculate the grid size needed for a given radius.
 * Radius 0 = 1x1, radius 1 = 3x3, radius 2 = 5x5, etc.
 */
export function gridSizeForRadius(radius: number): number {
  return 2 * radius + 1;
}

/** Calculate ring distance of a grid position from center. */
export function ringDistance(pos: KingdomTilePos, center: number): number {
  return Math.max(Math.abs(pos.row - center), Math.abs(pos.col - center));
}

/**
 * Calculate world dimensions for a given grid size and config.
 * World = grid of (tileSize + channelWidth) cells per kingdom, minus trailing channel.
 */
export function worldDimensions(
  gridSize: number,
  tileSize: number,
  channelWidth: number,
): { width: number; height: number } {
  const cellSize = tileSize + channelWidth;
  return {
    width: gridSize * cellSize + channelWidth, // channel border on all sides
    height: gridSize * cellSize + channelWidth,
  };
}

/**
 * Get the world-coordinate offset for a kingdom tile at grid position.
 * Each tile starts after its channel border.
 */
export function kingdomWorldOffset(
  pos: KingdomTilePos,
  tileSize: number,
  channelWidth: number,
): { row: number; col: number } {
  const cellSize = tileSize + channelWidth;
  return {
    row: channelWidth + pos.row * cellSize,
    col: channelWidth + pos.col * cellSize,
  };
}

/** Count grid positions at a specific ring distance. */
export function ringSlotCount(ring: number): number {
  if (ring === 0) return 1;
  return 8 * ring; // perimeter of a square at Chebyshev distance ring
}

/** Get all grid positions at a specific ring distance in a grid with given center. */
function ringPositions(ring: number, center: number): KingdomTilePos[] {
  const positions: KingdomTilePos[] = [];
  if (ring === 0) {
    positions.push({ row: center, col: center });
    return positions;
  }
  // Walk the perimeter of the ring square
  const minR = center - ring;
  const maxR = center + ring;
  const minC = center - ring;
  const maxC = center + ring;
  // Top row (left to right)
  for (let c = minC; c <= maxC; c++) positions.push({ row: minR, col: c });
  // Right column (top+1 to bottom-1)
  for (let r = minR + 1; r < maxR; r++) positions.push({ row: r, col: maxC });
  // Bottom row (right to left)
  for (let c = maxC; c >= minC; c--) positions.push({ row: maxR, col: c });
  // Left column (bottom-1 to top+1)
  for (let r = maxR - 1; r > minR; r--) positions.push({ row: r, col: minC });
  return positions;
}

// ─── Ring Descriptions ────────────────────────────────────────────────────

const RING_DESCRIPTIONS: Record<number, string> = {
  0: "Origin — AI-controlled world center",
  1: "Inner — Adjacent to origin. Immediate conflict.",
  2: "Middle — One kingdom gap from center. Balanced.",
  3: "Outer — Two kingdoms from center. Time to prepare.",
  4: "Far — Remote frontier. Safe buildup.",
  5: "Edge — World border. Maximum isolation.",
};

function getRingDescription(ring: number): string {
  return RING_DESCRIPTIONS[ring] ?? `Ring ${ring} — Distant frontier`;
}

// ─── AI Strength Gradient ─────────────────────────────────────────────────

/**
 * Number of starting armies for an AI kingdom based on ring distance.
 * Inner rings get more starting units (stronger), outer rings get fewer.
 */
function aiStartingArmies(ring: number): number {
  if (ring === 0) return 5; // Origin AI — strongest
  if (ring === 1) return 3; // Inner ring — strong
  if (ring === 2) return 2; // Middle ring — moderate
  return 1;                 // Outer rings — fresh start like human
}

/**
 * Starting tech bonus for AI kingdoms near the center.
 * Returns [science, health, electronics, war] bonus points.
 */
function aiStartingTech(ring: number): [number, number, number, number] {
  if (ring === 0) return [15, 10, 10, 15]; // Origin AI — advanced
  if (ring === 1) return [5, 3, 3, 5];     // Inner ring — some head start
  return [0, 0, 0, 0];                      // Ring 2+ — no tech bonus
}

/**
 * Starting resource bonus for AI kingdoms near the center.
 * Returns [ore, oil, textile] bonus amounts.
 */
function aiStartingResourceBonus(ring: number): [number, number, number] {
  if (ring === 0) return [200, 150, 200]; // Origin AI — stockpiled
  if (ring === 1) return [50, 30, 50];    // Inner ring — slight edge
  return [0, 0, 0];                        // Ring 2+ — standard start
}

// ─── World Map Composition ─────────────────────────────────────────────────

/**
 * Generate a kingdom tile's terrain as a standalone map.
 * Returns map cells, cities, and deposits for a single kingdom.
 */
function generateKingdomTile(
  tileSize: number,
  waterRatio: number,
  smoothPasses: number,
  seed: number,
): {
  map: MapCell[];
  cities: CityState[];
  deposits: DepositState[];
  startingCityIdx: number;
} {
  // Configure for tile-sized map
  configureMapDimensions(tileSize, tileSize);

  const config: GameConfig = {
    mapWidth: tileSize,
    mapHeight: tileSize,
    numCities: Math.floor((100 * (tileSize + tileSize)) / 228), // standard formula
    waterRatio,
    smoothPasses,
    minCityDist: 2,
    seed,
    numPlayers: 2, // 1 owner + 1 placeholder (we only use startingCities[0])
  };

  const result = generateMap(config);

  return {
    map: result.map,
    cities: result.cities,
    deposits: result.deposits,
    startingCityIdx: result.startingCities[0], // center-ish city for the kingdom owner
  };
}

/**
 * Place a kingdom tile into the world map, adding its terrain, cities, and deposits.
 * Returns the KingdomTile metadata and the assigned PlayerId.
 */
function placeKingdomTile(
  world: WorldState,
  pos: KingdomTilePos,
  ring: number,
  tileSeed: number,
): KingdomTile {
  const { tileSize, channelWidth, waterRatio, smoothPasses } = world.worldConfig;
  const state = world.gameState;
  const { worldWidth } = world;
  const center = Math.floor(world.gridSize / 2);
  const isOrigin = pos.row === center && pos.col === center;

  const offset = kingdomWorldOffset(pos, tileSize, channelWidth);
  const tile = generateKingdomTile(tileSize, waterRatio, smoothPasses, tileSeed);

  // Restore global dimensions (tile generation changed them)
  configureMapDimensions(world.worldWidth, world.worldHeight);

  // Assign a new player ID
  const playerId = (state.players.length + 1) as PlayerId;
  const startingCityId = state.cities.length + tile.startingCityIdx;

  // Copy tile terrain into world map
  for (let tr = 0; tr < tileSize; tr++) {
    for (let tc = 0; tc < tileSize; tc++) {
      const tileLoc = tr * tileSize + tc;
      const worldRow = offset.row + tr;
      const worldCol = offset.col + tc;
      const worldLoc = worldRow * worldWidth + worldCol;

      const tileCell = tile.map[tileLoc];
      state.map[worldLoc] = {
        terrain: tileCell.terrain,
        onBoard: tileCell.onBoard,
        cityId: null,
        depositId: null,
      };
    }
  }

  // Copy cities into world, remapping locations and IDs
  const cityIdOffset = state.cities.length;
  for (const city of tile.cities) {
    const tileRow = Math.floor(city.loc / tileSize);
    const tileCol = city.loc % tileSize;
    const worldRow = offset.row + tileRow;
    const worldCol = offset.col + tileCol;
    const worldLoc = worldRow * worldWidth + worldCol;

    const worldCity: CityState = {
      ...city,
      id: cityIdOffset + city.id,
      loc: worldLoc,
      owner: UNOWNED,
    };
    state.cities.push(worldCity);
    state.map[worldLoc].cityId = worldCity.id;
    state.map[worldLoc].terrain = TerrainType.City;
  }

  // Assign starting city to kingdom owner
  if (startingCityId < state.cities.length) {
    state.cities[startingCityId].owner = playerId as any;
  }
  state.nextCityId = state.cities.length;

  // Copy deposits into world, remapping locations and IDs
  const depositIdOffset = state.deposits.length;
  for (const deposit of tile.deposits) {
    const tileRow = Math.floor(deposit.loc / tileSize);
    const tileCol = deposit.loc % tileSize;
    const worldRow = offset.row + tileRow;
    const worldCol = offset.col + tileCol;
    const worldLoc = worldRow * worldWidth + worldCol;

    const worldDeposit: DepositState = {
      ...deposit,
      id: depositIdOffset + deposit.id,
      loc: worldLoc,
    };
    state.deposits.push(worldDeposit);
    state.map[worldLoc].depositId = worldDeposit.id;
  }
  state.nextDepositId = state.deposits.length;

  // Register new AI player
  const playerInfo = createPlayerInfo(playerId, undefined, true);
  state.players.push(playerInfo);
  state.config.numPlayers = state.players.length;

  // Initialize per-player data
  initPlayerData(state, playerId);

  // Apply ring-based resource bonus
  const resourceBonus = aiStartingResourceBonus(ring);
  state.resources[playerId][0] += resourceBonus[0];
  state.resources[playerId][1] += resourceBonus[1];
  state.resources[playerId][2] += resourceBonus[2];

  // Apply ring-based tech bonus
  const techBonus = aiStartingTech(ring);
  state.techResearch[playerId][0] += techBonus[0];
  state.techResearch[playerId][1] += techBonus[1];
  state.techResearch[playerId][2] += techBonus[2];
  state.techResearch[playerId][3] += techBonus[3];

  // Scan initial vision for starting city
  if (startingCityId < state.cities.length) {
    scan(state, playerId, state.cities[startingCityId].loc);
  }

  // Initialize kingdom state (crown city)
  state.kingdoms[playerId] = createKingdomState(playerId, startingCityId);

  // Spawn starting armies based on ring (AI strength gradient)
  const numArmies = aiStartingArmies(ring);
  if (startingCityId < state.cities.length) {
    const cityLoc = state.cities[startingCityId].loc;
    for (let i = 0; i < numArmies; i++) {
      const unit = createUnit(state, UnitType.Army, playerId as any, cityLoc);
      unit.func = UnitBehavior.Sentry;
    }
  }

  // Build kingdom tile metadata
  const kingdomTile: KingdomTile = {
    pos,
    owner: playerId,
    isOrigin,
    ring,
    worldOffset: offset,
    startingCityId,
    spawnProtectionEndTick: 0, // AI kingdoms don't get spawn protection
  };

  world.kingdoms.push(kingdomTile);
  return kingdomTile;
}

/**
 * Generate the full world map by composing kingdom tiles into a single map.
 * Pre-allocates for maxRadius but only populates tiles up to initialRadius.
 * Creates ocean channels between tiles and merges all terrain/cities/deposits.
 */
export function generateWorldMap(config: WorldConfig): WorldState {
  const rng = createRng(config.seed || (Date.now() & 0xffffffff));
  const maxRadius = config.maxRadius ?? WORLD_MAX_RADIUS;
  const gridSize = gridSizeForRadius(maxRadius);
  const center = maxRadius;
  const { width: worldWidth, height: worldHeight } = worldDimensions(
    gridSize,
    config.tileSize,
    config.channelWidth,
  );

  // Configure global dimensions for world map
  configureMapDimensions(worldWidth, worldHeight);

  // Initialize world map — all ocean
  const worldMap: MapCell[] = new Array(worldWidth * worldHeight);
  for (let i = 0; i < worldMap.length; i++) {
    worldMap[i] = {
      terrain: TerrainType.Sea,
      onBoard: true,
      cityId: null,
      depositId: null,
    };
  }

  // Mark border cells as off-board
  for (let r = 0; r < worldHeight; r++) {
    for (let c = 0; c < worldWidth; c++) {
      if (r === 0 || r === worldHeight - 1 || c === 0 || c === worldWidth - 1) {
        worldMap[r * worldWidth + c].onBoard = false;
      }
    }
  }

  // Save expansion seed (derived from main seed for deterministic expansion)
  const expansionSeed = Math.floor(rng() * 2 ** 32);

  const now = Date.now();

  // Build initial WorldState shell
  const world: WorldState = {
    gameState: {
      config: {
        mapWidth: worldWidth,
        mapHeight: worldHeight,
        numCities: 0,
        waterRatio: config.waterRatio,
        smoothPasses: config.smoothPasses,
        minCityDist: 2,
        seed: config.seed,
        numPlayers: 0,
      },
      turn: 0,
      map: worldMap,
      cities: [],
      units: [],
      nextUnitId: 0,
      nextCityId: 0,
      players: [],
      viewMaps: {},
      rngState: config.seed,
      resources: {},
      deposits: [],
      nextDepositId: 0,
      buildings: [],
      nextBuildingId: 0,
      techResearch: {},
      kingdoms: {},
      shields: {},
    },
    worldConfig: config,
    kingdoms: [],
    gridSize,
    populatedRadius: 0,
    worldWidth,
    worldHeight,
    createdAt: now,
    seasonEndsAt: now + config.lifespanDays * 24 * 60 * 60 * 1000,
    expansionSeed,
  };

  // Initialize unowned slot
  const state = world.gameState;
  state.viewMaps[UNOWNED] = [];
  state.resources[UNOWNED] = [0, 0, 0];
  state.techResearch[UNOWNED] = [0, 0, 0, 0];

  // Generate tiles for initial rings (0 to initialRadius)
  const tileRng = createRng(expansionSeed);
  for (let ring = 0; ring <= config.initialRadius; ring++) {
    const positions = ringPositions(ring, center);
    for (const pos of positions) {
      const tileSeed = Math.floor(tileRng() * 2 ** 32);
      placeKingdomTile(world, pos, ring, tileSeed);
    }
  }
  world.populatedRadius = config.initialRadius;

  // Restore global dimensions (tile generation may have changed them)
  configureMapDimensions(worldWidth, worldHeight);

  return world;
}

// ─── World Expansion ──────────────────────────────────────────────────────

/**
 * Expand the world by generating kingdom tiles up to the target ring.
 * New AI kingdoms are created for each new ring.
 * Returns the number of new kingdoms added.
 */
export function expandWorldToRing(world: WorldState, targetRing: number): number {
  const maxRadius = world.worldConfig.maxRadius ?? WORLD_MAX_RADIUS;
  const clampedTarget = Math.min(targetRing, maxRadius);

  if (clampedTarget <= world.populatedRadius) return 0;

  const center = Math.floor(world.gridSize / 2);
  let added = 0;

  // We need to advance the RNG to the right position for deterministic expansion.
  // The initial generation consumed seeds for rings 0..populatedRadius.
  // Skip those, then generate new rings.
  const tileRng = createRng(world.expansionSeed);
  // Skip seeds already used
  for (let ring = 0; ring <= world.populatedRadius; ring++) {
    const count = ringSlotCount(ring);
    for (let i = 0; i < count; i++) {
      tileRng(); // consume the seed
    }
  }

  // Generate new rings
  for (let ring = world.populatedRadius + 1; ring <= clampedTarget; ring++) {
    const positions = ringPositions(ring, center);
    for (const pos of positions) {
      const tileSeed = Math.floor(tileRng() * 2 ** 32);
      placeKingdomTile(world, pos, ring, tileSeed);
      added++;
    }
  }

  world.populatedRadius = clampedTarget;

  // Restore global dimensions
  configureMapDimensions(world.worldWidth, world.worldHeight);

  return added;
}

// ─── Kingdom Finding & Claiming ───────────────────────────────────────────

/**
 * Find an available kingdom tile for a new player to join.
 * Prefers the requested ring distance, falls back to nearest available.
 * If no tiles available, tries to expand the world to create new ones.
 * Returns null if no tiles are available even after expansion.
 */
export function findAvailableKingdom(
  world: WorldState,
  preferredRing: number,
): KingdomTile | null {
  // First, try to find an existing AI kingdom
  const available = world.kingdoms
    .filter(kt => {
      const player = world.gameState.players.find(p => p.id === kt.owner);
      return player?.isAI === true;
    })
    .sort((a, b) => {
      const distA = Math.abs(a.ring - preferredRing);
      const distB = Math.abs(b.ring - preferredRing);
      if (distA !== distB) return distA - distB;
      return a.ring - b.ring;
    });

  if (available.length > 0) return available[0];

  // No AI kingdoms available — try expanding to the next unpopulated ring
  const maxRadius = world.worldConfig.maxRadius ?? WORLD_MAX_RADIUS;
  const nextRing = world.populatedRadius + 1;
  if (nextRing <= maxRadius) {
    const targetRing = Math.min(
      Math.max(preferredRing, nextRing),
      maxRadius,
    );
    const added = expandWorldToRing(world, targetRing);
    if (added > 0) {
      // Retry with the newly created kingdoms
      return findAvailableKingdom(world, preferredRing);
    }
  }

  return null;
}

/**
 * Assign a human player to an existing AI kingdom tile.
 * The AI player is replaced with the human player.
 * Optionally activates spawn protection.
 */
export function claimKingdom(
  world: WorldState,
  tile: KingdomTile,
  playerName: string,
  currentTick?: number,
): PlayerId {
  const playerId = tile.owner;

  // Update player info to human
  const playerInfo = world.gameState.players.find(p => p.id === playerId);
  if (playerInfo) {
    playerInfo.isAI = false;
    playerInfo.name = playerName;
  }

  // Activate spawn protection
  if (currentTick !== undefined) {
    tile.spawnProtectionEndTick = currentTick + SPAWN_PROTECTION_TICKS;
  }

  return playerId;
}

// ─── Spawn Protection ─────────────────────────────────────────────────────

/**
 * Check if a kingdom tile has active spawn protection at the given tick.
 */
export function isSpawnProtected(tile: KingdomTile, currentTick: number): boolean {
  return tile.spawnProtectionEndTick > currentTick;
}

/**
 * Get the kingdom tile that contains a world map location, or null if in ocean channel.
 */
export function getKingdomTileAtLoc(
  world: WorldState,
  loc: number,
): KingdomTile | null {
  const { tileSize, channelWidth } = world.worldConfig;
  const { worldWidth } = world;
  const row = Math.floor(loc / worldWidth);
  const col = loc % worldWidth;
  const cellSize = tileSize + channelWidth;

  // Check if location is in the channel border
  const localRow = (row - channelWidth) % cellSize;
  const localCol = (col - channelWidth) % cellSize;
  if (row < channelWidth || col < channelWidth) return null;
  if (localRow >= tileSize || localCol >= tileSize) return null;

  // Calculate grid position
  const gridRow = Math.floor((row - channelWidth) / cellSize);
  const gridCol = Math.floor((col - channelWidth) / cellSize);

  return world.kingdoms.find(
    k => k.pos.row === gridRow && k.pos.col === gridCol,
  ) ?? null;
}

/**
 * Check if a unit move into a location is blocked by spawn protection.
 * Returns true if the target tile is spawn-protected and the unit's owner
 * is not the kingdom's owner.
 */
export function isBlockedBySpawnProtection(
  world: WorldState,
  unitOwner: PlayerId,
  targetLoc: number,
  currentTick: number,
): boolean {
  const tile = getKingdomTileAtLoc(world, targetLoc);
  if (!tile) return false;
  if (tile.owner === unitOwner) return false;
  return isSpawnProtected(tile, currentTick);
}

// ─── World Browser Info ───────────────────────────────────────────────────

/**
 * Get ring information for the world browser UI.
 * Returns info about each ring: total slots, AI/human counts, description.
 */
export function getWorldRingInfo(world: WorldState): RingInfo[] {
  const maxRadius = world.worldConfig.maxRadius ?? WORLD_MAX_RADIUS;
  const rings: RingInfo[] = [];

  for (let ring = 0; ring <= maxRadius; ring++) {
    const totalSlots = ringSlotCount(ring);
    const tilesAtRing = world.kingdoms.filter(k => k.ring === ring);
    let aiSlots = 0;
    let humanSlots = 0;

    for (const kt of tilesAtRing) {
      const player = world.gameState.players.find(p => p.id === kt.owner);
      if (player?.isAI) {
        aiSlots++;
      } else {
        humanSlots++;
      }
    }

    // Unpopulated rings show full available slots
    const isPopulated = ring <= world.populatedRadius;
    rings.push({
      ring,
      totalSlots,
      aiSlots: isPopulated ? aiSlots : totalSlots,
      humanSlots,
      description: getRingDescription(ring),
    });
  }

  return rings;
}
