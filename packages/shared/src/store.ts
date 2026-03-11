// Empire Reborn — Store & Monetization Types
// Item catalog, entitlements, VIP bonuses. NO pay-to-win.

import type { PlayerId } from "./constants.js";

// ─── Item Categories ────────────────────────────────────────────────────────

export type PurchaseType = "cosmetic" | "subscription" | "season_pass";

export type CosmeticCategory = "unit_skin" | "banner" | "crown_style" | "particle_theme" | "map_theme";

// ─── Store Items ────────────────────────────────────────────────────────────

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  purchaseType: PurchaseType;
  category?: CosmeticCategory;       // only for cosmetics
  priceCents: number;                 // price in USD cents
  /** For subscriptions: billing interval. */
  interval?: "month";
  /** Whether the item is currently available for purchase. */
  available: boolean;
}

/** Full item catalog. */
export const STORE_ITEMS: readonly StoreItem[] = [
  // ─── Cosmetics (permanent, no gameplay impact) ──────────────────────────
  {
    id: "skin_desert",
    name: "Desert Camo Skin Pack",
    description: "Sandy camouflage sprites for all unit types",
    purchaseType: "cosmetic",
    category: "unit_skin",
    priceCents: 299,
    available: true,
  },
  {
    id: "skin_arctic",
    name: "Arctic Ops Skin Pack",
    description: "Ice-white tactical sprites for all unit types",
    purchaseType: "cosmetic",
    category: "unit_skin",
    priceCents: 299,
    available: true,
  },
  {
    id: "banner_lion",
    name: "Lion Banner",
    description: "Regal lion crest displayed on your Crown City",
    purchaseType: "cosmetic",
    category: "banner",
    priceCents: 99,
    available: true,
  },
  {
    id: "banner_dragon",
    name: "Dragon Banner",
    description: "Fearsome dragon displayed on your Crown City",
    purchaseType: "cosmetic",
    category: "banner",
    priceCents: 99,
    available: true,
  },
  {
    id: "crown_golden",
    name: "Golden Crown",
    description: "Ornate golden crown glow on your capital",
    purchaseType: "cosmetic",
    category: "crown_style",
    priceCents: 199,
    available: true,
  },
  {
    id: "crown_obsidian",
    name: "Obsidian Crown",
    description: "Dark obsidian crown with purple glow",
    purchaseType: "cosmetic",
    category: "crown_style",
    priceCents: 199,
    available: true,
  },
  {
    id: "particles_fire",
    name: "Inferno Particles",
    description: "Fiery red/orange combat particle effects",
    purchaseType: "cosmetic",
    category: "particle_theme",
    priceCents: 199,
    available: true,
  },
  {
    id: "particles_ice",
    name: "Frost Particles",
    description: "Icy blue/white combat particle effects",
    purchaseType: "cosmetic",
    category: "particle_theme",
    priceCents: 199,
    available: true,
  },
  {
    id: "theme_winter",
    name: "Frozen Realm Theme",
    description: "Snow-covered terrain with icy water",
    purchaseType: "cosmetic",
    category: "map_theme",
    priceCents: 299,
    available: true,
  },
  {
    id: "theme_volcanic",
    name: "Volcanic Realm Theme",
    description: "Charred terrain with lava-red water",
    purchaseType: "cosmetic",
    category: "map_theme",
    priceCents: 299,
    available: true,
  },

  // ─── VIP Subscription ───────────────────────────────────────────────────
  {
    id: "vip_monthly",
    name: "VIP Membership",
    description: "10% faster builds, +2 shield hours, priority spawn, VIP badge",
    purchaseType: "subscription",
    priceCents: 499,
    interval: "month",
    available: true,
  },

  // ─── Season Pass ────────────────────────────────────────────────────────
  {
    id: "season_pass",
    name: "Season Pass",
    description: "Exclusive seasonal cosmetics, leaderboard access, unique unit skin",
    purchaseType: "season_pass",
    priceCents: 999,
    available: true,
  },
] as const;

/** Look up a store item by ID. */
export function getStoreItem(itemId: string): StoreItem | undefined {
  return STORE_ITEMS.find(item => item.id === itemId);
}

// ─── Entitlements ───────────────────────────────────────────────────────────

export interface Entitlement {
  itemId: string;
  /** Null = permanent (cosmetic purchase). Date string for expiring items. */
  expiresAt: string | null;
}

/** Player entitlements sent to client after auth. */
export interface PlayerEntitlements {
  items: Entitlement[];
  isVip: boolean;
  hasSeasonPass: boolean;
}

// ─── VIP Bonuses ────────────────────────────────────────────────────────────

/** VIP build time multiplier (10% faster = 0.9x). */
export const VIP_BUILD_SPEED_MULTIPLIER = 0.9;

/** VIP extra shield hours in milliseconds (+2 hours). */
export const VIP_EXTRA_SHIELD_MS = 2 * 60 * 60 * 1000;

/** VIP max shield = base 8hr + 2hr bonus = 10hr. */
export const VIP_SHIELD_MAX_MS = 10 * 60 * 60 * 1000;

/** VIP extended action history (turns of deltas kept). */
export const VIP_ACTION_HISTORY_SIZE = 50;

/** Default (non-VIP) action history size. */
export const DEFAULT_ACTION_HISTORY_SIZE = 10;

// ─── VIP Helpers ────────────────────────────────────────────────────────────

/**
 * Check if a player has VIP status from their entitlements.
 * Used server-side to apply bonuses.
 */
export function isVipPlayer(entitlements: Entitlement[]): boolean {
  const now = new Date().toISOString();
  return entitlements.some(
    e => e.itemId === "vip_monthly" && (e.expiresAt === null || e.expiresAt > now),
  );
}

/**
 * Get effective build time for a unit, applying VIP bonus if applicable.
 * Build time is reduced by 10% for VIP players (minimum 1).
 */
export function getEffectiveBuildTime(baseBuildTime: number, isVip: boolean): number {
  if (!isVip) return baseBuildTime;
  return Math.max(1, Math.floor(baseBuildTime * VIP_BUILD_SPEED_MULTIPLIER));
}

// ─── Protocol Messages ──────────────────────────────────────────────────────

/** Store-related client → server messages. */
export type StoreClientMessage =
  | { type: "store_list" }
  | { type: "store_purchase"; itemId: string }
  | { type: "store_entitlements" }
  | { type: "equip_cosmetic"; itemId: string }
  | { type: "unequip_cosmetic"; category: CosmeticCategory };

/** Store-related server → client messages. */
export type StoreServerMessage =
  | { type: "store_items"; items: StoreItem[] }
  | { type: "store_purchase_url"; url: string; sessionId: string }
  | { type: "store_purchase_complete"; itemId: string }
  | { type: "store_purchase_error"; message: string }
  | { type: "store_entitlements"; entitlements: PlayerEntitlements }
  | { type: "equipped_cosmetics"; equipped: Record<string, string> };
