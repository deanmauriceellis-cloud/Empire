import { describe, it, expect } from "vitest";
import { createSinglePlayerGame } from "../singleplayer.js";
import { Owner, UnitType } from "../constants.js";

describe("SinglePlayer", () => {
  // Must use default map dimensions since game engine uses hardcoded MAP_SIZE
  const testConfig = {
    seed: 42,
  };

  it("creates a game with valid initial state", () => {
    const game = createSinglePlayerGame(testConfig);

    expect(game.state.turn).toBe(0);
    expect(game.isGameOver).toBe(false);
    expect(game.winner).toBeNull();

    // Both players should have at least one city
    const p1Cities = game.state.cities.filter((c) => c.owner === Owner.Player1);
    const p2Cities = game.state.cities.filter((c) => c.owner === Owner.Player2);
    expect(p1Cities.length).toBeGreaterThanOrEqual(1);
    expect(p2Cities.length).toBeGreaterThanOrEqual(1);
  });

  it("advances turns with submitTurn", () => {
    const game = createSinglePlayerGame(testConfig);

    const result = game.submitTurn([{ type: "endTurn" }]);

    expect(result.turn).toBe(1);
    expect(game.state.turn).toBe(1);
  });

  it("processes production actions", () => {
    const game = createSinglePlayerGame(testConfig);

    const p1City = game.state.cities.find((c) => c.owner === Owner.Player1)!;
    const result = game.submitTurn([
      { type: "setProduction", cityId: p1City.id, unitType: UnitType.Army },
      { type: "endTurn" },
    ]);

    expect(result.turn).toBe(1);
    expect(p1City.production).toBe(UnitType.Army);
  });

  it("runs multiple turns without errors", () => {
    const game = createSinglePlayerGame(testConfig);

    // Run 10 turns — AI computes actions each turn
    for (let i = 0; i < 10; i++) {
      const result = game.submitTurn([{ type: "endTurn" }]);
      expect(result.turn).toBe(i + 1);
    }

    expect(game.state.turn).toBe(10);
    // Both players' cities should still exist
    const p1Cities = game.state.cities.filter((c) => c.owner === Owner.Player1);
    const p2Cities = game.state.cities.filter((c) => c.owner === Owner.Player2);
    expect(p1Cities.length).toBeGreaterThanOrEqual(1);
    expect(p2Cities.length).toBeGreaterThanOrEqual(1);
  });

  it("throws if submitting turn after game over", () => {
    const game = createSinglePlayerGame(testConfig);

    // Resign to end the game
    game.submitTurn([{ type: "resign" }]);

    expect(game.isGameOver).toBe(true);
    expect(game.winner).toBe(Owner.Player2);
    expect(game.winType).toBe("resignation");

    expect(() => game.submitTurn([{ type: "endTurn" }])).toThrow("Game is already over");
  });
});
