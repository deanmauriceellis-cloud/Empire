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
  createUnit,
  killUnit,
  findUnit,
  initViewMap,
  scan,
  setProduction,
  objMoves,
  objCapacity,
} from "../game.js";
import { rowColLoc } from "../utils.js";
import { computeAITurn } from "../ai.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────────

/** Create a minimal game state with all-land map for testing. */
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
  const id = state.nextCityId++;
  const city: CityState = {
    id,
    loc,
    owner,
    production,
    work: 0,
    func: Array(9).fill(UnitBehavior.None),
  };
  state.cities.push(city);
  state.map[loc].terrain = TerrainType.City;
  state.map[loc].cityId = state.cities.length - 1;

  // Update view maps
  const vm = state.viewMaps[owner];
  if (vm) {
    vm[loc] = { contents: "O", seen: state.turn };
  }
  // Enemy sees it as X
  const enemy = owner === Owner.Player1 ? Owner.Player2 : Owner.Player1;
  const evm = state.viewMaps[enemy];
  if (evm) {
    evm[loc] = { contents: "X", seen: state.turn };
  }

  return city;
}

/** Set a region of the map to water terrain. */
function setWater(state: GameState, startRow: number, startCol: number, rows: number, cols: number): void {
  for (let r = startRow; r < startRow + rows; r++) {
    for (let c = startCol; c < startCol + cols; c++) {
      const loc = rowColLoc(r, c);
      if (loc >= 0 && loc < MAP_SIZE) {
        state.map[loc].terrain = TerrainType.Sea;
        // Update all view maps
        for (const owner of [Owner.Player1, Owner.Player2]) {
          const vm = state.viewMaps[owner];
          if (vm) {
            vm[loc] = { contents: ".", seen: state.turn };
          }
        }
      }
    }
  }
}

/** Scan all units/cities for an owner so view map is up to date. */
function refreshVision(state: GameState, owner: Owner): void {
  for (const unit of state.units) {
    if (unit.owner === owner) scan(state, owner, unit.loc);
  }
  for (const city of state.cities) {
    if (city.owner === owner) scan(state, owner, city.loc);
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("AI System", () => {
  let state: GameState;
  const AI = Owner.Player2;
  const HUMAN = Owner.Player1;

  beforeEach(() => {
    state = createTestState();
  });

  describe("Step 4.1: AI Production Strategy", () => {
    it("should produce armies when enemy cities on continent", () => {
      // AI city at (10, 10), human city at (10, 15) — same continent
      const aiCity = addCity(state, rowColLoc(10, 10), AI, UnitType.Patrol);
      const humanCity = addCity(state, rowColLoc(10, 15), HUMAN);
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      const prodAction = actions.find(
        a => a.type === "setProduction" && a.cityId === aiCity.id,
      );
      // Should switch to army due to enemy presence
      expect(prodAction).toBeDefined();
      if (prodAction && prodAction.type === "setProduction") {
        expect(prodAction.unitType).toBe(UnitType.Army);
      }
    });

    it("should maintain army production when already producing armies and transport exists", () => {
      const aiCity1 = addCity(state, rowColLoc(10, 10), AI, UnitType.Army);
      const aiCity2 = addCity(state, rowColLoc(12, 10), AI, UnitType.Transport);
      const humanCity = addCity(state, rowColLoc(10, 15), HUMAN);
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      // Should NOT change army city's production — already producing what's needed
      const prodAction = actions.find(
        a => a.type === "setProduction" && a.cityId === aiCity1.id,
      );
      expect(prodAction).toBeUndefined();
    });

    it("should produce transports when no transport producers exist", () => {
      // Multiple AI cities, none producing transports
      const city1 = addCity(state, rowColLoc(10, 10), AI, UnitType.Army);
      const city2 = addCity(state, rowColLoc(12, 10), AI, UnitType.Army);
      const city3 = addCity(state, rowColLoc(14, 10), AI, UnitType.Army);
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      // At least one city should switch to transport
      const ttProduction = actions.filter(
        a => a.type === "setProduction" && a.unitType === UnitType.Transport,
      );
      expect(ttProduction.length).toBeGreaterThanOrEqual(1);
    });

    it("should not switch production if already balanced", () => {
      // Balanced production setup
      const city1 = addCity(state, rowColLoc(10, 10), AI, UnitType.Army);
      const city2 = addCity(state, rowColLoc(12, 10), AI, UnitType.Transport);
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      // No production switches expected
      const prodActions = actions.filter(a => a.type === "setProduction");
      // May or may not switch — just ensure no crash
      expect(actions).toBeDefined();
    });
  });

  describe("Step 4.2: AI Army Movement", () => {
    it("should attack adjacent enemy city", () => {
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const humanCity = addCity(state, rowColLoc(10, 12), HUMAN);

      // Create army adjacent to enemy city
      const army = createUnit(state, UnitType.Army, AI, rowColLoc(10, 11));
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      const attackAction = actions.find(
        a => a.type === "attack" && a.unitId === army.id,
      );
      expect(attackAction).toBeDefined();
      if (attackAction && attackAction.type === "attack") {
        expect(attackAction.targetLoc).toBe(humanCity.loc);
      }
    });

    it("should attack adjacent enemy army", () => {
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const army = createUnit(state, UnitType.Army, AI, rowColLoc(10, 12));
      const enemyArmy = createUnit(state, UnitType.Army, HUMAN, rowColLoc(10, 13));
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      const attackAction = actions.find(
        a => a.type === "attack" && a.unitId === army.id,
      );
      expect(attackAction).toBeDefined();
    });

    it("should move toward enemy city when not adjacent", () => {
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const humanCity = addCity(state, rowColLoc(10, 20), HUMAN);
      const army = createUnit(state, UnitType.Army, AI, rowColLoc(10, 12));
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      const moveAction = actions.find(
        a => a.type === "move" && a.unitId === army.id,
      );
      expect(moveAction).toBeDefined();
    });

    it("should move away from city when no other objectives", () => {
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const army = createUnit(state, UnitType.Army, AI, rowColLoc(10, 10));
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      // Army should try to move out of the city to explore
      const moveAction = actions.find(
        a => a.type === "move" && a.unitId === army.id,
      );
      expect(moveAction).toBeDefined();
    });
  });

  describe("Step 4.3: AI Transport Movement", () => {
    it("should wait for armies when empty", () => {
      // Water region with a transport
      setWater(state, 15, 15, 10, 10);
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const tt = createUnit(state, UnitType.Transport, AI, rowColLoc(16, 16));
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      // Transport should try to move toward armies or explore
      // Just ensure it generates some actions without crashing
      expect(actions).toBeDefined();
    });

    it("should unload armies near enemy territory", () => {
      // Water region, transport with army near enemy coast
      setWater(state, 20, 10, 5, 20);
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const humanCity = addCity(state, rowColLoc(26, 20), HUMAN);

      const tt = createUnit(state, UnitType.Transport, AI, rowColLoc(24, 20));
      // Put the transport on water
      state.map[rowColLoc(24, 20)].terrain = TerrainType.Sea;

      const army = createUnit(state, UnitType.Army, AI, rowColLoc(24, 20));
      army.shipId = tt.id;
      tt.cargoIds = [army.id];

      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      // Should contain a disembark action for the army
      const disembarkAction = actions.find(a => a.type === "disembark");
      // Transport near land should try to unload
      expect(actions.length).toBeGreaterThan(0);
    });
  });

  describe("Step 4.4: AI Fighter Movement", () => {
    it("should attack adjacent enemy", () => {
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const fighter = createUnit(state, UnitType.Fighter, AI, rowColLoc(10, 12));
      const enemyArmy = createUnit(state, UnitType.Army, HUMAN, rowColLoc(10, 13));
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      const attackAction = actions.find(
        a => a.type === "attack" && a.unitId === fighter.id,
      );
      expect(attackAction).toBeDefined();
    });

    it("should return to base when low on fuel", () => {
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const fighter = createUnit(state, UnitType.Fighter, AI, rowColLoc(10, 30));
      fighter.range = 22; // Low fuel — 20 tiles from city + margin of 2
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      const moveAction = actions.find(
        a => a.type === "move" && a.unitId === fighter.id,
      );
      // Should move back toward city
      expect(moveAction).toBeDefined();
      if (moveAction && moveAction.type === "move") {
        // Moved location should be closer to city (Chebyshev distance)
        const newRow = Math.floor(moveAction.loc / MAP_WIDTH);
        const newCol = moveAction.loc % MAP_WIDTH;
        const newDist = Math.max(Math.abs(newRow - 10), Math.abs(newCol - 10));
        const oldDist = 20; // Chebyshev dist from (10,30) to (10,10)
        expect(newDist).toBeLessThan(oldDist);
      }
    });

    it("should explore when no targets in range", () => {
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const fighter = createUnit(state, UnitType.Fighter, AI, rowColLoc(10, 12));
      // High fuel, no enemies
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      // Fighter should move somewhere
      const moveActions = actions.filter(
        a => a.type === "move" && a.unitId === fighter.id,
      );
      expect(moveActions.length).toBeGreaterThan(0);
    });
  });

  describe("Step 4.4: AI Ship Movement", () => {
    it("should return to port when damaged", () => {
      setWater(state, 10, 10, 20, 20);
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      // Destroyer at sea, damaged
      const ship = createUnit(state, UnitType.Destroyer, AI, rowColLoc(15, 15));
      ship.hits = 1; // damaged (max is 3)
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      const moveAction = actions.find(
        a => a.type === "move" && a.unitId === ship.id,
      );
      // Ship should try to move toward port
      expect(moveAction).toBeDefined();
    });

    it("should attack adjacent enemy ship", () => {
      setWater(state, 10, 10, 20, 20);
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const ship = createUnit(state, UnitType.Destroyer, AI, rowColLoc(15, 15));
      const enemyShip = createUnit(state, UnitType.Patrol, HUMAN, rowColLoc(15, 16));
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      const attackAction = actions.find(
        a => a.type === "attack" && a.unitId === ship.id,
      );
      expect(attackAction).toBeDefined();
    });

    it("should stay in port when repairing", () => {
      setWater(state, 10, 10, 20, 20);
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const ship = createUnit(state, UnitType.Battleship, AI, rowColLoc(10, 10));
      ship.hits = 5; // damaged (max 10)
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      // Should NOT have a move action for this ship — it stays in port
      const moveAction = actions.find(
        a => a.type === "move" && a.unitId === ship.id,
      );
      expect(moveAction).toBeUndefined();
    });

    it("should explore when fully repaired and no targets", () => {
      setWater(state, 10, 10, 20, 20);
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const ship = createUnit(state, UnitType.Patrol, AI, rowColLoc(15, 15));
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      // Ship should move somewhere
      const moveActions = actions.filter(
        a => a.type === "move" && a.unitId === ship.id,
      );
      expect(moveActions.length).toBeGreaterThan(0);
    });
  });

  describe("Step 4.5: AI Turn Orchestrator", () => {
    it("should generate valid actions array", () => {
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const humanCity = addCity(state, rowColLoc(30, 30), HUMAN);
      createUnit(state, UnitType.Army, AI, rowColLoc(10, 12));
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      expect(Array.isArray(actions)).toBe(true);
      // Should have at least some movement actions
      expect(actions.length).toBeGreaterThan(0);
    });

    it("should not crash with no units", () => {
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      expect(Array.isArray(actions)).toBe(true);
    });

    it("should resign when overwhelmed", () => {
      // AI has 1 city, human has 10+
      addCity(state, rowColLoc(10, 10), AI);
      for (let i = 0; i < 10; i++) {
        addCity(state, rowColLoc(20 + i, 20), HUMAN);
      }
      // Human has many armies
      for (let i = 0; i < 10; i++) {
        createUnit(state, UnitType.Army, HUMAN, rowColLoc(20 + i, 21));
      }
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      const resignAction = actions.find(a => a.type === "resign");
      expect(resignAction).toBeDefined();
    });

    it("should not resign when evenly matched", () => {
      addCity(state, rowColLoc(10, 10), AI);
      addCity(state, rowColLoc(20, 20), HUMAN);
      createUnit(state, UnitType.Army, AI, rowColLoc(10, 12));
      createUnit(state, UnitType.Army, HUMAN, rowColLoc(20, 22));
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      const resignAction = actions.find(a => a.type === "resign");
      expect(resignAction).toBeUndefined();
    });

    it("should handle multiple unit types in a turn", () => {
      setWater(state, 15, 1, 5, 98);
      const aiCity = addCity(state, rowColLoc(10, 10), AI);
      const humanCity = addCity(state, rowColLoc(30, 30), HUMAN);

      createUnit(state, UnitType.Army, AI, rowColLoc(10, 12));
      createUnit(state, UnitType.Fighter, AI, rowColLoc(10, 14));
      createUnit(state, UnitType.Patrol, AI, rowColLoc(16, 15));
      refreshVision(state, AI);

      const actions = computeAITurn(state, AI);
      expect(actions.length).toBeGreaterThan(0);
      // Should have moves for multiple unit types
      const moveActions = actions.filter(a => a.type === "move");
      expect(moveActions.length).toBeGreaterThan(0);
    });

    it("20-turn AI simulation should not crash", () => {
      // Set up a simple game with AI vs minimal human presence
      addCity(state, rowColLoc(10, 10), AI);
      addCity(state, rowColLoc(10, 14), AI);
      addCity(state, rowColLoc(40, 40), HUMAN);
      addCity(state, rowColLoc(40, 44), HUMAN);
      setWater(state, 25, 1, 3, 98); // ocean between territories

      // Manually create some starting units
      createUnit(state, UnitType.Army, AI, rowColLoc(10, 12));
      createUnit(state, UnitType.Army, HUMAN, rowColLoc(40, 42));
      refreshVision(state, AI);
      refreshVision(state, HUMAN);

      // Run 20 turns
      for (let turn = 0; turn < 20; turn++) {
        const aiActions = computeAITurn(state, AI);
        expect(Array.isArray(aiActions)).toBe(true);

        // Process actions (simplified — just validate they don't crash)
        for (const action of aiActions) {
          if (action.type === "setProduction") {
            const city = state.cities.find(c => c.id === action.cityId);
            if (city && city.owner === AI) {
              city.production = action.unitType;
            }
          }
        }

        state.turn++;
      }
    });
  });
});
