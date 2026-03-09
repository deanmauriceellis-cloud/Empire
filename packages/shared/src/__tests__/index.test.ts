import { describe, it, expect } from "vitest";
import { GAME_VERSION, MAP_WIDTH, MAP_HEIGHT, MAP_SIZE, NUM_CITY } from "../index.js";

describe("shared constants", () => {
  it("exports game version", () => {
    expect(GAME_VERSION).toBe("0.1.0");
  });

  it("has correct map dimensions", () => {
    expect(MAP_WIDTH).toBe(100);
    expect(MAP_HEIGHT).toBe(60);
    expect(MAP_SIZE).toBe(MAP_WIDTH * MAP_HEIGHT);
  });

  it("has correct city count", () => {
    expect(NUM_CITY).toBe(70);
  });
});
