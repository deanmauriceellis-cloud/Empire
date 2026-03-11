// Empire Reborn — Client Store State
// Manages store items, purchases, entitlements, and equipped cosmetics.

import type { Connection } from "./connection.js";
import type { StoreItem, PlayerEntitlements, CosmeticCategory } from "@empire/shared";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StoreState {
  readonly items: StoreItem[];
  readonly entitlements: PlayerEntitlements | null;
  readonly equipped: Record<string, string>;
  readonly isVip: boolean;
}

export interface StoreEvents {
  onItemsLoaded: (items: StoreItem[]) => void;
  onEntitlementsUpdated: (entitlements: PlayerEntitlements) => void;
  onEquippedUpdated: (equipped: Record<string, string>) => void;
  onPurchaseUrl: (url: string) => void;
  onPurchaseComplete: (itemId: string) => void;
  onPurchaseError: (message: string) => void;
}

// ─── Store Client ───────────────────────────────────────────────────────────

export interface StoreClient extends StoreState {
  requestItems(conn: Connection): void;
  requestEntitlements(conn: Connection): void;
  purchase(conn: Connection, itemId: string): void;
  equip(conn: Connection, itemId: string): void;
  unequip(conn: Connection, category: CosmeticCategory): void;
  handleServerMessage(msg: any): boolean;
  ownsItem(itemId: string): boolean;
}

export function createStoreClient(events: StoreEvents): StoreClient {
  let items: StoreItem[] = [];
  let entitlements: PlayerEntitlements | null = null;
  let equipped: Record<string, string> = {};

  return {
    get items() { return items; },
    get entitlements() { return entitlements; },
    get equipped() { return equipped; },
    get isVip() { return entitlements?.isVip ?? false; },

    requestItems(conn: Connection): void {
      conn.send({ type: "store_list" } as any);
    },

    requestEntitlements(conn: Connection): void {
      conn.send({ type: "store_entitlements" } as any);
    },

    purchase(conn: Connection, itemId: string): void {
      conn.send({ type: "store_purchase", itemId } as any);
    },

    equip(conn: Connection, itemId: string): void {
      conn.send({ type: "equip_cosmetic", itemId } as any);
    },

    unequip(conn: Connection, category: CosmeticCategory): void {
      conn.send({ type: "unequip_cosmetic", category } as any);
    },

    ownsItem(itemId: string): boolean {
      return entitlements?.items.some(e => e.itemId === itemId) ?? false;
    },

    handleServerMessage(msg: any): boolean {
      if (msg.type === "store_items") {
        items = msg.items ?? [];
        events.onItemsLoaded(items);
        return true;
      }
      if (msg.type === "store_entitlements") {
        entitlements = msg.entitlements ?? null;
        if (entitlements) {
          events.onEntitlementsUpdated(entitlements);
        }
        return true;
      }
      if (msg.type === "equipped_cosmetics") {
        equipped = msg.equipped ?? {};
        events.onEquippedUpdated(equipped);
        return true;
      }
      if (msg.type === "store_purchase_url") {
        events.onPurchaseUrl(msg.url);
        return true;
      }
      if (msg.type === "store_purchase_complete") {
        events.onPurchaseComplete(msg.itemId);
        return true;
      }
      if (msg.type === "store_purchase_error") {
        events.onPurchaseError(msg.message);
        return true;
      }
      return false;
    },
  };
}
