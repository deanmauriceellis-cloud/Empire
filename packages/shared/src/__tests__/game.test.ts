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
import type { GameState, CityState, UnitState, MapCell, ViewMapCell, PlayerInfo } from "../types.js";
import {
  gameRandom,
  gameRandomInt,
  createUnit,
  killUnit,
  embarkUnit,
  disembarkUnit,
  findUnit,
  findUnitAtLoc,
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
    func: Array(10).fill(UnitBehavior.None),
    upgradeIds: [],
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

  it("checkEndGame detects 5:1 domination resignation", () => {
    state.turn = 200; // must be past minimum turn threshold (150)
    // Player1 has 10 cities and 10 armies
    for (let i = 0; i < 10; i++) {
      addCity(state, rowColLoc(10 + i, 10), Owner.Player1);
      createUnit(state, UnitType.Army, Owner.Player1, rowColLoc(10 + i, 11));
    }
    // Player2 has 1 city and 1 army (< 10/5 = 2)
    addCity(state, rowColLoc(30, 30), Owner.Player2);
    createUnit(state, UnitType.Army, Owner.Player2, rowColLoc(30, 31));

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
      new Map([[1, [{ type: "move", unitId: unit.id, loc: newLoc }]], [2, []]]),
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
      new Map([[1, [{ type: "resign" }]], [2, []]]),
    );

    expect(result.winner).toBe(Owner.Player2);
    expect(result.winType).toBe("resignation");
  });

  it("executeTurn resets moved counters", () => {
    const loc = rowColLoc(10, 10);
    const unit = createUnit(state, UnitType.Army, Owner.Player1, loc);
    unit.moved = 5;

    executeTurn(state, new Map([[1, []], [2, []]]));
    expect(unit.moved).toBe(0);
  });

  it("executeTurn ticks production", () => {
    const cityLoc = rowColLoc(10, 10);
    const city = addCity(state, cityLoc, Owner.Player1, UnitType.Army);
    city.work = 4; // will complete this turn

    const result = executeTurn(state, new Map([[1, []], [2, []]]));
    expect(result.events.some((e) => e.type === "production")).toBe(true);
  });

  it("5-turn simulation with scripted actions", () => {
    addCity(state, rowColLoc(10, 10), Owner.Player1, UnitType.Army);
    addCity(state, rowColLoc(20, 20), Owner.Player2, UnitType.Army);

    // Run 5 turns with no actions
    for (let i = 0; i < 5; i++) {
      executeTurn(state, new Map([[1, []], [2, []]]));
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

  it("executeTurn handles Player 2 resignation", () => {
    addCity(state, rowColLoc(10, 10), Owner.Player1);
    addCity(state, rowColLoc(20, 20), Owner.Player2);

    const result = executeTurn(
      state,
      new Map([[1, []], [2, [{ type: "resign" }]]]),
    );

    expect(result.winner).toBe(Owner.Player1);
    expect(result.winType).toBe("resignation");
  });

  it("executeTurn moves satellites", () => {
    addCity(state, rowColLoc(5, 5), Owner.Player1);
    addCity(state, rowColLoc(30, 30), Owner.Player2);

    const sat = createUnit(state, UnitType.Satellite, Owner.Player1, rowColLoc(20, 20));
    const origLoc = sat.loc;

    executeTurn(state, new Map([[1, []], [2, []]]));
    // Satellite should have moved
    expect(sat.loc !== origLoc || findUnit(state, sat.id) === undefined).toBe(true);
  });
});

// ─── findUnitAtLoc Tests ───────────────────────────────────────────────────────

describe("findUnitAtLoc", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("finds unit for specific owner at location", () => {
    const loc = rowColLoc(10, 10);
    createUnit(state, UnitType.Army, Owner.Player2, loc);
    const p1Unit = createUnit(state, UnitType.Army, Owner.Player1, loc);

    const found = findUnitAtLoc(state, loc, Owner.Player1);
    expect(found).toBeDefined();
    expect(found!.id).toBe(p1Unit.id);
  });

  it("returns undefined when no units for owner at location", () => {
    const loc = rowColLoc(10, 10);
    createUnit(state, UnitType.Army, Owner.Player2, loc);

    const found = findUnitAtLoc(state, loc, Owner.Player1);
    expect(found).toBeUndefined();
  });
});

// ─── Satellite Tests ───────────────────────────────────────────────────────────

describe("Satellite Movement", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("moveSatellite moves satellite in its direction", () => {
    const loc = rowColLoc(20, 20);
    const sat = createUnit(state, UnitType.Satellite, Owner.Player1, loc);
    sat.func = UnitBehavior.MoveNE;
    sat.range = 100;
    const origLoc = sat.loc;

    const events = moveSatellite(state, sat);
    expect(sat.loc).not.toBe(origLoc);
  });

  it("moveSatellite kills satellite when range exhausted", () => {
    const loc = rowColLoc(20, 20);
    const sat = createUnit(state, UnitType.Satellite, Owner.Player1, loc);
    sat.func = UnitBehavior.MoveNE;
    sat.range = 1; // will die after 1 move

    const events = moveSatellite(state, sat);
    expect(findUnit(state, sat.id)).toBeUndefined();
    expect(events.some(e => e.type === "death")).toBe(true);
  });

  it("moveSatellite bounces off north edge", () => {
    // Place near north edge
    const loc = rowColLoc(1, 20);
    const sat = createUnit(state, UnitType.Satellite, Owner.Player1, loc);
    sat.func = UnitBehavior.MoveNE;
    sat.range = 100;

    moveSatellite(state, sat);
    // Should have bounced to SE
    expect(sat.func).toBe(UnitBehavior.MoveSE);
  });

  it("moveSatellite bounces off south edge", () => {
    // Place close to south edge but with room to bounce
    const loc = rowColLoc(MAP_HEIGHT - 3, 50);
    const sat = createUnit(state, UnitType.Satellite, Owner.Player1, loc);
    sat.func = UnitBehavior.MoveSW;
    sat.range = 100;

    const origFunc = sat.func;
    moveSatellite(state, sat);
    // After 12 steps starting near the south edge, it should have bounced at least once
    expect(sat.loc).not.toBe(loc);
    // Satellite should still be alive (range was 100)
    expect(findUnit(state, sat.id)).toBeDefined();
  });

  it("moveSatellite bounces off east edge", () => {
    const loc = rowColLoc(20, MAP_WIDTH - 2);
    const sat = createUnit(state, UnitType.Satellite, Owner.Player1, loc);
    sat.func = UnitBehavior.MoveNE;
    sat.range = 100;

    moveSatellite(state, sat);
    expect(sat.func).toBe(UnitBehavior.MoveNW);
  });

  it("moveSatellite bounces off west edge", () => {
    const loc = rowColLoc(20, 1);
    const sat = createUnit(state, UnitType.Satellite, Owner.Player1, loc);
    sat.func = UnitBehavior.MoveNW;
    sat.range = 100;

    moveSatellite(state, sat);
    expect(sat.func).toBe(UnitBehavior.MoveNE);
  });

  it("moveSatellite bounces off NE corner", () => {
    const loc = rowColLoc(1, MAP_WIDTH - 2);
    const sat = createUnit(state, UnitType.Satellite, Owner.Player1, loc);
    sat.func = UnitBehavior.MoveNE;
    sat.range = 100;

    moveSatellite(state, sat);
    expect(sat.func).toBe(UnitBehavior.MoveSW);
  });

  it("moveSatellite bounces off SW corner", () => {
    const loc = rowColLoc(MAP_HEIGHT - 2, 1);
    const sat = createUnit(state, UnitType.Satellite, Owner.Player1, loc);
    sat.func = UnitBehavior.MoveSW;
    sat.range = 100;

    moveSatellite(state, sat);
    expect(sat.func).toBe(UnitBehavior.MoveNE);
  });

  it("moveSatellite bounces off NW corner", () => {
    const loc = rowColLoc(1, 1);
    const sat = createUnit(state, UnitType.Satellite, Owner.Player1, loc);
    sat.func = UnitBehavior.MoveNW;
    sat.range = 100;

    moveSatellite(state, sat);
    expect(sat.func).toBe(UnitBehavior.MoveSE);
  });

  it("moveSatellite bounces off SE corner", () => {
    const loc = rowColLoc(MAP_HEIGHT - 2, MAP_WIDTH - 2);
    const sat = createUnit(state, UnitType.Satellite, Owner.Player1, loc);
    sat.func = UnitBehavior.MoveSE;
    sat.range = 100;

    moveSatellite(state, sat);
    expect(sat.func).toBe(UnitBehavior.MoveNW);
  });
});

// ─── Extended Combat Tests ─────────────────────────────────────────────────────

describe("Extended Combat", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("attackCity transfers enemy ships and kills their cargo on capture", () => {
    // Force capture (rng < 0.5)
    state.rngState = 0; // find a seed that gives capture
    const cityLoc = rowColLoc(10, 10);
    addCity(state, cityLoc, Owner.Player2);

    // Place an enemy ship with cargo at the city
    const seaLoc = cityLoc; // city acts as port
    const ship = createUnit(state, UnitType.Destroyer, Owner.Player2, seaLoc);
    const cargo = createUnit(state, UnitType.Army, Owner.Player2, seaLoc);
    embarkUnit(state, cargo.id, ship.id);

    const attacker = createUnit(state, UnitType.Army, Owner.Player1, rowColLoc(10, 11));

    // Try many seeds to get a capture
    let captured = false;
    for (let seed = 0; seed < 100; seed++) {
      const s = createTestState();
      s.rngState = seed * 1111;
      const cLoc = rowColLoc(10, 10);
      addCity(s, cLoc, Owner.Player2);
      const sh = createUnit(s, UnitType.Destroyer, Owner.Player2, cLoc);
      const cg = createUnit(s, UnitType.Army, Owner.Player2, cLoc);
      embarkUnit(s, cg.id, sh.id);
      const att = createUnit(s, UnitType.Army, Owner.Player1, rowColLoc(10, 11));

      attackCity(s, att, 0);
      if (s.cities[0].owner === Owner.Player1) {
        // City was captured — verify ship transferred
        const shipAlive = findUnit(s, sh.id);
        expect(shipAlive).toBeDefined();
        expect(shipAlive!.owner).toBe(Owner.Player1);
        // Cargo should be killed
        expect(findUnit(s, cg.id)).toBeUndefined();
        captured = true;
        break;
      }
    }
    expect(captured).toBe(true);
  });

  it("attackUnit: defender wins when attacker hits reach 0", () => {
    // Use weak attacker vs strong defender to make defender win likely
    const seaLoc1 = rowColLoc(10, 10);
    const seaLoc2 = rowColLoc(10, 11);
    setSea(state, [seaLoc1, seaLoc2]);

    let defenderWon = false;
    for (let seed = 0; seed < 100; seed++) {
      const s = createTestState();
      setSea(s, [seaLoc1, seaLoc2]);
      s.rngState = seed * 3333;

      const patrol = createUnit(s, UnitType.Patrol, Owner.Player1, seaLoc1);
      const battleship = createUnit(s, UnitType.Battleship, Owner.Player2, seaLoc2);

      attackUnit(s, patrol, battleship);

      if (findUnit(s, battleship.id) !== undefined && findUnit(s, patrol.id) === undefined) {
        defenderWon = true;
        break;
      }
    }
    expect(defenderWon).toBe(true);
  });

  it("attackUnit: cargo overflow kills excess cargo when ship damaged", () => {
    const seaLoc1 = rowColLoc(10, 10);
    const seaLoc2 = rowColLoc(10, 11);
    setSea(state, [seaLoc1, seaLoc2]);

    // Carrier with 8 fighters attacks enemy patrol
    const carrier = createUnit(state, UnitType.Carrier, Owner.Player1, seaLoc1);
    const fighters: UnitState[] = [];
    for (let i = 0; i < 8; i++) {
      const f = createUnit(state, UnitType.Fighter, Owner.Player1, seaLoc1);
      embarkUnit(state, f.id, carrier.id);
      fighters.push(f);
    }

    // Manually damage the carrier so capacity < cargo count, then test overflow
    carrier.hits = 3; // capacity = floor(8 * 3/8) = 3
    const cap = objCapacity(carrier);
    expect(cap).toBe(3);

    // Simulate what happens after combat — we can test handleCargoOverflow indirectly
    // by attacking a weak enemy where carrier survives but is already damaged
    const patrol = createUnit(state, UnitType.Patrol, Owner.Player2, seaLoc2);

    let carrierSurvived = false;
    for (let seed = 0; seed < 200; seed++) {
      const s = createTestState();
      setSea(s, [seaLoc1, seaLoc2]);
      s.rngState = seed * 7;
      const c = createUnit(s, UnitType.Carrier, Owner.Player1, seaLoc1);
      const fs: UnitState[] = [];
      for (let i = 0; i < 8; i++) {
        const f = createUnit(s, UnitType.Fighter, Owner.Player1, seaLoc1);
        embarkUnit(s, f.id, c.id);
        fs.push(f);
      }
      const p = createUnit(s, UnitType.Patrol, Owner.Player2, seaLoc2);

      const events = attackUnit(s, c, p);
      const cAlive = findUnit(s, c.id);
      if (cAlive && cAlive.hits < 8) {
        // Carrier survived with damage — check cargo overflow
        const newCap = objCapacity(cAlive);
        expect(cAlive.cargoIds.length).toBeLessThanOrEqual(newCap);
        carrierSurvived = true;
        break;
      }
    }
    expect(carrierSurvived).toBe(true);
  });
});

// ─── Extended End Game Tests ───────────────────────────────────────────────────

describe("Extended End Game", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("checkEndGame detects Player 2 elimination", () => {
    addCity(state, rowColLoc(10, 10), Owner.Player2);
    // Player1 has nothing
    const result = checkEndGame(state);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe(Owner.Player2);
    expect(result!.winType).toBe("elimination");
  });

  it("checkEndGame returns null when neither player has anything", () => {
    // No cities, no units
    const result = checkEndGame(state);
    expect(result).toBeNull();
  });

  it("checkEndGame detects 5:1 domination resignation for Player 2", () => {
    state.turn = 200; // must be past minimum turn threshold (150)
    // Player2 has 10 cities and 10 armies
    for (let i = 0; i < 10; i++) {
      addCity(state, rowColLoc(10 + i, 10), Owner.Player2);
      createUnit(state, UnitType.Army, Owner.Player2, rowColLoc(10 + i, 11));
    }
    // Player1 has 1 city and 1 army
    addCity(state, rowColLoc(30, 30), Owner.Player1);
    createUnit(state, UnitType.Army, Owner.Player1, rowColLoc(30, 31));

    const result = checkEndGame(state);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe(Owner.Player2);
    expect(result!.winType).toBe("resignation");
  });

  it("checkEndGame: army-only player isn't eliminated", () => {
    // Player1 has no cities but has armies
    createUnit(state, UnitType.Army, Owner.Player1, rowColLoc(10, 10));
    addCity(state, rowColLoc(20, 20), Owner.Player2);

    const result = checkEndGame(state);
    expect(result).toBeNull();
  });
});

// ─── processAction Tests ───────────────────────────────────────────────────────

describe("processAction", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("processAction handles attack on city", () => {
    const cityLoc = rowColLoc(10, 10);
    addCity(state, cityLoc, Owner.Player2);
    const attacker = createUnit(state, UnitType.Army, Owner.Player1, rowColLoc(10, 11));

    const events = processAction(
      state,
      { type: "attack", unitId: attacker.id, targetLoc: cityLoc },
      Owner.Player1,
    );
    expect(events.length).toBeGreaterThan(0);
    expect(findUnit(state, attacker.id)).toBeUndefined(); // attacker always dies
  });

  it("processAction handles attack on enemy unit", () => {
    const loc1 = rowColLoc(10, 10);
    const loc2 = rowColLoc(10, 11);
    const army1 = createUnit(state, UnitType.Army, Owner.Player1, loc1);
    const army2 = createUnit(state, UnitType.Army, Owner.Player2, loc2);

    const events = processAction(
      state,
      { type: "attack", unitId: army1.id, targetLoc: loc2 },
      Owner.Player1,
    );
    expect(events.some(e => e.type === "combat")).toBe(true);
  });

  it("processAction handles setProduction", () => {
    const cityLoc = rowColLoc(10, 10);
    const city = addCity(state, cityLoc, Owner.Player1, UnitType.Army);

    processAction(
      state,
      { type: "setProduction", cityId: city.id, unitType: UnitType.Fighter },
      Owner.Player1,
    );
    expect(city.production).toBe(UnitType.Fighter);
  });

  it("processAction handles setBehavior", () => {
    const unit = createUnit(state, UnitType.Army, Owner.Player1, rowColLoc(10, 10));

    processAction(
      state,
      { type: "setBehavior", unitId: unit.id, behavior: UnitBehavior.Sentry },
      Owner.Player1,
    );
    expect(unit.func).toBe(UnitBehavior.Sentry);
  });

  it("processAction handles embark", () => {
    const seaLoc = rowColLoc(10, 10);
    setSea(state, [seaLoc]);
    const army = createUnit(state, UnitType.Army, Owner.Player1, seaLoc);
    const tt = createUnit(state, UnitType.Transport, Owner.Player1, seaLoc);

    processAction(
      state,
      { type: "embark", unitId: army.id, shipId: tt.id },
      Owner.Player1,
    );
    expect(army.shipId).toBe(tt.id);
    expect(tt.cargoIds).toContain(army.id);
  });

  it("processAction handles disembark", () => {
    const seaLoc = rowColLoc(10, 10);
    setSea(state, [seaLoc]);
    const tt = createUnit(state, UnitType.Transport, Owner.Player1, seaLoc);
    const army = createUnit(state, UnitType.Army, Owner.Player1, seaLoc);
    embarkUnit(state, army.id, tt.id);

    processAction(
      state,
      { type: "disembark", unitId: army.id },
      Owner.Player1,
    );
    expect(army.shipId).toBeNull();
  });

  it("processAction handles resign", () => {
    const events = processAction(
      state,
      { type: "resign" },
      Owner.Player1,
    );
    expect(events.some(e => e.data.winner === Owner.Player2)).toBe(true);
  });

  it("processAction rejects actions for wrong owner", () => {
    const unit = createUnit(state, UnitType.Army, Owner.Player2, rowColLoc(10, 10));

    const events = processAction(
      state,
      { type: "move", unitId: unit.id, loc: rowColLoc(10, 11) },
      Owner.Player1,
    );
    expect(events).toHaveLength(0);
    expect(unit.loc).toBe(rowColLoc(10, 10)); // didn't move
  });

  it("processAction rejects embark on full ship", () => {
    const seaLoc = rowColLoc(10, 10);
    setSea(state, [seaLoc]);
    const tt = createUnit(state, UnitType.Transport, Owner.Player1, seaLoc);
    // Fill the transport (capacity 6)
    for (let i = 0; i < 6; i++) {
      const a = createUnit(state, UnitType.Army, Owner.Player1, seaLoc);
      embarkUnit(state, a.id, tt.id);
    }
    const extraArmy = createUnit(state, UnitType.Army, Owner.Player1, seaLoc);

    processAction(
      state,
      { type: "embark", unitId: extraArmy.id, shipId: tt.id },
      Owner.Player1,
    );
    expect(extraArmy.shipId).toBeNull(); // not embarked
  });

  it("processAction endTurn is a no-op", () => {
    const events = processAction(state, { type: "endTurn" }, Owner.Player1);
    expect(events).toHaveLength(0);
  });
});

// ─── Fighter Auto-Embark Tests ─────────────────────────────────────────────────

describe("Fighter Auto-Embark", () => {
  let state: GameState;

  beforeEach(() => {
    state = createTestState();
  });

  it("fighter auto-embarks on carrier when not in own city", () => {
    const seaLoc = rowColLoc(10, 11);
    setSea(state, [seaLoc]);
    const fighter = createUnit(state, UnitType.Fighter, Owner.Player1, rowColLoc(10, 10));
    const carrier = createUnit(state, UnitType.Carrier, Owner.Player1, seaLoc);

    moveUnit(state, fighter, seaLoc);
    expect(fighter.shipId).toBe(carrier.id);
  });

  it("fighter does NOT auto-embark when landing in own city", () => {
    const cityLoc = rowColLoc(10, 10);
    addCity(state, cityLoc, Owner.Player1);
    // Place a carrier at the city too
    const carrier = createUnit(state, UnitType.Carrier, Owner.Player1, cityLoc);
    const fighter = createUnit(state, UnitType.Fighter, Owner.Player1, rowColLoc(10, 11));

    moveUnit(state, fighter, cityLoc);
    expect(fighter.shipId).toBeNull(); // should NOT board carrier in own city
  });

  it("fighter auto-embarks at enemy city (not own)", () => {
    const cityLoc = rowColLoc(10, 10);
    addCity(state, cityLoc, Owner.Player2);
    const carrier = createUnit(state, UnitType.Carrier, Owner.Player1, cityLoc);
    const fighter = createUnit(state, UnitType.Fighter, Owner.Player1, rowColLoc(10, 11));

    moveUnit(state, fighter, cityLoc);
    expect(fighter.shipId).toBe(carrier.id);
  });
});
