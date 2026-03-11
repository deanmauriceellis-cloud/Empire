import { describe, it, expect } from "vitest";
import {
  Owner,
  UnitType,
  UnitBehavior,
  TerrainType,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_SIZE,
  TechType,
  STARTING_ORE,
  STARTING_OIL,
  STARTING_TEXTILE,
  INFINITY,
} from "../constants.js";
import type { GameState, MapCell, PlayerInfo } from "../types.js";
import { initViewMap, createUnit, attackUnit, repairShips, objMoves, objCapacity } from "../game.js";
import { UNIT_ATTRIBUTES } from "../units.js";
import {
  getTechLevel,
  getPlayerTechLevels,
  pointsToNextLevel,
  TECH_THRESHOLDS,
  MAX_TECH_LEVEL,
  techVisionBonus,
  techMaxHpBonus,
  techStrengthBonus,
  techCityHealRate,
  techShipsHealAtSea,
  techFighterRangeBonus,
  techSatelliteRangeBonus,
  techConstructionSpeedBonus,
  getEffectiveStrength,
  getEffectiveMaxHp,
  getEffectiveSpeed,
  getEffectiveFighterRange,
  getEffectiveSatelliteRange,
  getActiveTechBonuses,
  getNextLevelPreview,
  canProduceUnit,
} from "../tech.js";

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
    kingdoms: {},
    players: [
      { id: 1, name: "Player 1", color: 0x00cc00, isAI: false, status: "active" as const },
      { id: 2, name: "Player 2", color: 0xcc0000, isAI: true, status: "active" as const },
    ],
  };
}

function addCity(state: GameState, loc: number, owner: Owner) {
  const idx = state.cities.length;
  const city = {
    id: idx,
    loc,
    owner,
    production: UnitType.Army,
    work: 0,
    func: new Array(10).fill(UnitBehavior.None),
    upgradeIds: [],
  };
  state.cities.push(city);
  state.map[loc].terrain = TerrainType.City;
  state.map[loc].cityId = idx;
  return city;
}

// ─── Tech Level Calculation ────────────────────────────────────────────────

describe("Tech Level Calculation", () => {
  it("returns level 0 for 0 points", () => {
    expect(getTechLevel(0)).toBe(0);
  });

  it("returns level 0 for points below first threshold", () => {
    expect(getTechLevel(9)).toBe(0);
  });

  it("returns level 1 at exactly 10 points", () => {
    expect(getTechLevel(10)).toBe(1);
  });

  it("returns level 2 at 30 points", () => {
    expect(getTechLevel(30)).toBe(2);
  });

  it("returns level 3 at 60 points", () => {
    expect(getTechLevel(60)).toBe(3);
  });

  it("returns level 4 at 100 points", () => {
    expect(getTechLevel(100)).toBe(4);
  });

  it("returns level 5 at 150 points", () => {
    expect(getTechLevel(150)).toBe(5);
  });

  it("returns level 5 for points well above 150", () => {
    expect(getTechLevel(999)).toBe(5);
  });

  it("returns correct levels between thresholds", () => {
    expect(getTechLevel(15)).toBe(1);
    expect(getTechLevel(29)).toBe(1);
    expect(getTechLevel(45)).toBe(2);
    expect(getTechLevel(59)).toBe(2);
    expect(getTechLevel(80)).toBe(3);
    expect(getTechLevel(99)).toBe(3);
    expect(getTechLevel(120)).toBe(4);
    expect(getTechLevel(149)).toBe(4);
  });

  it("getPlayerTechLevels returns all 4 levels", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [10, 30, 60, 100];
    const levels = getPlayerTechLevels(state, Owner.Player1);
    expect(levels).toEqual([1, 2, 3, 4]);
  });

  it("pointsToNextLevel returns correct values", () => {
    expect(pointsToNextLevel(0)).toBe(10);
    expect(pointsToNextLevel(5)).toBe(5);
    expect(pointsToNextLevel(10)).toBe(20); // need 30 for level 2, have 10
    expect(pointsToNextLevel(150)).toBe(0); // already max
    expect(pointsToNextLevel(200)).toBe(0);
  });

  it("thresholds are correctly ordered", () => {
    for (let i = 1; i < TECH_THRESHOLDS.length; i++) {
      expect(TECH_THRESHOLDS[i]).toBeGreaterThan(TECH_THRESHOLDS[i - 1]);
    }
  });

  it("max tech level is 5", () => {
    expect(MAX_TECH_LEVEL).toBe(5);
  });
});

// ─── Tech Bonuses (Unit Functions) ─────────────────────────────────────────

describe("Tech Vision Bonus", () => {
  it("no bonus at level 0", () => {
    expect(techVisionBonus(0, 0, UnitType.Army)).toBe(0);
  });

  it("Science 2 gives +1 to all units", () => {
    expect(techVisionBonus(2, 0, UnitType.Army)).toBe(1);
    expect(techVisionBonus(2, 0, UnitType.Fighter)).toBe(1);
    expect(techVisionBonus(2, 0, UnitType.Battleship)).toBe(1);
  });

  it("Electronics 1 gives +1 to ships only", () => {
    expect(techVisionBonus(0, 1, UnitType.Patrol)).toBe(1);
    expect(techVisionBonus(0, 1, UnitType.Destroyer)).toBe(1);
    expect(techVisionBonus(0, 1, UnitType.Battleship)).toBe(1);
    expect(techVisionBonus(0, 1, UnitType.Army)).toBe(0);
    expect(techVisionBonus(0, 1, UnitType.Fighter)).toBe(0);
  });

  it("Science 2 + Electronics 1 stacks for ships", () => {
    expect(techVisionBonus(2, 1, UnitType.Patrol)).toBe(2);
    expect(techVisionBonus(2, 1, UnitType.Army)).toBe(1); // only sci
  });
});

describe("Tech Max HP Bonus", () => {
  it("no bonus at level 0", () => {
    expect(techMaxHpBonus(0, UnitType.Army)).toBe(0);
  });

  it("Health 2 gives Army +1 HP", () => {
    expect(techMaxHpBonus(2, UnitType.Army)).toBe(1);
    expect(techMaxHpBonus(2, UnitType.Fighter)).toBe(0);
  });

  it("Health 3 gives land units +1 HP (stacks with Health 2 for Army)", () => {
    expect(techMaxHpBonus(3, UnitType.Army)).toBe(2); // Health 2 + Health 3
    expect(techMaxHpBonus(3, UnitType.Construction)).toBe(1);
    expect(techMaxHpBonus(3, UnitType.Fighter)).toBe(0);
    expect(techMaxHpBonus(3, UnitType.Patrol)).toBe(0);
  });

  it("Health 5 gives all units +1 HP", () => {
    expect(techMaxHpBonus(5, UnitType.Army)).toBe(3); // H2+H3+H5
    expect(techMaxHpBonus(5, UnitType.Fighter)).toBe(1);
    expect(techMaxHpBonus(5, UnitType.Battleship)).toBe(1);
  });
});

describe("Tech Strength Bonus", () => {
  it("no bonus at level 0", () => {
    expect(techStrengthBonus(0, UnitType.Army)).toBe(0);
  });

  it("War 1 gives Army +1 strength", () => {
    expect(techStrengthBonus(1, UnitType.Army)).toBe(1);
    expect(techStrengthBonus(1, UnitType.Fighter)).toBe(0);
  });

  it("War 2 gives ships +1 strength", () => {
    expect(techStrengthBonus(2, UnitType.Patrol)).toBe(1);
    expect(techStrengthBonus(2, UnitType.Destroyer)).toBe(1);
    expect(techStrengthBonus(2, UnitType.Army)).toBe(1); // still has War 1
    expect(techStrengthBonus(2, UnitType.Fighter)).toBe(0);
  });

  it("War 3 gives Fighter +1 strength", () => {
    expect(techStrengthBonus(3, UnitType.Fighter)).toBe(1);
  });

  it("War 4 gives all units +1", () => {
    expect(techStrengthBonus(4, UnitType.Army)).toBe(2); // W1+W4
    expect(techStrengthBonus(4, UnitType.Patrol)).toBe(2); // W2+W4
    expect(techStrengthBonus(4, UnitType.Fighter)).toBe(2); // W3+W4
    expect(techStrengthBonus(4, UnitType.Satellite)).toBe(1); // W4 only
  });

  it("War 5 gives additional +1 (cumulative)", () => {
    expect(techStrengthBonus(5, UnitType.Army)).toBe(3); // W1+W4+W5
    expect(techStrengthBonus(5, UnitType.Fighter)).toBe(3); // W3+W4+W5
  });
});

describe("Tech Healing", () => {
  it("default city heal rate is 1", () => {
    expect(techCityHealRate(0)).toBe(1);
  });

  it("Health 1 increases city heal rate to 2", () => {
    expect(techCityHealRate(1)).toBe(2);
  });

  it("ships don't heal at sea by default", () => {
    expect(techShipsHealAtSea(0)).toBe(false);
    expect(techShipsHealAtSea(3)).toBe(false);
  });

  it("Health 4 enables ship healing at sea", () => {
    expect(techShipsHealAtSea(4)).toBe(true);
  });
});

describe("Tech Range Bonus", () => {
  it("no fighter range bonus below Electronics 3", () => {
    expect(techFighterRangeBonus(0)).toBe(0);
    expect(techFighterRangeBonus(2)).toBe(0);
  });

  it("Electronics 3 gives +2 fighter range", () => {
    expect(techFighterRangeBonus(3)).toBe(2);
  });

  it("no satellite range bonus below Electronics 4", () => {
    expect(techSatelliteRangeBonus(0)).toBe(0);
    expect(techSatelliteRangeBonus(3)).toBe(0);
  });

  it("Electronics 4 gives +100 satellite range", () => {
    expect(techSatelliteRangeBonus(4)).toBe(100);
  });
});

describe("Tech Construction Speed", () => {
  it("no speed bonus below Science 4", () => {
    expect(techConstructionSpeedBonus(0)).toBe(0);
    expect(techConstructionSpeedBonus(3)).toBe(0);
  });

  it("Science 4 gives construction unit +1 speed", () => {
    expect(techConstructionSpeedBonus(4)).toBe(1);
  });
});

// ─── Effective Stats (using GameState) ──────────────────────────────────────

describe("Effective Unit Stats", () => {
  it("effective strength includes war tech bonus", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [0, 0, 0, 10]; // War level 1
    const str = getEffectiveStrength(state, { type: UnitType.Army, owner: Owner.Player1 });
    expect(str).toBe(2); // base 1 + War1 bonus 1
  });

  it("effective max HP includes health tech bonus", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [0, 30, 0, 0]; // Health level 2
    const hp = getEffectiveMaxHp(state, { type: UnitType.Army, owner: Owner.Player1 });
    expect(hp).toBe(2); // base 1 + Health2 bonus 1
  });

  it("effective speed includes science tech bonus for construction", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [100, 0, 0, 0]; // Science level 4
    const spd = getEffectiveSpeed(state, { type: UnitType.Construction, owner: Owner.Player1 });
    expect(spd).toBe(2); // base 1 + Sci4 bonus 1
  });

  it("effective speed doesn't change for non-construction units", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [100, 0, 0, 0]; // Science level 4
    const spd = getEffectiveSpeed(state, { type: UnitType.Army, owner: Owner.Player1 });
    expect(spd).toBe(1); // base 1, no bonus
  });

  it("effective fighter range includes electronics bonus", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [0, 0, 60, 0]; // Electronics level 3
    const range = getEffectiveFighterRange(state, Owner.Player1);
    expect(range).toBe(34); // base 32 + 2
  });

  it("effective satellite range includes electronics bonus", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [0, 0, 100, 0]; // Electronics level 4
    const range = getEffectiveSatelliteRange(state, Owner.Player1);
    expect(range).toBe(600); // base 500 + 100
  });
});

// ─── Integration: createUnit with tech bonuses ─────────────────────────────

describe("createUnit with tech bonuses", () => {
  it("new army gets tech-boosted HP", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [0, 30, 0, 0]; // Health 2 → Army +1 HP
    const loc = MAP_WIDTH + 1;
    const unit = createUnit(state, UnitType.Army, Owner.Player1, loc);
    expect(unit.hits).toBe(2); // base 1 + bonus 1
  });

  it("new fighter gets tech-boosted range", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [0, 0, 60, 0]; // Electronics 3 → +2 range
    const loc = MAP_WIDTH + 1;
    const unit = createUnit(state, UnitType.Fighter, Owner.Player1, loc);
    expect(unit.range).toBe(34); // base 32 + 2
  });

  it("new satellite gets tech-boosted range", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [0, 0, 100, 0]; // Electronics 4 → +100 range
    const loc = MAP_WIDTH + 1;
    const unit = createUnit(state, UnitType.Satellite, Owner.Player1, loc);
    expect(unit.range).toBe(600); // base 500 + 100
  });

  it("units without tech have base stats", () => {
    const state = createTestState();
    const loc = MAP_WIDTH + 1;
    const army = createUnit(state, UnitType.Army, Owner.Player1, loc);
    expect(army.hits).toBe(1);
    const fighter = createUnit(state, UnitType.Fighter, Owner.Player1, loc);
    expect(fighter.range).toBe(32);
  });
});

// ─── Integration: Combat with tech strength ─────────────────────────────────

describe("Combat with tech bonuses", () => {
  it("tech-boosted army deals more damage in combat", () => {
    const state = createTestState();
    // War 4 = all units +1 strength (on top of War 1 for armies)
    state.techResearch[Owner.Player1] = [0, 0, 0, 100]; // War level 4

    const loc1 = MAP_WIDTH * 5 + 5;
    const loc2 = MAP_WIDTH * 5 + 6;

    // Player1 army: base str 1 + War1(+1) + War4(+1) = 3
    const attacker = createUnit(state, UnitType.Army, Owner.Player1, loc1);

    // Player2 destroyer: base str 1, 3 HP, no tech
    state.map[loc2].terrain = TerrainType.Sea;
    const defender = createUnit(state, UnitType.Destroyer, Owner.Player2, loc2);

    // Effective strength should be applied
    const attStr = getEffectiveStrength(state, attacker);
    const defStr = getEffectiveStrength(state, defender);
    expect(attStr).toBe(3); // 1 + 1(W1) + 1(W4)
    expect(defStr).toBe(1); // base, no tech
  });
});

// ─── Integration: Repair with tech healing ──────────────────────────────────

describe("Repair with tech bonuses", () => {
  it("Health 1 heals 2 HP/turn in own city", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [0, 10, 0, 0]; // Health level 1
    const cityLoc = MAP_WIDTH * 5 + 5;
    addCity(state, cityLoc, Owner.Player1);

    // Create a damaged destroyer at the city
    state.map[cityLoc].terrain = TerrainType.City;
    const unit = createUnit(state, UnitType.Destroyer, Owner.Player1, cityLoc);
    unit.hits = 1; // damaged (max 3)

    repairShips(state, Owner.Player1, new Set());
    expect(unit.hits).toBe(3); // healed 2 HP (1 + 2 = 3, capped at max)
  });

  it("Health 4 heals ships at sea", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [0, 100, 0, 0]; // Health level 4
    const seaLoc = MAP_WIDTH * 5 + 5;
    state.map[seaLoc].terrain = TerrainType.Sea;

    const unit = createUnit(state, UnitType.Destroyer, Owner.Player1, seaLoc);
    unit.hits = 2; // damaged

    repairShips(state, Owner.Player1, new Set());
    expect(unit.hits).toBe(3); // healed 1 HP at sea
  });

  it("ships do NOT heal at sea without Health 4", () => {
    const state = createTestState();
    const seaLoc = MAP_WIDTH * 5 + 5;
    state.map[seaLoc].terrain = TerrainType.Sea;

    const unit = createUnit(state, UnitType.Destroyer, Owner.Player1, seaLoc);
    unit.hits = 2;

    repairShips(state, Owner.Player1, new Set());
    expect(unit.hits).toBe(2); // no healing
  });
});

// ─── Integration: objMoves with tech speed ──────────────────────────────────

describe("objMoves with tech bonuses", () => {
  it("construction unit gets +1 speed with Science 4", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [100, 0, 0, 0]; // Science 4
    const loc = MAP_WIDTH + 1;
    const unit = createUnit(state, UnitType.Construction, Owner.Player1, loc);
    expect(objMoves(unit, state)).toBe(2); // base 1 + 1
  });

  it("objMoves without state falls back to base stats", () => {
    const state = createTestState();
    const loc = MAP_WIDTH + 1;
    const unit = createUnit(state, UnitType.Army, Owner.Player1, loc);
    expect(objMoves(unit)).toBe(1); // base only
  });
});

// ─── Unit Unlock Gating ─────────────────────────────────────────────────────

describe("Unit Unlock Gating", () => {
  it("existing units are always producible", () => {
    const state = createTestState();
    expect(canProduceUnit(state, Owner.Player1, UnitType.Army)).toBe(true);
    expect(canProduceUnit(state, Owner.Player1, UnitType.Fighter)).toBe(true);
    expect(canProduceUnit(state, Owner.Player1, UnitType.Patrol)).toBe(true);
    expect(canProduceUnit(state, Owner.Player1, UnitType.Destroyer)).toBe(true);
    expect(canProduceUnit(state, Owner.Player1, UnitType.Submarine)).toBe(true);
    expect(canProduceUnit(state, Owner.Player1, UnitType.Transport)).toBe(true);
    expect(canProduceUnit(state, Owner.Player1, UnitType.Carrier)).toBe(true);
    expect(canProduceUnit(state, Owner.Player1, UnitType.Battleship)).toBe(true);
    expect(canProduceUnit(state, Owner.Player1, UnitType.Satellite)).toBe(true);
    expect(canProduceUnit(state, Owner.Player1, UnitType.Construction)).toBe(true);
  });
});

// ─── UI Helpers ──────────────────────────────────────────────────────────────

describe("Tech UI Helpers", () => {
  it("getActiveTechBonuses returns empty for no tech", () => {
    const state = createTestState();
    const bonuses = getActiveTechBonuses(state, Owner.Player1);
    expect(bonuses).toHaveLength(0);
  });

  it("getActiveTechBonuses lists active bonuses", () => {
    const state = createTestState();
    state.techResearch[Owner.Player1] = [30, 10, 0, 10]; // Sci 2, Health 1, War 1
    const bonuses = getActiveTechBonuses(state, Owner.Player1);
    expect(bonuses.length).toBe(3);
    expect(bonuses.some(b => b.name === "Science" && b.level === 2)).toBe(true);
    expect(bonuses.some(b => b.name === "Health" && b.level === 1)).toBe(true);
    expect(bonuses.some(b => b.name === "War" && b.level === 1)).toBe(true);
  });

  it("getNextLevelPreview returns preview text", () => {
    expect(getNextLevelPreview(TechType.Science, 0)).toBeTruthy();
    expect(getNextLevelPreview(TechType.War, 2)).toBeTruthy();
    expect(getNextLevelPreview(TechType.Health, 5)).toBeNull(); // max level
  });
});
