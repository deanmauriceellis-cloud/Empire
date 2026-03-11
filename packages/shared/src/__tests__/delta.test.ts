import { describe, it, expect } from "vitest";
import {
  snapshotPreTurn,
  computeDelta,
  filterDeltaWithState,
  computeViewMapDelta,
  snapshotViewMap,
  applyDeltaToVisibleState,
  type TurnDelta,
  type FilteredDelta,
  type PreTurnSnapshot,
} from "../delta.js";
import type { GameState, ViewMapCell, UnitState, TurnEvent } from "../types.js";
import type { VisibleCity } from "../protocol.js";
import { Owner, UnitType, UnitBehavior, TerrainType, BuildingType, MAP_WIDTH, MAP_HEIGHT, MAP_SIZE } from "../constants.js";
import { initViewMap, executeTurn } from "../game.js";

// ─── Helpers ──────────────────────────────────────────────────────────────

function createSmallGameState(): GameState {
  const map: import("../types.js").MapCell[] = [];
  for (let i = 0; i < MAP_SIZE; i++) {
    const row = Math.floor(i / MAP_WIDTH);
    const col = i % MAP_WIDTH;
    const onBoard = row > 0 && row < MAP_HEIGHT - 1 && col > 0 && col < MAP_WIDTH - 1;
    map.push({ terrain: TerrainType.Land, onBoard, cityId: null, depositId: null });
  }

  // Place two cities
  const city0Loc = MAP_WIDTH + 1;
  const city1Loc = MAP_WIDTH + 10;
  map[city0Loc].cityId = 0;
  map[city1Loc].cityId = 1;

  return {
    config: {
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      numCities: 2,
      waterRatio: 30,
      smoothPasses: 2,
      minCityDist: 3,
      seed: 42,
    },
    turn: 0,
    map,
    cities: [
      { id: 0, loc: city0Loc, owner: 1 as Owner, production: UnitType.Army, work: 0, func: Array(15).fill(UnitBehavior.None), upgradeIds: [] },
      { id: 1, loc: city1Loc, owner: 2 as Owner, production: UnitType.Army, work: 0, func: Array(15).fill(UnitBehavior.None), upgradeIds: [] },
    ],
    units: [
      makeUnit(1, UnitType.Army, 1, city0Loc + 1),
      makeUnit(2, UnitType.Army, 2, city1Loc + 1),
    ],
    nextUnitId: 3,
    nextCityId: 2,
    viewMaps: {
      [Owner.Unowned]: initViewMap(),
      1: initViewMap(),
      2: initViewMap(),
    },
    rngState: 12345,
    resources: { 0: [0,0,0], 1: [150,100,150], 2: [150,100,150] },
    deposits: [],
    nextDepositId: 0,
    buildings: [],
    nextBuildingId: 0,
    techResearch: { 0: [0,0,0,0], 1: [0,0,0,0], 2: [0,0,0,0] },
    kingdoms: {},
    shields: {},
    players: [
      { id: 1, name: "Player 1", color: 0x00cc00, isAI: false, status: "active" as const },
      { id: 2, name: "Player 2", color: 0xcc0000, isAI: true, status: "active" as const },
    ],
  };
}

function makeUnit(id: number, type: UnitType, owner: number, loc: number, hits = 1): UnitState {
  return {
    id,
    type,
    owner: owner as Owner,
    loc,
    hits,
    moved: 0,
    func: UnitBehavior.None,
    shipId: null,
    cargoIds: [],
    range: 0,
    targetLoc: null,
  };
}

// ─── snapshotPreTurn ──────────────────────────────────────────────────────

describe("snapshotPreTurn", () => {
  it("captures unit locations and IDs", () => {
    const state = createSmallGameState();
    const snap = snapshotPreTurn(state);

    expect(snap.turn).toBe(state.turn);
    expect(snap.unitIds.size).toBe(state.units.length);
    for (const u of state.units) {
      expect(snap.unitLocs.has(u.id)).toBe(true);
      expect(snap.unitLocs.get(u.id)!.loc).toBe(u.loc);
      expect(snap.unitLocs.get(u.id)!.hits).toBe(u.hits);
    }
  });

  it("captures city ownership and production", () => {
    const state = createSmallGameState();
    const snap = snapshotPreTurn(state);

    for (const c of state.cities) {
      expect(snap.cityState.has(c.id)).toBe(true);
      const cs = snap.cityState.get(c.id)!;
      expect(cs.owner).toBe(c.owner);
      expect(cs.production).toBe(c.production);
    }
  });

  it("clones resources (mutation-safe)", () => {
    const state = createSmallGameState();
    const snap = snapshotPreTurn(state);

    // Mutate original
    if (state.resources[1]) {
      state.resources[1][0] += 100;
    }

    // Snapshot should be unchanged
    const snapRes = snap.resources.get(1);
    if (snapRes) {
      expect(snapRes[0]).not.toBe(state.resources[1][0]);
    }
  });
});

// ─── computeDelta ─────────────────────────────────────────────────────────

describe("computeDelta", () => {
  it("detects unit movement", () => {
    const state = createSmallGameState();
    const snap = snapshotPreTurn(state);

    // Move a unit
    const unit = state.units[0];
    const oldLoc = unit.loc;
    unit.loc = oldLoc + 1; // move 1 column
    state.turn += 1;

    const delta = computeDelta(snap, state, []);
    expect(delta.unitMoves.length).toBeGreaterThanOrEqual(1);
    const move = delta.unitMoves.find(m => m.unitId === unit.id);
    expect(move).toBeDefined();
    expect(move!.from).toBe(oldLoc);
    expect(move!.to).toBe(oldLoc + 1);
  });

  it("detects unit creation", () => {
    const state = createSmallGameState();
    const snap = snapshotPreTurn(state);

    // Create a new unit
    const newUnit = makeUnit(999, UnitType.Army, 1, 50);
    state.units.push(newUnit);
    state.turn += 1;

    const delta = computeDelta(snap, state, []);
    expect(delta.unitCreated.length).toBe(1);
    expect(delta.unitCreated[0].unitId).toBe(999);
    expect(delta.unitCreated[0].type).toBe(UnitType.Army);
    expect(delta.unitCreated[0].loc).toBe(50);
  });

  it("detects unit destruction", () => {
    const state = createSmallGameState();
    const snap = snapshotPreTurn(state);

    // Remove first unit
    const removedId = state.units[0].id;
    state.units.splice(0, 1);
    state.turn += 1;

    const delta = computeDelta(snap, state, []);
    expect(delta.unitDestroyed).toContain(removedId);
  });

  it("detects HP changes", () => {
    const state = createSmallGameState();
    const snap = snapshotPreTurn(state);

    // Damage a unit
    const unit = state.units[0];
    unit.hits -= 1;
    state.turn += 1;

    const delta = computeDelta(snap, state, []);
    const hpChange = delta.unitHpChanges.find(h => h.unitId === unit.id);
    expect(hpChange).toBeDefined();
    expect(hpChange!.hits).toBe(unit.hits);
  });

  it("detects city capture", () => {
    const state = createSmallGameState();
    // Ensure we have a city owned by player 2
    const enemyCity = state.cities.find(c => c.owner === 2);
    if (!enemyCity) return; // skip if no enemy city in this seed

    const snap = snapshotPreTurn(state);

    // Capture the city
    enemyCity.owner = 1 as Owner;
    state.turn += 1;

    const delta = computeDelta(snap, state, []);
    expect(delta.cityCaptures.length).toBeGreaterThanOrEqual(1);
    const cap = delta.cityCaptures.find(c => c.cityId === enemyCity.id);
    expect(cap).toBeDefined();
    expect(cap!.oldOwner).toBe(2);
    expect(cap!.newOwner).toBe(1);
  });

  it("detects resource changes", () => {
    const state = createSmallGameState();
    const snap = snapshotPreTurn(state);

    // Modify resources
    state.resources[1][0] += 50;
    state.turn += 1;

    const delta = computeDelta(snap, state, []);
    const resChange = delta.resourceChanges.find(r => r.playerId === 1);
    expect(resChange).toBeDefined();
    expect(resChange!.resources[0]).toBe(state.resources[1][0]);
  });

  it("detects tech changes", () => {
    const state = createSmallGameState();
    const snap = snapshotPreTurn(state);

    state.techResearch[1][0] += 5;
    state.turn += 1;

    const delta = computeDelta(snap, state, []);
    const techChange = delta.techChanges.find(t => t.playerId === 1);
    expect(techChange).toBeDefined();
    expect(techChange!.tech[0]).toBe(state.techResearch[1][0]);
  });

  it("includes combat events in combatResults", () => {
    const events: TurnEvent[] = [
      { type: "combat", loc: 50, description: "Battle" },
      { type: "production", loc: 10, description: "Unit built" },
      { type: "capture", loc: 30, description: "City captured" },
    ];

    const state = createSmallGameState();
    const snap = snapshotPreTurn(state);
    state.turn += 1;

    const delta = computeDelta(snap, state, events);
    // Should include combat + capture + death, not production
    expect(delta.combatResults.length).toBe(2);
    expect(delta.combatResults.some(e => e.type === "combat")).toBe(true);
    expect(delta.combatResults.some(e => e.type === "capture")).toBe(true);
  });

  it("returns empty delta when nothing changes", () => {
    const state = createSmallGameState();
    const snap = snapshotPreTurn(state);
    state.turn += 1;

    const delta = computeDelta(snap, state, []);
    expect(delta.unitMoves.length).toBe(0);
    expect(delta.unitCreated.length).toBe(0);
    expect(delta.unitDestroyed.length).toBe(0);
    expect(delta.cityCaptures.length).toBe(0);
  });

  it("detects building completion", () => {
    const state = createSmallGameState();
    // Add a building
    state.buildings.push({
      id: 0,
      loc: 10,
      type: BuildingType.Mine,
      owner: 1 as Owner,
      level: 1,
      work: 5,
      buildTime: 10,
      complete: false,
      constructorId: null,
      hp: 0,
    });
    state.nextBuildingId = 1;

    const snap = snapshotPreTurn(state);

    // Complete the building
    state.buildings[0].complete = true;
    state.turn += 1;

    const delta = computeDelta(snap, state, []);
    expect(delta.buildingChanges.length).toBe(1);
    expect(delta.buildingChanges[0].complete).toBe(true);
  });
});

// ─── computeViewMapDelta ──────────────────────────────────────────────────

describe("computeViewMapDelta", () => {
  it("returns empty for identical viewMaps", () => {
    const vm: ViewMapCell[] = [
      { contents: "+", seen: 0 },
      { contents: ".", seen: -1 },
      { contents: "*", seen: 1 },
    ];
    const snapshot = snapshotViewMap(vm);
    const changes = computeViewMapDelta(snapshot, vm);
    expect(changes.length).toBe(0);
  });

  it("detects content changes", () => {
    const vm: ViewMapCell[] = [
      { contents: "+", seen: 0 },
      { contents: ".", seen: -1 },
    ];
    const snapshot = snapshotViewMap(vm);

    // Modify viewMap
    vm[0].contents = "A";
    vm[0].seen = 5;

    const changes = computeViewMapDelta(snapshot, vm);
    expect(changes.length).toBe(1);
    expect(changes[0].loc).toBe(0);
    expect(changes[0].contents).toBe("A");
    expect(changes[0].seen).toBe(5);
  });

  it("detects seen changes (fog reveal)", () => {
    const vm: ViewMapCell[] = [
      { contents: " ", seen: -1 },
      { contents: "+", seen: 3 },
    ];
    const snapshot = snapshotViewMap(vm);

    // Reveal the fog cell
    vm[0].contents = "+";
    vm[0].seen = 10;

    const changes = computeViewMapDelta(snapshot, vm);
    expect(changes.length).toBe(1);
    expect(changes[0].loc).toBe(0);
    expect(changes[0].seen).toBe(10);
  });

  it("returns empty for undefined prevViewMap", () => {
    const vm: ViewMapCell[] = [{ contents: "+", seen: 0 }];
    const changes = computeViewMapDelta(undefined, vm);
    expect(changes.length).toBe(0);
  });
});

// ─── snapshotViewMap ──────────────────────────────────────────────────────

describe("snapshotViewMap", () => {
  it("creates independent copy", () => {
    const vm: ViewMapCell[] = [
      { contents: "+", seen: 0 },
      { contents: ".", seen: -1 },
    ];
    const snapshot = snapshotViewMap(vm);

    // Mutate original
    vm[0].contents = "X";
    vm[0].seen = 99;

    // Snapshot should be unchanged
    expect(snapshot[0].contents).toBe("+");
    expect(snapshot[0].seen).toBe(0);
  });
});

// ─── filterDeltaWithState ─────────────────────────────────────────────────

describe("filterDeltaWithState", () => {
  it("filters resources to own player only", () => {
    const state = createSmallGameState();
    const delta: TurnDelta = {
      tick: 1,
      unitMoves: [],
      unitCreated: [],
      unitDestroyed: [],
      unitHpChanges: [],
      combatResults: [],
      buildingChanges: [],
      cityCaptures: [],
      cityProduction: [],
      resourceChanges: [
        { playerId: 1, resources: [100, 50, 75] },
        { playerId: 2, resources: [200, 100, 150] },
      ],
      techChanges: [],
    };

    const filtered = filterDeltaWithState(delta, 1, state);
    expect(filtered.resourceChanges.length).toBe(1);
    expect(filtered.resourceChanges[0].playerId).toBe(1);
  });

  it("filters tech to own player only", () => {
    const state = createSmallGameState();
    const delta: TurnDelta = {
      tick: 1,
      unitMoves: [],
      unitCreated: [],
      unitDestroyed: [],
      unitHpChanges: [],
      combatResults: [],
      buildingChanges: [],
      cityCaptures: [],
      cityProduction: [],
      resourceChanges: [],
      techChanges: [
        { playerId: 1, tech: [10, 5, 0, 3] },
        { playerId: 2, tech: [20, 10, 5, 8] },
      ],
    };

    const filtered = filterDeltaWithState(delta, 1, state);
    expect(filtered.techChanges.length).toBe(1);
    expect(filtered.techChanges[0].playerId).toBe(1);
  });

  it("includes own unit moves regardless of visibility", () => {
    const state = createSmallGameState();
    const unit = state.units.find(u => u.owner === 1);
    if (!unit) return;

    const delta: TurnDelta = {
      tick: 1,
      unitMoves: [{ unitId: unit.id, from: unit.loc, to: unit.loc + 1 }],
      unitCreated: [],
      unitDestroyed: [],
      unitHpChanges: [],
      combatResults: [],
      buildingChanges: [],
      cityCaptures: [],
      cityProduction: [],
      resourceChanges: [],
      techChanges: [],
    };

    const filtered = filterDeltaWithState(delta, 1, state);
    expect(filtered.unitMoves.length).toBe(1);
  });

  it("returns empty delta for player with no viewMap", () => {
    const state = createSmallGameState();
    // Use a non-existent player ID
    const delta: TurnDelta = {
      tick: 1,
      unitMoves: [{ unitId: 1, from: 50, to: 51 }],
      unitCreated: [],
      unitDestroyed: [],
      unitHpChanges: [],
      combatResults: [{ type: "combat", loc: 50, description: "Battle" }],
      buildingChanges: [],
      cityCaptures: [],
      cityProduction: [],
      resourceChanges: [{ playerId: 999, resources: [100, 50, 75] }],
      techChanges: [],
    };

    const filtered = filterDeltaWithState(delta, 999, state);
    expect(filtered.unitMoves.length).toBe(0);
    expect(filtered.events.length).toBe(0);
    expect(filtered.resourceChanges.length).toBe(0);
  });

  it("includes own unit creation", () => {
    const state = createSmallGameState();
    const delta: TurnDelta = {
      tick: 1,
      unitMoves: [],
      unitCreated: [
        { unitId: 999, type: UnitType.Army, owner: 1, loc: 50, hits: 1 },
        { unitId: 1000, type: UnitType.Army, owner: 2, loc: 100, hits: 1 },
      ],
      unitDestroyed: [],
      unitHpChanges: [],
      combatResults: [],
      buildingChanges: [],
      cityCaptures: [],
      cityProduction: [],
      resourceChanges: [],
      techChanges: [],
    };

    const filtered = filterDeltaWithState(delta, 1, state);
    expect(filtered.unitCreated.some(u => u.unitId === 999)).toBe(true);
  });
});

// ─── applyDeltaToVisibleState ─────────────────────────────────────────────

describe("applyDeltaToVisibleState", () => {
  it("applies unit movement", () => {
    const units: UnitState[] = [makeUnit(1, UnitType.Army, 1, 50)];
    const cities: VisibleCity[] = [];
    const viewMap: ViewMapCell[] = Array.from({ length: 100 }, () => ({ contents: "+", seen: 0 }));

    const delta: FilteredDelta = {
      tick: 1,
      unitMoves: [{ unitId: 1, from: 50, to: 51 }],
      unitCreated: [],
      unitDestroyed: [],
      unitHpChanges: [],
      events: [],
      buildingChanges: [],
      cityCaptures: [],
      cityProduction: [],
      resourceChanges: [],
      techChanges: [],
      viewMapChanges: [],
    };

    const modified = applyDeltaToVisibleState(delta, cities, units, viewMap, 1);
    expect(modified).toBe(true);
    expect(units[0].loc).toBe(51);
  });

  it("applies unit destruction", () => {
    const units: UnitState[] = [
      makeUnit(1, UnitType.Army, 1, 50),
      makeUnit(2, UnitType.Army, 1, 60),
    ];
    const cities: VisibleCity[] = [];
    const viewMap: ViewMapCell[] = [];

    const delta: FilteredDelta = {
      tick: 1,
      unitMoves: [],
      unitCreated: [],
      unitDestroyed: [1],
      unitHpChanges: [],
      events: [],
      buildingChanges: [],
      cityCaptures: [],
      cityProduction: [],
      resourceChanges: [],
      techChanges: [],
      viewMapChanges: [],
    };

    applyDeltaToVisibleState(delta, cities, units, viewMap, 1);
    expect(units.length).toBe(1);
    expect(units[0].id).toBe(2);
  });

  it("applies unit creation", () => {
    const units: UnitState[] = [];
    const cities: VisibleCity[] = [];
    const viewMap: ViewMapCell[] = [];

    const delta: FilteredDelta = {
      tick: 1,
      unitMoves: [],
      unitCreated: [{ unitId: 5, type: UnitType.Army, owner: 1, loc: 30, hits: 1 }],
      unitDestroyed: [],
      unitHpChanges: [],
      events: [],
      buildingChanges: [],
      cityCaptures: [],
      cityProduction: [],
      resourceChanges: [],
      techChanges: [],
      viewMapChanges: [],
    };

    applyDeltaToVisibleState(delta, cities, units, viewMap, 1);
    expect(units.length).toBe(1);
    expect(units[0].id).toBe(5);
    expect(units[0].loc).toBe(30);
  });

  it("applies viewMap changes", () => {
    const viewMap: ViewMapCell[] = [
      { contents: " ", seen: -1 },
      { contents: "+", seen: 0 },
    ];
    const units: UnitState[] = [];
    const cities: VisibleCity[] = [];

    const delta: FilteredDelta = {
      tick: 1,
      unitMoves: [],
      unitCreated: [],
      unitDestroyed: [],
      unitHpChanges: [],
      events: [],
      buildingChanges: [],
      cityCaptures: [],
      cityProduction: [],
      resourceChanges: [],
      techChanges: [],
      viewMapChanges: [{ loc: 0, contents: "+", seen: 5 }],
    };

    applyDeltaToVisibleState(delta, cities, units, viewMap, 1);
    expect(viewMap[0].contents).toBe("+");
    expect(viewMap[0].seen).toBe(5);
  });

  it("applies city capture", () => {
    const cities: VisibleCity[] = [
      { id: 0, loc: 10, owner: 2 as Owner, production: null, work: null },
    ];
    const units: UnitState[] = [];
    const viewMap: ViewMapCell[] = [];

    const delta: FilteredDelta = {
      tick: 1,
      unitMoves: [],
      unitCreated: [],
      unitDestroyed: [],
      unitHpChanges: [],
      events: [],
      buildingChanges: [],
      cityCaptures: [{ cityId: 0, loc: 10, oldOwner: 2, newOwner: 1 }],
      cityProduction: [],
      resourceChanges: [],
      techChanges: [],
      viewMapChanges: [],
    };

    applyDeltaToVisibleState(delta, cities, units, viewMap, 1);
    expect(cities[0].owner).toBe(1);
  });

  it("applies HP changes", () => {
    const units: UnitState[] = [makeUnit(1, UnitType.Army, 1, 50, 3)];
    const cities: VisibleCity[] = [];
    const viewMap: ViewMapCell[] = [];

    const delta: FilteredDelta = {
      tick: 1,
      unitMoves: [],
      unitCreated: [],
      unitDestroyed: [],
      unitHpChanges: [{ unitId: 1, hits: 1 }],
      events: [],
      buildingChanges: [],
      cityCaptures: [],
      cityProduction: [],
      resourceChanges: [],
      techChanges: [],
      viewMapChanges: [],
    };

    applyDeltaToVisibleState(delta, cities, units, viewMap, 1);
    expect(units[0].hits).toBe(1);
  });

  it("returns false when no changes", () => {
    const units: UnitState[] = [makeUnit(1, UnitType.Army, 1, 50)];
    const cities: VisibleCity[] = [];
    const viewMap: ViewMapCell[] = [];

    const delta: FilteredDelta = {
      tick: 1,
      unitMoves: [],
      unitCreated: [],
      unitDestroyed: [],
      unitHpChanges: [],
      events: [],
      buildingChanges: [],
      cityCaptures: [],
      cityProduction: [],
      resourceChanges: [],
      techChanges: [],
      viewMapChanges: [],
    };

    const modified = applyDeltaToVisibleState(delta, cities, units, viewMap, 1);
    expect(modified).toBe(false);
  });
});

// ─── Integration: snapshot → executeTurn → computeDelta ───────────────────

describe("delta integration", () => {
  it("captures real turn changes via snapshot + executeTurn + computeDelta", () => {
    const state = createSmallGameState();
    const snap = snapshotPreTurn(state);

    // Run a real turn with AI
    const allActions = new Map<number, any[]>();
    for (const player of state.players) {
      allActions.set(player.id, []);
    }
    const result = executeTurn(state, allActions);
    const delta = computeDelta(snap, state, result.events);

    // Turn should have advanced
    expect(delta.tick).toBe(1);

    // At minimum, resources should change (city income)
    const hasResourceChange = delta.resourceChanges.length > 0;
    const hasCityProdChange = delta.cityProduction.length > 0;
    expect(hasResourceChange || hasCityProdChange).toBe(true);
  });

  it("delta + filter + apply round-trips correctly", () => {
    const state = createSmallGameState();

    // Build initial visible state for player 1
    const vm1 = state.viewMaps[1];
    const initialCities: VisibleCity[] = state.cities
      .filter(c => vm1[c.loc]?.seen >= 0)
      .map(c => ({
        id: c.id,
        loc: c.loc,
        owner: c.owner,
        production: c.owner === 1 ? c.production : null,
        work: c.owner === 1 ? c.work : null,
      }));
    const initialUnits = state.units.filter(u =>
      u.owner === 1 || vm1[u.loc]?.seen === state.turn,
    );
    const initialViewMap = snapshotViewMap(vm1);

    // Snapshot before turn
    const snap = snapshotPreTurn(state);
    const preVm = snapshotViewMap(vm1);

    // Execute turn
    const allActions = new Map<number, any[]>();
    for (const player of state.players) {
      allActions.set(player.id, []);
    }
    const result = executeTurn(state, allActions);

    // Compute and filter delta
    const delta = computeDelta(snap, state, result.events);
    const filtered = filterDeltaWithState(delta, 1, state);
    filtered.viewMapChanges = computeViewMapDelta(preVm, vm1);

    // Apply delta to initial state copy
    applyDeltaToVisibleState(
      filtered,
      initialCities,
      initialUnits,
      initialViewMap,
      1,
    );

    // Verify viewMap matches for all changed cells
    for (const change of filtered.viewMapChanges) {
      expect(initialViewMap[change.loc].contents).toBe(vm1[change.loc].contents);
      expect(initialViewMap[change.loc].seen).toBe(vm1[change.loc].seen);
    }
  });
});
