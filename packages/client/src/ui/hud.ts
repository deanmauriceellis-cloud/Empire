// Empire Reborn — HUD (Top Bar + Bottom Bar)

import { UNIT_ATTRIBUTES, GAME_VERSION, UnitBehavior, BEHAVIOR_NAMES, behaviorIndex, NUM_UNIT_TYPES } from "@empire/shared";
import type { UIState } from "../types.js";

export interface HUD {
  readonly topBar: HTMLDivElement;
  readonly bottomBar: HTMLDivElement;
  setWarStatsButton(btn: HTMLButtonElement): void;
  update(state: UIState): void;
}

export function createHUD(): HUD {
  const topBar = document.createElement("div");
  topBar.id = "hud-top";

  // Content span so innerHTML doesn't destroy the war stats button
  const topContent = document.createElement("span");
  topContent.id = "hud-top-content";
  topBar.appendChild(topContent);

  const bottomBar = document.createElement("div");
  bottomBar.id = "hud-bottom";

  return {
    topBar,
    bottomBar,

    setWarStatsButton(btn: HTMLButtonElement): void {
      topBar.insertBefore(btn, topContent);
    },

    update(state: UIState): void {
      // Top bar — unit counts by type
      const unitParts: string[] = [];
      for (let i = 0; i < NUM_UNIT_TYPES; i++) {
        if (state.unitCountsByType[i] > 0) {
          unitParts.push(`<span class="unit-count" title="${UNIT_ATTRIBUTES[i].name}">${UNIT_ATTRIBUTES[i].char}:${state.unitCountsByType[i]}</span>`);
        }
      }
      const unitSummary = unitParts.length > 0
        ? unitParts.join("")
        : `<span class="stat">0</span>`;

      topContent.innerHTML = [
        `<span><span class="stat-label">Turn</span><span class="stat">${state.turn}</span></span>`,
        `<span><span class="stat-label">Cities</span><span class="stat">${state.playerCityCount}</span></span>`,
        `<span><span class="stat-label">Units</span>${unitSummary}</span>`,
        `<span style="margin-left:auto;color:#555">Empire Reborn v${GAME_VERSION}</span>`,
      ].join("");

      // Bottom bar
      if (state.selectedUnit) {
        const u = state.selectedUnit;
        const attrs = UNIT_ATTRIBUTES[u.type];
        const movesLeft = attrs.speed - u.moved;
        const behaviorName = u.func === UnitBehavior.None ? "awaiting orders"
          : BEHAVIOR_NAMES[behaviorIndex(u.func)];

        const parts = [
          `<span class="unit-name">${attrs.name}</span>`,
          `<span class="info-sep">|</span>`,
          `<span>HP: ${u.hits}/${attrs.maxHits}</span>`,
          `<span class="info-sep">|</span>`,
          `<span>Moves: ${movesLeft}/${attrs.speed}</span>`,
        ];
        if (attrs.range < 10_000_000) {
          parts.push(`<span class="info-sep">|</span>`);
          parts.push(`<span>Range: ${u.range}</span>`);
        }
        parts.push(`<span class="info-sep">|</span>`);
        parts.push(`<span style="color:#888">${behaviorName}</span>`);
        if (attrs.capacity > 0) {
          parts.push(`<span class="info-sep">|</span>`);
          parts.push(`<span>Cargo: ${u.cargoIds.length}/${attrs.capacity}</span>`);
        }

        bottomBar.innerHTML = `<div class="unit-info">${parts.join("")}</div>`;
      } else if (state.selectedCity) {
        const c = state.selectedCity;
        const attrs = UNIT_ATTRIBUTES[c.production];
        const turnsLeft = Math.max(1, attrs.buildTime - c.work);
        const pct = Math.max(0, Math.min(100, Math.floor((c.work / attrs.buildTime) * 100)));

        bottomBar.innerHTML = `<div class="unit-info">` +
          `<span class="city-name">City #${c.id}</span>` +
          `<span class="info-sep">|</span>` +
          `<span>Building: ${attrs.name}</span>` +
          `<span class="info-sep">|</span>` +
          `<span>${pct}% (${turnsLeft} turns)</span>` +
          `</div>`;
      } else {
        bottomBar.innerHTML = `<span style="color:#555">Click a unit or city to select</span>`;
      }
    },
  };
}
