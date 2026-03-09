// Empire Reborn — Single-Player Game Manager
// Runs entirely client-side using shared game logic + AI.
// No server needed — same GameState + executeTurn interface.

import { type GameState, type GameConfig, type PlayerAction, type TurnResult } from "./types.js";
import { Owner, MAP_WIDTH, MAP_HEIGHT } from "./constants.js";
import { generateMap } from "./mapgen.js";
import { initViewMap, scan, executeTurn } from "./game.js";
import { computeAITurn } from "./ai.js";

export interface SinglePlayerGame {
  state: GameState;
  isGameOver: boolean;
  winner: Owner | null;
  winType: "elimination" | "resignation" | null;

  /** Submit player actions and advance the turn. Returns turn result. */
  submitTurn(actions: PlayerAction[]): TurnResult;
}

/**
 * Create a new single-player game.
 * Player 1 = human, Player 2 = AI.
 */
export function createSinglePlayerGame(configOverrides?: Partial<GameConfig>): SinglePlayerGame {
  const config: GameConfig = {
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    numCities: 70,
    waterRatio: 70,
    smoothPasses: 5,
    minCityDist: 2,
    seed: Math.floor(Math.random() * 2 ** 32),
    ...configOverrides,
  };

  const mapResult = generateMap(config);

  const state: GameState = {
    config,
    turn: 0,
    map: mapResult.map,
    cities: mapResult.cities,
    units: [],
    nextUnitId: 0,
    nextCityId: mapResult.cities.length,
    viewMaps: {
      [Owner.Unowned]: [],
      [Owner.Player1]: initViewMap(),
      [Owner.Player2]: initViewMap(),
    },
    rngState: config.seed,
  };

  // Assign starting cities
  const [city1Id, city2Id] = mapResult.startingCities;
  state.cities[city1Id].owner = Owner.Player1;
  state.cities[city2Id].owner = Owner.Player2;

  // Initial vision scan
  scan(state, Owner.Player1, state.cities[city1Id].loc);
  scan(state, Owner.Player2, state.cities[city2Id].loc);

  let isGameOver = false;
  let winner: Owner | null = null;
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

      // Compute AI actions
      const aiActions = computeAITurn(state, Owner.Player2);

      // Execute the turn
      const result = executeTurn(state, playerActions, aiActions);

      if (result.winner !== null) {
        isGameOver = true;
        winner = result.winner;
        winType = result.winType;
      }

      return result;
    },
  };
}
