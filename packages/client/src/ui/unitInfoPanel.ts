// Empire Reborn — Unit Info Panel (Phase 2A)
// Slide-in panel showing detailed unit/city/tile info when selected.

import {
  UNIT_ATTRIBUTES, Owner, UnitType, UnitBehavior,
  BEHAVIOR_NAMES, behaviorIndex, INFINITY,
  locRow, locCol,
} from "@empire/shared";
import type { UnitState, CityState, GameState } from "@empire/shared";

export interface UnitInfoPanel {
  readonly element: HTMLDivElement;
  update(
    selectedUnit: UnitState | null,
    selectedCityId: number | null,
    gameState: GameState,
    mapWidth: number,
  ): void;
}

// Terrain label from unit terrain string
function terrainLabel(terrain: string): string {
  if (terrain === "+") return "Land";
  if (terrain === ".") return "Sea";
  if (terrain === ".+") return "Any";
  return terrain;
}

// Owner color CSS class
function ownerColor(owner: Owner): string {
  if (owner === Owner.Player1) return "var(--color-green)";
  if (owner === Owner.Player2) return "var(--color-red)";
  return "var(--color-text-muted)";
}

// Unit type character display with color
function unitChar(type: UnitType): string {
  const attrs = UNIT_ATTRIBUTES[type];
  return `<span class="info-unit-char">${attrs.char}</span>`;
}

export function createUnitInfoPanel(): UnitInfoPanel {
  const element = document.createElement("div");
  element.id = "unit-info-panel";

  return {
    element,

    update(selectedUnit, selectedCityId, gameState, mapWidth): void {
      // No selection
      if (!selectedUnit && selectedCityId === null) {
        element.innerHTML = "";
        element.classList.remove("visible");
        return;
      }

      element.classList.add("visible");
      const parts: string[] = [];

      // ─── Unit info ───────────────────────────────────────────
      if (selectedUnit) {
        const u = selectedUnit;
        const attrs = UNIT_ATTRIBUTES[u.type];
        const movesLeft = attrs.speed - u.moved;
        const ownerLabel = u.owner === Owner.Player1 ? "Player" : "Computer";

        // Header: icon + name + owner
        parts.push(`<div class="info-header">`);
        parts.push(`<div class="info-icon" style="border-color:${ownerColor(u.owner)}">${attrs.char}</div>`);
        parts.push(`<div class="info-title">`);
        parts.push(`<div class="info-name">${attrs.name}</div>`);
        parts.push(`<div class="info-owner" style="color:${ownerColor(u.owner)}">${ownerLabel}</div>`);
        parts.push(`</div></div>`);

        // HP bar (segmented)
        const hpPct = Math.round((u.hits / attrs.maxHits) * 100);
        const hpColor = hpPct > 60 ? "var(--color-green)" : hpPct > 30 ? "var(--color-orange)" : "var(--color-red)";
        parts.push(`<div class="info-section">`);
        parts.push(`<div class="info-label">Hit Points</div>`);
        parts.push(`<div class="info-hp-bar">`);
        for (let i = 0; i < attrs.maxHits; i++) {
          const filled = i < u.hits;
          parts.push(`<div class="info-hp-seg${filled ? " filled" : ""}" style="${filled ? `background:${hpColor}` : ""}"></div>`);
        }
        parts.push(`</div>`);
        parts.push(`<div class="info-value">${u.hits} / ${attrs.maxHits}</div>`);
        parts.push(`</div>`);

        // Movement
        parts.push(`<div class="info-row">`);
        parts.push(`<span class="info-label">Moves</span>`);
        parts.push(`<span class="info-value">${movesLeft} / ${attrs.speed}</span>`);
        parts.push(`</div>`);

        // Terrain
        parts.push(`<div class="info-row">`);
        parts.push(`<span class="info-label">Terrain</span>`);
        parts.push(`<span class="info-value">${terrainLabel(attrs.terrain)}</span>`);
        parts.push(`</div>`);

        // Strength
        parts.push(`<div class="info-row">`);
        parts.push(`<span class="info-label">Strength</span>`);
        parts.push(`<span class="info-value">${attrs.strength}</span>`);
        parts.push(`</div>`);

        // Range (fighters/satellites only)
        if (attrs.range < INFINITY) {
          parts.push(`<div class="info-row">`);
          parts.push(`<span class="info-label">Range</span>`);
          parts.push(`<span class="info-value">${u.range} / ${attrs.range}</span>`);
          parts.push(`</div>`);
        }

        // Behavior/mission
        const behaviorName = u.func === UnitBehavior.None ? "Awaiting Orders"
          : BEHAVIOR_NAMES[behaviorIndex(u.func)];
        const behaviorColor = u.func === UnitBehavior.None
          ? "var(--color-text-muted)" : "var(--color-orange)";
        parts.push(`<div class="info-row">`);
        parts.push(`<span class="info-label">Orders</span>`);
        parts.push(`<span class="info-value" style="color:${behaviorColor};text-transform:capitalize">${behaviorName}</span>`);
        parts.push(`</div>`);

        // GoTo destination + ETA
        if (u.func === UnitBehavior.GoTo && u.targetLoc !== null) {
          const tCol = locCol(u.targetLoc);
          const tRow = locRow(u.targetLoc);
          const uCol = locCol(u.loc);
          const uRow = locRow(u.loc);
          const dist = Math.max(Math.abs(tCol - uCol), Math.abs(tRow - uRow));
          const eta = attrs.speed > 0 ? Math.ceil(dist / attrs.speed) : "?";
          parts.push(`<div class="info-row">`);
          parts.push(`<span class="info-label">Destination</span>`);
          parts.push(`<span class="info-value">(${tCol},${tRow})</span>`);
          parts.push(`</div>`);
          parts.push(`<div class="info-row">`);
          parts.push(`<span class="info-label">ETA</span>`);
          parts.push(`<span class="info-value">~${eta} turns</span>`);
          parts.push(`</div>`);
        }

        // Embarked
        if (u.shipId !== null) {
          const ship = gameState.units.find(s => s.id === u.shipId);
          if (ship) {
            const shipAttrs = UNIT_ATTRIBUTES[ship.type];
            parts.push(`<div class="info-row">`);
            parts.push(`<span class="info-label">Aboard</span>`);
            parts.push(`<span class="info-value">${shipAttrs.name} #${ship.id}</span>`);
            parts.push(`</div>`);
          }
        }

        // Cargo manifest (transports/carriers)
        if (attrs.capacity > 0 && u.cargoIds.length > 0) {
          parts.push(`<div class="info-section">`);
          parts.push(`<div class="info-label">Cargo (${u.cargoIds.length}/${attrs.capacity})</div>`);
          parts.push(`<div class="info-cargo">`);
          for (const cid of u.cargoIds) {
            const cargo = gameState.units.find(cu => cu.id === cid);
            if (cargo) {
              const cAttrs = UNIT_ATTRIBUTES[cargo.type];
              parts.push(`<span class="info-cargo-item">${cAttrs.char}</span>`);
            }
          }
          parts.push(`</div></div>`);
        } else if (attrs.capacity > 0) {
          parts.push(`<div class="info-row">`);
          parts.push(`<span class="info-label">Cargo</span>`);
          parts.push(`<span class="info-value">Empty (0/${attrs.capacity})</span>`);
          parts.push(`</div>`);
        }

        // Location
        const col = locCol(u.loc);
        const row = locRow(u.loc);
        parts.push(`<div class="info-row info-loc">`);
        parts.push(`<span class="info-label">Location</span>`);
        parts.push(`<span class="info-value">(${col}, ${row})</span>`);
        parts.push(`</div>`);
      }

      // ─── City info ───────────────────────────────────────────
      if (selectedCityId !== null) {
        const city = gameState.cities.find(c => c.id === selectedCityId);
        if (city) {
          const prodAttrs = UNIT_ATTRIBUTES[city.production];
          const pct = Math.max(0, Math.min(100, Math.floor((city.work / prodAttrs.buildTime) * 100)));
          const turnsLeft = Math.max(1, prodAttrs.buildTime - city.work);
          const ownerLabel = city.owner === Owner.Player1 ? "Player"
            : city.owner === Owner.Player2 ? "Computer" : "Neutral";

          if (selectedUnit) {
            // Separator if both unit and city shown
            parts.push(`<div class="info-divider"></div>`);
          }

          parts.push(`<div class="info-header">`);
          parts.push(`<div class="info-icon info-city-icon" style="border-color:${ownerColor(city.owner)}">C</div>`);
          parts.push(`<div class="info-title">`);
          parts.push(`<div class="info-name">City #${city.id}</div>`);
          parts.push(`<div class="info-owner" style="color:${ownerColor(city.owner)}">${ownerLabel}</div>`);
          parts.push(`</div></div>`);

          // Production
          parts.push(`<div class="info-row">`);
          parts.push(`<span class="info-label">Building</span>`);
          parts.push(`<span class="info-value" style="text-transform:capitalize">${prodAttrs.name}</span>`);
          parts.push(`</div>`);

          // Progress bar
          parts.push(`<div class="info-section">`);
          parts.push(`<div class="info-label">Progress</div>`);
          parts.push(`<div class="info-progress-bar"><div class="info-progress-fill" style="width:${pct}%"></div></div>`);
          parts.push(`<div class="info-value">${pct}% — ${turnsLeft} turn${turnsLeft !== 1 ? "s" : ""} left</div>`);
          parts.push(`</div>`);

          // Location
          const cCol = locCol(city.loc);
          const cRow = locRow(city.loc);
          parts.push(`<div class="info-row info-loc">`);
          parts.push(`<span class="info-label">Location</span>`);
          parts.push(`<span class="info-value">(${cCol}, ${cRow})</span>`);
          parts.push(`</div>`);
        }
      }

      element.innerHTML = parts.join("");
    },
  };
}
