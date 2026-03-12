import { describe, it, expect } from "vitest";
import {
  Owner,
  UnitType,
  UnitBehavior,
  TerrainType,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_SIZE,
} from "../index.js";
import type { GameState, CityState, MapCell } from "../types.js";
import { createUnit, initViewMap, scan } from "../game.js";
import { rowColLoc } from "../utils.js";
import { computeAITurn } from "../ai.js";
import { createAIPlanner } from "../ai-planner.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function createTestState(): GameState {
  const map: MapCell[] = [];
  for (let i = 0; i < MAP_SIZE; i++) {
    const row = Math.floor(i / MAP_WIDTH);
    const col = i % MAP_WIDTH;
    const onBoard = row > 0 && row < MAP_HEIGHT - 1 && col > 0 && col < MAP_WIDTH - 1;
    map.push({
      terrain: TerrainType.Land,
      onBoard,
      cityId: null,
      depositId: null,
    });
  }

  return {
    config: {
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      numCities: 70,
      waterRatio: 70,
      smoothPasses: 5,
      minCityDist: 2,
      seed: 42,
    },
    turn: 0,
    map,
    cities: [],
    units: [],
    nextUnitId: 1,
    nextCityId: 1,
    viewMaps: {
      [Owner.Unowned]: initViewMap(),
      [Owner.Player1]: initViewMap(),
      [Owner.Player2]: initViewMap(),
    },
    rngState: 12345,
    resources: { [Owner.Unowned]: [0,0,0], [Owner.Player1]: [150,100,150], [Owner.Player2]: [150,100,150] },
    deposits: [],
    nextDepositId: 0,
    buildings: [],
    nextBuildingId: 0,
    techResearch: { [Owner.Unowned]: [0,0,0,0], [Owner.Player1]: [0,0,0,0], [Owner.Player2]: [0,0,0,0] },
    kingdoms: {},
    shields: {},
    players: [
      { id: 1, name: "Player 1", color: 0x00cc00, isAI: false, status: "active" as const },
      { id: 2, name: "Player 2", color: 0xcc0000, isAI: true, status: "active" as const },
    ],
  };
}

function addCity(
  state: GameState,
  loc: number,
  owner: Owner,
  production: UnitType = UnitType.Army,
): CityState {
  const id = state.nextCityId++;
  const city: CityState = {
    id,
    loc,
    owner,
    production,
    work: 0,
    func: Array(10).fill(UnitBehavior.None),
    upgradeIds: [],
  };
  state.cities.push(city);
  state.map[loc].terrain = TerrainType.City;
  state.map[loc].cityId = state.cities.length - 1;
  // Update view maps
  const vm = state.viewMaps[owner];
  if (vm) {
    vm[loc] = { contents: "O", seen: state.turn };
  }
  return city;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe("AIPlanner", () => {
  it("produces identical actions to computeAITurn", () => {
    // Set up a meaningful game state with units
    const state = createTestState();
    const aiOwner = Owner.Player2;
    const loc1 = rowColLoc(5, 5);
    const loc2 = rowColLoc(10, 10);
    addCity(state, loc1, aiOwner, UnitType.Army);
    addCity(state, loc2, aiOwner, UnitType.Army);
    addCity(state, rowColLoc(15, 15), Owner.Player1, UnitType.Army);
    createUnit(state, UnitType.Army, aiOwner, loc1);
    createUnit(state, UnitType.Army, aiOwner, loc2);
    createUnit(state, UnitType.Army, aiOwner, rowColLoc(6, 6));
    scan(state, aiOwner, loc1);
    scan(state, aiOwner, loc2);

    // Clone state so both compute from identical starting point
    const stateA = JSON.parse(JSON.stringify(state));
    const stateB = JSON.parse(JSON.stringify(state));

    // Synchronous wrapper
    const actionsSync = computeAITurn(stateA, aiOwner);

    // Incremental planner drained
    const planner = createAIPlanner(stateB, aiOwner);
    while (planner.step()) { /* drain */ }
    const actionsPlanner = planner.getActions();

    expect(actionsPlanner).toEqual(actionsSync);
  });

  it("returns isDone() = true when complete", () => {
    const state = createTestState();
    const aiOwner = Owner.Player2;
    addCity(state, rowColLoc(5, 5), aiOwner, UnitType.Army);
    createUnit(state, UnitType.Army, aiOwner, rowColLoc(5, 5));

    const planner = createAIPlanner(state, aiOwner);
    expect(planner.isDone()).toBe(false);

    while (planner.step()) { /* drain */ }

    expect(planner.isDone()).toBe(true);
  });

  it("progress monotonically advances", () => {
    const state = createTestState();
    const aiOwner = Owner.Player2;
    const loc1 = rowColLoc(5, 5);
    addCity(state, loc1, aiOwner, UnitType.Army);
    // Create several idle units so the planner has work
    for (let i = 0; i < 5; i++) {
      createUnit(state, UnitType.Army, aiOwner, rowColLoc(5 + i, 5));
    }

    const planner = createAIPlanner(state, aiOwner);
    let prevDone = -1;
    while (planner.step()) {
      const { done } = planner.progress();
      expect(done).toBeGreaterThanOrEqual(prevDone);
      prevDone = done;
    }
    const { done, total } = planner.progress();
    expect(done).toBe(total);
  });

  it("handles empty state (no viewMap)", () => {
    const state = createTestState();
    // Player 3 has no viewMap
    const planner = createAIPlanner(state, 3 as Owner);
    expect(planner.isDone()).toBe(true);
    expect(planner.step()).toBe(false);
    expect(planner.getActions()).toEqual([]);
  });

  it("handles AI with no units (only cities)", () => {
    const state = createTestState();
    const aiOwner = Owner.Player2;
    addCity(state, rowColLoc(5, 5), aiOwner, UnitType.Army);

    const planner = createAIPlanner(state, aiOwner);
    while (planner.step()) { /* drain */ }

    expect(planner.isDone()).toBe(true);
    // Should have production actions but no movement
    const actions = planner.getActions();
    const moveActions = actions.filter(a => a.type === "move");
    expect(moveActions).toHaveLength(0);
  });

  it("handles resign when AI has no cities or armies", () => {
    const state = createTestState();
    const aiOwner = Owner.Player2;
    // Give enemy some cities/armies
    addCity(state, rowColLoc(5, 5), Owner.Player1, UnitType.Army);
    createUnit(state, UnitType.Army, Owner.Player1, rowColLoc(5, 5));
    // AI has nothing
    state.viewMaps[aiOwner] = initViewMap();

    const planner = createAIPlanner(state, aiOwner);
    while (planner.step()) { /* drain */ }

    const actions = planner.getActions();
    const resignActions = actions.filter(a => a.type === "resign");
    expect(resignActions.length).toBeGreaterThan(0);
  });

  it("step() returns false and getActions() is stable after completion", () => {
    const state = createTestState();
    const aiOwner = Owner.Player2;
    addCity(state, rowColLoc(5, 5), aiOwner, UnitType.Army);
    createUnit(state, UnitType.Army, aiOwner, rowColLoc(6, 6));

    const planner = createAIPlanner(state, aiOwner);
    while (planner.step()) { /* drain */ }

    // Calling step() again should return false
    expect(planner.step()).toBe(false);
    expect(planner.step()).toBe(false);

    // Actions should remain the same
    const actions1 = planner.getActions();
    const actions2 = planner.getActions();
    expect(actions1).toBe(actions2); // same reference
  });

  it("determinism: two planners on cloned state produce identical actions", () => {
    const state = createTestState();
    const aiOwner = Owner.Player2;
    addCity(state, rowColLoc(5, 5), aiOwner, UnitType.Army);
    addCity(state, rowColLoc(12, 12), aiOwner, UnitType.Army);
    addCity(state, rowColLoc(20, 20), Owner.Player1, UnitType.Army);
    for (let i = 0; i < 4; i++) {
      createUnit(state, UnitType.Army, aiOwner, rowColLoc(5 + i, 5));
    }

    const stateA = JSON.parse(JSON.stringify(state));
    const stateB = JSON.parse(JSON.stringify(state));

    const plannerA = createAIPlanner(stateA, aiOwner);
    while (plannerA.step()) {}
    const plannerB = createAIPlanner(stateB, aiOwner);
    while (plannerB.step()) {}

    expect(plannerA.getActions()).toEqual(plannerB.getActions());
  });
});
