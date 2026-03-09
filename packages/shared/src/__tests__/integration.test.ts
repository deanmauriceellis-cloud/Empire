import { describe, it, expect } from "vitest";
import { Owner, UnitType, MAP_SIZE } from "../constants.js";
import { generateMap } from "../mapgen.js";
import { computeAITurn } from "../ai.js";
import {
  createUnit,
  findUnit,
  initViewMap,
  scan,
  executeTurn,
  checkEndGame,
} from "../game.js";
import type { GameState } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createFullGameState(seed: number): GameState {
  const map = generateMap({
    mapWidth: 100,
    mapHeight: 60,
    numCities: 70,
    waterRatio: 70,
    smoothPasses: 5,
    minCityDist: 2,
    seed,
  });

  const state: GameState = {
    config: {
      mapWidth: 100,
      mapHeight: 60,
      numCities: 70,
      waterRatio: 70,
      smoothPasses: 5,
      minCityDist: 2,
      seed,
    },
    turn: 0,
    map: map.cells,
    cities: map.cities,
    units: [],
    nextUnitId: 1,
    nextCityId: map.cities.length + 1,
    viewMaps: {
      [Owner.Unowned]: initViewMap(),
      [Owner.Player1]: initViewMap(),
      [Owner.Player2]: initViewMap(),
    },
    rngState: seed,
  };

  // Create starting armies at each player's starting city
  for (const city of state.cities) {
    if (city.owner === Owner.Player1 || city.owner === Owner.Player2) {
      createUnit(state, UnitType.Army, city.owner, city.loc);
      scan(state, city.owner, city.loc);
    }
  }

  return state;
}

function refreshAllVision(state: GameState): void {
  for (const owner of [Owner.Player1, Owner.Player2]) {
    for (const unit of state.units) {
      if (unit.owner === owner) scan(state, owner, unit.loc);
    }
    for (const city of state.cities) {
      if (city.owner === owner) scan(state, owner, city.loc);
    }
  }
}

// ─── Integration Tests ──────────────────────────────────────────────────────────

describe("Integration: AI vs AI", () => {
  it("two AIs play 100 turns without crashing", () => {
    const state = createFullGameState(42);

    for (let turn = 0; turn < 100; turn++) {
      refreshAllVision(state);

      const p1Actions = computeAITurn(state, Owner.Player1);
      const p2Actions = computeAITurn(state, Owner.Player2);

      expect(Array.isArray(p1Actions)).toBe(true);
      expect(Array.isArray(p2Actions)).toBe(true);

      const result = executeTurn(state, p1Actions, p2Actions);

      if (result.winner !== null) {
        // Game ended naturally — that's fine
        expect([Owner.Player1, Owner.Player2]).toContain(result.winner);
        return;
      }
    }

    expect(state.turn).toBe(100);
    // Both players should still have cities or the game should have ended
    const p1Cities = state.cities.filter(c => c.owner === Owner.Player1).length;
    const p2Cities = state.cities.filter(c => c.owner === Owner.Player2).length;
    expect(p1Cities + p2Cities).toBeGreaterThan(0);
  });

  it("two AIs play with different seed", () => {
    const state = createFullGameState(9999);

    for (let turn = 0; turn < 50; turn++) {
      refreshAllVision(state);

      const p1Actions = computeAITurn(state, Owner.Player1);
      const p2Actions = computeAITurn(state, Owner.Player2);

      const result = executeTurn(state, p1Actions, p2Actions);

      if (result.winner !== null) return;
    }

    expect(state.turn).toBe(50);
  });

  it("game state is serializable (save/load round-trip)", () => {
    const state = createFullGameState(42);

    // Play 10 turns
    for (let turn = 0; turn < 10; turn++) {
      refreshAllVision(state);
      const p1Actions = computeAITurn(state, Owner.Player1);
      const p2Actions = computeAITurn(state, Owner.Player2);
      executeTurn(state, p1Actions, p2Actions);
    }

    // Serialize and deserialize (viewMaps have numeric Owner keys — JSON converts to strings)
    const json = JSON.stringify(state);
    const parsed = JSON.parse(json);

    // Reconstruct viewMaps with numeric keys (as Owner enum expects)
    const restoredViewMaps: Record<number, any> = {};
    for (const key of Object.keys(parsed.viewMaps)) {
      restoredViewMaps[Number(key)] = parsed.viewMaps[key];
    }
    parsed.viewMaps = restoredViewMaps;

    const restored: GameState = parsed;

    // Verify the restored state matches
    expect(restored.turn).toBe(state.turn);
    expect(restored.cities.length).toBe(state.cities.length);
    expect(restored.units.length).toBe(state.units.length);
    expect(restored.rngState).toBe(state.rngState);
    expect(restored.config.seed).toBe(42);

    // Verify the restored state can continue playing
    refreshAllVision(restored);
    const p1Actions = computeAITurn(restored, Owner.Player1);
    const p2Actions = computeAITurn(restored, Owner.Player2);

    // Filter out resign actions to focus on whether state is playable
    const p1Filtered = p1Actions.filter(a => a.type !== "resign");
    const p2Filtered = p2Actions.filter(a => a.type !== "resign");

    const result = executeTurn(restored, p1Filtered, p2Filtered);
    expect(restored.turn).toBe(state.turn + 1);
  });

  it("deterministic: same seed produces identical games", () => {
    const state1 = createFullGameState(777);
    const state2 = createFullGameState(777);

    for (let turn = 0; turn < 20; turn++) {
      refreshAllVision(state1);
      refreshAllVision(state2);

      const p1a1 = computeAITurn(state1, Owner.Player1);
      const p2a1 = computeAITurn(state1, Owner.Player2);
      const p1a2 = computeAITurn(state2, Owner.Player1);
      const p2a2 = computeAITurn(state2, Owner.Player2);

      // Same actions for both games
      expect(p1a1).toEqual(p1a2);
      expect(p2a1).toEqual(p2a2);

      const r1 = executeTurn(state1, p1a1, p2a1);
      const r2 = executeTurn(state2, p1a2, p2a2);

      expect(r1.turn).toBe(r2.turn);
      expect(r1.winner).toBe(r2.winner);

      if (r1.winner !== null) return;
    }
  });
});
