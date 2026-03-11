// Empire Reborn — Store & Monetization Tests

import { describe, it, expect } from "vitest";
import {
  STORE_ITEMS,
  getStoreItem,
  isVipPlayer,
  getEffectiveBuildTime,
  VIP_BUILD_SPEED_MULTIPLIER,
  VIP_SHIELD_MAX_MS,
  VIP_EXTRA_SHIELD_MS,
  type Entitlement,
} from "../store.js";

describe("Store Items", () => {
  it("has a complete catalog", () => {
    expect(STORE_ITEMS.length).toBeGreaterThanOrEqual(12);
  });

  it("all items have required fields", () => {
    for (const item of STORE_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(item.purchaseType).toBeTruthy();
      expect(item.priceCents).toBeGreaterThan(0);
      expect(typeof item.available).toBe("boolean");
    }
  });

  it("cosmetics have categories", () => {
    const cosmetics = STORE_ITEMS.filter(i => i.purchaseType === "cosmetic");
    expect(cosmetics.length).toBeGreaterThanOrEqual(10);
    for (const c of cosmetics) {
      expect(c.category).toBeTruthy();
    }
  });

  it("has exactly one VIP subscription", () => {
    const subs = STORE_ITEMS.filter(i => i.purchaseType === "subscription");
    expect(subs).toHaveLength(1);
    expect(subs[0].id).toBe("vip_monthly");
    expect(subs[0].interval).toBe("month");
  });

  it("has exactly one season pass", () => {
    const passes = STORE_ITEMS.filter(i => i.purchaseType === "season_pass");
    expect(passes).toHaveLength(1);
    expect(passes[0].id).toBe("season_pass");
  });

  it("item IDs are unique", () => {
    const ids = STORE_ITEMS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getStoreItem", () => {
  it("finds items by ID", () => {
    const item = getStoreItem("vip_monthly");
    expect(item).toBeDefined();
    expect(item!.name).toBe("VIP Membership");
  });

  it("returns undefined for unknown items", () => {
    expect(getStoreItem("nonexistent")).toBeUndefined();
  });
});

describe("isVipPlayer", () => {
  it("returns false for empty entitlements", () => {
    expect(isVipPlayer([])).toBe(false);
  });

  it("returns true for active VIP entitlement", () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const ents: Entitlement[] = [
      { itemId: "vip_monthly", expiresAt: future.toISOString() },
    ];
    expect(isVipPlayer(ents)).toBe(true);
  });

  it("returns false for expired VIP entitlement", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const ents: Entitlement[] = [
      { itemId: "vip_monthly", expiresAt: past.toISOString() },
    ];
    expect(isVipPlayer(ents)).toBe(false);
  });

  it("returns true for permanent VIP (expiresAt null)", () => {
    const ents: Entitlement[] = [
      { itemId: "vip_monthly", expiresAt: null },
    ];
    expect(isVipPlayer(ents)).toBe(true);
  });

  it("returns false for non-VIP entitlements", () => {
    const ents: Entitlement[] = [
      { itemId: "skin_desert", expiresAt: null },
      { itemId: "season_pass", expiresAt: null },
    ];
    expect(isVipPlayer(ents)).toBe(false);
  });
});

describe("getEffectiveBuildTime", () => {
  it("returns base build time for non-VIP", () => {
    expect(getEffectiveBuildTime(10, false)).toBe(10);
    expect(getEffectiveBuildTime(20, false)).toBe(20);
  });

  it("reduces build time by 10% for VIP", () => {
    // 10 * 0.9 = 9
    expect(getEffectiveBuildTime(10, true)).toBe(9);
    // 20 * 0.9 = 18
    expect(getEffectiveBuildTime(20, true)).toBe(18);
    // 5 * 0.9 = 4.5 → floor = 4
    expect(getEffectiveBuildTime(5, true)).toBe(4);
  });

  it("has minimum build time of 1", () => {
    expect(getEffectiveBuildTime(1, true)).toBe(1);
  });
});

describe("VIP Constants", () => {
  it("build speed multiplier is 0.9 (10% faster)", () => {
    expect(VIP_BUILD_SPEED_MULTIPLIER).toBe(0.9);
  });

  it("extra shield is 2 hours", () => {
    expect(VIP_EXTRA_SHIELD_MS).toBe(2 * 60 * 60 * 1000);
  });

  it("VIP shield max is 10 hours", () => {
    expect(VIP_SHIELD_MAX_MS).toBe(10 * 60 * 60 * 1000);
  });
});
