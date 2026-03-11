import { describe, it, expect, beforeEach } from "vitest";
import {
  UnitType, Owner, TerrainType, UnitBehavior, TechType, INFINITY,
  BuildingType, BUILDING_ATTRIBUTES, BUILDING_NAMES,
  DEFENSIVE_STRUCTURE_TYPES, NAVAL_STRUCTURE_TYPES,
  NUM_BUILDING_TYPES, NUM_UNIT_TYPES,
  isDefensiveStructureType, isNavalStructureType, isStructureType,
  canStructureTarget, isAirUnit, isSeaUnit, isLandUnit,
  STRUCTURE_TECH_REQUIREMENTS,
  createUnit, findUnit, processAction, scan,
  startBuildStructure, destroyBuilding, bombardStructure,
  triggerMine, checkMineTrigger, autoAttackStructures,
  scanStructureVision, collectPlatformIncome,
  findBridgeAtLoc, findStructureAtLoc, findOwnerStructures,
  chebyshevDist, goodLoc, executeTurn, tickBuildingConstruction,
  canBuildStructure,
  configureMapDimensions, MAP_WIDTH, MAP_HEIGHT, MAP_SIZE,
  ResourceType,
} from "../index.js";
import type { GameState, MapCell, ViewMapCell, CityState, BuildingState, PlayerInfo } from "../index.js";

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createTestState(width = 20, height = 20): GameState {
  configureMapDimensions(width, height);
  const map: MapCell[] = [];
  for (let i = 0; i < width * height; i++) {
    map.push({ terrain: TerrainType.Land, onBoard: true, cityId: null, depositId: null });
  }
  const viewMaps: Record<Owner, ViewMapCell[]> = {
    [Owner.Unowned]: [],
    [Owner.Player1]: map.map(() => ({ contents: " ", seen: -1 })),
    [Owner.Player2]: map.map(() => ({ contents: " ", seen: -1 })),
  };
  return {
    config: {
      mapWidth: width, mapHeight: height, numCities: 0,
      waterRatio: 70, smoothPasses: 5, minCityDist: 2, seed: 42,
    },
    turn: 1,
    map,
    cities: [],
    units: [],
    nextUnitId: 1,
    nextCityId: 0,
    viewMaps,
    rngState: 42,
    resources: {
      [Owner.Unowned]: [0, 0, 0],
      [Owner.Player1]: [500, 500, 500],
      [Owner.Player2]: [500, 500, 500],
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
    kingdoms: {},
    shields: {},
    players: [
      { id: 1, name: "Player 1", color: 0x00cc00, isAI: false, status: "active" as const },
      { id: 2, name: "Player 2", color: 0xcc0000, isAI: true, status: "active" as const },
    ],
  };
}

function loc(row: number, col: number): number {
  return row * MAP_WIDTH + col;
}

function addCity(state: GameState, l: number, owner: Owner): CityState {
  const city: CityState = {
    id: state.nextCityId++,
    loc: l,
    owner,
    production: UnitType.Army,
    work: 0,
    func: new Array(NUM_UNIT_TYPES).fill(UnitBehavior.None),
    upgradeIds: [],
  };
  state.cities.push(city);
  state.map[l].terrain = TerrainType.City;
  state.map[l].cityId = city.id;
  return city;
}

function setWater(state: GameState, l: number): void {
  state.map[l].terrain = TerrainType.Sea;
}

function addCompletedStructure(
  state: GameState, l: number, type: BuildingType, owner: Owner,
): BuildingState {
  const attrs = BUILDING_ATTRIBUTES[type];
  const building: BuildingState = {
    id: state.nextBuildingId++,
    loc: l,
    type,
    owner,
    level: 1,
    work: attrs.buildTime,
    buildTime: attrs.buildTime,
    complete: true,
    constructorId: null,
    hp: attrs.maxHp,
  };
  state.buildings.push(building);
  return building;
}

function grantTech(state: GameState, owner: Owner, track: TechType, points: number): void {
  state.techResearch[owner][track] = points;
}

// ─── Building Attributes Tests ──────────────────────────────────────────────

describe("structure attributes", () => {
  it("has 19 building types total (9 original + 7 defensive + 3 naval)", () => {
    expect(BUILDING_ATTRIBUTES).toHaveLength(19);
    expect(NUM_BUILDING_TYPES).toBe(19);
  });

  it("all defensive structures have isDefensiveStructure=true", () => {
    for (const type of DEFENSIVE_STRUCTURE_TYPES) {
      expect(isDefensiveStructureType(type)).toBe(true);
      expect(isStructureType(type)).toBe(true);
      expect(isNavalStructureType(type)).toBe(false);
    }
  });

  it("all naval structures have isNavalStructure=true", () => {
    for (const type of NAVAL_STRUCTURE_TYPES) {
      expect(isNavalStructureType(type)).toBe(true);
      expect(isStructureType(type)).toBe(true);
      expect(isDefensiveStructureType(type)).toBe(false);
    }
  });

  it("original buildings are not structures", () => {
    const originals = [
      BuildingType.Mine, BuildingType.OilWell, BuildingType.TextileFarm,
      BuildingType.University, BuildingType.Hospital, BuildingType.TechLab,
      BuildingType.MilitaryAcademy, BuildingType.Shipyard, BuildingType.Airfield,
    ];
    for (const type of originals) {
      expect(isStructureType(type)).toBe(false);
      expect(BUILDING_ATTRIBUTES[type].maxHp).toBe(0);
    }
  });

  it("structures have positive maxHp", () => {
    for (const type of [...DEFENSIVE_STRUCTURE_TYPES, ...NAVAL_STRUCTURE_TYPES]) {
      expect(BUILDING_ATTRIBUTES[type].maxHp).toBeGreaterThan(0);
    }
  });

  it("mines and sea mines are single-use and invisible", () => {
    expect(BUILDING_ATTRIBUTES[BuildingType.Minefield].singleUse).toBe(true);
    expect(BUILDING_ATTRIBUTES[BuildingType.Minefield].invisible).toBe(true);
    expect(BUILDING_ATTRIBUTES[BuildingType.SeaMine].singleUse).toBe(true);
    expect(BUILDING_ATTRIBUTES[BuildingType.SeaMine].invisible).toBe(true);
  });

  it("radar station has 5-tile vision radius", () => {
    expect(BUILDING_ATTRIBUTES[BuildingType.RadarStation].visionRadius).toBe(5);
  });

  it("building names array has correct length", () => {
    expect(BUILDING_NAMES).toHaveLength(19);
  });
});

// ─── Target Type Tests ──────────────────────────────────────────────────────

describe("structure targeting", () => {
  it("anti-air targets air units only", () => {
    expect(canStructureTarget(BuildingType.AntiAir, UnitType.Fighter)).toBe(true);
    expect(canStructureTarget(BuildingType.AntiAir, UnitType.AWACS)).toBe(true);
    expect(canStructureTarget(BuildingType.AntiAir, UnitType.Army)).toBe(false);
    expect(canStructureTarget(BuildingType.AntiAir, UnitType.Battleship)).toBe(false);
  });

  it("coastal battery targets sea units only", () => {
    expect(canStructureTarget(BuildingType.CoastalBattery, UnitType.Battleship)).toBe(true);
    expect(canStructureTarget(BuildingType.CoastalBattery, UnitType.Transport)).toBe(true);
    expect(canStructureTarget(BuildingType.CoastalBattery, UnitType.Army)).toBe(false);
    expect(canStructureTarget(BuildingType.CoastalBattery, UnitType.Fighter)).toBe(false);
  });

  it("bunker targets land units", () => {
    expect(canStructureTarget(BuildingType.Bunker, UnitType.Army)).toBe(true);
    expect(canStructureTarget(BuildingType.Bunker, UnitType.SpecialForces)).toBe(true);
    expect(canStructureTarget(BuildingType.Bunker, UnitType.Battleship)).toBe(false);
  });

  it("artillery fort targets land units at range", () => {
    expect(canStructureTarget(BuildingType.ArtilleryFort, UnitType.Army)).toBe(true);
    expect(BUILDING_ATTRIBUTES[BuildingType.ArtilleryFort].attackRange).toBe(3);
  });

  it("SAM site targets air units", () => {
    expect(canStructureTarget(BuildingType.SAMSite, UnitType.Fighter)).toBe(true);
    expect(canStructureTarget(BuildingType.SAMSite, UnitType.AWACS)).toBe(true);
    expect(canStructureTarget(BuildingType.SAMSite, UnitType.Army)).toBe(false);
  });

  it("sea mine targets sea units", () => {
    expect(canStructureTarget(BuildingType.SeaMine, UnitType.Destroyer)).toBe(true);
    expect(canStructureTarget(BuildingType.SeaMine, UnitType.Army)).toBe(false);
  });

  it("minefield targets land units", () => {
    expect(canStructureTarget(BuildingType.Minefield, UnitType.Army)).toBe(true);
    expect(canStructureTarget(BuildingType.Minefield, UnitType.Destroyer)).toBe(false);
  });
});

// ─── Build Structure Tests ──────────────────────────────────────────────────

describe("startBuildStructure", () => {
  it("construction unit builds bunker on land", () => {
    const state = createTestState();
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, loc(5, 5));
    const events = startBuildStructure(state, unit.id, BuildingType.Bunker);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("building");
    expect(state.buildings).toHaveLength(1);
    expect(state.buildings[0].type).toBe(BuildingType.Bunker);
    expect(state.buildings[0].hp).toBe(5);
    expect(state.buildings[0].complete).toBe(false);
  });

  it("consumes resources on build start", () => {
    const state = createTestState();
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, loc(5, 5));
    const resBefore = [...state.resources[Owner.Player1]];
    startBuildStructure(state, unit.id, BuildingType.Bunker);
    const cost = BUILDING_ATTRIBUTES[BuildingType.Bunker].cost;
    expect(state.resources[Owner.Player1][0]).toBe(resBefore[0] - cost[0]);
    expect(state.resources[Owner.Player1][1]).toBe(resBefore[1] - cost[1]);
    expect(state.resources[Owner.Player1][2]).toBe(resBefore[2] - cost[2]);
  });

  it("fails if on water tile for defensive structure", () => {
    const state = createTestState();
    setWater(state, loc(5, 5));
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, loc(5, 5));
    const events = startBuildStructure(state, unit.id, BuildingType.Bunker);
    expect(events).toHaveLength(0);
    expect(state.buildings).toHaveLength(0);
  });

  it("fails if structure already at location", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.Bunker, Owner.Player1);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, loc(5, 5));
    const events = startBuildStructure(state, unit.id, BuildingType.AntiAir);
    expect(events).toHaveLength(0);
  });

  it("fails if cannot afford", () => {
    const state = createTestState();
    state.resources[Owner.Player1] = [0, 0, 0];
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, loc(5, 5));
    const events = startBuildStructure(state, unit.id, BuildingType.Bunker);
    expect(events).toHaveLength(0);
  });

  it("engineer boat builds bridge on water", () => {
    const state = createTestState();
    setWater(state, loc(5, 5));
    // Need Sci 2 for Bridge
    grantTech(state, Owner.Player1, TechType.Science, 30);
    const unit = createUnit(state, UnitType.EngineerBoat, Owner.Player1, loc(5, 5));
    const events = startBuildStructure(state, unit.id, BuildingType.Bridge);
    expect(events).toHaveLength(1);
    expect(state.buildings[0].type).toBe(BuildingType.Bridge);
  });

  it("engineer boat builds sea mine on water", () => {
    const state = createTestState();
    setWater(state, loc(5, 5));
    grantTech(state, Owner.Player1, TechType.War, 10); // War 1 for Sea Mine
    const unit = createUnit(state, UnitType.EngineerBoat, Owner.Player1, loc(5, 5));
    const events = startBuildStructure(state, unit.id, BuildingType.SeaMine);
    expect(events).toHaveLength(1);
    expect(state.buildings[0].type).toBe(BuildingType.SeaMine);
  });

  it("engineer boat cannot build on land", () => {
    const state = createTestState();
    grantTech(state, Owner.Player1, TechType.Science, 30);
    const unit = createUnit(state, UnitType.EngineerBoat, Owner.Player1, loc(5, 5));
    const events = startBuildStructure(state, unit.id, BuildingType.Bridge);
    expect(events).toHaveLength(0);
  });

  it("construction unit cannot build naval structures", () => {
    const state = createTestState();
    setWater(state, loc(5, 5));
    grantTech(state, Owner.Player1, TechType.Science, 30);
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, loc(5, 5));
    const events = startBuildStructure(state, unit.id, BuildingType.Bridge);
    expect(events).toHaveLength(0);
  });
});

// ─── Tech Gating Tests ──────────────────────────────────────────────────────

describe("structure tech gating", () => {
  it("bunker has no tech requirement", () => {
    const state = createTestState();
    expect(canBuildStructure(state, Owner.Player1, BuildingType.Bunker)).toBe(true);
  });

  it("anti-air requires Sci 3", () => {
    const state = createTestState();
    expect(canBuildStructure(state, Owner.Player1, BuildingType.AntiAir)).toBe(false);
    grantTech(state, Owner.Player1, TechType.Science, 60); // Sci 3
    expect(canBuildStructure(state, Owner.Player1, BuildingType.AntiAir)).toBe(true);
  });

  it("coastal battery requires Sci 4", () => {
    const state = createTestState();
    expect(canBuildStructure(state, Owner.Player1, BuildingType.CoastalBattery)).toBe(false);
    grantTech(state, Owner.Player1, TechType.Science, 100); // Sci 4
    expect(canBuildStructure(state, Owner.Player1, BuildingType.CoastalBattery)).toBe(true);
  });

  it("radar station requires Elec 2", () => {
    const state = createTestState();
    expect(canBuildStructure(state, Owner.Player1, BuildingType.RadarStation)).toBe(false);
    grantTech(state, Owner.Player1, TechType.Electronics, 30); // Elec 2
    expect(canBuildStructure(state, Owner.Player1, BuildingType.RadarStation)).toBe(true);
  });

  it("artillery fort requires War 3", () => {
    const state = createTestState();
    expect(canBuildStructure(state, Owner.Player1, BuildingType.ArtilleryFort)).toBe(false);
    grantTech(state, Owner.Player1, TechType.War, 60); // War 3
    expect(canBuildStructure(state, Owner.Player1, BuildingType.ArtilleryFort)).toBe(true);
  });

  it("minefield requires War 1", () => {
    const state = createTestState();
    expect(canBuildStructure(state, Owner.Player1, BuildingType.Minefield)).toBe(false);
    grantTech(state, Owner.Player1, TechType.War, 10); // War 1
    expect(canBuildStructure(state, Owner.Player1, BuildingType.Minefield)).toBe(true);
  });

  it("SAM site requires Elec 4", () => {
    const state = createTestState();
    expect(canBuildStructure(state, Owner.Player1, BuildingType.SAMSite)).toBe(false);
    grantTech(state, Owner.Player1, TechType.Electronics, 100); // Elec 4
    expect(canBuildStructure(state, Owner.Player1, BuildingType.SAMSite)).toBe(true);
  });

  it("bridge requires Sci 2", () => {
    const state = createTestState();
    expect(canBuildStructure(state, Owner.Player1, BuildingType.Bridge)).toBe(false);
    grantTech(state, Owner.Player1, TechType.Science, 30); // Sci 2
    expect(canBuildStructure(state, Owner.Player1, BuildingType.Bridge)).toBe(true);
  });

  it("offshore platform requires Sci 3", () => {
    const state = createTestState();
    expect(canBuildStructure(state, Owner.Player1, BuildingType.OffshorePlatform)).toBe(false);
    grantTech(state, Owner.Player1, TechType.Science, 60); // Sci 3
    expect(canBuildStructure(state, Owner.Player1, BuildingType.OffshorePlatform)).toBe(true);
  });
});

// ─── Structure Construction Tick ─────────────────────────────────────────────

describe("structure construction tick", () => {
  it("structure completes and consumes constructor", () => {
    const state = createTestState();
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, loc(5, 5));
    startBuildStructure(state, unit.id, BuildingType.Bunker);
    const building = state.buildings[0];
    expect(building.buildTime).toBe(4);

    // Tick 4 times
    for (let i = 0; i < 4; i++) {
      tickBuildingConstruction(state);
    }

    expect(building.complete).toBe(true);
    expect(building.constructorId).toBeNull();
    // Constructor should be consumed
    expect(findUnit(state, unit.id)).toBeUndefined();
  });

  it("engineer boat is consumed when naval structure completes", () => {
    const state = createTestState();
    setWater(state, loc(5, 5));
    grantTech(state, Owner.Player1, TechType.Science, 30);
    const unit = createUnit(state, UnitType.EngineerBoat, Owner.Player1, loc(5, 5));
    startBuildStructure(state, unit.id, BuildingType.Bridge);
    const building = state.buildings[0];

    for (let i = 0; i < building.buildTime; i++) {
      tickBuildingConstruction(state);
    }

    expect(building.complete).toBe(true);
    expect(findUnit(state, unit.id)).toBeUndefined();
  });
});

// ─── Structure Destruction ──────────────────────────────────────────────────

describe("destroyBuilding", () => {
  it("removes structure from buildings array", () => {
    const state = createTestState();
    const structure = addCompletedStructure(state, loc(5, 5), BuildingType.Bunker, Owner.Player1);
    expect(state.buildings).toHaveLength(1);
    destroyBuilding(state, structure.id);
    expect(state.buildings).toHaveLength(0);
  });

  it("returns destruction event", () => {
    const state = createTestState();
    const structure = addCompletedStructure(state, loc(5, 5), BuildingType.Bunker, Owner.Player1);
    const events = destroyBuilding(state, structure.id);
    expect(events.some((e) => e.type === "structure")).toBe(true);
  });
});

// ─── Bombard Structure ──────────────────────────────────────────────────────

describe("bombardStructure", () => {
  it("deals damage to structure", () => {
    const state = createTestState();
    const structure = addCompletedStructure(state, loc(5, 5), BuildingType.Bunker, Owner.Player2);
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, loc(5, 3));
    grantTech(state, Owner.Player1, TechType.War, 30); // War 2 for artillery

    const hpBefore = structure.hp;
    bombardStructure(state, artillery, structure);
    expect(structure.hp).toBeLessThan(hpBefore);
  });

  it("destroys structure when HP reaches 0", () => {
    const state = createTestState();
    const structure = addCompletedStructure(state, loc(5, 5), BuildingType.RadarStation, Owner.Player2);
    structure.hp = 1; // low HP
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, loc(5, 3));
    grantTech(state, Owner.Player1, TechType.War, 30);

    const events = bombardStructure(state, artillery, structure);
    expect(state.buildings).toHaveLength(0);
    expect(events.some((e) => e.type === "combat")).toBe(true);
  });

  it("bombard action targets structures when no unit present", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.Bunker, Owner.Player2);
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, loc(5, 3));
    grantTech(state, Owner.Player1, TechType.War, 30);

    const events = processAction(state, {
      type: "bombard", unitId: artillery.id, targetLoc: loc(5, 5),
    }, Owner.Player1);
    expect(events.length).toBeGreaterThan(0);
    expect(state.buildings[0].hp).toBeLessThan(5);
  });
});

// ─── Mine Trigger Tests ─────────────────────────────────────────────────────

describe("mine trigger", () => {
  it("minefield triggers when enemy army enters", () => {
    const state = createTestState();
    grantTech(state, Owner.Player2, TechType.War, 10);
    addCompletedStructure(state, loc(5, 6), BuildingType.Minefield, Owner.Player2);
    const army = createUnit(state, UnitType.Army, Owner.Player1, loc(5, 5));
    // Give army extra HP so it survives
    army.hits = 5;

    const events = checkMineTrigger(state, army);
    // Mine shouldn't trigger — army is not at mine location yet
    expect(events).toHaveLength(0);

    // Move army to mine location
    processAction(state, { type: "move", unitId: army.id, loc: loc(5, 6) }, Owner.Player1);

    // Mine should have triggered
    expect(state.buildings.filter((b) => b.type === BuildingType.Minefield)).toHaveLength(0);
  });

  it("mine destroys 1-HP army", () => {
    const state = createTestState();
    grantTech(state, Owner.Player2, TechType.War, 10);
    addCompletedStructure(state, loc(5, 6), BuildingType.Minefield, Owner.Player2);
    const army = createUnit(state, UnitType.Army, Owner.Player1, loc(5, 5));

    processAction(state, { type: "move", unitId: army.id, loc: loc(5, 6) }, Owner.Player1);

    // Army should be dead (mine str 2, army HP 1)
    expect(findUnit(state, army.id)).toBeUndefined();
    // Mine consumed
    expect(state.buildings).toHaveLength(0);
  });

  it("sea mine triggers on ship entering water tile", () => {
    const state = createTestState();
    setWater(state, loc(5, 5));
    setWater(state, loc(5, 6));
    grantTech(state, Owner.Player2, TechType.War, 10);
    addCompletedStructure(state, loc(5, 6), BuildingType.SeaMine, Owner.Player2);
    const patrol = createUnit(state, UnitType.Patrol, Owner.Player1, loc(5, 5));

    processAction(state, { type: "move", unitId: patrol.id, loc: loc(5, 6) }, Owner.Player1);

    // Patrol has 1 HP, sea mine str 3 → patrol destroyed
    expect(findUnit(state, patrol.id)).toBeUndefined();
    expect(state.buildings).toHaveLength(0);
  });

  it("mine does not trigger on own units", () => {
    const state = createTestState();
    grantTech(state, Owner.Player1, TechType.War, 10);
    addCompletedStructure(state, loc(5, 6), BuildingType.Minefield, Owner.Player1);
    const army = createUnit(state, UnitType.Army, Owner.Player1, loc(5, 5));

    processAction(state, { type: "move", unitId: army.id, loc: loc(5, 6) }, Owner.Player1);

    // Mine should NOT trigger on own unit
    expect(state.buildings).toHaveLength(1);
    expect(findUnit(state, army.id)).toBeDefined();
  });

  it("mine does not trigger on wrong unit type", () => {
    const state = createTestState();
    grantTech(state, Owner.Player2, TechType.War, 10);
    // Land minefield doesn't target sea units
    setWater(state, loc(5, 6));
    addCompletedStructure(state, loc(5, 6), BuildingType.Minefield, Owner.Player2);
    const patrol = createUnit(state, UnitType.Patrol, Owner.Player1, loc(5, 5));
    setWater(state, loc(5, 5));

    processAction(state, { type: "move", unitId: patrol.id, loc: loc(5, 6) }, Owner.Player1);

    // Minefield targets land only, patrol is sea → no trigger
    expect(state.buildings).toHaveLength(1);
  });
});

// ─── Auto-Attack Tests ──────────────────────────────────────────────────────

describe("autoAttackStructures", () => {
  it("bunker auto-attacks adjacent enemy army", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.Bunker, Owner.Player1);
    const enemy = createUnit(state, UnitType.Army, Owner.Player2, loc(5, 6));
    enemy.hits = 5; // extra HP to survive

    const events = autoAttackStructures(state, Owner.Player1);
    expect(events.length).toBeGreaterThan(0);
    expect(enemy.hits).toBe(3); // 5 - 2 (bunker strength)
  });

  it("bunker does not attack non-adjacent enemies", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.Bunker, Owner.Player1);
    createUnit(state, UnitType.Army, Owner.Player2, loc(5, 8));

    const events = autoAttackStructures(state, Owner.Player1);
    expect(events).toHaveLength(0);
  });

  it("anti-air attacks fighters within 2 tiles", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.AntiAir, Owner.Player1);
    const fighter = createUnit(state, UnitType.Fighter, Owner.Player2, loc(5, 7));

    const events = autoAttackStructures(state, Owner.Player1);
    expect(events.length).toBeGreaterThan(0);
    // Fighter has 1 HP, anti-air str 3 → fighter destroyed
    expect(findUnit(state, fighter.id)).toBeUndefined();
  });

  it("anti-air does not attack land units", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.AntiAir, Owner.Player1);
    createUnit(state, UnitType.Army, Owner.Player2, loc(5, 6));

    const events = autoAttackStructures(state, Owner.Player1);
    expect(events).toHaveLength(0);
  });

  it("coastal battery attacks ships within 2 tiles", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.CoastalBattery, Owner.Player1);
    setWater(state, loc(5, 7));
    const destroyer = createUnit(state, UnitType.Destroyer, Owner.Player2, loc(5, 7));

    const events = autoAttackStructures(state, Owner.Player1);
    expect(events.length).toBeGreaterThan(0);
    expect(destroyer.hits).toBeLessThan(3); // destroyer has 3 HP, battery str 4
  });

  it("artillery fort attacks land units within 3 tiles", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.ArtilleryFort, Owner.Player1);
    const army = createUnit(state, UnitType.Army, Owner.Player2, loc(5, 8));
    army.hits = 10;

    const events = autoAttackStructures(state, Owner.Player1);
    expect(events.length).toBeGreaterThan(0);
    expect(army.hits).toBe(5); // 10 - 5 (fort strength)
  });

  it("does not attack own units", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.Bunker, Owner.Player1);
    createUnit(state, UnitType.Army, Owner.Player1, loc(5, 6));

    const events = autoAttackStructures(state, Owner.Player1);
    expect(events).toHaveLength(0);
  });

  it("SAM site attacks air within 3 tiles", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.SAMSite, Owner.Player1);
    const awacs = createUnit(state, UnitType.AWACS, Owner.Player2, loc(5, 8));

    const events = autoAttackStructures(state, Owner.Player1);
    expect(events.length).toBeGreaterThan(0);
    expect(findUnit(state, awacs.id)).toBeUndefined(); // AWACS 1 HP, SAM str 5
  });

  it("radar station does not auto-attack (strength 0)", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.RadarStation, Owner.Player1);
    createUnit(state, UnitType.Army, Owner.Player2, loc(5, 6));

    const events = autoAttackStructures(state, Owner.Player1);
    expect(events).toHaveLength(0);
  });
});

// ─── Bridge Tests ───────────────────────────────────────────────────────────

describe("bridge traversal", () => {
  it("army can cross water tile with bridge", () => {
    const state = createTestState();
    setWater(state, loc(5, 6));
    addCompletedStructure(state, loc(5, 6), BuildingType.Bridge, Owner.Player1);
    const army = createUnit(state, UnitType.Army, Owner.Player1, loc(5, 5));

    expect(goodLoc(state, army, loc(5, 6))).toBe(true);
  });

  it("army cannot cross water tile without bridge", () => {
    const state = createTestState();
    setWater(state, loc(5, 6));
    const army = createUnit(state, UnitType.Army, Owner.Player1, loc(5, 5));

    expect(goodLoc(state, army, loc(5, 6))).toBe(false);
  });

  it("ship can still move through bridge tile", () => {
    const state = createTestState();
    setWater(state, loc(5, 5));
    setWater(state, loc(5, 6));
    addCompletedStructure(state, loc(5, 6), BuildingType.Bridge, Owner.Player1);
    const patrol = createUnit(state, UnitType.Patrol, Owner.Player1, loc(5, 5));

    expect(goodLoc(state, patrol, loc(5, 6))).toBe(true);
  });

  it("findBridgeAtLoc returns bridge at location", () => {
    const state = createTestState();
    setWater(state, loc(5, 6));
    addCompletedStructure(state, loc(5, 6), BuildingType.Bridge, Owner.Player1);

    expect(findBridgeAtLoc(state, loc(5, 6))).toBeDefined();
    expect(findBridgeAtLoc(state, loc(5, 5))).toBeUndefined();
  });

  it("destroying bridge traps army on water", () => {
    const state = createTestState();
    setWater(state, loc(5, 6));
    const bridge = addCompletedStructure(state, loc(5, 6), BuildingType.Bridge, Owner.Player1);
    const army = createUnit(state, UnitType.Army, Owner.Player1, loc(5, 5));

    // Move army onto bridge
    processAction(state, { type: "move", unitId: army.id, loc: loc(5, 6) }, Owner.Player1);
    expect(army.loc).toBe(loc(5, 6));

    // Destroy bridge
    destroyBuilding(state, bridge.id);
    expect(findBridgeAtLoc(state, loc(5, 6))).toBeUndefined();
  });
});

// ─── Radar Vision Tests ─────────────────────────────────────────────────────

describe("radar station vision", () => {
  it("scanStructureVision reveals tiles in radar radius", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(10, 10), BuildingType.RadarStation, Owner.Player1);

    scanStructureVision(state, Owner.Player1);

    // Check that tiles within 5+1=6 Chebyshev distance are revealed
    const vm = state.viewMaps[Owner.Player1];
    expect(vm[loc(10, 10)].seen).toBe(state.turn);
    expect(vm[loc(10, 14)].seen).toBe(state.turn); // 4 tiles away
  });
});

// ─── Offshore Platform Tests ────────────────────────────────────────────────

describe("offshore platform income", () => {
  it("produces 1 oil per turn", () => {
    const state = createTestState();
    setWater(state, loc(5, 5));
    addCompletedStructure(state, loc(5, 5), BuildingType.OffshorePlatform, Owner.Player1);
    const oilBefore = state.resources[Owner.Player1][ResourceType.Oil];

    collectPlatformIncome(state, Owner.Player1);

    expect(state.resources[Owner.Player1][ResourceType.Oil]).toBe(oilBefore + 1);
  });

  it("multiple platforms stack income", () => {
    const state = createTestState();
    setWater(state, loc(5, 5));
    setWater(state, loc(5, 6));
    addCompletedStructure(state, loc(5, 5), BuildingType.OffshorePlatform, Owner.Player1);
    addCompletedStructure(state, loc(5, 6), BuildingType.OffshorePlatform, Owner.Player1);
    const oilBefore = state.resources[Owner.Player1][ResourceType.Oil];

    collectPlatformIncome(state, Owner.Player1);

    expect(state.resources[Owner.Player1][ResourceType.Oil]).toBe(oilBefore + 2);
  });
});

// ─── Process Action buildStructure ──────────────────────────────────────────

describe("processAction buildStructure", () => {
  it("handles buildStructure action for construction unit", () => {
    const state = createTestState();
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, loc(5, 5));

    const events = processAction(state, {
      type: "buildStructure", unitId: unit.id, buildingType: BuildingType.Bunker,
    }, Owner.Player1);

    expect(events).toHaveLength(1);
    expect(state.buildings).toHaveLength(1);
  });

  it("handles buildStructure action for engineer boat", () => {
    const state = createTestState();
    setWater(state, loc(5, 5));
    grantTech(state, Owner.Player1, TechType.War, 10);
    const unit = createUnit(state, UnitType.EngineerBoat, Owner.Player1, loc(5, 5));

    const events = processAction(state, {
      type: "buildStructure", unitId: unit.id, buildingType: BuildingType.SeaMine,
    }, Owner.Player1);

    expect(events).toHaveLength(1);
    expect(state.buildings).toHaveLength(1);
  });

  it("rejects buildStructure from non-builder unit", () => {
    const state = createTestState();
    const unit = createUnit(state, UnitType.Army, Owner.Player1, loc(5, 5));

    const events = processAction(state, {
      type: "buildStructure", unitId: unit.id, buildingType: BuildingType.Bunker,
    }, Owner.Player1);

    expect(events).toHaveLength(0);
    expect(state.buildings).toHaveLength(0);
  });
});

// ─── ExecuteTurn Integration ────────────────────────────────────────────────

describe("executeTurn with structures", () => {
  it("structures auto-attack during turn execution", () => {
    const state = createTestState();
    // Need cities for both players to avoid endgame
    addCity(state, loc(0, 0), Owner.Player1);
    addCity(state, loc(19, 19), Owner.Player2);

    addCompletedStructure(state, loc(5, 5), BuildingType.Bunker, Owner.Player1);
    const enemy = createUnit(state, UnitType.Army, Owner.Player2, loc(5, 6));
    enemy.hits = 10;

    const result = executeTurn(state, new Map([[1, []], [2, []]]));
    // Bunker should have fired at enemy
    expect(enemy.hits).toBeLessThan(10);
  });

  it("platform income collected during turn", () => {
    const state = createTestState();
    addCity(state, loc(0, 0), Owner.Player1);
    addCity(state, loc(19, 19), Owner.Player2);
    setWater(state, loc(5, 5));
    addCompletedStructure(state, loc(5, 5), BuildingType.OffshorePlatform, Owner.Player1);

    const oilBefore = state.resources[Owner.Player1][ResourceType.Oil];
    executeTurn(state, new Map([[1, []], [2, []]]));
    expect(state.resources[Owner.Player1][ResourceType.Oil]).toBeGreaterThan(oilBefore);
  });
});

// ─── Helper Function Tests ──────────────────────────────────────────────────

describe("structure helper functions", () => {
  it("findStructureAtLoc finds completed structure", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.Bunker, Owner.Player1);

    expect(findStructureAtLoc(state, loc(5, 5))).toBeDefined();
    expect(findStructureAtLoc(state, loc(5, 6))).toBeUndefined();
  });

  it("findStructureAtLoc filters by owner", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.Bunker, Owner.Player1);

    expect(findStructureAtLoc(state, loc(5, 5), Owner.Player1)).toBeDefined();
    expect(findStructureAtLoc(state, loc(5, 5), Owner.Player2)).toBeUndefined();
  });

  it("findOwnerStructures returns all structures for owner", () => {
    const state = createTestState();
    addCompletedStructure(state, loc(5, 5), BuildingType.Bunker, Owner.Player1);
    addCompletedStructure(state, loc(6, 6), BuildingType.AntiAir, Owner.Player1);
    addCompletedStructure(state, loc(7, 7), BuildingType.Bunker, Owner.Player2);

    expect(findOwnerStructures(state, Owner.Player1)).toHaveLength(2);
    expect(findOwnerStructures(state, Owner.Player2)).toHaveLength(1);
  });

  it("isAirUnit correctly identifies air units", () => {
    expect(isAirUnit(UnitType.Fighter)).toBe(true);
    expect(isAirUnit(UnitType.AWACS)).toBe(true);
    expect(isAirUnit(UnitType.Army)).toBe(false);
  });

  it("isSeaUnit correctly identifies sea units", () => {
    expect(isSeaUnit(UnitType.Destroyer)).toBe(true);
    expect(isSeaUnit(UnitType.Transport)).toBe(true);
    expect(isSeaUnit(UnitType.Army)).toBe(false);
  });

  it("isLandUnit correctly identifies land units", () => {
    expect(isLandUnit(UnitType.Army)).toBe(true);
    expect(isLandUnit(UnitType.Construction)).toBe(true);
    expect(isLandUnit(UnitType.Destroyer)).toBe(false);
  });
});
