// Empire Reborn — Single-Player Game Manager
// Runs entirely client-side using shared game logic + AI.
// No server needed — same GameState + executeTurn interface.

import { type GameState, type GameConfig, type PlayerAction, type TurnResult, type PlayerInfo } from "./types.js";
import { Owner, MAP_WIDTH, MAP_HEIGHT, NUM_CITY, configureMapDimensions, UNOWNED } from "./constants.js";
import type { PlayerId } from "./constants.js";
import { generateMap } from "./mapgen.js";
import { initViewMap, scan, executeTurn } from "./game.js";
import { computeAITurn } from "./ai.js";
import { createPlayerInfo, initAllPlayerData } from "./player.js";
import { initKingdoms } from "./kingdom.js";

export interface SinglePlayerGame {
  state: GameState;
  isGameOver: boolean;
  winner: PlayerId | null;
  winType: "elimination" | "resignation" | null;

  /** Submit player actions and advance the turn. Returns turn result. */
  submitTurn(actions: PlayerAction[]): TurnResult;
}

/**
 * Create a new single-player game.
 * Player 1 = human, remaining players = AI.
 */
export function createSinglePlayerGame(configOverrides?: Partial<GameConfig>): SinglePlayerGame {
  // Configure global map dimensions first so NUM_CITY scales correctly
  const w = configOverrides?.mapWidth ?? MAP_WIDTH;
  const h = configOverrides?.mapHeight ?? MAP_HEIGHT;
  configureMapDimensions(w, h);

  const numPlayers = configOverrides?.numPlayers ?? 2;

  const config: GameConfig = {
    mapWidth: w,
    mapHeight: h,
    numCities: NUM_CITY, // auto-scaled by configureMapDimensions
    waterRatio: 70,
    smoothPasses: 5,
    minCityDist: 2,
    seed: Math.floor(Math.random() * 2 ** 32),
    ...configOverrides,
    numPlayers,
  };

  const mapResult = generateMap(config);

  // Create player roster: player 1 = human, rest = AI
  const players: PlayerInfo[] = [];
  for (let i = 1; i <= numPlayers; i++) {
    players.push(createPlayerInfo(i, undefined, i > 1));
  }

  const state: GameState = {
    config,
    turn: 0,
    map: mapResult.map,
    cities: mapResult.cities,
    units: [],
    nextUnitId: 0,
    nextCityId: mapResult.cities.length,
    players,
    viewMaps: {},
    rngState: config.seed,
    resources: {},
    deposits: mapResult.deposits,
    nextDepositId: mapResult.deposits.length,
    buildings: [],
    nextBuildingId: 0,
    techResearch: {},
    kingdoms: {},
  };

  // Initialize per-player data (viewMaps, resources, tech)
  initAllPlayerData(state);

  // Assign starting cities
  for (let i = 0; i < numPlayers && i < mapResult.startingCities.length; i++) {
    const cityId = mapResult.startingCities[i];
    const playerId = i + 1;
    state.cities[cityId].owner = playerId as any;

    // Initial vision scan
    scan(state, playerId, state.cities[cityId].loc);
  }

  // Initialize kingdoms — starting cities become crown cities
  initKingdoms(state, mapResult.startingCities);

  let isGameOver = false;
  let winner: PlayerId | null = null;
  let winType: "elimination" | "resignation" | null = null;

  return {
    state,
    get isGameOver() { return isGameOver; },
    get winner() { return winner; },
    get winType() { return winType; },

    submitTurn(playerActions: PlayerAction[]): TurnResult {
      if (isGameOver) {
        throw new Error("Game is already over");
      }

      const t0 = performance.now();

      // Build action map: human player + all AI players
      const allActions = new Map<number, PlayerAction[]>();
      allActions.set(1, playerActions); // Human is always player 1

      // Compute AI actions for all AI players
      for (const player of state.players) {
        if (player.isAI && player.status === "active") {
          const aiActions = computeAITurn(state, player.id);
          allActions.set(player.id, aiActions);
        }
      }

      const t1 = performance.now();

      // Execute the turn
      const result = executeTurn(state, allActions);
      const t2 = performance.now();

      // Log turn timing
      const aiMs = (t1 - t0).toFixed(0);
      const execMs = (t2 - t1).toFixed(0);
      const totalMs = (t2 - t0).toFixed(0);
      const p1Units = state.units.filter(u => u.owner === 1).length;
      const aiPlayers = state.players.filter(p => p.isAI && p.status === "active");
      const aiUnitCounts = aiPlayers.map(p =>
        `P${p.id}=${state.units.filter(u => u.owner === p.id).length}`
      ).join(" ");
      console.log(
        `[PERF] Turn ${state.turn}: AI=${aiMs}ms exec=${execMs}ms total=${totalMs}ms | P1:${playerActions.length} actions | Units: P1=${p1Units} ${aiUnitCounts}`,
      );

      if (result.winner !== null) {
        isGameOver = true;
        winner = result.winner;
        winType = result.winType;
      }

      return result;
    },
  };
}
