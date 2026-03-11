import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { GameDatabase } from "../database.js";
import {
  type GameState,
  type GameConfig,
  Owner,
  UnitType,
  UnitBehavior,
  MAP_WIDTH,
  MAP_HEIGHT,
  generateMap,
  initViewMap,
  scan,
} from "@empire/shared";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createTestState(): GameState {
  const config: GameConfig = {
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    numCities: 70,
    waterRatio: 70,
    smoothPasses: 5,
    minCityDist: 2,
    seed: 42,
  };

  const mapResult = generateMap(config);

  const state: GameState = {
    config,
    turn: 0,
    map: mapResult.map,
    cities: mapResult.cities,
    units: [],
    nextUnitId: 0,
    nextCityId: mapResult.cities.length,
    viewMaps: {
      [Owner.Unowned]: [],
      [Owner.Player1]: initViewMap(),
      [Owner.Player2]: initViewMap(),
    },
    rngState: config.seed,
    resources: { [Owner.Unowned]: [0,0,0], [Owner.Player1]: [150,100,150], [Owner.Player2]: [150,100,150] },
    deposits: [],
    nextDepositId: 0,
  };

  const [city1Id, city2Id] = mapResult.startingCities;
  state.cities[city1Id].owner = Owner.Player1;
  state.cities[city2Id].owner = Owner.Player2;

  scan(state, Owner.Player1, state.cities[city1Id].loc);
  scan(state, Owner.Player2, state.cities[city2Id].loc);

  return state;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("GameDatabase", () => {
  let db: GameDatabase;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "empire-test-"));
    db = new GameDatabase(join(tmpDir, "test.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saves and loads a game state round-trip", () => {
    const state = createTestState();
    state.turn = 5;

    db.saveGame("test-001", "playing", state);

    const loaded = db.loadGame("test-001");
    expect(loaded).not.toBeNull();
    expect(loaded!.phase).toBe("playing");
    expect(loaded!.state.turn).toBe(5);
    expect(loaded!.state.config.seed).toBe(42);
    expect(loaded!.state.cities.length).toBe(state.cities.length);
    expect(loaded!.state.map.length).toBe(state.map.length);
  });

  it("preserves view maps across save/load", () => {
    const state = createTestState();

    db.saveGame("test-002", "playing", state);
    const loaded = db.loadGame("test-002")!;

    // Check that player 1's view map has some seen cells
    const p1View = loaded.state.viewMaps[Owner.Player1];
    const seenCells = p1View.filter((c) => c.seen >= 0);
    expect(seenCells.length).toBeGreaterThan(0);
  });

  it("returns null for non-existent game", () => {
    expect(db.loadGame("nope")).toBeNull();
  });

  it("updates existing game on re-save", () => {
    const state = createTestState();

    db.saveGame("test-003", "playing", state);
    state.turn = 10;
    db.saveGame("test-003", "playing", state);

    const loaded = db.loadGame("test-003")!;
    expect(loaded.state.turn).toBe(10);
  });

  it("lists saved games", () => {
    const state = createTestState();

    db.saveGame("game-a", "playing", state);
    state.turn = 3;
    db.saveGame("game-b", "game_over", state);

    const list = db.listGames();
    expect(list).toHaveLength(2);

    const ids = list.map((g) => g.id);
    expect(ids).toContain("game-a");
    expect(ids).toContain("game-b");

    const gameB = list.find((g) => g.id === "game-b")!;
    expect(gameB.phase).toBe("game_over");
    expect(gameB.turn).toBe(3);
  });

  it("deletes a game", () => {
    const state = createTestState();
    db.saveGame("game-del", "playing", state);

    expect(db.deleteGame("game-del")).toBe(true);
    expect(db.loadGame("game-del")).toBeNull();
    expect(db.deleteGame("game-del")).toBe(false);
  });

  it("handles empty database gracefully", () => {
    expect(db.listGames()).toHaveLength(0);
    expect(db.loadGame("nope")).toBeNull();
  });
});
