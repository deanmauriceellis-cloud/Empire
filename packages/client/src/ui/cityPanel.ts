// Empire Reborn — City Production Panel (Modal)

import {
  UNIT_ATTRIBUTES, UnitType, NUM_UNIT_TYPES, UNIT_COSTS,
  BUILDING_NAMES, MAX_CITY_UPGRADES,
} from "@empire/shared";
import type { CityState, BuildingState } from "@empire/shared";

export interface CityPanel {
  readonly element: HTMLDivElement;
  /** Open the panel for a city. */
  open(city: CityState, buildings?: BuildingState[]): void;
  /** Close the panel. */
  close(): void;
  /** Returns the selected unit type if player chose one, or null. */
  consumeSelection(): { cityId: number; unitType: UnitType } | null;
  readonly isOpen: boolean;
}

export function createCityPanel(): CityPanel {
  const element = document.createElement("div");
  element.id = "city-panel";

  let currentCity: CityState | null = null;
  let currentBuildings: BuildingState[] = [];
  let pendingSelection: { cityId: number; unitType: UnitType } | null = null;
  let isOpen = false;

  function render(city: CityState): void {
    const currentAttrs = UNIT_ATTRIBUTES[city.production];
    const pct = Math.max(0, Math.min(100, Math.floor((city.work / currentAttrs.buildTime) * 100)));
    const turnsLeft = Math.max(1, currentAttrs.buildTime - city.work);

    let html = `<button class="close-btn" data-action="close">&times;</button>`;
    html += `<h2>City #${city.id} Production</h2>`;

    // Progress bar
    html += `<div class="progress-info">Building: <strong>${currentAttrs.name}</strong> — ${pct}% (${turnsLeft} turns left)</div>`;
    html += `<div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div>`;

    // Production grid
    html += `<div style="margin-top:12px" class="section-label" style="color:#666;font-size:11px">Choose production:</div>`;
    html += `<div class="production-grid" style="margin-top:8px">`;

    for (let i = 0; i < NUM_UNIT_TYPES; i++) {
      const attrs = UNIT_ATTRIBUTES[i];
      const active = city.production === i ? " active" : "";
      const cost = UNIT_COSTS[i];
      const costStr = [
        cost[0] > 0 ? `${cost[0]}o` : "",
        cost[1] > 0 ? `${cost[1]}f` : "",
        cost[2] > 0 ? `${cost[2]}t` : "",
      ].filter(Boolean).join("/");
      html += `<button class="prod-btn${active}" data-unit-type="${i}">` +
        `<span class="prod-name">${attrs.char} ${attrs.name}</span>` +
        `<span class="prod-stat">${attrs.buildTime}t | ${costStr} | ` +
        `${attrs.strength}atk | ${attrs.maxHits}hp</span>` +
        `</button>`;
    }

    html += `</div>`;

    // Penalty warning
    html += `<div class="penalty-warning" id="penalty-warn">Switching production incurs a 20% penalty on the new unit's build time.</div>`;

    // City upgrade slots
    if (city.upgradeIds.length > 0 || currentBuildings.length > 0) {
      html += `<div class="section-label" style="margin-top:12px;color:#fa4">Upgrades (${city.upgradeIds.length}/${MAX_CITY_UPGRADES})</div>`;
      html += `<div style="margin-top:4px">`;
      for (const bid of city.upgradeIds) {
        const b = currentBuildings.find((building) => building.id === bid);
        if (b) {
          const lvl = b.level > 1 ? ` Lv${b.level}` : "";
          const status = b.complete
            ? `<span style="color:#4c8">Active</span>`
            : `<span style="color:#fa4">Building ${Math.floor((b.work / b.buildTime) * 100)}%</span>`;
          html += `<div style="font-size:11px;color:#ccc;margin:2px 0">` +
            `${BUILDING_NAMES[b.type]}${lvl} — ${status}</div>`;
        }
      }
      for (let i = city.upgradeIds.length; i < MAX_CITY_UPGRADES; i++) {
        html += `<div style="font-size:11px;color:#555;margin:2px 0">[ Empty slot ]</div>`;
      }
      html += `</div>`;
    }

    element.innerHTML = html;
  }

  element.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest("[data-action], [data-unit-type]") as HTMLElement | null;
    if (!target) return;

    if (target.dataset.action === "close") {
      isOpen = false;
      element.classList.remove("visible");
      return;
    }

    if (target.dataset.unitType !== undefined && currentCity) {
      const unitType = parseInt(target.dataset.unitType, 10) as UnitType;
      pendingSelection = { cityId: currentCity.id, unitType };
      isOpen = false;
      element.classList.remove("visible");
    }
  });

  element.addEventListener("mouseover", (e) => {
    const target = (e.target as HTMLElement).closest("[data-unit-type]") as HTMLElement | null;
    const warn = element.querySelector("#penalty-warn") as HTMLElement | null;
    if (!warn || !currentCity) return;

    if (target && parseInt(target.dataset.unitType!, 10) !== currentCity.production) {
      warn.style.display = "block";
    } else {
      warn.style.display = "none";
    }
  });

  return {
    element,
    get isOpen() { return isOpen; },

    open(city: CityState, buildings?: BuildingState[]): void {
      currentCity = city;
      currentBuildings = buildings ?? [];
      isOpen = true;
      render(city);
      element.classList.add("visible");
    },

    close(): void {
      isOpen = false;
      element.classList.remove("visible");
    },

    consumeSelection(): { cityId: number; unitType: UnitType } | null {
      const sel = pendingSelection;
      pendingSelection = null;
      return sel;
    },
  };
}
