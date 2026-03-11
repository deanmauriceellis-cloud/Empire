import { describe, it, expect, beforeEach } from "vitest";
import {
  UnitType, Owner, TerrainType, UnitBehavior, TechType, INFINITY,
  UNIT_ATTRIBUTES,
  createUnit, processAction, bombardUnit, canBombard, chebyshevDist, scan,
  canProduceUnit, UNIT_TECH_REQUIREMENTS,
  getEffectiveStrength, getEffectiveMaxHp,
  configureMapDimensions, MAP_WIDTH, MAP_HEIGHT, MAP_SIZE,
} from "../index.js";
import type { GameState, MapCell, ViewMapCell, CityState, PlayerInfo } from "../index.js";

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
    players: [
      { id: 1, name: "Player 1", color: 0x00cc00, isAI: false, status: "active" as const },
      { id: 2, name: "Player 2", color: 0xcc0000, isAI: true, status: "active" as const },
    ],
  };
}

function addCity(state: GameState, loc: number, owner: Owner): CityState {
  const city: CityState = {
    id: state.nextCityId++,
    loc,
    owner,
    production: UnitType.Army,
    work: 0,
    func: new Array(15).fill(UnitBehavior.None),
    upgradeIds: [],
  };
  state.cities.push(city);
  state.map[loc].terrain = TerrainType.City;
  state.map[loc].cityId = city.id;
  return city;
}

function setWater(state: GameState, loc: number): void {
  state.map[loc].terrain = TerrainType.Sea;
}

// ─── New Unit Attributes ─────────────────────────────────────────────────────

describe("new unit attributes", () => {
  it("Artillery: land, speed 1, str 3, hp 2, attackRange 2", () => {
    const a = UNIT_ATTRIBUTES[UnitType.Artillery];
    expect(a.char).toBe("R");
    expect(a.terrain).toBe("+");
    expect(a.speed).toBe(1);
    expect(a.strength).toBe(3);
    expect(a.maxHits).toBe(2);
    expect(a.attackRange).toBe(2);
    expect(a.invisible).toBe(false);
  });

  it("Special Forces: land, speed 2, str 2, hp 1, invisible", () => {
    const sf = UNIT_ATTRIBUTES[UnitType.SpecialForces];
    expect(sf.char).toBe("X");
    expect(sf.terrain).toBe("+");
    expect(sf.speed).toBe(2);
    expect(sf.strength).toBe(2);
    expect(sf.maxHits).toBe(1);
    expect(sf.attackRange).toBe(0);
    expect(sf.invisible).toBe(true);
  });

  it("AWACS: air, speed 6, str 0, hp 1, range 48, visionRadius 5", () => {
    const w = UNIT_ATTRIBUTES[UnitType.AWACS];
    expect(w.char).toBe("W");
    expect(w.terrain).toBe(".+");
    expect(w.speed).toBe(6);
    expect(w.strength).toBe(0);
    expect(w.maxHits).toBe(1);
    expect(w.range).toBe(48);
    expect(w.visionRadius).toBe(5);
  });

  it("Missile Cruiser: sea, speed 2, str 4, hp 6, attackRange 3", () => {
    const mc = UNIT_ATTRIBUTES[UnitType.MissileCruiser];
    expect(mc.char).toBe("M");
    expect(mc.terrain).toBe(".");
    expect(mc.speed).toBe(2);
    expect(mc.strength).toBe(4);
    expect(mc.maxHits).toBe(6);
    expect(mc.attackRange).toBe(3);
  });

  it("Engineer Boat: sea, speed 2, str 0, hp 1", () => {
    const eb = UNIT_ATTRIBUTES[UnitType.EngineerBoat];
    expect(eb.char).toBe("G");
    expect(eb.terrain).toBe(".");
    expect(eb.speed).toBe(2);
    expect(eb.strength).toBe(0);
    expect(eb.maxHits).toBe(1);
    expect(eb.range).toBe(INFINITY);
  });
});

// ─── Tech Unlock Gating ─────────────────────────────────────────────────────

describe("unit tech requirements", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("Artillery requires War 2", () => {
    expect(canProduceUnit(state, Owner.Player1, UnitType.Artillery)).toBe(false);
    state.techResearch[Owner.Player1][TechType.War] = 30; // War level 2
    expect(canProduceUnit(state, Owner.Player1, UnitType.Artillery)).toBe(true);
  });

  it("Special Forces requires War 3", () => {
    expect(canProduceUnit(state, Owner.Player1, UnitType.SpecialForces)).toBe(false);
    state.techResearch[Owner.Player1][TechType.War] = 60; // War level 3
    expect(canProduceUnit(state, Owner.Player1, UnitType.SpecialForces)).toBe(true);
  });

  it("AWACS requires Electronics 2", () => {
    expect(canProduceUnit(state, Owner.Player1, UnitType.AWACS)).toBe(false);
    state.techResearch[Owner.Player1][TechType.Electronics] = 30;
    expect(canProduceUnit(state, Owner.Player1, UnitType.AWACS)).toBe(true);
  });

  it("Engineer Boat requires Science 2", () => {
    expect(canProduceUnit(state, Owner.Player1, UnitType.EngineerBoat)).toBe(false);
    state.techResearch[Owner.Player1][TechType.Science] = 30;
    expect(canProduceUnit(state, Owner.Player1, UnitType.EngineerBoat)).toBe(true);
  });

  it("Missile Cruiser requires War 4 + Electronics 3", () => {
    expect(canProduceUnit(state, Owner.Player1, UnitType.MissileCruiser)).toBe(false);
    state.techResearch[Owner.Player1][TechType.War] = 100; // War 4
    expect(canProduceUnit(state, Owner.Player1, UnitType.MissileCruiser)).toBe(false);
    state.techResearch[Owner.Player1][TechType.Electronics] = 60; // Elec 3
    expect(canProduceUnit(state, Owner.Player1, UnitType.MissileCruiser)).toBe(true);
  });

  it("existing units have no tech requirements", () => {
    expect(canProduceUnit(state, Owner.Player1, UnitType.Army)).toBe(true);
    expect(canProduceUnit(state, Owner.Player1, UnitType.Fighter)).toBe(true);
    expect(canProduceUnit(state, Owner.Player1, UnitType.Battleship)).toBe(true);
  });
});

// ─── Chebyshev Distance ─────────────────────────────────────────────────────

describe("chebyshevDist", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("same location = 0", () => {
    expect(chebyshevDist(state, 42, 42)).toBe(0);
  });

  it("adjacent = 1", () => {
    const loc = 5 * 20 + 5; // row 5, col 5
    expect(chebyshevDist(state, loc, loc + 1)).toBe(1); // east
    expect(chebyshevDist(state, loc, loc + 20)).toBe(1); // south
    expect(chebyshevDist(state, loc, loc + 21)).toBe(1); // southeast
  });

  it("distance 2", () => {
    const loc = 5 * 20 + 5;
    expect(chebyshevDist(state, loc, loc + 2)).toBe(2); // 2 east
    expect(chebyshevDist(state, loc, loc + 40)).toBe(2); // 2 south
    expect(chebyshevDist(state, loc, loc + 42)).toBe(2); // 2 south-east
  });
});

// ─── canBombard ──────────────────────────────────────────────────────────────

describe("canBombard", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
    // Give player War 2 tech so artillery can be built
    state.techResearch[Owner.Player1][TechType.War] = 30;
  });

  it("artillery can bombard at range 2", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    const targetLoc = 5 * 20 + 7; // 2 tiles east
    expect(canBombard(state, artillery, targetLoc)).toBe(true);
  });

  it("artillery cannot bombard adjacent (range must be > 1)", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    const targetLoc = 5 * 20 + 6; // 1 tile east
    expect(canBombard(state, artillery, targetLoc)).toBe(false);
  });

  it("artillery cannot bombard at range 3 (max range 2)", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    const targetLoc = 5 * 20 + 8; // 3 tiles east
    expect(canBombard(state, artillery, targetLoc)).toBe(false);
  });

  it("army cannot bombard (attackRange 0)", () => {
    const army = createUnit(state, UnitType.Army, Owner.Player1, 5 * 20 + 5);
    const targetLoc = 5 * 20 + 7;
    expect(canBombard(state, army, targetLoc)).toBe(false);
  });

  it("artillery cannot bombard when out of moves", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    artillery.moved = 1; // used its single move
    const targetLoc = 5 * 20 + 7;
    expect(canBombard(state, artillery, targetLoc)).toBe(false);
  });

  it("missile cruiser can bombard at range 3", () => {
    state.techResearch[Owner.Player1][TechType.War] = 100;
    state.techResearch[Owner.Player1][TechType.Electronics] = 60;
    // Put cruiser on water
    for (let i = 0; i < 400; i++) setWater(state, i);
    const cruiser = createUnit(state, UnitType.MissileCruiser, Owner.Player1, 5 * 20 + 5);
    const targetLoc = 5 * 20 + 8; // 3 tiles east
    expect(canBombard(state, cruiser, targetLoc)).toBe(true);
  });
});

// ─── bombardUnit ─────────────────────────────────────────────────────────────

describe("bombardUnit", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
    state.techResearch[Owner.Player1][TechType.War] = 30;
  });

  it("deals damage equal to attacker effective strength", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    const target = createUnit(state, UnitType.Battleship, Owner.Player2, 5 * 20 + 7);
    // Set water for battleship
    setWater(state, 5 * 20 + 7);
    const initialHp = target.hits;
    const events = bombardUnit(state, artillery, target);
    const expectedDmg = getEffectiveStrength(state, artillery);
    expect(target.hits).toBe(initialHp - expectedDmg);
    expect(events.length).toBe(1);
    expect(events[0].data?.bombard).toBe(true);
  });

  it("kills target when damage exceeds HP", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    const target = createUnit(state, UnitType.Army, Owner.Player2, 5 * 20 + 7);
    const events = bombardUnit(state, artillery, target);
    expect(events.length).toBe(2); // combat event + death event
    expect(events[0].data?.bombard).toBe(true);
    expect(state.units.find(u => u.id === target.id)).toBeUndefined();
  });

  it("does not move attacker to target location", () => {
    const artLoc = 5 * 20 + 5;
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, artLoc);
    const target = createUnit(state, UnitType.Army, Owner.Player2, 5 * 20 + 7);
    bombardUnit(state, artillery, target);
    expect(artillery.loc).toBe(artLoc); // didn't move
  });

  it("costs 1 move point", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    const target = createUnit(state, UnitType.Battleship, Owner.Player2, 5 * 20 + 7);
    setWater(state, 5 * 20 + 7);
    expect(artillery.moved).toBe(0);
    bombardUnit(state, artillery, target);
    expect(artillery.moved).toBe(1);
  });

  it("attacker takes no return damage", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    const target = createUnit(state, UnitType.Battleship, Owner.Player2, 5 * 20 + 7);
    setWater(state, 5 * 20 + 7);
    const initialHp = artillery.hits;
    bombardUnit(state, artillery, target);
    expect(artillery.hits).toBe(initialHp); // no damage taken
  });
});

// ─── processAction bombard ───────────────────────────────────────────────────

describe("processAction bombard", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
    state.techResearch[Owner.Player1][TechType.War] = 30;
  });

  it("processes bombard action", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    const target = createUnit(state, UnitType.Army, Owner.Player2, 5 * 20 + 7);
    const events = processAction(state, {
      type: "bombard", unitId: artillery.id, targetLoc: 5 * 20 + 7,
    }, Owner.Player1);
    expect(events.length).toBeGreaterThan(0);
  });

  it("rejects bombard from wrong owner", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    createUnit(state, UnitType.Army, Owner.Player1, 5 * 20 + 7);
    const events = processAction(state, {
      type: "bombard", unitId: artillery.id, targetLoc: 5 * 20 + 7,
    }, Owner.Player2);
    expect(events).toHaveLength(0);
  });

  it("rejects bombard at adjacent range", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    createUnit(state, UnitType.Army, Owner.Player2, 5 * 20 + 6);
    const events = processAction(state, {
      type: "bombard", unitId: artillery.id, targetLoc: 5 * 20 + 6,
    }, Owner.Player1);
    expect(events).toHaveLength(0);
  });

  it("rejects bombard when no enemy at target", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    const events = processAction(state, {
      type: "bombard", unitId: artillery.id, targetLoc: 5 * 20 + 7,
    }, Owner.Player1);
    expect(events).toHaveLength(0);
  });
});

// ─── Artillery melee restriction ─────────────────────────────────────────────

describe("artillery cannot melee", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
    state.techResearch[Owner.Player1][TechType.War] = 30;
  });

  it("rejects melee attack action from artillery", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    createUnit(state, UnitType.Army, Owner.Player2, 5 * 20 + 6);
    const events = processAction(state, {
      type: "attack", unitId: artillery.id, targetLoc: 5 * 20 + 6,
    }, Owner.Player1);
    expect(events).toHaveLength(0);
  });
});

// ─── Special Forces invisibility ─────────────────────────────────────────────

describe("special forces invisibility", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
    state.techResearch[Owner.Player1][TechType.War] = 60; // War 3 for spec ops
  });

  it("invisible unit appears as terrain on enemy viewMap when no adjacent units", () => {
    const specOps = createUnit(state, UnitType.SpecialForces, Owner.Player1, 5 * 20 + 10);
    // Manually scan for Player2 at the spec ops location
    // Import scan indirectly via the game module
    scan(state, Owner.Player2, 5 * 20 + 10);
    // Should see terrain, not the unit
    expect(state.viewMaps[Owner.Player2][5 * 20 + 10].contents).toBe("+");
  });

  it("invisible unit revealed when enemy unit is adjacent", () => {
    const specOps = createUnit(state, UnitType.SpecialForces, Owner.Player1, 5 * 20 + 10);
    // Place enemy unit adjacent
    createUnit(state, UnitType.Army, Owner.Player2, 5 * 20 + 11);
    scan(state, Owner.Player2, 5 * 20 + 10);
    // Should see the spec ops as lowercase 'x'
    expect(state.viewMaps[Owner.Player2][5 * 20 + 10].contents).toBe("x");
  });

  it("own invisible unit is always visible on own viewMap", () => {
    const specOps = createUnit(state, UnitType.SpecialForces, Owner.Player1, 5 * 20 + 10);
    scan(state, Owner.Player1, 5 * 20 + 10);
    // Owner should see their own spec ops
    expect(state.viewMaps[Owner.Player1][5 * 20 + 10].contents).toBe("X");
  });
});

// ─── AWACS vision ────────────────────────────────────────────────────────────

describe("AWACS vision", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
    state.techResearch[Owner.Player1][TechType.Electronics] = 30;
  });

  it("AWACS has visionRadius 5", () => {
    expect(UNIT_ATTRIBUTES[UnitType.AWACS].visionRadius).toBe(5);
  });

  it("AWACS reveals tiles at distance 5+ on creation", () => {
    const loc = 10 * 20 + 10; // center of 20x20 map
    const awacs = createUnit(state, UnitType.AWACS, Owner.Player1, loc);
    // Check tile 5 tiles away (north)
    const farLoc = 5 * 20 + 10; // 5 rows north
    expect(state.viewMaps[Owner.Player1][farLoc].seen).toBeGreaterThanOrEqual(0);
  });

  it("AWACS has fuel range 48", () => {
    const loc = 10 * 20 + 10;
    const awacs = createUnit(state, UnitType.AWACS, Owner.Player1, loc);
    expect(awacs.range).toBe(48);
  });
});

// ─── Non-combat units cannot attack ──────────────────────────────────────────

describe("non-combat units", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("AWACS cannot melee attack", () => {
    state.techResearch[Owner.Player1][TechType.Electronics] = 30;
    const awacs = createUnit(state, UnitType.AWACS, Owner.Player1, 5 * 20 + 5);
    createUnit(state, UnitType.Army, Owner.Player2, 5 * 20 + 6);
    const events = processAction(state, {
      type: "attack", unitId: awacs.id, targetLoc: 5 * 20 + 6,
    }, Owner.Player1);
    expect(events).toHaveLength(0);
  });

  it("Engineer Boat cannot melee attack", () => {
    state.techResearch[Owner.Player1][TechType.Science] = 30;
    for (let i = 0; i < 400; i++) setWater(state, i);
    const eng = createUnit(state, UnitType.EngineerBoat, Owner.Player1, 5 * 20 + 5);
    createUnit(state, UnitType.Patrol, Owner.Player2, 5 * 20 + 6);
    const events = processAction(state, {
      type: "attack", unitId: eng.id, targetLoc: 5 * 20 + 6,
    }, Owner.Player1);
    expect(events).toHaveLength(0);
  });
});

// ─── Tech bonuses for new units ──────────────────────────────────────────────

describe("tech bonuses for new units", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
    state.techResearch[Owner.Player1][TechType.War] = 100; // War 4
    state.techResearch[Owner.Player1][TechType.Electronics] = 60; // Elec 3
    state.techResearch[Owner.Player1][TechType.Health] = 60; // Health 3
  });

  it("Artillery gets War strength bonuses", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    // Base 3, War 4 = +1 all units
    expect(getEffectiveStrength(state, artillery)).toBe(4);
  });

  it("Missile Cruiser gets War ship + all bonuses", () => {
    const mc = createUnit(state, UnitType.MissileCruiser, Owner.Player1, 5 * 20 + 5);
    // Base 4, War 2 = +1 ship, War 4 = +1 all = 6
    expect(getEffectiveStrength(state, mc)).toBe(6);
  });

  it("Artillery gets Health 3 land HP bonus", () => {
    const artillery = createUnit(state, UnitType.Artillery, Owner.Player1, 5 * 20 + 5);
    // Base 2, Health 3 = +1 land unit
    expect(getEffectiveMaxHp(state, artillery)).toBe(3);
    expect(artillery.hits).toBe(3);
  });

  it("SpecialForces gets Health 3 land HP bonus", () => {
    const sf = createUnit(state, UnitType.SpecialForces, Owner.Player1, 5 * 20 + 5);
    // Base 1, Health 3 = +1 land unit
    expect(getEffectiveMaxHp(state, sf)).toBe(2);
  });
});
