// Empire Reborn — Shield Mechanic Tests

import { describe, it, expect } from "vitest";
import {
  isShielded,
  processAction,
  autoAttackStructures,
  checkMineTrigger,
} from "../game.js";
import { SHIELD_MAX_MS, SHIELD_INITIAL_MS, SHIELD_CHARGE_RATIO } from "../constants.js";
import type { GameState, ShieldState, UnitState, PlayerAction } from "../types.js";
import {
  Owner,
  UnitType,
  UnitBehavior,
  TerrainType,
  BuildingType,
  configureMapDimensions,
} from "../constants.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeState(overrides?: Partial<GameState>): GameState {
  configureMapDimensions(10, 10);
  const map = Array.from({ length: 100 }, () => ({
    terrain: TerrainType.Land,
    onBoard: true,
    cityId: null,
    depositId: null,
  }));
  return {
    config: { mapWidth: 10, mapHeight: 10, numCities: 2, waterRatio: 0, smoothPasses: 0, minCityDist: 3, seed: 1 },
    turn: 1,
    map,
    cities: [],
    units: [],
    nextUnitId: 100,
    nextCityId: 10,
    players: [
      { id: 1, name: "P1", color: 0xff0000, isAI: false, status: "active" },
      { id: 2, name: "P2", color: 0x0000ff, isAI: true, status: "active" },
    ],
    viewMaps: {},
    rngState: 42,
    resources: { 1: [100, 100, 100], 2: [100, 100, 100] },
    deposits: [],
    nextDepositId: 0,
    buildings: [],
    nextBuildingId: 0,
    techResearch: { 1: [0, 0, 0, 0], 2: [0, 0, 0, 0] },
    kingdoms: {},
    shields: {},
    ...overrides,
  };
}

function makeUnit(id: number, owner: number, loc: number, type: UnitType = UnitType.Army): UnitState {
  return {
    id,
    type,
    owner: owner as Owner,
    loc,
    hits: 3,
    moved: 0,
    func: UnitBehavior.None,
    shipId: null,
    cargoIds: [],
    range: 100,
    targetLoc: null,
  };
}

// ─── isShielded ─────────────────────────────────────────────────────────────

describe("isShielded", () => {
  it("returns false when no shields defined", () => {
    const state = makeState();
    expect(isShielded(state, 1)).toBe(false);
  });

  it("returns false when shield exists but is not active", () => {
    const state = makeState({
      shields: { 1: { chargeMs: 1000, activatedAt: null, isActive: false } },
    });
    expect(isShielded(state, 1)).toBe(false);
  });

  it("returns true when shield is active", () => {
    const state = makeState({
      shields: { 1: { chargeMs: 1000, activatedAt: Date.now(), isActive: true } },
    });
    expect(isShielded(state, 1)).toBe(true);
  });

  it("returns false for a different player", () => {
    const state = makeState({
      shields: { 1: { chargeMs: 1000, activatedAt: Date.now(), isActive: true } },
    });
    expect(isShielded(state, 2)).toBe(false);
  });
});

// ─── Shield Constants ───────────────────────────────────────────────────────

describe("Shield Constants", () => {
  it("SHIELD_MAX_MS is 8 hours", () => {
    expect(SHIELD_MAX_MS).toBe(8 * 60 * 60 * 1000);
  });

  it("SHIELD_INITIAL_MS is 2 hours", () => {
    expect(SHIELD_INITIAL_MS).toBe(2 * 60 * 60 * 1000);
  });

  it("SHIELD_CHARGE_RATIO is 1.0", () => {
    expect(SHIELD_CHARGE_RATIO).toBe(1.0);
  });
});

// ─── Attack blocked by shield ───────────────────────────────────────────────

describe("Shield blocks combat", () => {
  it("attack on shielded unit produces no events", () => {
    const state = makeState({
      shields: { 2: { chargeMs: 1000, activatedAt: Date.now(), isActive: true } },
    });
    const attacker = makeUnit(1, 1, 11);
    const defender = makeUnit(2, 2, 12);
    state.units = [attacker, defender];

    const action: PlayerAction = { type: "attack", unitId: 1, targetLoc: 12 };
    const events = processAction(state, action, 1 as Owner);
    expect(events).toHaveLength(0);
    // Both units should still be alive
    expect(state.units.find(u => u.id === 1)!.hits).toBe(3);
    expect(state.units.find(u => u.id === 2)!.hits).toBe(3);
  });

  it("attack on shielded city produces no events", () => {
    const state = makeState({
      shields: { 2: { chargeMs: 1000, activatedAt: Date.now(), isActive: true } },
    });
    state.cities = [{
      id: 0, loc: 12, owner: 2 as Owner, production: UnitType.Army,
      work: 0, func: new Array(15).fill(UnitBehavior.None), upgradeIds: [],
    }];
    state.map[12].cityId = 0;
    const attacker = makeUnit(1, 1, 11);
    state.units = [attacker];

    const action: PlayerAction = { type: "attack", unitId: 1, targetLoc: 12 };
    const events = processAction(state, action, 1 as Owner);
    expect(events).toHaveLength(0);
    expect(state.cities[0].owner).toBe(2);
  });

  it("attack on non-shielded unit works normally", () => {
    const state = makeState({
      shields: { 2: { chargeMs: 1000, activatedAt: null, isActive: false } },
    });
    const attacker = makeUnit(1, 1, 11);
    const defender = makeUnit(2, 2, 12);
    state.units = [attacker, defender];

    const action: PlayerAction = { type: "attack", unitId: 1, targetLoc: 12 };
    const events = processAction(state, action, 1 as Owner);
    expect(events.length).toBeGreaterThan(0);
  });

  it("bombard on shielded unit produces no events", () => {
    const state = makeState({
      shields: { 2: { chargeMs: 1000, activatedAt: Date.now(), isActive: true } },
    });
    // Artillery at loc 11, target at loc 31 (2 tiles away)
    const artillery = makeUnit(1, 1, 11, UnitType.Artillery);
    artillery.hits = 2;
    const target = makeUnit(2, 2, 31);
    state.units = [artillery, target];

    const action: PlayerAction = { type: "bombard", unitId: 1, targetLoc: 31 };
    const events = processAction(state, action, 1 as Owner);
    expect(events).toHaveLength(0);
    expect(target.hits).toBe(3); // no damage
  });

  it("autoAttackStructures skips shielded enemy units", () => {
    configureMapDimensions(10, 10);
    const state = makeState({
      shields: { 2: { chargeMs: 1000, activatedAt: Date.now(), isActive: true } },
    });
    // Bunker at loc 22, enemy unit at adjacent loc 23
    state.buildings = [{
      id: 0, loc: 22, type: BuildingType.Bunker, owner: 1 as Owner,
      level: 1, work: 4, buildTime: 4, complete: true, constructorId: null, hp: 5,
    }];
    const enemy = makeUnit(2, 2, 23);
    state.units = [enemy];

    const events = autoAttackStructures(state, 1 as Owner);
    expect(events).toHaveLength(0);
    expect(enemy.hits).toBe(3); // no damage
  });

  it("checkMineTrigger does not trigger mines for shielded units", () => {
    configureMapDimensions(10, 10);
    const state = makeState({
      shields: { 2: { chargeMs: 1000, activatedAt: Date.now(), isActive: true } },
    });
    // Mine at loc 33 owned by P1
    state.buildings = [{
      id: 0, loc: 33, type: BuildingType.Minefield, owner: 1 as Owner,
      level: 1, work: 3, buildTime: 3, complete: true, constructorId: null, hp: 0,
    }];
    const unit = makeUnit(2, 2, 33);
    state.units = [unit];

    const events = checkMineTrigger(state, unit);
    expect(events).toHaveLength(0);
    expect(unit.hits).toBe(3);
    // Mine should still exist
    expect(state.buildings).toHaveLength(1);
  });

  it("shielded player can still attack others", () => {
    const state = makeState({
      shields: { 1: { chargeMs: 1000, activatedAt: Date.now(), isActive: true } },
    });
    const attacker = makeUnit(1, 1, 11);
    const defender = makeUnit(2, 2, 12);
    state.units = [attacker, defender];

    const action: PlayerAction = { type: "attack", unitId: 1, targetLoc: 12 };
    const events = processAction(state, action, 1 as Owner);
    // Shielded attacker can still attack — shield only protects, doesn't restrict
    expect(events.length).toBeGreaterThan(0);
  });
});
