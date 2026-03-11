// Empire Reborn — Server Store Tests

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GameDatabase } from "../database.js";
import { StoreService } from "../store.js";
import { join } from "node:path";
import { mkdirSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";

const TEST_DB_DIR = join(tmpdir(), "empire-store-test");
let dbPath: string;
let db: GameDatabase;
let store: StoreService;

beforeEach(() => {
  mkdirSync(TEST_DB_DIR, { recursive: true });
  dbPath = join(TEST_DB_DIR, `store-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = new GameDatabase(dbPath);
  store = new StoreService(db);
});

afterEach(() => {
  db.close();
  try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
});

describe("StoreService", () => {
  describe("getAvailableItems", () => {
    it("returns all available store items", () => {
      const items = store.getAvailableItems();
      expect(items.length).toBeGreaterThanOrEqual(12);
      for (const item of items) {
        expect(item.available).toBe(true);
      }
    });
  });

  describe("getPlayerEntitlements", () => {
    it("returns empty entitlements for new user", () => {
      const userId = db.createUser("testuser", "hash");
      const ents = store.getPlayerEntitlements(userId);
      expect(ents.items).toHaveLength(0);
      expect(ents.isVip).toBe(false);
      expect(ents.hasSeasonPass).toBe(false);
    });
  });

  describe("grantItemDev", () => {
    it("grants a cosmetic item permanently", () => {
      const userId = db.createUser("testuser", "hash");
      const ok = store.grantItemDev(userId, "skin_desert");
      expect(ok).toBe(true);

      const ents = store.getPlayerEntitlements(userId);
      expect(ents.items).toHaveLength(1);
      expect(ents.items[0].itemId).toBe("skin_desert");
      expect(ents.items[0].expiresAt).toBeNull();
    });

    it("grants VIP subscription with 30-day expiry", () => {
      const userId = db.createUser("testuser", "hash");
      store.grantItemDev(userId, "vip_monthly");

      const ents = store.getPlayerEntitlements(userId);
      expect(ents.isVip).toBe(true);
      expect(ents.items[0].itemId).toBe("vip_monthly");
      expect(ents.items[0].expiresAt).toBeTruthy();

      // Expiry should be ~30 days from now
      const expiry = new Date(ents.items[0].expiresAt!);
      const now = new Date();
      const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(29);
      expect(diffDays).toBeLessThan(31);
    });

    it("grants season pass with 90-day expiry", () => {
      const userId = db.createUser("testuser", "hash");
      store.grantItemDev(userId, "season_pass");

      const ents = store.getPlayerEntitlements(userId);
      expect(ents.hasSeasonPass).toBe(true);
      expect(ents.items[0].expiresAt).toBeTruthy();

      const expiry = new Date(ents.items[0].expiresAt!);
      const now = new Date();
      const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(89);
      expect(diffDays).toBeLessThan(91);
    });

    it("returns false for unknown items", () => {
      const userId = db.createUser("testuser", "hash");
      const ok = store.grantItemDev(userId, "nonexistent_item");
      expect(ok).toBe(false);
    });

    it("records purchase in database", () => {
      const userId = db.createUser("testuser", "hash");
      store.grantItemDev(userId, "skin_desert");

      const purchases = db.getPurchasesForUser(userId);
      expect(purchases).toHaveLength(1);
      expect(purchases[0].item_id).toBe("skin_desert");
      expect(purchases[0].amount_cents).toBe(0);
      expect(purchases[0].stripe_session_id).toBeNull();
    });
  });

  describe("isVip", () => {
    it("returns false for non-VIP user", () => {
      const userId = db.createUser("testuser", "hash");
      expect(store.isVip(userId)).toBe(false);
    });

    it("returns true for VIP user", () => {
      const userId = db.createUser("testuser", "hash");
      store.grantItemDev(userId, "vip_monthly");
      expect(store.isVip(userId)).toBe(true);
    });
  });

  describe("equipCosmetic", () => {
    it("equips a cosmetic the user owns", () => {
      const userId = db.createUser("testuser", "hash");
      store.grantItemDev(userId, "skin_desert");

      const ok = store.equipCosmetic(userId, "skin_desert");
      expect(ok).toBe(true);

      const equipped = store.getEquippedCosmetics(userId);
      expect(equipped.unit_skin).toBe("skin_desert");
    });

    it("unequips previous item in same category when equipping new one", () => {
      const userId = db.createUser("testuser", "hash");
      store.grantItemDev(userId, "skin_desert");
      store.grantItemDev(userId, "skin_arctic");

      store.equipCosmetic(userId, "skin_desert");
      expect(store.getEquippedCosmetics(userId).unit_skin).toBe("skin_desert");

      store.equipCosmetic(userId, "skin_arctic");
      expect(store.getEquippedCosmetics(userId).unit_skin).toBe("skin_arctic");
    });

    it("fails if user doesn't own the item", () => {
      const userId = db.createUser("testuser", "hash");
      const ok = store.equipCosmetic(userId, "skin_desert");
      expect(ok).toBe(false);
    });

    it("fails for non-cosmetic items", () => {
      const userId = db.createUser("testuser", "hash");
      store.grantItemDev(userId, "vip_monthly");
      const ok = store.equipCosmetic(userId, "vip_monthly");
      expect(ok).toBe(false);
    });
  });

  describe("unequipCosmetic", () => {
    it("unequips a cosmetic", () => {
      const userId = db.createUser("testuser", "hash");
      store.grantItemDev(userId, "skin_desert");
      store.equipCosmetic(userId, "skin_desert");
      expect(store.getEquippedCosmetics(userId).unit_skin).toBe("skin_desert");

      store.unequipCosmetic(userId, "skin_desert");
      expect(store.getEquippedCosmetics(userId).unit_skin).toBeUndefined();
    });
  });

  describe("multiple items", () => {
    it("supports owning and equipping items across categories", () => {
      const userId = db.createUser("testuser", "hash");
      store.grantItemDev(userId, "skin_desert");
      store.grantItemDev(userId, "banner_lion");
      store.grantItemDev(userId, "crown_golden");

      store.equipCosmetic(userId, "skin_desert");
      store.equipCosmetic(userId, "banner_lion");
      store.equipCosmetic(userId, "crown_golden");

      const equipped = store.getEquippedCosmetics(userId);
      expect(equipped.unit_skin).toBe("skin_desert");
      expect(equipped.banner).toBe("banner_lion");
      expect(equipped.crown_style).toBe("crown_golden");

      const ents = store.getPlayerEntitlements(userId);
      expect(ents.items).toHaveLength(3);
    });
  });
});

describe("Database Store Methods", () => {
  describe("entitlements", () => {
    it("grants and retrieves entitlements", () => {
      const userId = db.createUser("testuser", "hash");
      db.grantEntitlement(userId, "skin_desert", null);

      const ents = db.getActiveEntitlementsForUser(userId);
      expect(ents).toHaveLength(1);
      expect(ents[0].item_id).toBe("skin_desert");
      expect(ents[0].expires_at).toBeNull();
    });

    it("filters expired entitlements", () => {
      const userId = db.createUser("testuser", "hash");
      const past = new Date();
      past.setDate(past.getDate() - 1);
      db.grantEntitlement(userId, "vip_monthly", past.toISOString());

      const active = db.getActiveEntitlementsForUser(userId);
      expect(active).toHaveLength(0);

      const all = db.getEntitlementsForUser(userId);
      expect(all).toHaveLength(1);
    });

    it("hasEntitlement checks expiry", () => {
      const userId = db.createUser("testuser", "hash");
      const future = new Date();
      future.setDate(future.getDate() + 30);
      db.grantEntitlement(userId, "vip_monthly", future.toISOString());

      expect(db.hasEntitlement(userId, "vip_monthly")).toBe(true);
      expect(db.hasEntitlement(userId, "nonexistent")).toBe(false);
    });

    it("revokes entitlements", () => {
      const userId = db.createUser("testuser", "hash");
      db.grantEntitlement(userId, "skin_desert", null);
      expect(db.hasEntitlement(userId, "skin_desert")).toBe(true);

      db.revokeEntitlement(userId, "skin_desert");
      expect(db.hasEntitlement(userId, "skin_desert")).toBe(false);
    });

    it("upserts entitlements on re-grant", () => {
      const userId = db.createUser("testuser", "hash");
      const d1 = new Date();
      d1.setDate(d1.getDate() + 15);
      db.grantEntitlement(userId, "vip_monthly", d1.toISOString());

      const d2 = new Date();
      d2.setDate(d2.getDate() + 30);
      db.grantEntitlement(userId, "vip_monthly", d2.toISOString());

      const ents = db.getEntitlementsForUser(userId);
      expect(ents).toHaveLength(1);
      // Should have the newer expiry
      expect(new Date(ents[0].expires_at!).getTime()).toBeCloseTo(d2.getTime(), -3);
    });
  });

  describe("purchases", () => {
    it("creates and retrieves purchases", () => {
      const userId = db.createUser("testuser", "hash");
      db.createPurchase(userId, "cosmetic", "skin_desert", 299, "cs_test123");

      const purchases = db.getPurchasesForUser(userId);
      expect(purchases).toHaveLength(1);
      expect(purchases[0].item_id).toBe("skin_desert");
      expect(purchases[0].amount_cents).toBe(299);
      expect(purchases[0].stripe_session_id).toBe("cs_test123");
    });

    it("finds purchase by stripe session", () => {
      const userId = db.createUser("testuser", "hash");
      db.createPurchase(userId, "cosmetic", "skin_desert", 299, "cs_unique_123");

      const purchase = db.getPurchaseByStripeSession("cs_unique_123");
      expect(purchase).not.toBeNull();
      expect(purchase!.item_id).toBe("skin_desert");
    });

    it("returns null for unknown stripe session", () => {
      expect(db.getPurchaseByStripeSession("nonexistent")).toBeNull();
    });
  });

  describe("getWorldPlayerUsers", () => {
    it("returns player-user mappings for a world", () => {
      const userId1 = db.createUser("player1", "hash");
      const userId2 = db.createUser("player2", "hash");
      db.createKingdom(userId1, "world-1", 1, "Kingdom1", "inner");
      db.createKingdom(userId2, "world-1", 2, "Kingdom2", "middle");

      const mappings = db.getWorldPlayerUsers("world-1");
      expect(mappings).toHaveLength(2);
      expect(mappings.find(m => m.player_id === 1)?.user_id).toBe(userId1);
      expect(mappings.find(m => m.player_id === 2)?.user_id).toBe(userId2);
    });

    it("returns empty for unknown world", () => {
      expect(db.getWorldPlayerUsers("nonexistent")).toHaveLength(0);
    });
  });
});
