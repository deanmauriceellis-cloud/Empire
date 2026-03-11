// Empire Reborn — VIP Bonus Integration Tests

import { describe, it, expect, beforeEach } from "vitest";
import {
  type GameState,
  UnitType,
  Owner,
  configureMapDimensions,
  tickCityProduction,
  UNIT_ATTRIBUTES,
} from "../index.js";
import { createMinimalGameState } from "./test-helpers.js";

// Check if test helper exists, otherwise use inline creation
function makeTestState(): GameState {
  configureMapDimensions(10, 10);
  const state: GameState = {
    config: { seed: 42, mapWidth: 10, mapHeight: 10, numPlayers: 2, numCities: 2, waterRatio: 50, smoothPasses: 3 },
    turn: 1,
    map: Array.from({ length: 100 }, () => ({ terrain: 0, onBoard: true, cityId: null, depositId: null })),
    cities: [
      {
        id: 0, loc: 11, owner: 1, production: UnitType.Army, work: 0,
        func: Array(20).fill(0),
        upgradeIds: [],
      } as any,
    ],
    units: [],
    nextUnitId: 0,
    nextCityId: 1,
    players: [
      { id: 1, name: "Player 1", color: 0x0000ff, isAI: false, status: "active" as const },
      { id: 2, name: "Player 2", color: 0xff0000, isAI: true, status: "active" as const },
    ],
    viewMaps: {},
    rngState: 42,
    resources: { 1: [1000, 1000, 1000], 2: [1000, 1000, 1000] },
    deposits: [],
    nextDepositId: 0,
    buildings: [],
    nextBuildingId: 0,
    techResearch: { 1: [0, 0, 0, 0], 2: [0, 0, 0, 0] },
    kingdoms: {},
    shields: {},
  };
  return state;
}

describe("VIP Production Bonus", () => {
  it("non-VIP player has normal build time", () => {
    const state = makeTestState();
    const armyBuildTime = UNIT_ATTRIBUTES[UnitType.Army].buildTime;

    // Advance production to near completion
    state.cities[0].work = armyBuildTime - 2;
    tickCityProduction(state, 1);
    // work should be armyBuildTime - 1 (no unit produced yet)
    expect(state.units.length).toBe(0);
    expect(state.cities[0].work).toBe(armyBuildTime - 1);
  });

  it("VIP player gets 10% faster production", () => {
    const state = makeTestState();
    state.vipPlayers = [1]; // Player 1 is VIP

    const baseBuildTime = UNIT_ATTRIBUTES[UnitType.Army].buildTime; // 5
    const vipBuildTime = Math.max(1, Math.floor(baseBuildTime * 0.9)); // 4

    // Start production at work = vipBuildTime - 1 = 3
    state.cities[0].work = vipBuildTime - 1;
    tickCityProduction(state, 1);
    // VIP build time is reduced, so unit should be produced
    expect(state.units.length).toBe(1);
    expect(state.cities[0].work).toBe(0);
  });

  it("non-VIP player still needs full build time", () => {
    const state = makeTestState();
    state.vipPlayers = [2]; // Only Player 2 is VIP, not Player 1

    const baseBuildTime = UNIT_ATTRIBUTES[UnitType.Army].buildTime;
    const vipBuildTime = Math.max(1, Math.floor(baseBuildTime * 0.9));

    // At VIP build time - 1, non-VIP should NOT have completed
    state.cities[0].work = vipBuildTime - 1;
    tickCityProduction(state, 1);
    // Player 1 is NOT VIP, so needs full build time
    if (vipBuildTime < baseBuildTime) {
      expect(state.units.length).toBe(0);
    }
  });

  it("VIP bonus doesn't apply without vipPlayers field", () => {
    const state = makeTestState();
    // No vipPlayers field set

    const baseBuildTime = UNIT_ATTRIBUTES[UnitType.Army].buildTime;
    state.cities[0].work = baseBuildTime - 1;
    tickCityProduction(state, 1);
    expect(state.units.length).toBe(1); // Should complete at normal time
  });
});
