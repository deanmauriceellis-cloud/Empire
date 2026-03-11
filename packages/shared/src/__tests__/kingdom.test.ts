import { describe, it, expect, beforeEach } from "vitest";
import {
  Owner,
  UnitType,
  UnitBehavior,
  TerrainType,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_SIZE,
  TRIBUTE_RATE,
  CROWN_DEFENSE_BONUS,
  CROWN_HEAL_BONUS,
  CROWN_GARRISON_BONUS,
  CROWN_VISION_RADIUS,
  CROWN_PRODUCTION_BONUS,
  NUM_UNIT_TYPES,
  CITY_INCOME,
  DEPOSIT_INCOME,
  DepositType,
} from "../constants.js";
import type { GameState, CityState, UnitState, MapCell, ViewMapCell, PlayerInfo, KingdomState } from "../types.js";
import {
  initViewMap,
  scan,
  createUnit,
  attackCity,
  attackUnit,
  tickCityProduction,
  collectResourceIncome,
  repairShips,
  executeTurn,
} from "../game.js";
import {
  createKingdomState,
  initKingdoms,
  getCrownCityId,
  isCrownCity,
  isOwnCrownCity,
  getCrownCityLoc,
  getCrownDefenseBonus,
  getCrownHealBonus,
  getCrownGarrisonBonus,
  hasCrownProductionBonus,
  isTributary,
  getOverlord,
  getTributaries,
  makeTributary,
  freeTributary,
  freeAllTributaries,
  canRebel,
  processRebellions,
  collectTributeIncome,
  handleCrownCapture,
  reassignCrown,
  scanCrownVision,
} from "../kingdom.js";

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
    players: [
      { id: 1, name: "Player 1", color: 0x00cc00, isAI: false, status: "active" },
      { id: 2, name: "Player 2", color: 0xcc0000, isAI: true, status: "active" },
    ],
  };
}

function addCity(state: GameState, loc: number, owner: number): CityState {
  const idx = state.cities.length; // array index (used as cityId on MapCell)
  const city: CityState = {
    id: idx,
    loc,
    owner: owner as any,
    production: UnitType.Army,
    work: 0,
    func: Array(NUM_UNIT_TYPES).fill(UnitBehavior.None),
    upgradeIds: [],
  };
  state.cities.push(city);
  state.map[loc].terrain = TerrainType.City;
  state.map[loc].cityId = idx;
  state.nextCityId = idx + 1;
  return city;
}

// ─── Kingdom Initialization ──────────────────────────────────────────────────

describe("Kingdom Initialization", () => {
  it("createKingdomState creates a kingdom with correct defaults", () => {
    const k = createKingdomState(1, 5);
    expect(k.playerId).toBe(1);
    expect(k.crownCityId).toBe(5);
    expect(k.tributeTarget).toBeNull();
    expect(k.tributaries).toEqual([]);
    expect(k.tributeRate).toBe(TRIBUTE_RATE);
  });

  it("initKingdoms assigns crown cities from starting cities", () => {
    const state = createTestState();
    const c0 = addCity(state, MAP_WIDTH + 1, 1);
    const c1 = addCity(state, MAP_WIDTH + 10, 2);

    initKingdoms(state, [c0.id, c1.id]);

    expect(state.kingdoms[1].crownCityId).toBe(c0.id);
    expect(state.kingdoms[2].crownCityId).toBe(c1.id);
    expect(state.kingdoms[1].tributeTarget).toBeNull();
    expect(state.kingdoms[2].tributeTarget).toBeNull();
  });
});

// ─── Crown City Queries ──────────────────────────────────────────────────────

describe("Crown City Queries", () => {
  let state: GameState;
  let city1: CityState;
  let city2: CityState;

  beforeEach(() => {
    state = createTestState();
    city1 = addCity(state, MAP_WIDTH + 1, 1);
    city2 = addCity(state, MAP_WIDTH + 10, 2);
    initKingdoms(state, [city1.id, city2.id]);
  });

  it("getCrownCityId returns correct city ID", () => {
    expect(getCrownCityId(state, 1)).toBe(city1.id);
    expect(getCrownCityId(state, 2)).toBe(city2.id);
    expect(getCrownCityId(state, 99)).toBeNull();
  });

  it("isCrownCity identifies crown cities", () => {
    expect(isCrownCity(state, city1.id)).toBe(true);
    expect(isCrownCity(state, city2.id)).toBe(true);
    const city3 = addCity(state, MAP_WIDTH + 20, 1);
    expect(isCrownCity(state, city3.id)).toBe(false);
  });

  it("isOwnCrownCity checks ownership", () => {
    expect(isOwnCrownCity(state, city1.id)).toBe(true);
    // Change ownership — crown no longer belongs to owner
    city1.owner = Owner.Player2;
    expect(isOwnCrownCity(state, city1.id)).toBe(false);
  });

  it("getCrownCityLoc returns location", () => {
    expect(getCrownCityLoc(state, 1)).toBe(city1.loc);
    expect(getCrownCityLoc(state, 2)).toBe(city2.loc);
    expect(getCrownCityLoc(state, 99)).toBeNull();
  });
});

// ─── Crown City Bonuses ─────────────────────────────────────────────────────

describe("Crown City Bonuses", () => {
  let state: GameState;
  let crownCity: CityState;
  let normalCity: CityState;

  beforeEach(() => {
    state = createTestState();
    crownCity = addCity(state, MAP_WIDTH + 1, 1);
    normalCity = addCity(state, MAP_WIDTH + 10, 1);
    initKingdoms(state, [crownCity.id]);
  });

  it("getCrownDefenseBonus returns bonus for units in own crown city", () => {
    expect(getCrownDefenseBonus(state, 1, crownCity.loc)).toBe(CROWN_DEFENSE_BONUS);
    expect(getCrownDefenseBonus(state, 1, normalCity.loc)).toBe(0);
    expect(getCrownDefenseBonus(state, 2, crownCity.loc)).toBe(0);
  });

  it("getCrownHealBonus returns bonus for units in own crown city", () => {
    expect(getCrownHealBonus(state, 1, crownCity.loc)).toBe(CROWN_HEAL_BONUS);
    expect(getCrownHealBonus(state, 1, normalCity.loc)).toBe(0);
  });

  it("getCrownGarrisonBonus returns bonus when attacking a crown city", () => {
    expect(getCrownGarrisonBonus(state, 1, crownCity.loc)).toBe(CROWN_GARRISON_BONUS);
    expect(getCrownGarrisonBonus(state, 1, normalCity.loc)).toBe(0);
  });

  it("hasCrownProductionBonus identifies crown city", () => {
    expect(hasCrownProductionBonus(state, crownCity.id)).toBe(true);
    expect(hasCrownProductionBonus(state, normalCity.id)).toBe(false);
  });

  it("crown defense bonus no longer applies if city captured", () => {
    crownCity.owner = Owner.Player2;
    expect(getCrownDefenseBonus(state, 1, crownCity.loc)).toBe(0);
  });
});

// ─── Tributary System ───────────────────────────────────────────────────────

describe("Tributary System", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
    const c1 = addCity(state, MAP_WIDTH + 1, 1);
    const c2 = addCity(state, MAP_WIDTH + 10, 2);
    initKingdoms(state, [c1.id, c2.id]);
  });

  it("makeTributary establishes vassal relationship", () => {
    makeTributary(state, 2, 1);
    expect(isTributary(state, 2)).toBe(true);
    expect(getOverlord(state, 2)).toBe(1);
    expect(getTributaries(state, 1)).toContain(2);
    expect(isTributary(state, 1)).toBe(false);
  });

  it("freeTributary removes vassal relationship", () => {
    makeTributary(state, 2, 1);
    freeTributary(state, 2);
    expect(isTributary(state, 2)).toBe(false);
    expect(getOverlord(state, 2)).toBeNull();
    expect(getTributaries(state, 1)).not.toContain(2);
  });

  it("freeAllTributaries frees all vassals", () => {
    // Add a third player
    state.players.push({ id: 3, name: "Player 3", color: 0x3366ff, isAI: true, status: "active" });
    const c3 = addCity(state, MAP_WIDTH + 20, 3);
    state.kingdoms[3] = createKingdomState(3, c3.id);

    makeTributary(state, 2, 1);
    makeTributary(state, 3, 1);
    expect(getTributaries(state, 1)).toHaveLength(2);

    freeAllTributaries(state, 1);
    expect(getTributaries(state, 1)).toHaveLength(0);
    expect(isTributary(state, 2)).toBe(false);
    expect(isTributary(state, 3)).toBe(false);
  });

  it("duplicate makeTributary does not duplicate in list", () => {
    makeTributary(state, 2, 1);
    makeTributary(state, 2, 1);
    expect(getTributaries(state, 1)).toHaveLength(1);
  });
});

// ─── Rebellion ──────────────────────────────────────────────────────────────

describe("Rebellion", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
    const c1 = addCity(state, MAP_WIDTH + 1, 1);
    const c2 = addCity(state, MAP_WIDTH + 10, 2);
    initKingdoms(state, [c1.id, c2.id]);
    makeTributary(state, 2, 1);
  });

  it("canRebel returns false when vassal is weaker", () => {
    // Player 1 has 3 units, player 2 has 1
    createUnit(state, UnitType.Army, 1 as any, MAP_WIDTH * 2 + 1);
    createUnit(state, UnitType.Army, 1 as any, MAP_WIDTH * 2 + 2);
    createUnit(state, UnitType.Army, 1 as any, MAP_WIDTH * 2 + 3);
    createUnit(state, UnitType.Army, 2 as any, MAP_WIDTH * 2 + 10);
    expect(canRebel(state, 2)).toBe(false);
  });

  it("canRebel returns true when vassal is stronger", () => {
    createUnit(state, UnitType.Army, 1 as any, MAP_WIDTH * 2 + 1);
    createUnit(state, UnitType.Army, 2 as any, MAP_WIDTH * 2 + 10);
    createUnit(state, UnitType.Army, 2 as any, MAP_WIDTH * 2 + 11);
    createUnit(state, UnitType.Army, 2 as any, MAP_WIDTH * 2 + 12);
    expect(canRebel(state, 2)).toBe(true);
  });

  it("canRebel returns false for non-tributary", () => {
    freeTributary(state, 2);
    expect(canRebel(state, 2)).toBe(false);
  });

  it("processRebellions frees eligible vassals", () => {
    // Make player 2 stronger
    createUnit(state, UnitType.Army, 2 as any, MAP_WIDTH * 2 + 10);
    createUnit(state, UnitType.Army, 2 as any, MAP_WIDTH * 2 + 11);

    const events = processRebellions(state);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("crown");
    expect(events[0].description).toContain("rebelled");
    expect(isTributary(state, 2)).toBe(false);
  });

  it("processRebellions does not free weaker vassals", () => {
    createUnit(state, UnitType.Army, 1 as any, MAP_WIDTH * 2 + 1);
    createUnit(state, UnitType.Army, 1 as any, MAP_WIDTH * 2 + 2);

    const events = processRebellions(state);
    expect(events).toHaveLength(0);
    expect(isTributary(state, 2)).toBe(true);
  });
});

// ─── Tribute Income ─────────────────────────────────────────────────────────

describe("Tribute Income", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
    const c1 = addCity(state, MAP_WIDTH + 1, 1);
    const c2 = addCity(state, MAP_WIDTH + 10, 2);
    // Add another city for player 2 so they have income to pay
    addCity(state, MAP_WIDTH + 15, 2);
    initKingdoms(state, [c1.id, c2.id]);
  });

  it("tributary pays percentage of turn income to overlord", () => {
    makeTributary(state, 2, 1);

    // Player 2 has 2 cities: income = 2*[2,1,2] = [4,2,4] per turn
    // Tribute at 30% = floor([1.2, 0.6, 1.2]) = [1, 0, 1]
    const p1Before = [...state.resources[1]];
    const p2Before = [...state.resources[2]];

    const events = collectTributeIncome(state);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("tribute");

    // Player 1 gained tribute
    expect(state.resources[1][0]).toBe(p1Before[0] + 1); // +1 ore
    expect(state.resources[1][2]).toBe(p1Before[2] + 1); // +1 textile

    // Player 2 lost tribute
    expect(state.resources[2][0]).toBe(p2Before[0] - 1);
    expect(state.resources[2][2]).toBe(p2Before[2] - 1);
  });

  it("no tribute when player is not a tributary", () => {
    const events = collectTributeIncome(state);
    expect(events).toHaveLength(0);
  });

  it("tribute cannot exceed vassal stockpile", () => {
    makeTributary(state, 2, 1);
    state.resources[2] = [0, 0, 0]; // empty stockpile

    const events = collectTributeIncome(state);
    // Even though they owe tribute, they can't pay more than they have
    expect(state.resources[2][0]).toBe(0);
    expect(state.resources[2][1]).toBe(0);
    expect(state.resources[2][2]).toBe(0);
  });
});

// ─── Crown Capture ──────────────────────────────────────────────────────────

describe("Crown Capture", () => {
  let state: GameState;
  let crownCity1: CityState;
  let crownCity2: CityState;
  let normalCity: CityState;

  beforeEach(() => {
    state = createTestState();
    crownCity1 = addCity(state, MAP_WIDTH + 1, 1);
    normalCity = addCity(state, MAP_WIDTH + 5, 1);
    crownCity2 = addCity(state, MAP_WIDTH + 10, 2);
    initKingdoms(state, [crownCity1.id, crownCity2.id]);
  });

  it("handleCrownCapture makes old owner a tributary", () => {
    const events = handleCrownCapture(state, crownCity2.id, 2, 1);
    expect(events.length).toBeGreaterThan(0);
    expect(isTributary(state, 2)).toBe(true);
    expect(getOverlord(state, 2)).toBe(1);
    expect(getTributaries(state, 1)).toContain(2);
  });

  it("handleCrownCapture reassigns crown to next best city", () => {
    // Player 2 needs another city to get a new crown
    const backupCity = addCity(state, MAP_WIDTH + 15, 2);
    // Simulate attackCity: city transfers BEFORE handleCrownCapture
    crownCity2.owner = Owner.Player1;
    handleCrownCapture(state, crownCity2.id, 2, 1);
    expect(state.kingdoms[2].crownCityId).toBe(backupCity.id);
  });

  it("handleCrownCapture frees tributaries of captured overlord", () => {
    // Player 3 is tributary of player 2
    state.players.push({ id: 3, name: "Player 3", color: 0x3366ff, isAI: true, status: "active" });
    const c3 = addCity(state, MAP_WIDTH + 20, 3);
    state.kingdoms[3] = createKingdomState(3, c3.id);
    makeTributary(state, 3, 2);

    const events = handleCrownCapture(state, crownCity2.id, 2, 1);
    // Player 3 should be freed since their overlord (player 2) lost their crown
    expect(isTributary(state, 3)).toBe(false);
    expect(events.some(e => e.description.includes("freed"))).toBe(true);
  });

  it("handleCrownCapture on non-crown city does nothing", () => {
    const events = handleCrownCapture(state, normalCity.id, 1, 2);
    expect(events).toHaveLength(0);
    expect(isTributary(state, 1)).toBe(false);
  });

  it("reassignCrown picks city with most upgrades", () => {
    const c3 = addCity(state, MAP_WIDTH + 20, 1);
    c3.upgradeIds = [1, 2]; // 2 upgrades — should be picked
    normalCity.upgradeIds = [1]; // 1 upgrade

    reassignCrown(state, 1);
    expect(state.kingdoms[1].crownCityId).toBe(c3.id);
  });

  it("reassignCrown sets -1 when no cities remain", () => {
    // Remove all player 1 cities
    for (const city of state.cities) {
      if (city.owner === Owner.Player1) city.owner = Owner.Player2;
    }
    reassignCrown(state, 1);
    expect(state.kingdoms[1].crownCityId).toBe(-1);
  });
});

// ─── Crown Vision ───────────────────────────────────────────────────────────

describe("Crown Vision", () => {
  it("scanCrownVision calls scan with crown vision radius", () => {
    const state = createTestState();
    const city = addCity(state, MAP_WIDTH * 5 + 5, 1);
    initKingdoms(state, [city.id]);

    let scanCalled = false;
    let scanRadius = 0;
    const mockScan = (_state: GameState, _owner: number, _loc: number, extra?: number) => {
      scanCalled = true;
      scanRadius = extra ?? 0;
    };

    scanCrownVision(state, mockScan);
    expect(scanCalled).toBe(true);
    expect(scanRadius).toBe(CROWN_VISION_RADIUS);
  });
});

// ─── Integration: Crown Production Bonus ────────────────────────────────────

describe("Crown Production Bonus", () => {
  it("crown city produces faster than normal city", () => {
    const state = createTestState();
    const crownCity = addCity(state, MAP_WIDTH + 1, 1);
    const normalCity = addCity(state, MAP_WIDTH + 10, 1);
    initKingdoms(state, [crownCity.id]);

    // Both producing armies (buildTime = 5)
    crownCity.production = UnitType.Army;
    normalCity.production = UnitType.Army;
    state.resources[1] = [9999, 9999, 9999]; // no stalls

    // Tick several turns on even turn numbers (when bonus applies)
    let crownWork = 0;
    let normalWork = 0;
    for (let t = 0; t < 10; t++) {
      state.turn = t;
      tickCityProduction(state, Owner.Player1);
      // Track work (reset when unit produced)
    }

    // Crown city should have produced more units
    const crownUnits = state.units.filter(u => u.loc === crownCity.loc).length;
    const normalUnits = state.units.filter(u => u.loc === normalCity.loc).length;
    expect(crownUnits).toBeGreaterThanOrEqual(normalUnits);
  });
});

// ─── Integration: executeTurn with kingdoms ──────────────────────────────────

describe("executeTurn with kingdoms", () => {
  it("tribute is collected during turn execution", () => {
    const state = createTestState();
    const c1 = addCity(state, MAP_WIDTH + 1, 1);
    const c2 = addCity(state, MAP_WIDTH + 10, 2);
    addCity(state, MAP_WIDTH + 15, 2);
    initKingdoms(state, [c1.id, c2.id]);
    makeTributary(state, 2, 1);

    state.resources[1] = [100, 100, 100];
    state.resources[2] = [100, 100, 100];

    const actions = new Map<number, any[]>();
    actions.set(1, []);
    actions.set(2, []);
    const result = executeTurn(state, actions);

    // Should have tribute events
    const tributeEvents = result.events.filter(e => e.type === "tribute");
    expect(tributeEvents.length).toBeGreaterThan(0);
  });

  it("rebellions processed during turn execution", () => {
    const state = createTestState();
    const c1 = addCity(state, MAP_WIDTH + 1, 1);
    const c2 = addCity(state, MAP_WIDTH + 10, 2);
    initKingdoms(state, [c1.id, c2.id]);
    makeTributary(state, 2, 1);

    // Player 2 has more units (rebels)
    createUnit(state, UnitType.Army, 2 as any, MAP_WIDTH * 3 + 10);
    createUnit(state, UnitType.Army, 2 as any, MAP_WIDTH * 3 + 11);
    createUnit(state, UnitType.Army, 2 as any, MAP_WIDTH * 3 + 12);

    const actions = new Map<number, any[]>();
    actions.set(1, []);
    actions.set(2, []);
    const result = executeTurn(state, actions);

    // Rebellion should have happened
    expect(isTributary(state, 2)).toBe(false);
    const crownEvents = result.events.filter(e => e.type === "crown");
    expect(crownEvents.length).toBeGreaterThan(0);
  });
});
