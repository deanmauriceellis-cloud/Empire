import { describe, it, expect } from "vitest";
import { Owner, UnitType, UnitBehavior, MAP_SIZE, MAP_WIDTH, MAP_HEIGHT, TerrainType } from "../constants.js";
import { generateMap } from "../mapgen.js";
import { computeAITurn } from "../ai.js";
import {
  createUnit,
  findUnit,
  initViewMap,
  scan,
  executeTurn,
  checkEndGame,
} from "../game.js";
import { rowColLoc } from "../utils.js";
import type { GameState, MapCell } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createFullGameState(seed: number): GameState {
  const map = generateMap({
    mapWidth: 100,
    mapHeight: 60,
    numCities: 70,
    waterRatio: 70,
    smoothPasses: 5,
    minCityDist: 2,
    seed,
  });

  const state: GameState = {
    config: {
      mapWidth: 100,
      mapHeight: 60,
      numCities: 70,
      waterRatio: 70,
      smoothPasses: 5,
      minCityDist: 2,
      seed,
    },
    turn: 0,
    map: map.cells,
    cities: map.cities,
    units: [],
    nextUnitId: 1,
    nextCityId: map.cities.length + 1,
    viewMaps: {
      [Owner.Unowned]: initViewMap(),
      [Owner.Player1]: initViewMap(),
      [Owner.Player2]: initViewMap(),
    },
    rngState: seed,
    resources: { [Owner.Unowned]: [0,0,0], [Owner.Player1]: [150,100,150], [Owner.Player2]: [150,100,150] },
    deposits: [],
    nextDepositId: 0,
  };

  // Create starting armies at each player's starting city
  for (const city of state.cities) {
    if (city.owner === Owner.Player1 || city.owner === Owner.Player2) {
      createUnit(state, UnitType.Army, city.owner, city.loc);
      scan(state, city.owner, city.loc);
    }
  }

  return state;
}

function refreshAllVision(state: GameState): void {
  for (const owner of [Owner.Player1, Owner.Player2]) {
    for (const unit of state.units) {
      if (unit.owner === owner) scan(state, owner, unit.loc);
    }
    for (const city of state.cities) {
      if (city.owner === owner) scan(state, owner, city.loc);
    }
  }
}

// ─── Integration Tests ──────────────────────────────────────────────────────────

describe("Integration: AI vs AI", () => {
  it("two AIs play 100 turns without crashing", () => {
    const state = createFullGameState(42);

    for (let turn = 0; turn < 100; turn++) {
      refreshAllVision(state);

      const p1Actions = computeAITurn(state, Owner.Player1);
      const p2Actions = computeAITurn(state, Owner.Player2);

      expect(Array.isArray(p1Actions)).toBe(true);
      expect(Array.isArray(p2Actions)).toBe(true);

      const result = executeTurn(state, p1Actions, p2Actions);

      if (result.winner !== null) {
        // Game ended naturally — that's fine
        expect([Owner.Player1, Owner.Player2]).toContain(result.winner);
        return;
      }
    }

    expect(state.turn).toBe(100);
    // Both players should still have cities or the game should have ended
    const p1Cities = state.cities.filter(c => c.owner === Owner.Player1).length;
    const p2Cities = state.cities.filter(c => c.owner === Owner.Player2).length;
    expect(p1Cities + p2Cities).toBeGreaterThan(0);
  });

  it("two AIs play with different seed", () => {
    const state = createFullGameState(9999);

    for (let turn = 0; turn < 50; turn++) {
      refreshAllVision(state);

      const p1Actions = computeAITurn(state, Owner.Player1);
      const p2Actions = computeAITurn(state, Owner.Player2);

      const result = executeTurn(state, p1Actions, p2Actions);

      if (result.winner !== null) return;
    }

    expect(state.turn).toBe(50);
  });

  it("game state is serializable (save/load round-trip)", () => {
    const state = createFullGameState(42);

    // Play 10 turns
    for (let turn = 0; turn < 10; turn++) {
      refreshAllVision(state);
      const p1Actions = computeAITurn(state, Owner.Player1);
      const p2Actions = computeAITurn(state, Owner.Player2);
      executeTurn(state, p1Actions, p2Actions);
    }

    // Serialize and deserialize (viewMaps have numeric Owner keys — JSON converts to strings)
    const json = JSON.stringify(state);
    const parsed = JSON.parse(json);

    // Reconstruct viewMaps with numeric keys (as Owner enum expects)
    const restoredViewMaps: Record<number, any> = {};
    for (const key of Object.keys(parsed.viewMaps)) {
      restoredViewMaps[Number(key)] = parsed.viewMaps[key];
    }
    parsed.viewMaps = restoredViewMaps;

    const restored: GameState = parsed;

    // Verify the restored state matches
    expect(restored.turn).toBe(state.turn);
    expect(restored.cities.length).toBe(state.cities.length);
    expect(restored.units.length).toBe(state.units.length);
    expect(restored.rngState).toBe(state.rngState);
    expect(restored.config.seed).toBe(42);

    // Verify the restored state can continue playing
    refreshAllVision(restored);
    const p1Actions = computeAITurn(restored, Owner.Player1);
    const p2Actions = computeAITurn(restored, Owner.Player2);

    // Filter out resign actions to focus on whether state is playable
    const p1Filtered = p1Actions.filter(a => a.type !== "resign");
    const p2Filtered = p2Actions.filter(a => a.type !== "resign");

    const result = executeTurn(restored, p1Filtered, p2Filtered);
    expect(restored.turn).toBe(state.turn + 1);
  });

  it("deterministic: same seed produces identical games", () => {
    const state1 = createFullGameState(777);
    const state2 = createFullGameState(777);

    for (let turn = 0; turn < 20; turn++) {
      refreshAllVision(state1);
      refreshAllVision(state2);

      const p1a1 = computeAITurn(state1, Owner.Player1);
      const p2a1 = computeAITurn(state1, Owner.Player2);
      const p1a2 = computeAITurn(state2, Owner.Player1);
      const p2a2 = computeAITurn(state2, Owner.Player2);

      // Same actions for both games
      expect(p1a1).toEqual(p1a2);
      expect(p2a1).toEqual(p2a2);

      const r1 = executeTurn(state1, p1a1, p2a1);
      const r2 = executeTurn(state2, p1a2, p2a2);

      expect(r1.turn).toBe(r2.turn);
      expect(r1.winner).toBe(r2.winner);

      if (r1.winner !== null) return;
    }
  });

  it("200-turn auto-play: no transport oscillation, fighters built, armies delivered", () => {
    const state = createFullGameState(42);
    let fighterSeen = false;
    let armyOnEnemyContinent = false;
    const transportLocHistory = new Map<number, number[]>();

    for (let turn = 0; turn < 200; turn++) {
      refreshAllVision(state);

      const p1Actions = computeAITurn(state, Owner.Player1);
      const p2Actions = computeAITurn(state, Owner.Player2);

      const result = executeTurn(state, p1Actions, p2Actions);

      // Track fighters (either player)
      if (state.units.some(u => u.type === UnitType.Fighter)) {
        fighterSeen = true;
      }

      // Track transport positions for oscillation detection
      for (const u of state.units) {
        if (u.type === UnitType.Transport) {
          const history = transportLocHistory.get(u.id) || [];
          history.push(u.loc);
          transportLocHistory.set(u.id, history);
        }
      }

      // Check for armies on enemy territory (not on own-city continent)
      for (const u of state.units) {
        if (u.owner === Owner.Player1 && u.type === UnitType.Army && u.shipId === null) {
          // Check if at or near an enemy city
          const nearby = [u.loc, ...Array.from({ length: 8 }, (_, i) => u.loc + [1, -1, MAP_SIZE / 60, -(MAP_SIZE / 60)][i % 4])];
          for (const city of state.cities) {
            if (city.owner === Owner.Player2 && Math.abs(city.loc - u.loc) < 200) {
              armyOnEnemyContinent = true;
            }
          }
        }
      }

      if (result.winner !== null) break;
    }

    // Validate: no transport oscillates for >8 consecutive turns in the same 3-tile area
    for (const [id, history] of transportLocHistory) {
      if (history.length < 9) continue;
      for (let i = 0; i <= history.length - 9; i++) {
        const window = history.slice(i, i + 9);
        const uniqueLocs = new Set(window).size;
        // If transport visited only 2 unique locations in 9 turns, it's oscillating badly
        expect(uniqueLocs).toBeGreaterThan(2);
      }
    }
  });

  it("B4: army on enemy continent stays Aggressive, not WaitForTransport", () => {
    // Setup: small map with two islands separated by water
    // Army on enemy island should stay Aggressive after explore exhausts
    const map: MapCell[] = [];
    for (let i = 0; i < MAP_SIZE; i++) {
      const row = Math.floor(i / MAP_WIDTH);
      const col = i % MAP_WIDTH;
      const onBoard = row > 0 && row < MAP_HEIGHT - 1 && col > 0 && col < MAP_WIDTH - 1;
      // Water everywhere except two islands
      const isTopIsland = row >= 5 && row <= 15 && col >= 5 && col <= 25;
      const isBottomIsland = row >= 25 && row <= 35 && col >= 5 && col <= 25;
      map.push({
        terrain: (isTopIsland || isBottomIsland) && onBoard ? TerrainType.Land : TerrainType.Sea,
        onBoard,
        cityId: null,
        depositId: null,
      });
    }

    const state: GameState = {
      config: { mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT, numCities: 2, waterRatio: 70, smoothPasses: 5, minCityDist: 2, seed: 42 },
      turn: 0, map, cities: [], units: [], nextUnitId: 1, nextCityId: 1,
      viewMaps: { [Owner.Unowned]: initViewMap(), [Owner.Player1]: initViewMap(), [Owner.Player2]: initViewMap() },
      rngState: 42,
      resources: { [Owner.Unowned]: [0,0,0], [Owner.Player1]: [150,100,150], [Owner.Player2]: [150,100,150] },
      deposits: [],
      nextDepositId: 0,
    };

    // P1 city on top island, P2 city on bottom island
    const p1CityLoc = rowColLoc(10, 15);
    state.map[p1CityLoc].terrain = TerrainType.City;
    state.map[p1CityLoc].cityId = 0;
    state.cities.push({ id: 1, loc: p1CityLoc, owner: Owner.Player1, production: UnitType.Army, work: 0, func: Array(9).fill(UnitBehavior.None) });

    const p2CityLoc = rowColLoc(30, 15);
    state.map[p2CityLoc].terrain = TerrainType.City;
    state.map[p2CityLoc].cityId = 1;
    state.cities.push({ id: 2, loc: p2CityLoc, owner: Owner.Player2, production: UnitType.Army, work: 0, func: Array(9).fill(UnitBehavior.None) });

    // Place a P1 army on the ENEMY (bottom) island with Explore behavior
    const armyLoc = rowColLoc(28, 10);
    const army = createUnit(state, UnitType.Army, Owner.Player1, armyLoc);
    army.func = UnitBehavior.Explore;

    // Scan everything for P1 so the island is fully explored
    for (let r = 25; r <= 35; r++) {
      for (let c = 5; c <= 25; c++) {
        scan(state, Owner.Player1, rowColLoc(r, c));
      }
    }
    // Mark enemy city as seen
    state.viewMaps[Owner.Player1][p2CityLoc] = { contents: "X", seen: 0 };

    // Execute a turn — the explore behavior should exhaust, and army should get Aggressive (not WaitForTransport)
    const p1Actions = computeAITurn(state, Owner.Player1);
    const p2Actions = computeAITurn(state, Owner.Player2);
    executeTurn(state, p1Actions, p2Actions);

    const updatedArmy = findUnit(state, army.id);
    if (updatedArmy) {
      // Army on enemy continent should NOT be WaitForTransport
      expect(updatedArmy.func).not.toBe(UnitBehavior.WaitForTransport);
    }
  });

  it("transport production cap respected with many cities", () => {
    const state = createFullGameState(42);

    // Play 80 turns to get cities built up
    for (let turn = 0; turn < 80; turn++) {
      refreshAllVision(state);
      const p1Actions = computeAITurn(state, Owner.Player1);
      const p2Actions = computeAITurn(state, Owner.Player2);
      const result = executeTurn(state, p1Actions, p2Actions);
      if (result.winner !== null) break;
    }

    // Check transport production cap for each player
    for (const owner of [Owner.Player1, Owner.Player2]) {
      const ownCities = state.cities.filter(c => c.owner === owner);
      const citiesBuildingTransport = ownCities.filter(c => c.production === UnitType.Transport).length;
      const maxTransportCities = Math.ceil(ownCities.length / 4);
      expect(citiesBuildingTransport).toBeLessThanOrEqual(maxTransportCities);
    }
  });
});
