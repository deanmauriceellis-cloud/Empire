// Empire Reborn — Store & Payment Integration
// Stripe checkout sessions, entitlement management, webhook handling.

import {
  STORE_ITEMS,
  getStoreItem,
  isVipPlayer,
  type StoreItem,
  type PlayerEntitlements,
  type Entitlement,
} from "@empire/shared";
import type { GameDatabase } from "./database.js";

// ─── Stripe Config ──────────────────────────────────────────────────────────

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const STORE_BASE_URL = process.env.STORE_BASE_URL ?? "http://localhost:5174";

/** Whether Stripe is configured (non-empty key). */
export function isStripeConfigured(): boolean {
  return STRIPE_SECRET_KEY.length > 0;
}

// ─── Lazy Stripe import ─────────────────────────────────────────────────────

let stripeInstance: any = null;

async function getStripe(): Promise<any> {
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.");
  }
  if (!stripeInstance) {
    const { default: Stripe } = await import("stripe");
    stripeInstance = new Stripe(STRIPE_SECRET_KEY);
  }
  return stripeInstance;
}

// ─── Store Service ──────────────────────────────────────────────────────────

export class StoreService {
  constructor(private db: GameDatabase) {}

  /** Get available store items. */
  getAvailableItems(): StoreItem[] {
    return STORE_ITEMS.filter(item => item.available);
  }

  /** Get player entitlements (active, non-expired). */
  getPlayerEntitlements(userId: number): PlayerEntitlements {
    const rows = this.db.getActiveEntitlementsForUser(userId);
    const items: Entitlement[] = rows.map(r => ({
      itemId: r.item_id,
      expiresAt: r.expires_at,
    }));
    return {
      items,
      isVip: isVipPlayer(items),
      hasSeasonPass: items.some(e => e.itemId === "season_pass"),
    };
  }

  /** Check if a user has VIP status. */
  isVip(userId: number): boolean {
    return this.db.hasEntitlement(userId, "vip_monthly");
  }

  /**
   * Create a Stripe checkout session for an item purchase.
   * Returns the checkout URL for the client to redirect to.
   */
  async createCheckoutSession(
    userId: number,
    username: string,
    itemId: string,
  ): Promise<{ url: string; sessionId: string }> {
    const item = getStoreItem(itemId);
    if (!item) throw new Error(`Unknown item: ${itemId}`);
    if (!item.available) throw new Error(`Item not available: ${itemId}`);

    // Check if user already owns this (for non-subscription permanent items)
    if (item.purchaseType === "cosmetic") {
      const existing = this.db.hasEntitlement(userId, itemId);
      if (existing) throw new Error("You already own this item");
    }

    const stripe = await getStripe();

    const sessionParams: any = {
      mode: item.purchaseType === "subscription" ? "subscription" : "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: item.name,
            description: item.description,
          },
          unit_amount: item.priceCents,
          ...(item.purchaseType === "subscription" ? {
            recurring: { interval: item.interval ?? "month" },
          } : {}),
        },
        quantity: 1,
      }],
      metadata: {
        userId: String(userId),
        username,
        itemId,
        purchaseType: item.purchaseType,
      },
      success_url: `${STORE_BASE_URL}?store_success=1&item=${itemId}`,
      cancel_url: `${STORE_BASE_URL}?store_cancel=1`,
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return { url: session.url!, sessionId: session.id };
  }

  /**
   * Fulfill a completed purchase — record in DB, grant entitlement.
   * Called after Stripe webhook confirms payment.
   */
  fulfillPurchase(
    userId: number,
    itemId: string,
    amountCents: number,
    stripeSessionId: string | null,
  ): void {
    const item = getStoreItem(itemId);
    if (!item) return;

    // Record the purchase
    this.db.createPurchase(userId, item.purchaseType, itemId, amountCents, stripeSessionId);

    // Grant entitlement
    let expiresAt: string | null = null;
    if (item.purchaseType === "subscription") {
      // VIP: 30 days from now
      const d = new Date();
      d.setDate(d.getDate() + 30);
      expiresAt = d.toISOString();
    } else if (item.purchaseType === "season_pass") {
      // Season pass: 90 days from now
      const d = new Date();
      d.setDate(d.getDate() + 90);
      expiresAt = d.toISOString();
    }
    // Cosmetics: expiresAt = null (permanent)

    this.db.grantEntitlement(userId, itemId, expiresAt);
  }

  /**
   * Handle Stripe webhook event.
   * Returns true if event was handled, false if ignored.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<boolean> {
    const stripe = await getStripe();

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
    } catch {
      return false;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const metadata = session.metadata ?? {};
      const userId = Number(metadata.userId);
      const itemId = metadata.itemId as string;
      const amountCents = session.amount_total ?? 0;

      if (userId && itemId) {
        // Check for duplicate fulfillment
        const existing = this.db.getPurchaseByStripeSession(session.id);
        if (!existing) {
          this.fulfillPurchase(userId, itemId, amountCents, session.id);
        }
      }
      return true;
    }

    if (event.type === "customer.subscription.deleted") {
      // VIP subscription cancelled — revoke entitlement
      const subscription = event.data.object;
      const metadata = subscription.metadata ?? {};
      const userId = Number(metadata.userId);
      const itemId = metadata.itemId as string;
      if (userId && itemId) {
        this.db.revokeEntitlement(userId, itemId);
      }
      return true;
    }

    return false;
  }

  /**
   * Dev-mode: grant an item without payment (for testing).
   */
  grantItemDev(userId: number, itemId: string): boolean {
    const item = getStoreItem(itemId);
    if (!item) return false;

    this.fulfillPurchase(userId, itemId, 0, null);
    return true;
  }

  /**
   * Equip a cosmetic item for a user.
   * Unequips any other item in the same category first.
   */
  equipCosmetic(userId: number, itemId: string): boolean {
    const item = getStoreItem(itemId);
    if (!item || !item.category) return false;

    // Verify the user owns this item
    if (!this.db.hasEntitlement(userId, itemId)) return false;

    // Unequip other items in the same category
    const equipped = this.db.getEquippedCosmetics(userId);
    for (const e of equipped) {
      const eItem = getStoreItem(e.item_id);
      if (eItem?.category === item.category) {
        this.db.unequipCosmetic(userId, e.item_id);
      }
    }

    // Equip this one
    this.db.equipCosmetic(userId, itemId);
    return true;
  }

  /** Unequip a cosmetic item. */
  unequipCosmetic(userId: number, itemId: string): boolean {
    this.db.unequipCosmetic(userId, itemId);
    return true;
  }

  /** Get equipped cosmetics as category → itemId map. */
  getEquippedCosmetics(userId: number): Record<string, string> {
    const equipped = this.db.getEquippedCosmetics(userId);
    const result: Record<string, string> = {};
    for (const e of equipped) {
      const item = getStoreItem(e.item_id);
      if (item?.category) {
        result[item.category] = e.item_id;
      }
    }
    return result;
  }
}
