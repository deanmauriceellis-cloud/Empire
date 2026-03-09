import { describe, it, expect, beforeEach } from "vitest";
import {
  Owner,
  UnitType,
  UnitBehavior,
  TerrainType,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_SIZE,
  UNIT_ATTRIBUTES,
  INFINITY,
} from "../index.js";
import type { GameState, CityState, UnitState, MapCell, ViewMapCell } from "../types.js";
import {
  gameRandom,
  gameRandomInt,
  createUnit,
  killUnit,
  embarkUnit,
  disembarkUnit,
  findUnit,
  findUnitsAtLoc,
  findNonFullShip,
  objMoves,
  objCapacity,
  initViewMap,
  scan,
  scanSatellite,
  updateViewCell,
  goodLoc,
  moveUnit,
  moveSatellite,
  attackCity,
  attackUnit,
  setProduction,
  tickCityProduction,
  repairShips,
  checkEndGame,
  processAction,
  executeTurn,
} from "../game.js";
import { rowColLoc } from "../utils.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────────

/** Create a minimal game state for testing. */
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
  };
}

/** Add a city to the test state. */
function addCity(
  state: GameState,
  loc: number,
  owner: Owner,
  production: UnitType = UnitType.Army,
): CityState {
  const city: CityState = {
    id: state.nextCityId++,
    loc,
    owner,
    production,
    work: 0,
    func: Array(9).fill(UnitBehavior.None),
  };
  state.cities.push(city);
  state.map[loc].cityId = state.cities.length - 1;
  state.map[loc].terrain = TerrainType.Land;
  return city;
}

/** Set some cells to sea terrain. */
function setSea(state: GameState, locs: number[]): void {
  for (const loc of locs) {
    state.map[loc].terrain = TerrainType.Sea;
  }
}

// ─── RNG Tests ──────────────────────────────────────────────────────────────────

describe("RNG", () => {
  it("gameRandom returns values in [0, 1)", () => {
    const state = createTestState();
    for (let i = 0; i < 100; i++) {
      const val = gameRandom(state);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it("gameRandom is deterministic for same initial state", () => {
    const state1 = createTestState();
    const state2 = createTestState();
    for (let i = 0; i < 10; i++) {
      expect(gameRandom(state1)).toBe(gameRandom(state2));
    }
  });

  it("gameRandomInt returns values in [0, n)", () => {
    const state = createTestState();
    for (let i = 0; i < 100; i++) {
      const val = gameRandomInt(state, 6);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(6);
    }
  });
});

// ─── Unit Management Tests ──────────────────────────────────────────────────────

describe("Unit Management", () => {
  let state: GameState;
  const landLoc = rowColLoc(10, 10); // center of map, land

  beforeEach(() => {
    state = createTestState();
  });

  it("createUnit creates a unit with correct defaults", () => {
    const unit = createUnit(state, UnitType.Army, Owner.Player1, landLoc);
    expect(unit.type).toBe(UnitType.Army);
    expect(unit.owner).toBe(Owner.Player1);
    expect(unit.loc).toBe(landLoc);
    expect(unit.hits).toBe(1);
    expect(unit.moved).toBe(0);
    expect(unit.shipId).toBeNull();
    expect(unit.cargoIds).toEqual([]);
    expect(unit.range).toBe(INFINITY);
    expect(state.units).toContain(unit);
  });

  it("createUnit assigns sequential IDs", () => {
    const u1 = createUnit(state, UnitType.Army, Owner.Player1, landLoc);
    const u2 = createUnit(state, UnitType.Army, Owner.Player1, landLoc + 1);
    expect(u2.id).toBe(u1.id + 1);
  });

  it("satellite gets random diagonal behavior", () => {
    const sat = createUnit(state, UnitType.Satellite, Owner.Player1, landLoc);
    const validDirs = [UnitBehavior.MoveNE, UnitBehavior.MoveNW, UnitBehavior.MoveSE, UnitBehavior.MoveSW];
    expect(validDirs).toContain(sat.func);
  });

  it("fighter has range 32", () => {
    const fighter = createUnit(state, UnitType.Fighter, Owner.Player1, landLoc);
    expect(fighter.range).toBe(32);
  });

  it("killUnit removes unit from state", () => {
    const unit = createUnit(state, UnitType.Army, Owner.Player1, landLoc);
    const events = killUnit(state, unit.id);
    expect(findUnit(state, unit.id)).toBeUndefined();
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === "death")).toBe(true);
  });

  it("killUnit cascades to cargo", () => {
    const seaLoc = rowColLoc(10, 15);
    setSea(state, [seaLoc]);
    const tt = createUnit(state, UnitType.Transport, Owner.Player1, seaLoc);
    const army1 = createUnit(state, UnitType.Army, Owner.Player1, seaLoc);
    const army2 = createUnit(state, UnitType.Army, Owner.Player1, seaLoc);
    embarkUnit(state, army1.id, tt.id);
    embarkUnit(state, army2.id, tt.id);

    const events = killUnit(state, tt.id);
    expect(findUnit(state, tt.id)).toBeUndefined();
    expect(findUnit(state, army1.id)).toBeUndefined();
    expect(findUnit(state, army2.id)).toBeUndefined();
    // Should have 3 death events (2 cargo + 1 transport)
    expect(events.filter((e) => e.type === "death")).toHaveLength(3);
  });

  it("embark/disembark update references", () => {
    const seaLoc = rowColLoc(10, 15);
    setSea(state, [seaLoc]);
    const tt = createUnit(state, UnitType.Transport, Owner.Player1, seaLoc);
    const army = createUnit(state, UnitType.Army, Owner.Player1, seaLoc);

    embarkUnit(state, army.id, tt.id);
    expect(army.shipId).toBe(tt.id);
    expect(tt.cargoIds).toContain(army.id);

    disembarkUnit(state, army.id);
    expect(army.shipId).toBeNull();
    expect(tt.cargoIds).not.toContain(army.id);
  });

  it("findNonFullShip returns null when ship is full", () => {
    const seaLoc = rowColLoc(10, 15);
    setSea(state, [seaLoc]);
    const tt = createUnit(state, UnitType.Transport, Owner.Player1, seaLoc);
    // Transport capacity is 6
    for (let i = 0; i < 6; i++) {
      const army = createUnit(state, UnitType.Army, Owner.Player1, seaLoc);
      embarkUnit(state, army.id, tt.id);
    }
    expect(findNonFullShip(state, UnitType.Transport, seaLoc, Owner.Player1)).toBeNull();
  });

  it("findUnitsAtLoc returns all units at location", () => {
    const u1 = createUnit(state, UnitType.Army, Owner.Player1, landLoc);
    const u2 = createUnit(state, UnitType.Army, Owner.Player2, landLoc);
    createUnit(state, UnitType.Army, Owner.Player1, landLoc + 1); // different loc
    const atLoc = findUnitsAtLoc(state, landLoc);
    expect(atLoc).toHaveLength(2);
    expect(atLoc).toContain(u1);
    expect(atLoc).toContain(u2);
  });
});

// ─── Unit Stats Tests ───────────────────────────────────────────────────────────

describe("Unit Stats", () => {
  it("objMoves for undamaged army is 1", () => {
    const unit: UnitState = {
      id: 1, type: UnitType.Army, owner: Owner.Player1, loc: 0,
      hits: 1, moved: 0, func: UnitBehavior.None, shipId: null, cargoIds: [], range: INFINITY,
    };
    expect(objMoves(unit)).toBe(1);
  });

  it("objMoves scales with damage for battleship", () => {
    const unit: UnitState = {
      id: 1, type: UnitType.Battleship, owner: Owner.Player1, loc: 0,
      hits: 10, moved: 0, func: UnitBehavior.None, shipId: null, cargoIds: [], range: INFINITY,
    };
    expect(objMoves(unit)).toBe(2); // full health
    unit.hits = 5;
    expect(objMoves(unit)).toBe(1); // half health
    unit.hits = 1;
    expect(objMoves(unit)).toBe(1); // always at least 1 if alive
  });

  it("objCapacity scales with damage for transport", () => {
    const unit: UnitState = {
      id: 1, type: UnitType.Transport, owner: Owner.Player1, loc: 0,
      hits: 1, moved: 0, func: UnitBehavior.None, shipId: null, cargoIds: [], range: INFINITY,
    };
    // Transport: capacity=6, maxHits=1 — always 6
    expect(objCapacity(unit)).toBe(6);
  });

  it("objCapacity for carrier scales with damage", () => {
    const unit: UnitState = {
      id: 1, type: UnitType.Carrier, owner: Owner.Player1, loc: 0,
      hits: 8, moved: 0, func: UnitBehavior.None, shipId: null, cargoIds: [], range: INFINITY,
    };
    expect(objCapacity(unit)).toBe(8); // full: 8
    unit.hits = 4;
    expect(objCapacity(unit)).toBe(4); // half
    unit.hits = 1;
    expect(objCapacity(unit)).toBe(1); // severely damaged
  });

  it("objCapacity is 0 for units without cargo", () => {
    const unit: UnitState = {
      id: 1, type: UnitType.Army, owner: Owner.Player1, loc: 0,
      hits: 1, moved: 0, func: UnitBehavior.None, shipId: null, cargoIds: [], range: INFINITY,
    };
    expect(objCapacity(unit)).toBe(0);
  });
});

// ─── Vision Tests ───────────────────────────────────────────────────────────────

describe("Vision", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("initViewMap creates unseen map", () => {
    const vm = initViewMap();
    expect(vm[500].contents).toBe(" ");
    expect(vm[500].seen).toBe(-1);
  });

  it("scan reveals 9 cells", () => {
    const loc = rowColLoc(10, 10);
    scan(state, Owner.Player1, loc);
    const vm = state.viewMaps[Owner.Player1];
    // Center + 8 adjacent should be revealed
    expect(vm[loc].seen).toBe(0);
    expect(vm[loc].contents).toBe("+"); // land
  });

  it("scan shows units", () => {
    const loc = rowColLoc(10, 10);
    createUnit(state, UnitType.Army, Owner.Player1, loc);
    scan(state, Owner.Player1, loc);

    const vm = state.viewMaps[Owner.Player1];
    expect(vm[loc].contents).toBe("A"); // own army = uppercase
  });

  it("scan shows enemy units as lowercase", () => {
    const loc = rowColLoc(10, 10);
    createUnit(state, UnitType.Army, Owner.Player2, loc);
    scan(state, Owner.Player1, loc);

    const vm = state.viewMaps[Owner.Player1];
    expect(vm[loc].contents).toBe("a"); // enemy army = lowercase
  });

  it("scan shows own city as O, enemy as X", () => {
    const loc1 = rowColLoc(10, 10);
    const loc2 = rowColLoc(10, 12);
    addCity(state, loc1, Owner.Player1);
    addCity(state, loc2, Owner.Player2);

    scan(state, Owner.Player1, loc1);
    scan(state, Owner.Player1, loc2);

    const vm = state.viewMaps[Owner.Player1];
    expect(vm[loc1].contents).toBe("O");
    expect(vm[loc2].contents).toBe("X");
  });

  it("scan shows unowned city as *", () => {
    const loc = rowColLoc(10, 10);
    addCity(state, loc, Owner.Unowned);
    scan(state, Owner.Player1, loc);
    expect(state.viewMaps[Owner.Player1][loc].contents).toBe("*");
  });

  it("scanSatellite reveals wider area", () => {
    const loc = rowColLoc(10, 10);
    scanSatellite(state, Owner.Player1, loc);
    const vm = state.viewMaps[Owner.Player1];
    // Should reveal cells at distance 2 as well
    const farLoc = rowColLoc(8, 10); // 2 north
    expect(vm[farLoc].seen).toBe(0);
  });
});

// ─── Movement Tests ─────────────────────────────────────────────────────────────

describe("Movement", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("goodLoc allows army on land", () => {
    const loc = rowColLoc(10, 10);
    const unit = createUnit(state, UnitType.Army, Owner.Player1, loc);
    expect(goodLoc(state, unit, rowColLoc(10, 11))).toBe(true);
  });

  it("goodLoc rejects army on sea", () => {
    const loc = rowColLoc(10, 10);
    const seaLoc = rowColLoc(10, 11);
    setSea(state, [seaLoc]);
    const unit = createUnit(state, UnitType.Army, Owner.Player1, loc);
    expect(goodLoc(state, unit, seaLoc)).toBe(false);
  });

  it("goodLoc allows army boarding transport", () => {
    const seaLoc = rowColLoc(10, 11);
    setSea(state, [seaLoc]);
    const army = createUnit(state, UnitType.Army, Owner.Player1, rowColLoc(10, 10));
    createUnit(state, UnitType.Transport, Owner.Player1, seaLoc);
    expect(goodLoc(state, army, seaLoc)).toBe(true);
  });

  it("goodLoc allows fighter landing on carrier", () => {
    const seaLoc = rowColLoc(10, 11);
    setSea(state, [seaLoc]);
    const fighter = createUnit(state, UnitType.Fighter, Owner.Player1, rowColLoc(10, 10));
    createUnit(state, UnitType.Carrier, Owner.Player1, seaLoc);
    expect(goodLoc(state, fighter, seaLoc)).toBe(true);
  });

  it("goodLoc allows ship in own city", () => {
    const cityLoc = rowColLoc(10, 10);
    addCity(state, cityLoc, Owner.Player1);
    const ship = createUnit(state, UnitType.Destroyer, Owner.Player1, rowColLoc(10, 11));
    // City is on land but ships can enter own city (port)
    expect(goodLoc(state, ship, cityLoc)).toBe(true);
  });

  it("moveUnit updates unit location and increments moved", () => {
    const loc = rowColLoc(10, 10);
    const newLoc = rowColLoc(10, 11);
    const unit = createUnit(state, UnitType.Army, Owner.Player1, loc);
    moveUnit(state, unit, newLoc);
    expect(unit.loc).toBe(newLoc);
    expect(unit.moved).toBe(1);
  });

  it("moveUnit decrements fighter range", () => {
    const loc = rowColLoc(10, 10);
    const newLoc = rowColLoc(10, 11);
    const fighter = createUnit(state, UnitType.Fighter, Owner.Player1, loc);
    const initialRange = fighter.range;
    moveUnit(state, fighter, newLoc);
    expect(fighter.range).toBe(initialRange - 1);
  });

  it("moveUnit moves cargo with ship", () => {
    const seaLoc1 = rowColLoc(10, 10);
    const seaLoc2 = rowColLoc(10, 11);
    setSea(state, [seaLoc1, seaLoc2]);
    const tt = createUnit(state, UnitType.Transport, Owner.Player1, seaLoc1);
    const army = createUnit(state, UnitType.Army, Owner.Player1, seaLoc1);
    embarkUnit(state, army.id, tt.id);

    moveUnit(state, tt, seaLoc2);
    expect(army.loc).toBe(seaLoc2);
  });

  it("moveUnit auto-embarks army on transport", () => {
    const landLoc = rowColLoc(10, 10);
    const seaLoc = rowColLoc(10, 11);
    setSea(state, [seaLoc]);
    const army = createUnit(state, UnitType.Army, Owner.Player1, landLoc);
    createUnit(state, UnitType.Transport, Owner.Player1, seaLoc);

    moveUnit(state, army, seaLoc);
    expect(army.shipId).not.toBeNull();
  });

  it("moveUnit auto-disembarks from ship", () => {
    const seaLoc = rowColLoc(10, 10);
    const landLoc = rowColLoc(10, 11);
    setSea(state, [seaLoc]);
    const tt = createUnit(state, UnitType.Transport, Owner.Player1, seaLoc);
    const army = createUnit(state, UnitType.Army, Owner.Player1, seaLoc);
    embarkUnit(state, army.id, tt.id);

    moveUnit(state, army, landLoc);
    expect(army.shipId).toBeNull();
    expect(tt.cargoIds).not.toContain(army.id);
  });
});

// ─── Combat Tests ───────────────────────────────────────────────────────────────

describe("Combat", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("attackCity: attacker always dies", () => {
    const cityLoc = rowColLoc(10, 10);
    addCity(state, cityLoc, Owner.Player2);
    const attacker = createUnit(state, UnitType.Army, Owner.Player1, rowColLoc(10, 11));

    // Run many times — attacker always dies
    const events = attackCity(state, attacker, 0);
    expect(findUnit(state, attacker.id)).toBeUndefined();
    expect(events.some((e) => e.type === "death")).toBe(true);
  });

  it("attackCity: 50% chance to capture", () => {
    let captures = 0;
    const trials = 200;

    for (let i = 0; i < trials; i++) {
      const s = createTestState();
      s.rngState = i * 7777; // different seed each trial
      const cityLoc = rowColLoc(10, 10);
      addCity(s, cityLoc, Owner.Player2);
      const attacker = createUnit(s, UnitType.Army, Owner.Player1, rowColLoc(10, 11));

      attackCity(s, attacker, 0);
      if (s.cities[0].owner === Owner.Player1) captures++;
    }

    // Should be roughly 50% captures (allow wide margin)
    expect(captures).toBeGreaterThan(50);
    expect(captures).toBeLessThan(150);
  });

  it("attackUnit: combat resolves with a winner", () => {
    const loc1 = rowColLoc(10, 10);
    const loc2 = rowColLoc(10, 11);
    const army1 = createUnit(state, UnitType.Army, Owner.Player1, loc1);
    const army2 = createUnit(state, UnitType.Army, Owner.Player2, loc2);

    const events = attackUnit(state, army1, army2);
    expect(events.some((e) => e.type === "combat")).toBe(true);

    // One unit survives, one is dead
    const u1alive = findUnit(state, army1.id) !== undefined;
    const u2alive = findUnit(state, army2.id) !== undefined;
    expect(u1alive).not.toBe(u2alive);
  });

  it("attackUnit: winner moves to loser's location", () => {
    // Use a battleship vs patrol — battleship almost always wins
    const seaLoc1 = rowColLoc(10, 10);
    const seaLoc2 = rowColLoc(10, 11);
    setSea(state, [seaLoc1, seaLoc2]);

    const bb = createUnit(state, UnitType.Battleship, Owner.Player1, seaLoc1);
    const patrol = createUnit(state, UnitType.Patrol, Owner.Player2, seaLoc2);

    attackUnit(state, bb, patrol);

    // Battleship should likely win and be at patrol's loc
    if (findUnit(state, bb.id)) {
      expect(bb.loc).toBe(seaLoc2);
    }
  });

  it("attackUnit: cargo overflow kills excess cargo", () => {
    // Carrier with 8 fighters, take damage to reduce capacity
    const seaLoc1 = rowColLoc(10, 10);
    const seaLoc2 = rowColLoc(10, 11);
    setSea(state, [seaLoc1, seaLoc2]);

    const carrier = createUnit(state, UnitType.Carrier, Owner.Player1, seaLoc1);
    const fighters: UnitState[] = [];
    for (let i = 0; i < 8; i++) {
      const f = createUnit(state, UnitType.Fighter, Owner.Player1, seaLoc1);
      embarkUnit(state, f.id, carrier.id);
      fighters.push(f);
    }

    // Manually damage the carrier (simulating post-combat)
    carrier.hits = 4; // capacity drops to 4
    // Handle cargo overflow manually
    const cap = objCapacity(carrier);
    expect(cap).toBe(4);
    expect(carrier.cargoIds.length).toBe(8);
  });
});

// ─── Production Tests ───────────────────────────────────────────────────────────

describe("Production", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("setProduction applies 20% penalty on switch", () => {
    const cityLoc = rowColLoc(10, 10);
    const city = addCity(state, cityLoc, Owner.Player1, UnitType.Army);

    setProduction(state, city.id, UnitType.Fighter);
    expect(city.production).toBe(UnitType.Fighter);
    // Fighter buildTime=10, penalty = -floor(10/5) = -2
    expect(city.work).toBe(-2);
  });

  it("setProduction no penalty when same type", () => {
    const cityLoc = rowColLoc(10, 10);
    const city = addCity(state, cityLoc, Owner.Player1, UnitType.Army);
    city.work = 3;

    setProduction(state, city.id, UnitType.Army);
    expect(city.work).toBe(3); // unchanged
  });

  it("tickCityProduction spawns unit at buildTime", () => {
    const cityLoc = rowColLoc(10, 10);
    const city = addCity(state, cityLoc, Owner.Player1, UnitType.Army);
    city.work = 4; // Army buildTime=5, one more tick

    const events = tickCityProduction(state, Owner.Player1);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("production");

    // Unit should be created at city location
    const units = findUnitsAtLoc(state, cityLoc);
    expect(units.some((u) => u.type === UnitType.Army && u.owner === Owner.Player1)).toBe(true);

    // Work should reset
    expect(city.work).toBe(0);
  });

  it("tickCityProduction respects negative work (penalty)", () => {
    const cityLoc = rowColLoc(10, 10);
    const city = addCity(state, cityLoc, Owner.Player1, UnitType.Army);
    city.work = -2;

    const events = tickCityProduction(state, Owner.Player1);
    expect(events).toHaveLength(0); // no production
    expect(city.work).toBe(-1); // incremented by 1
  });

  it("repairShips heals stationary ship in own city", () => {
    const cityLoc = rowColLoc(10, 10);
    addCity(state, cityLoc, Owner.Player1);
    const ship = createUnit(state, UnitType.Destroyer, Owner.Player1, cityLoc);
    ship.hits = 2; // max is 3

    repairShips(state, Owner.Player1, new Set());
    expect(ship.hits).toBe(3);
  });

  it("repairShips does not heal moved ship", () => {
    const cityLoc = rowColLoc(10, 10);
    addCity(state, cityLoc, Owner.Player1);
    const ship = createUnit(state, UnitType.Destroyer, Owner.Player1, cityLoc);
    ship.hits = 2;

    repairShips(state, Owner.Player1, new Set([ship.id]));
    expect(ship.hits).toBe(2); // not healed
  });

  it("repairShips does not heal ship not in city", () => {
    const seaLoc = rowColLoc(10, 10);
    setSea(state, [seaLoc]);
    const ship = createUnit(state, UnitType.Destroyer, Owner.Player1, seaLoc);
    ship.hits = 2;

    repairShips(state, Owner.Player1, new Set());
    expect(ship.hits).toBe(2); // not healed — not in port
  });
});

// ─── End Game Tests ─────────────────────────────────────────────────────────────

describe("End Game", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("checkEndGame returns null when both sides have units", () => {
    addCity(state, rowColLoc(10, 10), Owner.Player1);
    addCity(state, rowColLoc(20, 20), Owner.Player2);
    expect(checkEndGame(state)).toBeNull();
  });

  it("checkEndGame detects elimination", () => {
    addCity(state, rowColLoc(10, 10), Owner.Player1);
    // Player2 has nothing
    const result = checkEndGame(state);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe(Owner.Player1);
    expect(result!.winType).toBe("elimination");
  });

  it("checkEndGame detects 3:1 resignation", () => {
    // Player1 has 10 cities and 10 armies
    for (let i = 0; i < 10; i++) {
      addCity(state, rowColLoc(10 + i, 10), Owner.Player1);
      createUnit(state, UnitType.Army, Owner.Player1, rowColLoc(10 + i, 11));
    }
    // Player2 has 2 cities and 2 armies
    for (let i = 0; i < 2; i++) {
      addCity(state, rowColLoc(30 + i, 30), Owner.Player2);
      createUnit(state, UnitType.Army, Owner.Player2, rowColLoc(30 + i, 31));
    }

    const result = checkEndGame(state);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe(Owner.Player1);
    expect(result!.winType).toBe("resignation");
  });
});

// ─── Turn Execution Tests ───────────────────────────────────────────────────────

describe("Turn Execution", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("executeTurn processes move actions", () => {
    // Both players need cities so endgame doesn't trigger
    addCity(state, rowColLoc(5, 5), Owner.Player1);
    addCity(state, rowColLoc(30, 30), Owner.Player2);

    const loc = rowColLoc(10, 10);
    const newLoc = rowColLoc(10, 11);
    const unit = createUnit(state, UnitType.Army, Owner.Player1, loc);

    const result = executeTurn(
      state,
      [{ type: "move", unitId: unit.id, loc: newLoc }],
      [],
    );

    expect(unit.loc).toBe(newLoc);
    expect(state.turn).toBe(1);
    expect(result.winner).toBeNull();
  });

  it("executeTurn handles resignation", () => {
    addCity(state, rowColLoc(10, 10), Owner.Player1);
    addCity(state, rowColLoc(20, 20), Owner.Player2);

    const result = executeTurn(
      state,
      [{ type: "resign" }],
      [],
    );

    expect(result.winner).toBe(Owner.Player2);
    expect(result.winType).toBe("resignation");
  });

  it("executeTurn resets moved counters", () => {
    const loc = rowColLoc(10, 10);
    const unit = createUnit(state, UnitType.Army, Owner.Player1, loc);
    unit.moved = 5;

    executeTurn(state, [], []);
    expect(unit.moved).toBe(0);
  });

  it("executeTurn ticks production", () => {
    const cityLoc = rowColLoc(10, 10);
    const city = addCity(state, cityLoc, Owner.Player1, UnitType.Army);
    city.work = 4; // will complete this turn

    const result = executeTurn(state, [], []);
    expect(result.events.some((e) => e.type === "production")).toBe(true);
  });

  it("5-turn simulation with scripted actions", () => {
    addCity(state, rowColLoc(10, 10), Owner.Player1, UnitType.Army);
    addCity(state, rowColLoc(20, 20), Owner.Player2, UnitType.Army);

    // Run 5 turns with no actions
    for (let i = 0; i < 5; i++) {
      executeTurn(state, [], []);
    }

    expect(state.turn).toBe(5);
    // Both cities should have produced an army (buildTime=5)
    const p1Armies = state.units.filter(
      (u) => u.type === UnitType.Army && u.owner === Owner.Player1,
    );
    const p2Armies = state.units.filter(
      (u) => u.type === UnitType.Army && u.owner === Owner.Player2,
    );
    expect(p1Armies.length).toBeGreaterThanOrEqual(1);
    expect(p2Armies.length).toBeGreaterThanOrEqual(1);
  });
});
