import { describe, it, expect } from "vitest";
import {
  UnitType, TerrainType, INFINITY,
  UNIT_ATTRIBUTES, getUnitAttributes, canTraverse,
} from "../index.js";

describe("unit attributes", () => {
  it("has 15 unit types", () => {
    expect(UNIT_ATTRIBUTES).toHaveLength(15);
  });

  it("army: 5 build time, land only", () => {
    const army = getUnitAttributes(UnitType.Army);
    expect(army.char).toBe("A");
    expect(army.buildTime).toBe(5);
    expect(army.speed).toBe(1);
    expect(army.terrain).toBe("+");
    expect(army.range).toBe(INFINITY);
  });

  it("fighter: range=32, speed=8, air unit", () => {
    const fighter = getUnitAttributes(UnitType.Fighter);
    expect(fighter.char).toBe("F");
    expect(fighter.range).toBe(32);
    expect(fighter.speed).toBe(8);
    expect(fighter.terrain).toBe(".+");
    expect(fighter.buildTime).toBe(10);
  });

  it("transport: capacity=6, 1 hit", () => {
    const transport = getUnitAttributes(UnitType.Transport);
    expect(transport.char).toBe("T");
    expect(transport.capacity).toBe(6);
    expect(transport.maxHits).toBe(1);
    expect(transport.speed).toBe(2);
  });

  it("carrier: capacity=8, 8 hits", () => {
    const carrier = getUnitAttributes(UnitType.Carrier);
    expect(carrier.char).toBe("C");
    expect(carrier.capacity).toBe(8);
    expect(carrier.maxHits).toBe(8);
  });

  it("battleship: strength=2, 10 hits, 40 build time", () => {
    const bb = getUnitAttributes(UnitType.Battleship);
    expect(bb.char).toBe("B");
    expect(bb.strength).toBe(2);
    expect(bb.maxHits).toBe(10);
    expect(bb.buildTime).toBe(40);
  });

  it("submarine: strength=3, 2 hits", () => {
    const sub = getUnitAttributes(UnitType.Submarine);
    expect(sub.char).toBe("S");
    expect(sub.strength).toBe(3);
    expect(sub.maxHits).toBe(2);
  });

  it("satellite: range=500, speed=10, strength=0", () => {
    const sat = getUnitAttributes(UnitType.Satellite);
    expect(sat.char).toBe("Z");
    expect(sat.range).toBe(500);
    expect(sat.speed).toBe(10);
    expect(sat.strength).toBe(0);
    expect(sat.buildTime).toBe(50);
  });
});

describe("canTraverse", () => {
  it("army can traverse land but not sea", () => {
    expect(canTraverse(UnitType.Army, TerrainType.Land)).toBe(true);
    expect(canTraverse(UnitType.Army, TerrainType.Sea)).toBe(false);
  });

  it("fighter can traverse both land and sea", () => {
    expect(canTraverse(UnitType.Fighter, TerrainType.Land)).toBe(true);
    expect(canTraverse(UnitType.Fighter, TerrainType.Sea)).toBe(true);
  });

  it("destroyer can traverse sea but not land", () => {
    expect(canTraverse(UnitType.Destroyer, TerrainType.Sea)).toBe(true);
    expect(canTraverse(UnitType.Destroyer, TerrainType.Land)).toBe(false);
  });

  it("all units can be in cities", () => {
    for (let t = UnitType.Army; t <= UnitType.EngineerBoat; t++) {
      expect(canTraverse(t, TerrainType.City)).toBe(true);
    }
  });
});
