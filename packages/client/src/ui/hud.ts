// Empire Reborn — HUD (Top Bar + Bottom Bar)

import { UNIT_ATTRIBUTES, GAME_VERSION, UnitBehavior, BEHAVIOR_NAMES, behaviorIndex, NUM_UNIT_TYPES, TECH_NAMES, getTechLevel, TECH_THRESHOLDS, MAX_TECH_LEVEL, TechType, techMaxHpBonus, techStrengthBonus, techConstructionSpeedBonus, UnitType } from "@empire/shared";
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

      // Resource display with income
      const [ore, oil, txt] = state.resources;
      const [oreInc, oilInc, txtInc] = state.resourceIncome;
      const fmtInc = (v: number) => v > 0 ? `<span class="res-income">+${v}</span>` : "";
      const resHtml = `<span class="resources">` +
        `<span class="res-ore" title="Ore">${ore}${fmtInc(oreInc)}</span>` +
        `<span class="res-oil" title="Oil">${oil}${fmtInc(oilInc)}</span>` +
        `<span class="res-txt" title="Textile">${txt}${fmtInc(txtInc)}</span>` +
        `</span>`;

      // Tech research display — show levels (Lv0-5) with points as tooltip
      const tech = state.techResearch;
      const hasTech = tech[0] > 0 || tech[1] > 0 || tech[2] > 0 || tech[3] > 0;
      const techColors = ["#66aaff", "#44cc88", "#ffaa44", "#ff6644"];
      const techLabels = ["S", "H", "E", "W"];
      const techHtml = hasTech
        ? `<span class="tech-display">` +
          [0, 1, 2, 3].map(i => {
            const lv = getTechLevel(tech[i]);
            const next = lv < MAX_TECH_LEVEL ? TECH_THRESHOLDS[lv] : tech[i];
            return `<span style="color:${techColors[i]}" title="${TECH_NAMES[i]}: ${tech[i]} pts (Lv${lv}/${MAX_TECH_LEVEL})">${techLabels[i]}:Lv${lv}</span>`;
          }).join("") +
          `</span>`
        : "";

      // World mode indicators
      let worldHtml = "";
      if (state.isWorldMode) {
        const parts: string[] = [];
        // Tick countdown
        if (state.tickNextMs !== undefined) {
          const secs = Math.max(0, Math.ceil(state.tickNextMs / 1000));
          const min = Math.floor(secs / 60);
          const sec = secs % 60;
          parts.push(`<span class="tick-timer" title="Next tick">⏱ ${min}:${sec.toString().padStart(2, "0")}</span>`);
        }
        // Actions queued
        if (state.worldActionsQueued !== undefined && state.worldActionsQueued > 0) {
          parts.push(`<span class="actions-queued" title="Actions queued for next tick">${state.worldActionsQueued} queued</span>`);
        }
        // Shield
        if (state.shieldRemainingMs !== undefined && state.shieldRemainingMs > 0) {
          const shieldMin = Math.ceil(state.shieldRemainingMs / 60000);
          parts.push(`<span class="shield-indicator" title="Shield active">${shieldMin}min shield</span>`);
        }
        // Season
        if (state.seasonRemainingS !== undefined) {
          const days = Math.ceil(state.seasonRemainingS / 86400);
          parts.push(`<span style="color:#888" title="Season remaining">${days}d left</span>`);
        }
        worldHtml = parts.join("");
      }

      topContent.innerHTML = [
        `<span><span class="stat-label">Turn</span><span class="stat">${state.turn}</span></span>`,
        `<span><span class="stat-label">Cities</span><span class="stat">${state.playerCityCount}</span></span>`,
        `<span><span class="stat-label">Units</span>${unitSummary}</span>`,
        resHtml,
        techHtml,
        worldHtml,
        `<span style="margin-left:auto;color:#555">Empire Reborn v${GAME_VERSION}</span>`,
      ].join("");

      // Bottom bar — compute tech-boosted stats from UIState.techResearch
      const techLevels = state.techResearch
        ? [getTechLevel(state.techResearch[0]), getTechLevel(state.techResearch[1]),
           getTechLevel(state.techResearch[2]), getTechLevel(state.techResearch[3])]
        : [0, 0, 0, 0];

      if (state.selectedUnit) {
        const u = state.selectedUnit;
        const attrs = UNIT_ATTRIBUTES[u.type];
        const hpBonus = techMaxHpBonus(techLevels[TechType.Health], u.type);
        const effMaxHp = attrs.maxHits + hpBonus;
        const spdBonus = u.type === UnitType.Construction ? techConstructionSpeedBonus(techLevels[TechType.Science]) : 0;
        const effSpeed = attrs.speed + spdBonus;
        const movesLeft = effSpeed - u.moved;
        const behaviorName = u.func === UnitBehavior.None ? "awaiting orders"
          : BEHAVIOR_NAMES[behaviorIndex(u.func)];

        const parts = [
          `<span class="unit-name">${attrs.name}</span>`,
          `<span class="info-sep">|</span>`,
          `<span>HP: ${u.hits}/${effMaxHp}</span>`,
          `<span class="info-sep">|</span>`,
          `<span>Moves: ${movesLeft}/${effSpeed}</span>`,
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
