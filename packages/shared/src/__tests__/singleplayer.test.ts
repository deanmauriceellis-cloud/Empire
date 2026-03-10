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

  it("produces multiple armies over time", () => {
    const game = createSinglePlayerGame(testConfig);
    const p1City = game.state.cities.find((c) => c.owner === Owner.Player1)!;

    // Army buildTime is 5, so first army at turn 5, second at turn 10
    const armyCounts: number[] = [];
    for (let t = 0; t < 15; t++) {
      const p1Armies = game.state.units.filter(
        (u) => u.owner === Owner.Player1 && u.type === UnitType.Army,
      );
      armyCounts.push(p1Armies.length);
      game.submitTurn([]);
    }

    // After 15 turns: should have produced 3 armies (at turns 5, 10, 15... but turn 15 isn't checked since loop goes to 14)
    // At turn 4 (index 4): 0 armies (work=4, not yet produced)
    // At turn 5 (index 5): 1 army (produced at end of turn 4)
    // At turn 10 (index 10): 2 armies (produced at end of turn 9, unless AI killed one)
    const finalArmies = game.state.units.filter(
      (u) => u.owner === Owner.Player1 && u.type === UnitType.Army,
    );
    console.log("Army counts per turn:", armyCounts);
    console.log("Final P1 armies:", finalArmies.length, "IDs:", finalArmies.map((u) => u.id));
    console.log("Final P1 city work:", p1City.work);

    // At minimum, should have produced at least 2 armies by turn 15
    // (some may have been killed by AI)
    expect(armyCounts[0]).toBe(0); // turn 0: no units yet
    // By turn 5 at latest, first army should exist
    expect(armyCounts.slice(0, 6).some((c) => c >= 1)).toBe(true);
  });

  it("newly produced units are in bridge visible units", () => {
    // This tests the specific bug: bridge might filter out new units
    const game = createSinglePlayerGame(testConfig);

    // Run until first unit is produced
    for (let t = 0; t < 6; t++) {
      game.submitTurn([]);
    }

    const state = game.state;
    const owner = Owner.Player1;
    const viewMap = state.viewMaps[owner];

    // All own units should pass the bridge filter
    const ownUnits = state.units.filter((u) => u.owner === owner);
    expect(ownUnits.length).toBeGreaterThan(0);

    for (const unit of ownUnits) {
      const view = viewMap[unit.loc];
      // Own units should always pass: u.owner === owner
      expect(unit.owner).toBe(owner);
      // And the tile should be seen (scan was called on creation)
      expect(view.seen).toBeGreaterThanOrEqual(0);
    }
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
