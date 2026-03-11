// Empire Reborn — Store Panel UI
// In-game store for cosmetics, VIP subscription, and season pass.

import type { StoreItem, PlayerEntitlements, CosmeticCategory } from "@empire/shared";

// ─── Types ──────────────────────────────────────────────────────────────────

type StoreTab = "cosmetics" | "vip" | "season" | "inventory";

export interface StorePanelActions {
  onPurchase: (itemId: string) => void;
  onEquip: (itemId: string) => void;
  onUnequip: (category: CosmeticCategory) => void;
  onClose: () => void;
}

export interface StorePanel {
  readonly element: HTMLDivElement;
  open(items: StoreItem[], entitlements: PlayerEntitlements | null, equipped: Record<string, string>): void;
  close(): void;
  updateEntitlements(entitlements: PlayerEntitlements, equipped: Record<string, string>): void;
  showPurchaseResult(itemId: string, success: boolean, message?: string): void;
  /** Set actions after creation (for late binding). */
  setActions(actions: StorePanelActions): void;
  readonly isOpen: boolean;
}

// ─── Category Labels ────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  unit_skin: "Unit Skins",
  banner: "Banners",
  crown_style: "Crown Styles",
  particle_theme: "Particles",
  map_theme: "Map Themes",
};

// ─── Create Store Panel ─────────────────────────────────────────────────────

export function createStorePanel(initialActions: StorePanelActions): StorePanel {
  let actions = initialActions;
  const el = document.createElement("div");
  el.id = "store-panel";
  el.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    z-index: 1000;
    pointer-events: auto;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    color: #ccc;
  `;

  let isOpen = false;
  let currentTab: StoreTab = "cosmetics";
  let currentItems: StoreItem[] = [];
  let currentEntitlements: PlayerEntitlements | null = null;
  let currentEquipped: Record<string, string> = {};

  function render(): void {
    el.innerHTML = `
      <div style="
        position: absolute; inset: 0;
        background: rgba(0,0,0,0.7);
        display: flex; align-items: center; justify-content: center;
      ">
        <div style="
          background: rgba(10,10,30,0.95);
          border: 1px solid #335;
          border-radius: 6px;
          width: 700px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        ">
          <!-- Header -->
          <div style="
            display: flex; justify-content: space-between; align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid #335;
            background: rgba(0,0,0,0.3);
          ">
            <span style="font-size: 16px; color: #fff; font-weight: bold;">Store</span>
            <button id="store-close" style="
              background: none; border: 1px solid #555; color: #aaa;
              padding: 4px 10px; cursor: pointer; font-family: inherit;
              border-radius: 3px;
            ">Close</button>
          </div>

          <!-- Tabs -->
          <div style="display: flex; border-bottom: 1px solid #335; background: rgba(0,0,0,0.2);">
            ${renderTab("cosmetics", "Cosmetics")}
            ${renderTab("vip", "VIP")}
            ${renderTab("season", "Season Pass")}
            ${renderTab("inventory", "My Items")}
          </div>

          <!-- Content -->
          <div id="store-content" style="
            padding: 16px;
            overflow-y: auto;
            flex: 1;
            max-height: 60vh;
          ">
            ${renderTabContent()}
          </div>
        </div>
      </div>
    `;

    // Bind events
    el.querySelector("#store-close")?.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      actions.onClose();
    });

    el.querySelectorAll("[data-tab]").forEach(btn => {
      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        currentTab = (btn as HTMLElement).dataset.tab as StoreTab;
        render();
      });
    });

    el.querySelectorAll("[data-buy]").forEach(btn => {
      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        const itemId = (btn as HTMLElement).dataset.buy!;
        actions.onPurchase(itemId);
      });
    });

    el.querySelectorAll("[data-equip]").forEach(btn => {
      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        const itemId = (btn as HTMLElement).dataset.equip!;
        actions.onEquip(itemId);
      });
    });

    el.querySelectorAll("[data-unequip]").forEach(btn => {
      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        const cat = (btn as HTMLElement).dataset.unequip! as CosmeticCategory;
        actions.onUnequip(cat);
      });
    });

    // Close on backdrop click
    el.querySelector("div")?.addEventListener("pointerdown", (e) => {
      if (e.target === el.querySelector("div")) {
        actions.onClose();
      }
    });
  }

  function renderTab(tab: StoreTab, label: string): string {
    const active = tab === currentTab;
    return `<button data-tab="${tab}" style="
      flex: 1; padding: 8px 12px;
      background: ${active ? "rgba(68,170,255,0.15)" : "transparent"};
      border: none; border-bottom: ${active ? "2px solid #4af" : "2px solid transparent"};
      color: ${active ? "#4af" : "#888"};
      cursor: pointer; font-family: inherit; font-size: 12px;
    ">${label}</button>`;
  }

  function renderTabContent(): string {
    switch (currentTab) {
      case "cosmetics": return renderCosmetics();
      case "vip": return renderVip();
      case "season": return renderSeasonPass();
      case "inventory": return renderInventory();
    }
  }

  function renderCosmetics(): string {
    const cosmetics = currentItems.filter(i => i.purchaseType === "cosmetic");
    if (cosmetics.length === 0) return "<p style='color: #888'>No cosmetics available.</p>";

    // Group by category
    const groups = new Map<string, StoreItem[]>();
    for (const item of cosmetics) {
      const cat = item.category ?? "other";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }

    let html = "";
    for (const [cat, items] of groups) {
      html += `<h3 style="color: #4af; margin: 12px 0 8px; font-size: 13px; border-bottom: 1px solid #333; padding-bottom: 4px;">${CATEGORY_LABELS[cat] ?? cat}</h3>`;
      html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">`;
      for (const item of items) {
        html += renderItemCard(item);
      }
      html += `</div>`;
    }
    return html;
  }

  function renderVip(): string {
    const vipItem = currentItems.find(i => i.id === "vip_monthly");
    const isVip = currentEntitlements?.isVip ?? false;

    return `
      <div style="text-align: center; padding: 20px 0;">
        <div style="font-size: 24px; color: #fa4; margin-bottom: 8px;">
          ${isVip ? "★ VIP Active ★" : "★ VIP Membership ★"}
        </div>
        <div style="color: #aaa; margin-bottom: 16px;">
          ${vipItem?.description ?? "Premium membership with gameplay benefits"}
        </div>
        <div style="
          background: rgba(255,170,68,0.1);
          border: 1px solid rgba(255,170,68,0.3);
          border-radius: 6px;
          padding: 16px;
          margin: 0 auto;
          max-width: 400px;
          text-align: left;
        ">
          <div style="color: #fa4; font-weight: bold; margin-bottom: 8px;">Benefits:</div>
          <div style="color: #ccc; line-height: 1.8;">
            ✓ 10% faster build times<br>
            ✓ +2 shield hours (10hr max vs 8hr)<br>
            ✓ Priority spawn placement<br>
            ✓ VIP badge next to name<br>
            ✓ Extended action history (50 turns)
          </div>
          <div style="color: #888; margin-top: 12px; font-size: 11px;">
            No stat boosts, no extra resources, no pay-to-win.
          </div>
        </div>
        <div style="margin-top: 16px;">
          ${isVip
            ? `<span style="color: #4c4; font-size: 14px;">Active — thank you for your support!</span>`
            : `<button data-buy="vip_monthly" style="
                background: rgba(255,170,68,0.2); border: 1px solid #fa4;
                color: #fa4; padding: 10px 24px; cursor: pointer;
                font-family: inherit; font-size: 14px; border-radius: 4px;
              ">Subscribe — $${(vipItem?.priceCents ?? 499) / 100}/month</button>`
          }
        </div>
      </div>
    `;
  }

  function renderSeasonPass(): string {
    const passItem = currentItems.find(i => i.id === "season_pass");
    const hasPass = currentEntitlements?.hasSeasonPass ?? false;

    return `
      <div style="text-align: center; padding: 20px 0;">
        <div style="font-size: 24px; color: #4af; margin-bottom: 8px;">
          ${hasPass ? "Season Pass Active" : "Season Pass"}
        </div>
        <div style="color: #aaa; margin-bottom: 16px;">
          ${passItem?.description ?? "Exclusive seasonal content and rewards"}
        </div>
        <div style="
          background: rgba(68,170,255,0.1);
          border: 1px solid rgba(68,170,255,0.3);
          border-radius: 6px;
          padding: 16px;
          margin: 0 auto;
          max-width: 400px;
          text-align: left;
        ">
          <div style="color: #4af; font-weight: bold; margin-bottom: 8px;">Includes:</div>
          <div style="color: #ccc; line-height: 1.8;">
            ✓ Exclusive seasonal map theme<br>
            ✓ Seasonal leaderboard access<br>
            ✓ Unique unit skin (changes each season)<br>
            ✓ Seasonal crown style<br>
            ✓ End-of-season stats &amp; badges
          </div>
        </div>
        <div style="margin-top: 16px;">
          ${hasPass
            ? `<span style="color: #4c4; font-size: 14px;">Active for this season</span>`
            : `<button data-buy="season_pass" style="
                background: rgba(68,170,255,0.2); border: 1px solid #4af;
                color: #4af; padding: 10px 24px; cursor: pointer;
                font-family: inherit; font-size: 14px; border-radius: 4px;
              ">Purchase — $${(passItem?.priceCents ?? 999) / 100}</button>`
          }
        </div>
      </div>
    `;
  }

  function renderInventory(): string {
    const owned = currentEntitlements?.items ?? [];
    if (owned.length === 0) {
      return `<p style="color: #888; text-align: center; padding: 20px;">You don't own any items yet.</p>`;
    }

    let html = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">`;
    for (const ent of owned) {
      const item = currentItems.find(i => i.id === ent.itemId);
      if (!item) continue;

      const isEquipped = Object.values(currentEquipped).includes(ent.itemId);
      const isCosmetic = item.purchaseType === "cosmetic";
      const cat = item.category;

      html += `
        <div style="
          background: rgba(30,30,50,0.8);
          border: 1px solid ${isEquipped ? "#4c4" : "#333"};
          border-radius: 4px; padding: 10px;
        ">
          <div style="color: #fff; font-weight: bold; font-size: 12px;">${item.name}</div>
          <div style="color: #888; font-size: 11px; margin-top: 2px;">
            ${item.description}
            ${ent.expiresAt ? `<br><span style="color: #fa4;">Expires: ${new Date(ent.expiresAt).toLocaleDateString()}</span>` : ""}
          </div>
          ${isCosmetic && cat ? `
            <div style="margin-top: 6px;">
              ${isEquipped
                ? `<button data-unequip="${cat}" style="
                    background: rgba(76,196,76,0.2); border: 1px solid #4c4;
                    color: #4c4; padding: 3px 10px; cursor: pointer;
                    font-family: inherit; font-size: 11px; border-radius: 3px;
                  ">Equipped ✓</button>`
                : `<button data-equip="${ent.itemId}" style="
                    background: rgba(68,170,255,0.15); border: 1px solid #4af;
                    color: #4af; padding: 3px 10px; cursor: pointer;
                    font-family: inherit; font-size: 11px; border-radius: 3px;
                  ">Equip</button>`
              }
            </div>
          ` : ""}
        </div>
      `;
    }
    html += "</div>";
    return html;
  }

  function renderItemCard(item: StoreItem): string {
    const owned = currentEntitlements?.items.some(e => e.itemId === item.id) ?? false;
    return `
      <div style="
        background: rgba(30,30,50,0.8);
        border: 1px solid ${owned ? "#4c4" : "#333"};
        border-radius: 4px; padding: 10px;
      ">
        <div style="color: #fff; font-weight: bold; font-size: 12px;">${item.name}</div>
        <div style="color: #888; font-size: 11px; margin-top: 2px;">${item.description}</div>
        <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #4c4; font-size: 12px;">$${(item.priceCents / 100).toFixed(2)}</span>
          ${owned
            ? `<span style="color: #4c4; font-size: 11px;">Owned ✓</span>`
            : `<button data-buy="${item.id}" style="
                background: rgba(68,170,255,0.15); border: 1px solid #4af;
                color: #4af; padding: 3px 10px; cursor: pointer;
                font-family: inherit; font-size: 11px; border-radius: 3px;
              ">Buy</button>`
          }
        </div>
      </div>
    `;
  }

  return {
    element: el,
    get isOpen() { return isOpen; },

    setActions(newActions: StorePanelActions): void {
      actions = newActions;
    },

    open(items, entitlements, equipped) {
      currentItems = items;
      currentEntitlements = entitlements;
      currentEquipped = equipped;
      currentTab = "cosmetics";
      isOpen = true;
      el.style.display = "block";
      render();
    },

    close() {
      isOpen = false;
      el.style.display = "none";
      el.innerHTML = "";
    },

    updateEntitlements(entitlements, equipped) {
      currentEntitlements = entitlements;
      currentEquipped = equipped;
      if (isOpen) render();
    },

    showPurchaseResult(itemId, success, message) {
      if (!isOpen) return;
      // Re-render to reflect ownership change
      if (success) render();
      // Could add a toast notification here
    },
  };
}
