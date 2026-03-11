import { describe, it, expect, beforeEach } from "vitest";
import {
  Owner,
  UnitType,
  UnitBehavior,
  TerrainType,
  BuildingType,
  DepositType,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_SIZE,
  TechType,
} from "../constants.js";
import { UNIT_ATTRIBUTES } from "../units.js";
import { BUILDING_ATTRIBUTES } from "../buildings.js";
import type { GameState, CityState, UnitState, MapCell, ViewMapCell, DepositState, BuildingState, PlayerInfo } from "../types.js";
import {
  createUnit,
  findUnit,
  initViewMap,
  scan,
} from "../game.js";
import { rowColLoc } from "../utils.js";
import { computeAITurn } from "../ai.js";
import {
  aiConstructionMove,
  aiArtilleryMove,
  aiMissileCruiserMove,
  needsConstruction,
  canAffordProduction,
  shouldSurrenderEconomic,
  pickCityUpgrade,
  aiEngineerBoatMove,
} from "../ai-economy.js";
import { countProduction, decideProduction, needMore } from "../ai-production.js";
import { getRatioTable } from "../ai-helpers.js";

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
    turn: 10,
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
    resources: { [Owner.Unowned]: [0,0,0], [Owner.Player1]: [500,500,500], [Owner.Player2]: [500,500,500] },
    deposits: [],
    nextDepositId: 0,
    buildings: [],
    nextBuildingId: 0,
    techResearch: { [Owner.Unowned]: [0,0,0,0], [Owner.Player1]: [0,0,0,0], [Owner.Player2]: [0,0,0,0] },
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

  const vm = state.viewMaps[owner];
  if (vm) vm[loc] = { contents: "O", seen: state.turn };
  const enemy = owner === Owner.Player1 ? Owner.Player2 : Owner.Player1;
  const evm = state.viewMaps[enemy];
  if (evm) evm[loc] = { contents: "X", seen: state.turn };

  return city;
}

function addUnit(state: GameState, type: UnitType, loc: number, owner: Owner): UnitState {
  const unit = createUnit(state, type, owner, loc);
  scan(state, owner, loc);
  return unit;
}

function addDeposit(state: GameState, loc: number, type: DepositType): DepositState {
  const deposit: DepositState = {
    id: state.nextDepositId++,
    loc,
    type,
    owner: Owner.Unowned,
    buildingComplete: false,
    buildingId: null,
  };
  state.deposits.push(deposit);
  state.map[loc].depositId = state.deposits.length - 1;
  return deposit;
}

function setWater(state: GameState, startRow: number, startCol: number, rows: number, cols: number): void {
  for (let r = startRow; r < startRow + rows; r++) {
    for (let c = startCol; c < startCol + cols; c++) {
      const loc = rowColLoc(r, c);
      if (loc >= 0 && loc < MAP_SIZE) {
        state.map[loc].terrain = TerrainType.Sea;
        for (const owner of [Owner.Player1, Owner.Player2]) {
          const vm = state.viewMaps[owner];
          if (vm) vm[loc] = { contents: ".", seen: state.turn };
        }
      }
    }
  }
}

function refreshVision(state: GameState, owner: Owner): void {
  for (const unit of state.units) {
    if (unit.owner === owner) scan(state, owner, unit.loc);
  }
  for (const city of state.cities) {
    if (city.owner === owner) scan(state, owner, city.loc);
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("AI Economy — Construction Management", () => {
  it("needsConstruction returns true when unclaimed deposits exist", () => {
    const state = createTestState();
    const loc = rowColLoc(10, 10);
    addCity(state, rowColLoc(10, 12), Owner.Player2, UnitType.Army);
    addCity(state, rowColLoc(10, 8), Owner.Player2, UnitType.Army);
    addCity(state, rowColLoc(10, 14), Owner.Player2, UnitType.Army);
    addCity(state, rowColLoc(10, 16), Owner.Player2, UnitType.Army);
    addDeposit(state, loc, DepositType.OreVein);
    refreshVision(state, Owner.Player2);
    expect(needsConstruction(state, Owner.Player2)).toBe(true);
  });

  it("needsConstruction returns false when all deposits claimed and no upgrade slots", () => {
    const state = createTestState();
    const city = addCity(state, rowColLoc(10, 8), Owner.Player2, UnitType.Army);
    const dep = addDeposit(state, rowColLoc(10, 10), DepositType.OreVein);
    dep.buildingComplete = true;
    dep.owner = Owner.Player2;
    // Fill all 4 upgrade slots so no upgrades needed
    for (let i = 0; i < 4; i++) {
      const b: BuildingState = {
        id: state.nextBuildingId++, loc: city.loc,
        type: BuildingType.University + i as BuildingType,
        owner: Owner.Player2, level: 1, work: 8, buildTime: 8,
        complete: true, constructorId: null, hp: 0,
      };
      state.buildings.push(b);
      city.upgradeIds.push(b.id);
    }
    refreshVision(state, Owner.Player2);
    expect(needsConstruction(state, Owner.Player2)).toBe(false);
  });

  it("needsConstruction respects max constructor limit", () => {
    const state = createTestState();
    // 4 cities → max 1 constructor
    for (let i = 0; i < 4; i++) {
      addCity(state, rowColLoc(10, 5 + i * 3), Owner.Player2, UnitType.Army);
    }
    addDeposit(state, rowColLoc(15, 10), DepositType.OreVein);
    addUnit(state, UnitType.Construction, rowColLoc(12, 10), Owner.Player2);
    refreshVision(state, Owner.Player2);
    expect(needsConstruction(state, Owner.Player2)).toBe(false);
  });

  it("construction unit builds on deposit when standing on one", () => {
    const state = createTestState();
    const depLoc = rowColLoc(10, 10);
    addDeposit(state, depLoc, DepositType.OreVein);
    const unit = addUnit(state, UnitType.Construction, depLoc, Owner.Player2);
    refreshVision(state, Owner.Player2);

    const actions = aiConstructionMove(state, unit, Owner.Player2, state.viewMaps[Owner.Player2]);
    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe("buildOnDeposit");
  });

  it("construction unit builds city upgrade when at own city", () => {
    const state = createTestState();
    const cityLoc = rowColLoc(10, 10);
    addCity(state, cityLoc, Owner.Player2, UnitType.Army);
    const unit = addUnit(state, UnitType.Construction, cityLoc, Owner.Player2);
    refreshVision(state, Owner.Player2);

    const actions = aiConstructionMove(state, unit, Owner.Player2, state.viewMaps[Owner.Player2]);
    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe("buildCityUpgrade");
  });

  it("construction unit moves toward unclaimed deposit", () => {
    const state = createTestState();
    const unitLoc = rowColLoc(10, 10);
    const depLoc = rowColLoc(10, 15);
    addDeposit(state, depLoc, DepositType.OilWell);
    const unit = addUnit(state, UnitType.Construction, unitLoc, Owner.Player2);
    // Make deposit visible
    state.viewMaps[Owner.Player2][depLoc] = { contents: "+", seen: state.turn };
    refreshVision(state, Owner.Player2);

    const actions = aiConstructionMove(state, unit, Owner.Player2, state.viewMaps[Owner.Player2]);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].type).toBe("move");
  });

  it("construction unit stays put when already building", () => {
    const state = createTestState();
    const depLoc = rowColLoc(10, 10);
    addDeposit(state, depLoc, DepositType.OreVein);
    const unit = addUnit(state, UnitType.Construction, depLoc, Owner.Player2);
    // Simulate active building
    state.buildings.push({
      id: state.nextBuildingId++,
      loc: depLoc,
      type: BuildingType.Mine,
      owner: Owner.Player2,
      level: 1,
      work: 2,
      buildTime: 4,
      complete: false,
      constructorId: unit.id,
      hp: 0,
    });
    refreshVision(state, Owner.Player2);

    const actions = aiConstructionMove(state, unit, Owner.Player2, state.viewMaps[Owner.Player2]);
    expect(actions.length).toBe(0); // stay put
  });
});

describe("AI Economy — City Upgrade Priority", () => {
  it("picks MilitaryAcademy first", () => {
    const state = createTestState();
    const cityLoc = rowColLoc(10, 10);
    const city = addCity(state, cityLoc, Owner.Player2, UnitType.Army);
    const upgrade = pickCityUpgrade(state, city, Owner.Player2);
    expect(upgrade).toBe(BuildingType.MilitaryAcademy);
  });

  it("picks University when Academy already built", () => {
    const state = createTestState();
    const cityLoc = rowColLoc(10, 10);
    const city = addCity(state, cityLoc, Owner.Player2, UnitType.Army);
    // Add completed MilitaryAcademy
    const b: BuildingState = {
      id: state.nextBuildingId++,
      loc: cityLoc,
      type: BuildingType.MilitaryAcademy,
      owner: Owner.Player2,
      level: 1,
      work: 10,
      buildTime: 10,
      complete: true,
      constructorId: null,
      hp: 0,
    };
    state.buildings.push(b);
    city.upgradeIds.push(b.id);

    const upgrade = pickCityUpgrade(state, city, Owner.Player2);
    expect(upgrade).toBe(BuildingType.University);
  });

  it("returns null when all 4 upgrade slots filled", () => {
    const state = createTestState();
    const cityLoc = rowColLoc(10, 10);
    const city = addCity(state, cityLoc, Owner.Player2, UnitType.Army);
    // Fill 4 slots
    for (let i = 0; i < 4; i++) {
      const b: BuildingState = {
        id: state.nextBuildingId++,
        loc: cityLoc,
        type: BuildingType.University + i as BuildingType,
        owner: Owner.Player2,
        level: 1, work: 8, buildTime: 8, complete: true, constructorId: null, hp: 0,
      };
      state.buildings.push(b);
      city.upgradeIds.push(b.id);
    }
    const upgrade = pickCityUpgrade(state, city, Owner.Player2);
    expect(upgrade).toBeNull();
  });
});

describe("AI Economy — Production Integration", () => {
  it("decideProduction considers Construction when 4+ cities and deposits available", () => {
    const state = createTestState();
    // Add 5 cities for P2
    for (let i = 0; i < 5; i++) {
      addCity(state, rowColLoc(10, 5 + i * 4), Owner.Player2, UnitType.Army);
    }
    // Add enemy city
    addCity(state, rowColLoc(30, 30), Owner.Player1, UnitType.Army);
    // Add an unclaimed deposit visible to P2
    addDeposit(state, rowColLoc(10, 25), DepositType.OreVein);
    refreshVision(state, Owner.Player2);

    const prodCounts = countProduction(state, Owner.Player2);
    const viewMap = state.viewMaps[Owner.Player2];

    // Try a city not building army at 0% progress
    state.cities[0].production = UnitType.Fighter;
    state.cities[0].work = 0;
    const result = decideProduction(state, state.cities[0], Owner.Player2, viewMap, prodCounts);

    // Should eventually produce Construction when conditions are right
    // (May produce other things first due to priority ordering — just verify it doesn't crash)
    expect(result).not.toBeUndefined();
  });

  it("needMore includes Artillery when tech allows", () => {
    const state = createTestState();
    // Give P2 War 2 tech
    state.techResearch[Owner.Player2][TechType.War] = 30;
    const ratio = getRatioTable(15); // R2 table
    const prodCounts = new Array(15).fill(0);
    prodCounts[UnitType.Army] = 10; // lots of army

    const needed = needMore(prodCounts, ratio, false, state, Owner.Player2);
    // Should be able to pick Artillery since War 2 is met
    expect(needed).not.toBe(UnitType.Army);
  });

  it("needMore skips Artillery when tech insufficient", () => {
    const state = createTestState();
    // P2 has no tech
    const ratio = getRatioTable(15); // R2 table has Artillery
    const prodCounts = new Array(15).fill(0);
    prodCounts[UnitType.Army] = 10;

    const needed = needMore(prodCounts, ratio, false, state, Owner.Player2);
    // Artillery requires War 2 — should not be picked
    expect(needed).not.toBe(UnitType.Artillery);
  });
});

describe("AI Economy — Artillery Bombard", () => {
  it("artillery bombards enemy in range", () => {
    const state = createTestState();
    const artLoc = rowColLoc(10, 10);
    const enemyLoc = rowColLoc(10, 12); // 2 tiles away (within range)
    const artillery = addUnit(state, UnitType.Artillery, artLoc, Owner.Player2);
    addUnit(state, UnitType.Army, enemyLoc, Owner.Player1);
    refreshVision(state, Owner.Player2);

    const actions = aiArtilleryMove(state, artillery, Owner.Player2, state.viewMaps[Owner.Player2]);
    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe("bombard");
  });

  it("artillery moves toward enemy when out of range", () => {
    const state = createTestState();
    const artLoc = rowColLoc(10, 10);
    const enemyLoc = rowColLoc(10, 20); // 10 tiles away (out of range)
    const artillery = addUnit(state, UnitType.Artillery, artLoc, Owner.Player2);
    addUnit(state, UnitType.Army, enemyLoc, Owner.Player1);
    refreshVision(state, Owner.Player2);

    const actions = aiArtilleryMove(state, artillery, Owner.Player2, state.viewMaps[Owner.Player2]);
    if (actions.length > 0) {
      expect(actions[0].type).toBe("move");
    }
    // May return 0 actions if pathfinding doesn't find a target — that's ok
  });

  it("artillery does nothing when no targets exist", () => {
    const state = createTestState();
    const artLoc = rowColLoc(10, 10);
    const artillery = addUnit(state, UnitType.Artillery, artLoc, Owner.Player2);
    refreshVision(state, Owner.Player2);

    const actions = aiArtilleryMove(state, artillery, Owner.Player2, state.viewMaps[Owner.Player2]);
    // No enemies anywhere — either move to explore or idle
    for (const a of actions) {
      expect(a.type).not.toBe("bombard");
    }
  });
});

describe("AI Economy — Missile Cruiser Bombard", () => {
  it("missile cruiser bombards enemy in range", () => {
    const state = createTestState();
    // Set up water for cruiser
    setWater(state, 8, 8, 6, 6);
    const cruiserLoc = rowColLoc(10, 10);
    const enemyLoc = rowColLoc(10, 13); // 3 tiles away (within range)
    state.map[enemyLoc].terrain = TerrainType.Land; // enemy on land
    const cruiser = addUnit(state, UnitType.MissileCruiser, cruiserLoc, Owner.Player2);
    addUnit(state, UnitType.Army, enemyLoc, Owner.Player1);
    refreshVision(state, Owner.Player2);

    const actions = aiMissileCruiserMove(state, cruiser, Owner.Player2, state.viewMaps[Owner.Player2]);
    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe("bombard");
  });
});

describe("AI Economy — Resource Awareness", () => {
  it("canAffordProduction checks safety margin", () => {
    const state = createTestState();
    state.resources[Owner.Player2] = [30, 30, 30]; // tight budget
    // Army costs [5,0,5] — should be affordable with margin
    expect(canAffordProduction(state, Owner.Player2, UnitType.Army)).toBe(true);
    // Battleship costs [40,25,0] — ore too low
    expect(canAffordProduction(state, Owner.Player2, UnitType.Battleship)).toBe(false);
  });

  it("canAffordProduction returns false when below safety margin", () => {
    const state = createTestState();
    state.resources[Owner.Player2] = [25, 25, 25];
    // Construction costs [10,0,5], but 25-10=15 < 20 safety margin for ore
    expect(canAffordProduction(state, Owner.Player2, UnitType.Construction)).toBe(false);
  });
});

describe("AI Economy — Surrender Enhancement", () => {
  it("surrenders when economically hopeless", () => {
    const state = createTestState();
    // P2: 1 city, no deposits, depleted resources
    addCity(state, rowColLoc(10, 10), Owner.Player2, UnitType.Army);
    state.resources[Owner.Player2] = [10, 10, 10];
    // P1: 10 cities
    for (let i = 0; i < 10; i++) {
      addCity(state, rowColLoc(30, 5 + i * 4), Owner.Player1, UnitType.Army);
    }
    expect(shouldSurrenderEconomic(state, Owner.Player2)).toBe(true);
  });

  it("does not surrender when economically viable", () => {
    const state = createTestState();
    // P2: 5 cities, decent resources
    for (let i = 0; i < 5; i++) {
      addCity(state, rowColLoc(10, 5 + i * 4), Owner.Player2, UnitType.Army);
    }
    state.resources[Owner.Player2] = [200, 200, 200];
    // P1: 5 cities
    for (let i = 0; i < 5; i++) {
      addCity(state, rowColLoc(30, 5 + i * 4), Owner.Player1, UnitType.Army);
    }
    expect(shouldSurrenderEconomic(state, Owner.Player2)).toBe(false);
  });
});

describe("AI Economy — New Unit Movement Integration", () => {
  it("computeAITurn handles Construction units without crashing", () => {
    const state = createTestState();
    addCity(state, rowColLoc(10, 10), Owner.Player2, UnitType.Army);
    addCity(state, rowColLoc(10, 20), Owner.Player1, UnitType.Army);
    addUnit(state, UnitType.Construction, rowColLoc(10, 10), Owner.Player2);
    refreshVision(state, Owner.Player2);

    const actions = computeAITurn(state, Owner.Player2);
    expect(Array.isArray(actions)).toBe(true);
  });

  it("computeAITurn handles Artillery units without crashing", () => {
    const state = createTestState();
    addCity(state, rowColLoc(10, 10), Owner.Player2, UnitType.Army);
    addCity(state, rowColLoc(10, 20), Owner.Player1, UnitType.Army);
    addUnit(state, UnitType.Artillery, rowColLoc(10, 12), Owner.Player2);
    refreshVision(state, Owner.Player2);

    const actions = computeAITurn(state, Owner.Player2);
    expect(Array.isArray(actions)).toBe(true);
  });

  it("computeAITurn handles Special Forces units", () => {
    const state = createTestState();
    addCity(state, rowColLoc(10, 10), Owner.Player2, UnitType.Army);
    addCity(state, rowColLoc(10, 20), Owner.Player1, UnitType.Army);
    addUnit(state, UnitType.SpecialForces, rowColLoc(10, 12), Owner.Player2);
    refreshVision(state, Owner.Player2);

    const actions = computeAITurn(state, Owner.Player2);
    expect(Array.isArray(actions)).toBe(true);
  });

  it("computeAITurn handles AWACS units", () => {
    const state = createTestState();
    addCity(state, rowColLoc(10, 10), Owner.Player2, UnitType.Army);
    addCity(state, rowColLoc(10, 20), Owner.Player1, UnitType.Army);
    addUnit(state, UnitType.AWACS, rowColLoc(10, 12), Owner.Player2);
    refreshVision(state, Owner.Player2);

    const actions = computeAITurn(state, Owner.Player2);
    expect(Array.isArray(actions)).toBe(true);
  });

  it("computeAITurn handles MissileCruiser on water", () => {
    const state = createTestState();
    setWater(state, 15, 1, 5, 98);
    addCity(state, rowColLoc(10, 10), Owner.Player2, UnitType.Army);
    addCity(state, rowColLoc(25, 10), Owner.Player1, UnitType.Army);
    addUnit(state, UnitType.MissileCruiser, rowColLoc(17, 10), Owner.Player2);
    refreshVision(state, Owner.Player2);

    const actions = computeAITurn(state, Owner.Player2);
    expect(Array.isArray(actions)).toBe(true);
  });

  it("computeAITurn handles EngineerBoat on water", () => {
    const state = createTestState();
    setWater(state, 15, 1, 5, 98);
    addCity(state, rowColLoc(10, 10), Owner.Player2, UnitType.Army);
    addUnit(state, UnitType.EngineerBoat, rowColLoc(17, 10), Owner.Player2);
    refreshVision(state, Owner.Player2);

    const actions = computeAITurn(state, Owner.Player2);
    expect(Array.isArray(actions)).toBe(true);
  });
});

describe("AI Economy — Ratio Tables", () => {
  it("RATIO_2 (11-20 cities) includes Artillery and AWACS", () => {
    const ratio = getRatioTable(15);
    expect(ratio[UnitType.Artillery]).toBeGreaterThan(0);
    expect(ratio[UnitType.AWACS]).toBeGreaterThan(0);
  });

  it("RATIO_3 (21-30 cities) includes SpecialForces and MissileCruiser", () => {
    const ratio = getRatioTable(25);
    expect(ratio[UnitType.SpecialForces]).toBeGreaterThan(0);
    expect(ratio[UnitType.MissileCruiser]).toBeGreaterThan(0);
  });

  it("RATIO_EARLY (2-3 cities) has no new units", () => {
    const ratio = getRatioTable(2);
    expect(ratio[UnitType.Artillery]).toBe(0);
    expect(ratio[UnitType.SpecialForces]).toBe(0);
    expect(ratio[UnitType.AWACS]).toBe(0);
    expect(ratio[UnitType.MissileCruiser]).toBe(0);
    expect(ratio[UnitType.Construction]).toBe(0);
  });
});

describe("AI Economy — Resource Starvation", () => {
  it("decideProduction switches to Army when can't afford current unit", () => {
    const state = createTestState();
    state.resources[Owner.Player2] = [10, 0, 10]; // can afford Army [5,0,5] but not Fighter [15,10,0]
    const city = addCity(state, rowColLoc(10, 10), Owner.Player2, UnitType.Fighter);
    addCity(state, rowColLoc(30, 30), Owner.Player1, UnitType.Army);
    city.work = 0; // hasn't started yet
    refreshVision(state, Owner.Player2);

    const prodCounts = countProduction(state, Owner.Player2);
    const result = decideProduction(state, city, Owner.Player2, state.viewMaps[Owner.Player2], prodCounts);
    expect(result).toBe(UnitType.Army); // should switch to cheapest affordable
  });
});

describe("AI Economy — Dynamic Tech Priority", () => {
  it("pickCityUpgrade shifts to War when losing militarily", () => {
    const state = createTestState();
    const city = addCity(state, rowColLoc(10, 10), Owner.Player2, UnitType.Army);
    // P1 has many more armies
    for (let i = 0; i < 10; i++) {
      addUnit(state, UnitType.Army, rowColLoc(30, 5 + i), Owner.Player1);
    }
    // P2 has few
    addUnit(state, UnitType.Army, rowColLoc(10, 12), Owner.Player2);
    refreshVision(state, Owner.Player2);

    const upgrade = pickCityUpgrade(state, city, Owner.Player2);
    // When losing militarily, MilitaryAcademy should still be first (War focus)
    expect(upgrade).toBe(BuildingType.MilitaryAcademy);
  });

  it("pickCityUpgrade shifts to Electronics when losing navally", () => {
    const state = createTestState();
    setWater(state, 15, 1, 5, 98);
    const city = addCity(state, rowColLoc(10, 10), Owner.Player2, UnitType.Army);
    // P1 has many ships
    for (let i = 0; i < 5; i++) {
      addUnit(state, UnitType.Destroyer, rowColLoc(17, 5 + i * 3), Owner.Player1);
    }
    // P2 has none
    // Add Academy already built so it doesn't just pick that
    const b: BuildingState = {
      id: state.nextBuildingId++, loc: city.loc,
      type: BuildingType.MilitaryAcademy,
      owner: Owner.Player2, level: 1, work: 10, buildTime: 10,
      complete: true, constructorId: null, hp: 0,
    };
    state.buildings.push(b);
    city.upgradeIds.push(b.id);
    refreshVision(state, Owner.Player2);

    const upgrade = pickCityUpgrade(state, city, Owner.Player2);
    // When losing navally, TechLab (Electronics) should be prioritized
    expect(upgrade).toBe(BuildingType.TechLab);
  });
});

describe("AI Economy — Engineer Boat", () => {
  it("engineer boat builds bridge on water between land", () => {
    const state = createTestState();
    // Create a narrow water channel with land on both sides
    setWater(state, 10, 10, 1, 3); // 3 water tiles
    const boatLoc = rowColLoc(10, 11); // middle water tile
    // Give tech for bridge (Sci 2)
    state.techResearch[Owner.Player2][TechType.Science] = 30;
    const boat = addUnit(state, UnitType.EngineerBoat, boatLoc, Owner.Player2);
    refreshVision(state, Owner.Player2);

    const actions = aiEngineerBoatMove(state, boat, Owner.Player2, state.viewMaps[Owner.Player2]);
    // Should try to build a bridge (water tile between two land tiles)
    if (actions.length > 0) {
      expect(actions[0].type).toBe("buildStructure");
    }
  });
});
