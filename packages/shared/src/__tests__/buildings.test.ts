import { describe, it, expect } from "vitest";
import {
  Owner,
  UnitType,
  UnitBehavior,
  TerrainType,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_SIZE,
  DepositType,
  BuildingType,
  DEPOSIT_INCOME,
  DEPOSIT_RESOURCE,
  STARTING_ORE,
  STARTING_OIL,
  STARTING_TEXTILE,
  NUM_RESOURCE_TYPES,
  TechType,
  BUILDING_NAMES,
  MAX_CITY_UPGRADES,
} from "../index.js";
import type { GameState, CityState, MapCell, DepositState, BuildingState } from "../types.js";
import {
  initViewMap,
  tickCityProduction,
  collectResourceIncome,
  executeTurn,
  createUnit,
  findUnit,
  startBuildOnDeposit,
  startBuildCityUpgrade,
  tickBuildingConstruction,
  collectTechResearch,
} from "../game.js";
import {
  BUILDING_ATTRIBUTES,
  getBuildingCost,
  getBuildingTime,
  getBuildingTechOutput,
  canAffordBuilding,
  depositToBuildingType,
  isCityUpgradeType,
  cityHasUpgradeSlot,
  cityHasUpgradeType,
  UPGRADE_COSTS,
} from "../buildings.js";
import { UNIT_COSTS, UNIT_ATTRIBUTES } from "../units.js";
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
  const cityId = state.cities.length;
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
): DepositState {
  const deposit: DepositState = {
    id: state.nextDepositId++,
    loc,
    type,
    owner,
    buildingComplete: false,
    buildingId: null,
  };
  state.deposits.push(deposit);
  state.map[loc].depositId = deposit.id;
  return deposit;
}

// ─── Building Attributes Tests ──────────────────────────────────────────────

describe("building attributes", () => {
  it("has attributes for all building types", () => {
    expect(BUILDING_ATTRIBUTES).toHaveLength(9);
  });

  it("deposit buildings have correct types", () => {
    expect(BUILDING_ATTRIBUTES[BuildingType.Mine].isDepositBuilding).toBe(true);
    expect(BUILDING_ATTRIBUTES[BuildingType.OilWell].isDepositBuilding).toBe(true);
    expect(BUILDING_ATTRIBUTES[BuildingType.TextileFarm].isDepositBuilding).toBe(true);
  });

  it("city upgrades have correct types", () => {
    expect(BUILDING_ATTRIBUTES[BuildingType.University].isCityUpgrade).toBe(true);
    expect(BUILDING_ATTRIBUTES[BuildingType.Hospital].isCityUpgrade).toBe(true);
    expect(BUILDING_ATTRIBUTES[BuildingType.TechLab].isCityUpgrade).toBe(true);
    expect(BUILDING_ATTRIBUTES[BuildingType.MilitaryAcademy].isCityUpgrade).toBe(true);
    expect(BUILDING_ATTRIBUTES[BuildingType.Shipyard].isCityUpgrade).toBe(true);
    expect(BUILDING_ATTRIBUTES[BuildingType.Airfield].isCityUpgrade).toBe(true);
  });

  it("depositToBuildingType maps correctly", () => {
    expect(depositToBuildingType(DepositType.OreVein)).toBe(BuildingType.Mine);
    expect(depositToBuildingType(DepositType.OilWell)).toBe(BuildingType.OilWell);
    expect(depositToBuildingType(DepositType.TextileFarm)).toBe(BuildingType.TextileFarm);
  });

  it("tech output mapping is correct", () => {
    expect(BUILDING_ATTRIBUTES[BuildingType.University].techOutput).toBe(TechType.Science);
    expect(BUILDING_ATTRIBUTES[BuildingType.Hospital].techOutput).toBe(TechType.Health);
    expect(BUILDING_ATTRIBUTES[BuildingType.TechLab].techOutput).toBe(TechType.Electronics);
    expect(BUILDING_ATTRIBUTES[BuildingType.MilitaryAcademy].techOutput).toBe(TechType.War);
    expect(BUILDING_ATTRIBUTES[BuildingType.Shipyard].techOutput).toBeNull();
    expect(BUILDING_ATTRIBUTES[BuildingType.Airfield].techOutput).toBeNull();
  });

  it("getBuildingTechOutput scales with level", () => {
    expect(getBuildingTechOutput(BuildingType.University, 1)).toBe(1);
    expect(getBuildingTechOutput(BuildingType.University, 2)).toBe(2);
    expect(getBuildingTechOutput(BuildingType.University, 3)).toBe(3);
    expect(getBuildingTechOutput(BuildingType.Shipyard, 1)).toBe(0);
  });

  it("upgrade costs exist for all city upgrades", () => {
    expect(UPGRADE_COSTS[BuildingType.University]).toBeDefined();
    expect(UPGRADE_COSTS[BuildingType.Hospital]).toBeDefined();
    expect(UPGRADE_COSTS[BuildingType.TechLab]).toBeDefined();
    expect(UPGRADE_COSTS[BuildingType.MilitaryAcademy]).toBeDefined();
    expect(UPGRADE_COSTS[BuildingType.Shipyard]).toBeDefined();
    expect(UPGRADE_COSTS[BuildingType.Airfield]).toBeDefined();
  });

  it("getBuildingCost returns level-appropriate costs", () => {
    const l1 = getBuildingCost(BuildingType.University, 1);
    const l2 = getBuildingCost(BuildingType.University, 2);
    const l3 = getBuildingCost(BuildingType.University, 3);
    expect(l1).toEqual([30, 0, 20]);
    expect(l2).toEqual([60, 0, 40]);
    expect(l3).toEqual([120, 0, 80]);
  });

  it("getBuildingTime returns level-appropriate times", () => {
    expect(getBuildingTime(BuildingType.University, 1)).toBe(8);
    expect(getBuildingTime(BuildingType.University, 2)).toBe(6);
    expect(getBuildingTime(BuildingType.University, 3)).toBe(8);
  });
});

// ─── Construction Unit Tests ────────────────────────────────────────────────

describe("construction unit", () => {
  it("has correct attributes", () => {
    const attrs = UNIT_ATTRIBUTES[UnitType.Construction];
    expect(attrs.char).toBe("E");
    expect(attrs.terrain).toBe("+");
    expect(attrs.speed).toBe(1);
    expect(attrs.strength).toBe(0);
    expect(attrs.maxHits).toBe(1);
    expect(attrs.buildTime).toBe(10);
  });

  it("has correct resource cost", () => {
    expect(UNIT_COSTS[UnitType.Construction]).toEqual([10, 0, 5]);
  });
});

// ─── Build On Deposit Tests ─────────────────────────────────────────────────

describe("build on deposit", () => {
  it("construction unit starts building on ore deposit", () => {
    const state = createTestState();
    const depLoc = rowColLoc(5, 5);
    addDeposit(state, depLoc, DepositType.OreVein);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, depLoc);

    const resBefore = [...state.resources[Owner.Player1]];
    const events = startBuildOnDeposit(state, unit.id);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("building");
    expect(state.buildings).toHaveLength(1);
    expect(state.buildings[0].type).toBe(BuildingType.Mine);
    expect(state.buildings[0].complete).toBe(false);
    expect(state.buildings[0].constructorId).toBe(unit.id);
    expect(state.deposits[0].buildingId).toBe(state.buildings[0].id);
    expect(state.deposits[0].owner).toBe(Owner.Player1);

    // Resources consumed
    const mineCost = BUILDING_ATTRIBUTES[BuildingType.Mine].cost;
    expect(state.resources[Owner.Player1][0]).toBe(resBefore[0] - mineCost[0]);
    expect(state.resources[Owner.Player1][2]).toBe(resBefore[2] - mineCost[2]);
  });

  it("fails if deposit already has a building", () => {
    const state = createTestState();
    const depLoc = rowColLoc(5, 5);
    const dep = addDeposit(state, depLoc, DepositType.OreVein);
    dep.buildingComplete = true;
    dep.buildingId = 99;
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, depLoc);

    const events = startBuildOnDeposit(state, unit.id);
    expect(events).toHaveLength(0);
  });

  it("fails if player can't afford building", () => {
    const state = createTestState();
    state.resources[Owner.Player1] = [0, 0, 0];
    const depLoc = rowColLoc(5, 5);
    addDeposit(state, depLoc, DepositType.OreVein);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, depLoc);

    const events = startBuildOnDeposit(state, unit.id);
    expect(events).toHaveLength(0);
  });

  it("fails if unit is not at a deposit", () => {
    const state = createTestState();
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, rowColLoc(5, 5));

    const events = startBuildOnDeposit(state, unit.id);
    expect(events).toHaveLength(0);
  });

  it("fails if unit is not a construction unit", () => {
    const state = createTestState();
    const depLoc = rowColLoc(5, 5);
    addDeposit(state, depLoc, DepositType.OreVein);
    const unit = createUnit(state, UnitType.Army, Owner.Player1, depLoc);

    const events = startBuildOnDeposit(state, unit.id);
    expect(events).toHaveLength(0);
  });
});

// ─── Build City Upgrade Tests ───────────────────────────────────────────────

describe("build city upgrade", () => {
  it("construction unit starts building a university", () => {
    const state = createTestState();
    const cityLoc = rowColLoc(5, 5);
    const city = addCity(state, cityLoc, Owner.Player1);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, cityLoc);

    const resBefore = [...state.resources[Owner.Player1]];
    const events = startBuildCityUpgrade(state, unit.id, city.id, BuildingType.University);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("building");
    expect(state.buildings).toHaveLength(1);
    expect(state.buildings[0].type).toBe(BuildingType.University);
    expect(state.buildings[0].complete).toBe(false);
    expect(city.upgradeIds).toHaveLength(1);

    const cost = getBuildingCost(BuildingType.University, 1);
    expect(state.resources[Owner.Player1][0]).toBe(resBefore[0] - cost[0]);
  });

  it("fails if city already has 4 upgrades", () => {
    const state = createTestState();
    const cityLoc = rowColLoc(5, 5);
    const city = addCity(state, cityLoc, Owner.Player1);
    city.upgradeIds = [0, 1, 2, 3]; // Full
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, cityLoc);

    const events = startBuildCityUpgrade(state, unit.id, city.id, BuildingType.University);
    expect(events).toHaveLength(0);
  });

  it("fails if city already has same upgrade type", () => {
    const state = createTestState();
    const cityLoc = rowColLoc(5, 5);
    const city = addCity(state, cityLoc, Owner.Player1);

    // Add an existing complete university
    state.buildings.push({
      id: 0, loc: cityLoc, type: BuildingType.University, owner: Owner.Player1,
      level: 1, work: 8, buildTime: 8, complete: true, constructorId: null,
    });
    city.upgradeIds = [0];
    state.nextBuildingId = 1;

    const unit = createUnit(state, UnitType.Construction, Owner.Player1, cityLoc);

    // Can't build a NEW university (but could upgrade)
    // This will try to upgrade since existing is complete and level < 3
    const events = startBuildCityUpgrade(state, unit.id, city.id, BuildingType.University);
    expect(events).toHaveLength(1);
    expect(events[0].description).toContain("Upgrade");
    // The existing building should now be level 2 and incomplete
    expect(state.buildings[0].level).toBe(2);
    expect(state.buildings[0].complete).toBe(false);
  });

  it("fails if city not owned by player", () => {
    const state = createTestState();
    const cityLoc = rowColLoc(5, 5);
    const city = addCity(state, cityLoc, Owner.Player2);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, cityLoc);

    const events = startBuildCityUpgrade(state, unit.id, city.id, BuildingType.University);
    expect(events).toHaveLength(0);
  });

  it("fails if unit not at city location", () => {
    const state = createTestState();
    const city = addCity(state, rowColLoc(5, 5), Owner.Player1);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, rowColLoc(10, 10));

    const events = startBuildCityUpgrade(state, unit.id, city.id, BuildingType.University);
    expect(events).toHaveLength(0);
  });

  it("can't build deposit building type as city upgrade", () => {
    const state = createTestState();
    const cityLoc = rowColLoc(5, 5);
    const city = addCity(state, cityLoc, Owner.Player1);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, cityLoc);

    const events = startBuildCityUpgrade(state, unit.id, city.id, BuildingType.Mine);
    expect(events).toHaveLength(0);
  });

  it("upgrade from level 2 to level 3 costs more", () => {
    const state = createTestState();
    const cityLoc = rowColLoc(5, 5);
    const city = addCity(state, cityLoc, Owner.Player1);

    // Add a level 2 complete university
    state.buildings.push({
      id: 0, loc: cityLoc, type: BuildingType.University, owner: Owner.Player1,
      level: 2, work: 6, buildTime: 6, complete: true, constructorId: null,
    });
    city.upgradeIds = [0];
    state.nextBuildingId = 1;

    const unit = createUnit(state, UnitType.Construction, Owner.Player1, cityLoc);
    const resBefore = [...state.resources[Owner.Player1]];
    const events = startBuildCityUpgrade(state, unit.id, city.id, BuildingType.University);

    expect(events).toHaveLength(1);
    const l3Cost = getBuildingCost(BuildingType.University, 3);
    expect(state.resources[Owner.Player1][0]).toBe(resBefore[0] - l3Cost[0]);
    expect(state.buildings[0].level).toBe(3);
  });

  it("can't upgrade past level 3", () => {
    const state = createTestState();
    const cityLoc = rowColLoc(5, 5);
    const city = addCity(state, cityLoc, Owner.Player1);

    state.buildings.push({
      id: 0, loc: cityLoc, type: BuildingType.University, owner: Owner.Player1,
      level: 3, work: 8, buildTime: 8, complete: true, constructorId: null,
    });
    city.upgradeIds = [0];
    state.nextBuildingId = 1;

    const unit = createUnit(state, UnitType.Construction, Owner.Player1, cityLoc);
    const events = startBuildCityUpgrade(state, unit.id, city.id, BuildingType.University);
    // Can't upgrade (level 3 is max) and can't build new (already has one)
    expect(events).toHaveLength(0);
  });
});

// ─── Building Construction Tick Tests ───────────────────────────────────────

describe("tickBuildingConstruction", () => {
  it("advances work each turn", () => {
    const state = createTestState();
    const depLoc = rowColLoc(5, 5);
    addDeposit(state, depLoc, DepositType.OreVein);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, depLoc);
    startBuildOnDeposit(state, unit.id);

    expect(state.buildings[0].work).toBe(0);
    tickBuildingConstruction(state);
    expect(state.buildings[0].work).toBe(1);
    tickBuildingConstruction(state);
    expect(state.buildings[0].work).toBe(2);
  });

  it("completes building after enough turns", () => {
    const state = createTestState();
    const depLoc = rowColLoc(5, 5);
    addDeposit(state, depLoc, DepositType.OreVein);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, depLoc);
    startBuildOnDeposit(state, unit.id);

    const buildTime = state.buildings[0].buildTime;
    for (let i = 0; i < buildTime - 1; i++) {
      tickBuildingConstruction(state);
    }
    expect(state.buildings[0].complete).toBe(false);

    const events = tickBuildingConstruction(state);
    expect(state.buildings[0].complete).toBe(true);
    expect(state.deposits[0].buildingComplete).toBe(true);
    expect(events.some((e) => e.type === "building" && e.description.includes("completed"))).toBe(true);
  });

  it("consumes construction unit on completion", () => {
    const state = createTestState();
    const depLoc = rowColLoc(5, 5);
    addDeposit(state, depLoc, DepositType.OreVein);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, depLoc);
    const unitId = unit.id;
    startBuildOnDeposit(state, unitId);

    const buildTime = state.buildings[0].buildTime;
    for (let i = 0; i < buildTime; i++) {
      tickBuildingConstruction(state);
    }

    // Constructor should be dead
    expect(findUnit(state, unitId)).toBeUndefined();
    expect(state.buildings[0].constructorId).toBeNull();
    // Death event should be in the events
  });

  it("stops construction if constructor dies", () => {
    const state = createTestState();
    const depLoc = rowColLoc(5, 5);
    addDeposit(state, depLoc, DepositType.OreVein);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, depLoc);
    startBuildOnDeposit(state, unit.id);

    tickBuildingConstruction(state);
    expect(state.buildings[0].work).toBe(1);

    // Kill the constructor
    state.units = state.units.filter((u) => u.id !== unit.id);

    tickBuildingConstruction(state);
    // Work should not advance and constructorId should be cleared
    expect(state.buildings[0].work).toBe(1);
    expect(state.buildings[0].constructorId).toBeNull();
  });

  it("stops construction if constructor moves away", () => {
    const state = createTestState();
    const depLoc = rowColLoc(5, 5);
    addDeposit(state, depLoc, DepositType.OreVein);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, depLoc);
    startBuildOnDeposit(state, unit.id);

    tickBuildingConstruction(state);
    expect(state.buildings[0].work).toBe(1);

    // Move constructor away
    unit.loc = rowColLoc(10, 10);

    tickBuildingConstruction(state);
    expect(state.buildings[0].work).toBe(1);
    expect(state.buildings[0].constructorId).toBeNull();
  });

  it("completed deposit building generates income", () => {
    const state = createTestState();
    const depLoc = rowColLoc(5, 5);
    addDeposit(state, depLoc, DepositType.OreVein);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, depLoc);
    startBuildOnDeposit(state, unit.id);

    // Complete the building
    const buildTime = state.buildings[0].buildTime;
    for (let i = 0; i < buildTime; i++) {
      tickBuildingConstruction(state);
    }

    // Now collect income — should get deposit income
    const resBefore = [...state.resources[Owner.Player1]];
    collectResourceIncome(state, Owner.Player1);
    expect(state.resources[Owner.Player1][0]).toBeGreaterThan(resBefore[0]);
  });
});

// ─── Tech Research Tests ────────────────────────────────────────────────────

describe("collectTechResearch", () => {
  it("completed university generates science", () => {
    const state = createTestState();
    state.buildings.push({
      id: 0, loc: rowColLoc(5, 5), type: BuildingType.University, owner: Owner.Player1,
      level: 1, work: 8, buildTime: 8, complete: true, constructorId: null,
    });

    collectTechResearch(state, Owner.Player1);
    expect(state.techResearch[Owner.Player1][TechType.Science]).toBe(1);
  });

  it("level 2 university generates 2 science/turn", () => {
    const state = createTestState();
    state.buildings.push({
      id: 0, loc: rowColLoc(5, 5), type: BuildingType.University, owner: Owner.Player1,
      level: 2, work: 6, buildTime: 6, complete: true, constructorId: null,
    });

    collectTechResearch(state, Owner.Player1);
    expect(state.techResearch[Owner.Player1][TechType.Science]).toBe(2);
  });

  it("incomplete buildings don't generate research", () => {
    const state = createTestState();
    state.buildings.push({
      id: 0, loc: rowColLoc(5, 5), type: BuildingType.University, owner: Owner.Player1,
      level: 1, work: 3, buildTime: 8, complete: false, constructorId: 99,
    });

    collectTechResearch(state, Owner.Player1);
    expect(state.techResearch[Owner.Player1][TechType.Science]).toBe(0);
  });

  it("shipyard/airfield don't generate research", () => {
    const state = createTestState();
    state.buildings.push({
      id: 0, loc: rowColLoc(5, 5), type: BuildingType.Shipyard, owner: Owner.Player1,
      level: 1, work: 8, buildTime: 8, complete: true, constructorId: null,
    });

    collectTechResearch(state, Owner.Player1);
    expect(state.techResearch[Owner.Player1]).toEqual([0, 0, 0, 0]);
  });

  it("multiple buildings accumulate research", () => {
    const state = createTestState();
    state.buildings.push(
      { id: 0, loc: rowColLoc(5, 5), type: BuildingType.University, owner: Owner.Player1, level: 1, work: 8, buildTime: 8, complete: true, constructorId: null },
      { id: 1, loc: rowColLoc(10, 10), type: BuildingType.Hospital, owner: Owner.Player1, level: 2, work: 6, buildTime: 6, complete: true, constructorId: null },
      { id: 2, loc: rowColLoc(15, 15), type: BuildingType.TechLab, owner: Owner.Player1, level: 3, work: 10, buildTime: 10, complete: true, constructorId: null },
    );

    collectTechResearch(state, Owner.Player1);
    expect(state.techResearch[Owner.Player1][TechType.Science]).toBe(1);
    expect(state.techResearch[Owner.Player1][TechType.Health]).toBe(2);
    expect(state.techResearch[Owner.Player1][TechType.Electronics]).toBe(3);
  });
});

// ─── Process Action Tests ───────────────────────────────────────────────────

describe("processAction — build actions", () => {
  it("buildOnDeposit action works via executeTurn", () => {
    const state = createTestState();
    const depLoc = rowColLoc(5, 5);
    addCity(state, rowColLoc(3, 3), Owner.Player1);
    addCity(state, rowColLoc(20, 20), Owner.Player2);
    addDeposit(state, depLoc, DepositType.OilWell);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, depLoc);

    const result = executeTurn(
      state,
      [{ type: "buildOnDeposit", unitId: unit.id }],
      [],
    );

    expect(result.events.some((e) => e.type === "building")).toBe(true);
    expect(state.buildings).toHaveLength(1);
    expect(state.buildings[0].type).toBe(BuildingType.OilWell);
  });

  it("buildCityUpgrade action works via executeTurn", () => {
    const state = createTestState();
    const cityLoc = rowColLoc(5, 5);
    const city = addCity(state, cityLoc, Owner.Player1);
    addCity(state, rowColLoc(20, 20), Owner.Player2);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, cityLoc);

    const result = executeTurn(
      state,
      [{ type: "buildCityUpgrade", unitId: unit.id, cityId: city.id, buildingType: BuildingType.Hospital }],
      [],
    );

    expect(result.events.some((e) => e.type === "building")).toBe(true);
    expect(state.buildings).toHaveLength(1);
    expect(state.buildings[0].type).toBe(BuildingType.Hospital);
    expect(city.upgradeIds).toHaveLength(1);
  });
});

// ─── Integration: Full Construction Lifecycle ───────────────────────────────

describe("full construction lifecycle", () => {
  it("deposit building: start → tick → complete → income", () => {
    const state = createTestState();
    const depLoc = rowColLoc(5, 5);
    const city = addCity(state, rowColLoc(3, 3), Owner.Player1);
    addCity(state, rowColLoc(20, 20), Owner.Player2);
    const dep = addDeposit(state, depLoc, DepositType.TextileFarm);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, depLoc);
    const unitId = unit.id;

    // Start building
    startBuildOnDeposit(state, unitId);
    expect(state.buildings).toHaveLength(1);
    expect(dep.buildingComplete).toBe(false);

    // Tick through build time (Farm = 4 turns)
    const buildTime = state.buildings[0].buildTime;
    for (let t = 0; t < buildTime; t++) {
      const result = executeTurn(state, [], []);
    }

    // Building should be complete, constructor consumed
    expect(state.buildings[0].complete).toBe(true);
    expect(dep.buildingComplete).toBe(true);
    expect(findUnit(state, unitId)).toBeUndefined();

    // Income should include the textile deposit
    const resBefore = [...state.resources[Owner.Player1]];
    collectResourceIncome(state, Owner.Player1);
    expect(state.resources[Owner.Player1][2]).toBeGreaterThan(resBefore[2]);
  });

  it("city upgrade: start → tick → complete → tech research", () => {
    const state = createTestState();
    const cityLoc = rowColLoc(5, 5);
    const city = addCity(state, cityLoc, Owner.Player1);
    addCity(state, rowColLoc(20, 20), Owner.Player2);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, cityLoc);

    // Start university
    startBuildCityUpgrade(state, unit.id, city.id, BuildingType.University);

    // Tick through build time (University = 8 turns)
    const buildTime = state.buildings[0].buildTime;
    for (let t = 0; t < buildTime; t++) {
      executeTurn(state, [], []);
    }

    expect(state.buildings[0].complete).toBe(true);
    expect(findUnit(state, unit.id)).toBeUndefined();

    // Tech research should have accumulated (1 per turn after completion)
    // Since it completed at the end of a turn, research starts accumulating on the NEXT turn
    const techBefore = state.techResearch[Owner.Player1][TechType.Science];
    executeTurn(state, [], []);
    expect(state.techResearch[Owner.Player1][TechType.Science]).toBe(techBefore + 1);
  });
});

// ─── Helper Function Tests ──────────────────────────────────────────────────

describe("building helpers", () => {
  it("canAffordBuilding checks all resource types", () => {
    expect(canAffordBuilding([30, 0, 20], BuildingType.University, 1)).toBe(true);
    expect(canAffordBuilding([29, 0, 20], BuildingType.University, 1)).toBe(false);
    expect(canAffordBuilding([30, 0, 19], BuildingType.University, 1)).toBe(false);
  });

  it("isCityUpgradeType returns correct values", () => {
    expect(isCityUpgradeType(BuildingType.Mine)).toBe(false);
    expect(isCityUpgradeType(BuildingType.University)).toBe(true);
    expect(isCityUpgradeType(BuildingType.Airfield)).toBe(true);
  });

  it("cityHasUpgradeSlot checks max", () => {
    expect(cityHasUpgradeSlot([])).toBe(true);
    expect(cityHasUpgradeSlot([1, 2, 3])).toBe(true);
    expect(cityHasUpgradeSlot([1, 2, 3, 4])).toBe(false);
  });

  it("cityHasUpgradeType checks building types", () => {
    const buildings = [
      { id: 1, type: BuildingType.University },
      { id: 2, type: BuildingType.Hospital },
    ];
    expect(cityHasUpgradeType([1, 2], buildings, BuildingType.University)).toBe(true);
    expect(cityHasUpgradeType([1, 2], buildings, BuildingType.TechLab)).toBe(false);
  });
});
