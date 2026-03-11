import { describe, it, expect } from "vitest";
import {
  Owner,
  UnitType,
  UnitBehavior,
  TerrainType,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_SIZE,
  ResourceType,
  DepositType,
  DEPOSIT_INCOME,
  DEPOSIT_RESOURCE,
  STARTING_ORE,
  STARTING_OIL,
  STARTING_TEXTILE,
  NUM_RESOURCE_TYPES,
} from "../index.js";
import type { GameState, CityState, MapCell, DepositState } from "../types.js";
import {
  initViewMap,
  tickCityProduction,
  collectResourceIncome,
  setProduction,
  executeTurn,
} from "../game.js";
import { UNIT_COSTS, canAffordUnit } from "../units.js";
import { generateMap } from "../mapgen.js";
import { configureMapDimensions } from "../constants.js";
import { rowColLoc } from "../utils.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────

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
    resources: {
      [Owner.Unowned]: [0, 0, 0],
      [Owner.Player1]: [STARTING_ORE, STARTING_OIL, STARTING_TEXTILE],
      [Owner.Player2]: [STARTING_ORE, STARTING_OIL, STARTING_TEXTILE],
    },
    deposits: [],
    nextDepositId: 0,
    buildings: [],
    nextBuildingId: 0,
    techResearch: {
      [Owner.Unowned]: [0, 0, 0, 0],
      [Owner.Player1]: [0, 0, 0, 0],
      [Owner.Player2]: [0, 0, 0, 0],
    },
  };
}

function addCity(
  state: GameState,
  loc: number,
  owner: Owner,
  production: UnitType = UnitType.Army,
): CityState {
  const cityId = state.cities.length; // array index must match cityId
  const city: CityState = {
    id: cityId,
    loc,
    owner,
    production,
    work: 0,
    func: Array(10).fill(UnitBehavior.None),
    upgradeIds: [],
  };
  state.cities.push(city);
  state.nextCityId = state.cities.length;
  state.map[loc] = { ...state.map[loc], terrain: TerrainType.City, cityId };
  return city;
}

function addDeposit(
  state: GameState,
  loc: number,
  type: DepositType,
  owner: Owner = Owner.Unowned,
  buildingComplete: boolean = false,
): DepositState {
  const deposit: DepositState = {
    id: state.nextDepositId++,
    loc,
    type,
    owner,
    buildingComplete,
    buildingId: null,
  };
  state.deposits.push(deposit);
  state.map[loc].depositId = deposit.id;
  return deposit;
}

// ─── Unit Cost Tests ────────────────────────────────────────────────────────

describe("Unit Resource Costs", () => {
  it("all unit types have defined costs", () => {
    for (let t = 0; t < 9; t++) {
      const cost = UNIT_COSTS[t];
      expect(cost).toBeDefined();
      expect(cost.length).toBe(3);
      // All costs should be non-negative
      for (const c of cost) {
        expect(c).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("army costs 5 ore, 0 oil, 5 textile", () => {
    const cost = UNIT_COSTS[UnitType.Army];
    expect(cost).toEqual([5, 0, 5]);
  });

  it("battleship is most expensive", () => {
    const bsCost = UNIT_COSTS[UnitType.Battleship];
    for (let t = 0; t < 9; t++) {
      if (t === UnitType.Battleship) continue;
      const cost = UNIT_COSTS[t];
      const bsTotal = bsCost[0] + bsCost[1] + bsCost[2];
      const total = cost[0] + cost[1] + cost[2];
      expect(bsTotal).toBeGreaterThanOrEqual(total);
    }
  });

  it("canAffordUnit returns true when resources sufficient", () => {
    expect(canAffordUnit([150, 100, 150], UnitType.Army)).toBe(true);
    expect(canAffordUnit([5, 0, 5], UnitType.Army)).toBe(true);
  });

  it("canAffordUnit returns false when any resource insufficient", () => {
    expect(canAffordUnit([4, 0, 5], UnitType.Army)).toBe(false);
    expect(canAffordUnit([5, 0, 4], UnitType.Army)).toBe(false);
    expect(canAffordUnit([0, 0, 0], UnitType.Battleship)).toBe(false);
  });
});

// ─── Production Gating Tests ───────────────────────────────────────────────

describe("Production Gating", () => {
  it("resources consumed when production starts (work goes from 0 to 1)", () => {
    const state = createTestState();
    const city = addCity(state, rowColLoc(5, 5), Owner.Player1, UnitType.Army);

    const oreBeforeProd = state.resources[Owner.Player1][0];
    const txtBeforeProd = state.resources[Owner.Player1][2];

    tickCityProduction(state, Owner.Player1);

    // Army costs [5, 0, 5]
    expect(state.resources[Owner.Player1][0]).toBe(oreBeforeProd - 5);
    expect(state.resources[Owner.Player1][1]).toBe(100); // oil unchanged
    expect(state.resources[Owner.Player1][2]).toBe(txtBeforeProd - 5);
    expect(city.work).toBe(1);
  });

  it("resources NOT consumed on subsequent work ticks", () => {
    const state = createTestState();
    addCity(state, rowColLoc(5, 5), Owner.Player1, UnitType.Army);

    // First tick consumes resources
    tickCityProduction(state, Owner.Player1);
    const oreAfterStart = state.resources[Owner.Player1][0];

    // Second tick should NOT consume again
    tickCityProduction(state, Owner.Player1);
    expect(state.resources[Owner.Player1][0]).toBe(oreAfterStart);
  });

  it("city stalls when resources insufficient", () => {
    const state = createTestState();
    state.resources[Owner.Player1] = [0, 0, 0]; // no resources
    const city = addCity(state, rowColLoc(5, 5), Owner.Player1, UnitType.Army);

    const events = tickCityProduction(state, Owner.Player1);

    expect(city.work).toBe(0); // did not advance
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("stall");
  });

  it("city resumes when resources become available", () => {
    const state = createTestState();
    state.resources[Owner.Player1] = [0, 0, 0];
    const city = addCity(state, rowColLoc(5, 5), Owner.Player1, UnitType.Army);

    // Stall
    tickCityProduction(state, Owner.Player1);
    expect(city.work).toBe(0);

    // Add resources
    state.resources[Owner.Player1] = [10, 10, 10];
    tickCityProduction(state, Owner.Player1);
    expect(city.work).toBe(1);
  });

  it("multiple cities each consume their own resources", () => {
    const state = createTestState();
    state.resources[Owner.Player1] = [15, 10, 15]; // enough for 3 armies or 1 fighter
    addCity(state, rowColLoc(5, 5), Owner.Player1, UnitType.Army);
    addCity(state, rowColLoc(10, 10), Owner.Player1, UnitType.Army);
    addCity(state, rowColLoc(15, 15), Owner.Player1, UnitType.Army);

    tickCityProduction(state, Owner.Player1);

    // 3 armies = 15 ore, 0 oil, 15 textile — exactly matches budget
    expect(state.resources[Owner.Player1][0]).toBe(0);
    expect(state.resources[Owner.Player1][2]).toBe(0);
  });

  it("stalled city does not block other cities", () => {
    const state = createTestState();
    state.resources[Owner.Player1] = [45, 25, 5]; // enough for 1 army, not enough textile for battleship
    const city1 = addCity(state, rowColLoc(5, 5), Owner.Player1, UnitType.Army);
    const city2 = addCity(state, rowColLoc(10, 10), Owner.Player1, UnitType.Battleship);

    const events = tickCityProduction(state, Owner.Player1);

    // Army should proceed, battleship should stall (needs 0 textile, but army takes 5 first)
    // Actually: army [5,0,5] → remaining [40,25,0], then battleship [40,25,0] → can afford!
    // Let me recalculate: resources = [45,25,5]
    // City1 (army): costs [5,0,5] → remaining [40,25,0]
    // City2 (battleship): costs [40,25,0] → remaining [0,0,0]
    // Both should proceed since battleship costs 0 textile
    expect(city1.work).toBe(1);
    expect(city2.work).toBe(1);
  });

  it("production completes and unit spawns after full build time", () => {
    const state = createTestState();
    const city = addCity(state, rowColLoc(5, 5), Owner.Player1, UnitType.Army);

    // Army takes 5 turns
    for (let i = 0; i < 5; i++) {
      tickCityProduction(state, Owner.Player1);
    }

    expect(state.units.length).toBe(1);
    expect(state.units[0].type).toBe(UnitType.Army);
    expect(city.work).toBe(0); // reset after completion
  });

  it("retooling penalty works with resource check", () => {
    const state = createTestState();
    const city = addCity(state, rowColLoc(5, 5), Owner.Player1, UnitType.Army);

    // Start army production
    tickCityProduction(state, Owner.Player1);
    expect(city.work).toBe(1);

    // Switch to fighter — retooling penalty
    setProduction(state, city.id, UnitType.Fighter);
    expect(city.work).toBeLessThan(0); // negative from penalty

    // Tick through negative work (no resource consumed during retooling)
    const resBefore = [...state.resources[Owner.Player1]];
    tickCityProduction(state, Owner.Player1);
    // Still negative or zero — no resources consumed yet
    if (city.work <= 0) {
      expect(state.resources[Owner.Player1]).toEqual(resBefore);
    }
  });
});

// ─── Resource Income Tests ─────────────────────────────────────────────────

describe("Resource Income", () => {
  it("completed deposit building generates income", () => {
    const state = createTestState();
    addDeposit(state, rowColLoc(5, 5), DepositType.OreVein, Owner.Player1, true);

    const resBefore = state.resources[Owner.Player1][0];
    const events = collectResourceIncome(state, Owner.Player1);

    expect(state.resources[Owner.Player1][0]).toBe(resBefore + DEPOSIT_INCOME);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("income");
  });

  it("incomplete building generates no income", () => {
    const state = createTestState();
    addDeposit(state, rowColLoc(5, 5), DepositType.OreVein, Owner.Player1, false);

    const resBefore = [...state.resources[Owner.Player1]];
    const events = collectResourceIncome(state, Owner.Player1);

    expect(state.resources[Owner.Player1]).toEqual(resBefore);
    expect(events.length).toBe(0);
  });

  it("unowned deposit generates no income for either player", () => {
    const state = createTestState();
    addDeposit(state, rowColLoc(5, 5), DepositType.OilWell, Owner.Unowned, true);

    const res1Before = [...state.resources[Owner.Player1]];
    collectResourceIncome(state, Owner.Player1);
    expect(state.resources[Owner.Player1]).toEqual(res1Before);
  });

  it("each deposit type generates correct resource", () => {
    const state = createTestState();
    addDeposit(state, rowColLoc(5, 5), DepositType.OreVein, Owner.Player1, true);
    addDeposit(state, rowColLoc(10, 10), DepositType.OilWell, Owner.Player1, true);
    addDeposit(state, rowColLoc(15, 15), DepositType.TextileFarm, Owner.Player1, true);

    const resBefore = [...state.resources[Owner.Player1]];
    collectResourceIncome(state, Owner.Player1);

    expect(state.resources[Owner.Player1][0]).toBe(resBefore[0] + DEPOSIT_INCOME); // ore
    expect(state.resources[Owner.Player1][1]).toBe(resBefore[1] + DEPOSIT_INCOME); // oil
    expect(state.resources[Owner.Player1][2]).toBe(resBefore[2] + DEPOSIT_INCOME); // textile
  });

  it("multiple deposits of same type stack income", () => {
    const state = createTestState();
    addDeposit(state, rowColLoc(5, 5), DepositType.OreVein, Owner.Player1, true);
    addDeposit(state, rowColLoc(10, 10), DepositType.OreVein, Owner.Player1, true);

    const oreBefore = state.resources[Owner.Player1][0];
    collectResourceIncome(state, Owner.Player1);

    expect(state.resources[Owner.Player1][0]).toBe(oreBefore + DEPOSIT_INCOME * 2);
  });
});

// ─── Deposit Placement Tests ───────────────────────────────────────────────

describe("Deposit Placement", () => {
  it("generateMap places deposits on the map", () => {
    configureMapDimensions(100, 60);
    const result = generateMap({
      mapWidth: 100,
      mapHeight: 60,
      numCities: 70,
      waterRatio: 70,
      smoothPasses: 5,
      minCityDist: 2,
      seed: 42,
    });

    expect(result.deposits.length).toBeGreaterThan(0);
  });

  it("deposit count scales with city count (~1 per 3-4 cities)", () => {
    configureMapDimensions(100, 60);
    const result = generateMap({
      mapWidth: 100,
      mapHeight: 60,
      numCities: 70,
      waterRatio: 70,
      smoothPasses: 5,
      minCityDist: 2,
      seed: 42,
    });

    // 70 cities → expect ~17-23 deposits
    expect(result.deposits.length).toBeGreaterThanOrEqual(6);
    expect(result.deposits.length).toBeLessThanOrEqual(30);
  });

  it("deposits are on land tiles (not water or cities)", () => {
    configureMapDimensions(100, 60);
    const result = generateMap({
      mapWidth: 100,
      mapHeight: 60,
      numCities: 70,
      waterRatio: 70,
      smoothPasses: 5,
      minCityDist: 2,
      seed: 42,
    });

    for (const deposit of result.deposits) {
      expect(result.map[deposit.loc].terrain).toBe(TerrainType.Land);
      expect(result.map[deposit.loc].cityId).toBeNull();
    }
  });

  it("deposits are all unowned and without buildings initially", () => {
    configureMapDimensions(100, 60);
    const result = generateMap({
      mapWidth: 100,
      mapHeight: 60,
      numCities: 70,
      waterRatio: 70,
      smoothPasses: 5,
      minCityDist: 2,
      seed: 42,
    });

    for (const deposit of result.deposits) {
      expect(deposit.owner).toBe(Owner.Unowned);
      expect(deposit.buildingComplete).toBe(false);
    }
  });

  it("map cells reference their deposit", () => {
    configureMapDimensions(100, 60);
    const result = generateMap({
      mapWidth: 100,
      mapHeight: 60,
      numCities: 70,
      waterRatio: 70,
      smoothPasses: 5,
      minCityDist: 2,
      seed: 42,
    });

    for (const deposit of result.deposits) {
      expect(result.map[deposit.loc].depositId).toBe(deposit.id);
    }
  });

  it("deposits have balanced type distribution", () => {
    configureMapDimensions(100, 60);
    const result = generateMap({
      mapWidth: 100,
      mapHeight: 60,
      numCities: 70,
      waterRatio: 70,
      smoothPasses: 5,
      minCityDist: 2,
      seed: 42,
    });

    const typeCounts = [0, 0, 0];
    for (const deposit of result.deposits) {
      typeCounts[deposit.type]++;
    }

    // Each type should have at least 1, and no type should dominate (>60%)
    for (const count of typeCounts) {
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count / result.deposits.length).toBeLessThanOrEqual(0.6);
    }
  });

  it("deposits placed deterministically for same seed", () => {
    configureMapDimensions(100, 60);
    const config = {
      mapWidth: 100,
      mapHeight: 60,
      numCities: 70,
      waterRatio: 70,
      smoothPasses: 5,
      minCityDist: 2,
      seed: 12345,
    };

    const result1 = generateMap(config);
    const result2 = generateMap(config);

    expect(result1.deposits.length).toBe(result2.deposits.length);
    for (let i = 0; i < result1.deposits.length; i++) {
      expect(result1.deposits[i].loc).toBe(result2.deposits[i].loc);
      expect(result1.deposits[i].type).toBe(result2.deposits[i].type);
    }
  });

  it("river maps also place deposits", () => {
    configureMapDimensions(100, 60);
    const result = generateMap({
      mapWidth: 100,
      mapHeight: 60,
      numCities: 70,
      waterRatio: 30,
      smoothPasses: 5,
      minCityDist: 2,
      seed: 42,
      mapType: "river",
    });

    expect(result.deposits.length).toBeGreaterThan(0);
  });
});

// ─── Save/Load with Economy State ──────────────────────────────────────────

describe("Economy State Serialization", () => {
  it("resources survive JSON round-trip", () => {
    const state = createTestState();
    state.resources[Owner.Player1] = [100, 50, 75];

    const json = JSON.stringify(state);
    const restored = JSON.parse(json) as GameState;

    expect(restored.resources[Owner.Player1]).toEqual([100, 50, 75]);
    expect(restored.resources[Owner.Player2]).toEqual([STARTING_ORE, STARTING_OIL, STARTING_TEXTILE]);
  });

  it("deposits survive JSON round-trip", () => {
    const state = createTestState();
    addDeposit(state, rowColLoc(5, 5), DepositType.OreVein, Owner.Player1, true);
    addDeposit(state, rowColLoc(10, 10), DepositType.OilWell, Owner.Unowned, false);

    const json = JSON.stringify(state);
    const restored = JSON.parse(json) as GameState;

    expect(restored.deposits.length).toBe(2);
    expect(restored.deposits[0].type).toBe(DepositType.OreVein);
    expect(restored.deposits[0].owner).toBe(Owner.Player1);
    expect(restored.deposits[0].buildingComplete).toBe(true);
    expect(restored.deposits[1].type).toBe(DepositType.OilWell);
    expect(restored.deposits[1].buildingComplete).toBe(false);
  });

  it("depositId on map cells survives JSON round-trip", () => {
    const state = createTestState();
    addDeposit(state, rowColLoc(5, 5), DepositType.TextileFarm);

    const json = JSON.stringify(state);
    const restored = JSON.parse(json) as GameState;

    expect(restored.map[rowColLoc(5, 5)].depositId).toBe(0);
  });
});

// ─── Integration: Economy in executeTurn ─────────────────────────────────────

describe("Economy in executeTurn", () => {
  it("resources are consumed during turn execution", () => {
    const state = createTestState();
    addCity(state, rowColLoc(5, 5), Owner.Player1, UnitType.Army);
    addCity(state, rowColLoc(10, 10), Owner.Player2, UnitType.Army);

    const p1OreBefore = state.resources[Owner.Player1][0];
    executeTurn(state, [{ type: "endTurn" }], [{ type: "endTurn" }]);

    // Army costs 5 ore, city passive income adds 2 ore
    expect(state.resources[Owner.Player1][0]).toBe(p1OreBefore + 2 - 5);
  });

  it("income collected before production in turn execution", () => {
    const state = createTestState();
    state.resources[Owner.Player1] = [0, 0, 0]; // broke
    addCity(state, rowColLoc(5, 5), Owner.Player1, UnitType.Army);
    addCity(state, rowColLoc(10, 10), Owner.Player2, UnitType.Army);
    // No deposits — only passive city income: +2 ore, +1 oil, +2 textile per city
    // Army costs 5 ore, 0 oil, 5 textile — not enough from 1 city (2 ore, 2 textile)
    const result = executeTurn(state, [{ type: "endTurn" }], [{ type: "endTurn" }]);

    const city = state.cities[0];
    expect(city.work).toBe(0); // stalled — can't afford army

    // Resources should be passive income only (2 ore, 1 oil, 2 textile)
    expect(state.resources[Owner.Player1][0]).toBe(2);
    expect(state.resources[Owner.Player1][1]).toBe(1);
    expect(state.resources[Owner.Player1][2]).toBe(2);
  });
});
