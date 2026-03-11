// Empire Reborn — World Map Generator
// Composes a world from kingdom tiles arranged in a grid with ocean channels.

import type { GameState, GameConfig, MapCell, CityState, DepositState, PlayerInfo } from "./types.js";
import type { PlayerId } from "./constants.js";
import { TerrainType, configureMapDimensions, UNOWNED, STARTING_ORE, STARTING_OIL, STARTING_TEXTILE } from "./constants.js";
import { generateMap, createRng } from "./mapgen.js";
import { initViewMap, scan } from "./game.js";
import { createPlayerInfo, initAllPlayerData } from "./player.js";
import { initKingdoms } from "./kingdom.js";

// ─── World Config ──────────────────────────────────────────────────────────

/** Configuration for a kingdom world. */
export interface WorldConfig {
  /** Kingdom tile size in tiles (each kingdom is tileSize x tileSize). */
  tileSize: number;
  /** Ocean channel width between kingdom tiles. */
  channelWidth: number;
  /** Initial grid radius (0=center only, 1=center+ring1, 2=center+ring1+ring2). */
  initialRadius: number;
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
  /** Grid position (0,0 = center). */
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
}

/** World state extending GameState with world-specific data. */
export interface WorldState {
  /** Underlying game state (the combined world map). */
  gameState: GameState;
  /** World configuration. */
  worldConfig: WorldConfig;
  /** Grid of kingdom tiles. */
  kingdoms: KingdomTile[];
  /** World grid diameter (in kingdom tiles). */
  gridSize: number;
  /** Total world dimensions. */
  worldWidth: number;
  worldHeight: number;
  /** World creation timestamp. */
  createdAt: number;
  /** Season end timestamp. */
  seasonEndsAt: number;
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
 * Generate the full world map by composing kingdom tiles into a single map.
 * Creates ocean channels between tiles and merges all terrain/cities/deposits.
 */
export function generateWorldMap(config: WorldConfig): WorldState {
  const rng = createRng(config.seed || (Date.now() & 0xffffffff));
  const gridSize = gridSizeForRadius(config.initialRadius);
  const center = config.initialRadius; // center grid index
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

  const worldCities: CityState[] = [];
  const worldDeposits: DepositState[] = [];
  const kingdomTiles: KingdomTile[] = [];
  let nextPlayerId = 1;

  // Generate each kingdom tile
  for (let gr = 0; gr < gridSize; gr++) {
    for (let gc = 0; gc < gridSize; gc++) {
      const ring = ringDistance({ row: gr, col: gc }, center);
      const isOrigin = gr === center && gc === center;
      const offset = kingdomWorldOffset(
        { row: gr, col: gc },
        config.tileSize,
        config.channelWidth,
      );

      // Generate tile terrain with unique seed
      const tileSeed = Math.floor(rng() * 2 ** 32);
      const tile = generateKingdomTile(
        config.tileSize,
        config.waterRatio,
        config.smoothPasses,
        tileSeed,
      );

      // Assign a player to this kingdom (all AI for now)
      const playerId = nextPlayerId++;
      const startingCityId = worldCities.length + tile.startingCityIdx;

      // Copy tile terrain into world map
      for (let tr = 0; tr < config.tileSize; tr++) {
        for (let tc = 0; tc < config.tileSize; tc++) {
          const tileLoc = tr * config.tileSize + tc;
          const worldRow = offset.row + tr;
          const worldCol = offset.col + tc;
          const worldLoc = worldRow * worldWidth + worldCol;

          const tileCell = tile.map[tileLoc];
          worldMap[worldLoc] = {
            terrain: tileCell.terrain,
            onBoard: tileCell.onBoard,
            cityId: null, // will be set when copying cities
            depositId: null, // will be set when copying deposits
          };
        }
      }

      // Copy cities into world, remapping locations and IDs
      const cityIdOffset = worldCities.length;
      for (const city of tile.cities) {
        const tileRow = Math.floor(city.loc / config.tileSize);
        const tileCol = city.loc % config.tileSize;
        const worldRow = offset.row + tileRow;
        const worldCol = offset.col + tileCol;
        const worldLoc = worldRow * worldWidth + worldCol;

        const worldCity: CityState = {
          ...city,
          id: cityIdOffset + city.id,
          loc: worldLoc,
          owner: UNOWNED,
        };
        worldCities.push(worldCity);
        worldMap[worldLoc].cityId = worldCity.id;
        worldMap[worldLoc].terrain = TerrainType.City;
      }

      // Assign starting city to kingdom owner
      if (startingCityId < worldCities.length) {
        worldCities[startingCityId].owner = playerId as any;
      }

      // Copy deposits into world, remapping locations and IDs
      const depositIdOffset = worldDeposits.length;
      for (const deposit of tile.deposits) {
        const tileRow = Math.floor(deposit.loc / config.tileSize);
        const tileCol = deposit.loc % config.tileSize;
        const worldRow = offset.row + tileRow;
        const worldCol = offset.col + tileCol;
        const worldLoc = worldRow * worldWidth + worldCol;

        const worldDeposit: DepositState = {
          ...deposit,
          id: depositIdOffset + deposit.id,
          loc: worldLoc,
        };
        worldDeposits.push(worldDeposit);
        worldMap[worldLoc].depositId = worldDeposit.id;
      }

      // Record kingdom tile
      kingdomTiles.push({
        pos: { row: gr, col: gc },
        owner: playerId as PlayerId,
        isOrigin,
        ring,
        worldOffset: offset,
        startingCityId,
      });
    }
  }

  // Restore global dimensions to world size (tile generation changed them)
  configureMapDimensions(worldWidth, worldHeight);

  // Create player roster — all AI kingdoms
  const players: PlayerInfo[] = [];
  const startingCities: number[] = [];
  for (const kt of kingdomTiles) {
    players.push(createPlayerInfo(kt.owner, undefined, true));
    startingCities.push(kt.startingCityId);
  }

  // Build GameState for the world
  const gameState: GameState = {
    config: {
      mapWidth: worldWidth,
      mapHeight: worldHeight,
      numCities: worldCities.length,
      waterRatio: config.waterRatio,
      smoothPasses: config.smoothPasses,
      minCityDist: 2,
      seed: config.seed,
      numPlayers: players.length,
    },
    turn: 0,
    map: worldMap,
    cities: worldCities,
    units: [],
    nextUnitId: 0,
    nextCityId: worldCities.length,
    players,
    viewMaps: {},
    rngState: config.seed,
    resources: {},
    deposits: worldDeposits,
    nextDepositId: worldDeposits.length,
    buildings: [],
    nextBuildingId: 0,
    techResearch: {},
    kingdoms: {},
  };

  // Initialize per-player data (viewMaps, resources, tech)
  initAllPlayerData(gameState);

  // Scan initial vision for each kingdom's starting city
  for (const kt of kingdomTiles) {
    if (kt.startingCityId < worldCities.length) {
      scan(gameState, kt.owner, worldCities[kt.startingCityId].loc);
    }
  }

  // Initialize kingdoms — starting cities become crown cities
  initKingdoms(gameState, startingCities);

  const now = Date.now();

  return {
    gameState,
    worldConfig: config,
    kingdoms: kingdomTiles,
    gridSize,
    worldWidth,
    worldHeight,
    createdAt: now,
    seasonEndsAt: now + config.lifespanDays * 24 * 60 * 60 * 1000,
  };
}

/**
 * Find an available kingdom tile for a new player to join.
 * Prefers the requested ring distance, falls back to nearest available.
 * Returns null if no tiles are available.
 */
export function findAvailableKingdom(
  world: WorldState,
  preferredRing: number,
): KingdomTile | null {
  // Sort by distance from preferred ring, then by actual ring (inner first)
  const available = world.kingdoms
    .filter(kt => {
      // Kingdom is "available" if it's AI-owned (can be claimed by human)
      const player = world.gameState.players.find(p => p.id === kt.owner);
      return player?.isAI === true;
    })
    .sort((a, b) => {
      const distA = Math.abs(a.ring - preferredRing);
      const distB = Math.abs(b.ring - preferredRing);
      if (distA !== distB) return distA - distB;
      return a.ring - b.ring;
    });

  return available[0] ?? null;
}

/**
 * Assign a human player to an existing AI kingdom tile.
 * The AI player is replaced with the human player.
 */
export function claimKingdom(
  world: WorldState,
  tile: KingdomTile,
  playerName: string,
): PlayerId {
  const playerId = tile.owner;

  // Update player info to human
  const playerInfo = world.gameState.players.find(p => p.id === playerId);
  if (playerInfo) {
    playerInfo.isAI = false;
    playerInfo.name = playerName;
  }

  return playerId;
}
