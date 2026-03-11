// Empire Reborn — Unit Info Panel (Phase 2A)
// Slide-in panel showing detailed unit/city/tile info when selected.

import {
  UNIT_ATTRIBUTES, Owner, UnitType, UnitBehavior,
  BEHAVIOR_NAMES, behaviorIndex, INFINITY,
  locRow, locCol,
  UNIT_COSTS, DEPOSIT_NAMES, DepositType,
  BUILDING_NAMES,
  getEffectiveMaxHp, getEffectiveStrength, getEffectiveSpeed,
  getEffectiveFighterRange, getEffectiveSatelliteRange,
  getPlayerColor, UNOWNED,
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

// Owner color as CSS hex string
function ownerColor(owner: Owner): string {
  if (owner === UNOWNED) return "var(--color-text-muted)";
  const hex = getPlayerColor(owner);
  return `#${hex.toString(16).padStart(6, "0")}`;
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
        const effMaxHp = getEffectiveMaxHp(gameState, u);
        const effStrength = getEffectiveStrength(gameState, u);
        const effSpeed = getEffectiveSpeed(gameState, u);
        const effRange = u.type === UnitType.Fighter
          ? getEffectiveFighterRange(gameState, u.owner)
          : u.type === UnitType.Satellite
            ? getEffectiveSatelliteRange(gameState, u.owner)
            : attrs.range;
        const movesLeft = effSpeed - u.moved;
        const ownerLabel = "Player " + u.owner;

        // Header: icon + name + owner
        parts.push(`<div class="info-header">`);
        parts.push(`<div class="info-icon" style="border-color:${ownerColor(u.owner)}">${attrs.char}</div>`);
        parts.push(`<div class="info-title">`);
        parts.push(`<div class="info-name">${attrs.name}</div>`);
        parts.push(`<div class="info-owner" style="color:${ownerColor(u.owner)}">${ownerLabel}</div>`);
        parts.push(`</div></div>`);

        // HP bar (segmented) — use effective max HP
        const hpPct = Math.round((u.hits / effMaxHp) * 100);
        const hpColor = hpPct > 60 ? "var(--color-green)" : hpPct > 30 ? "var(--color-orange)" : "var(--color-red)";
        parts.push(`<div class="info-section">`);
        parts.push(`<div class="info-label">Hit Points</div>`);
        parts.push(`<div class="info-hp-bar">`);
        for (let i = 0; i < effMaxHp; i++) {
          const filled = i < u.hits;
          parts.push(`<div class="info-hp-seg${filled ? " filled" : ""}" style="${filled ? `background:${hpColor}` : ""}"></div>`);
        }
        parts.push(`</div>`);
        parts.push(`<div class="info-value">${u.hits} / ${effMaxHp}${effMaxHp > attrs.maxHits ? ` <span style="color:var(--color-green)">(+${effMaxHp - attrs.maxHits})</span>` : ""}</div>`);
        parts.push(`</div>`);

        // Movement
        parts.push(`<div class="info-row">`);
        parts.push(`<span class="info-label">Moves</span>`);
        parts.push(`<span class="info-value">${movesLeft} / ${effSpeed}${effSpeed > attrs.speed ? ` <span style="color:var(--color-green)">(+${effSpeed - attrs.speed})</span>` : ""}</span>`);
        parts.push(`</div>`);

        // Terrain
        parts.push(`<div class="info-row">`);
        parts.push(`<span class="info-label">Terrain</span>`);
        parts.push(`<span class="info-value">${terrainLabel(attrs.terrain)}</span>`);
        parts.push(`</div>`);

        // Strength
        parts.push(`<div class="info-row">`);
        parts.push(`<span class="info-label">Strength</span>`);
        parts.push(`<span class="info-value">${effStrength}${effStrength > attrs.strength ? ` <span style="color:var(--color-green)">(+${effStrength - attrs.strength})</span>` : ""}</span>`);
        parts.push(`</div>`);

        // Range (fighters/satellites/AWACS)
        if (attrs.range < INFINITY) {
          parts.push(`<div class="info-row">`);
          parts.push(`<span class="info-label">Range</span>`);
          parts.push(`<span class="info-value">${u.range} / ${effRange}${effRange > attrs.range ? ` <span style="color:var(--color-green)">(+${effRange - attrs.range})</span>` : ""}</span>`);
          parts.push(`</div>`);
        }

        // Bombard range (artillery/missile cruiser)
        if (attrs.attackRange > 0) {
          parts.push(`<div class="info-row">`);
          parts.push(`<span class="info-label">Bombard</span>`);
          parts.push(`<span class="info-value" style="color:var(--color-orange)">${attrs.attackRange} tiles</span>`);
          parts.push(`</div>`);
        }

        // Visibility (special forces)
        if (attrs.invisible) {
          parts.push(`<div class="info-row">`);
          parts.push(`<span class="info-label">Stealth</span>`);
          parts.push(`<span class="info-value" style="color:var(--color-green)">Invisible</span>`);
          parts.push(`</div>`);
        }

        // Vision radius (AWACS)
        if (attrs.visionRadius > 0) {
          parts.push(`<div class="info-row">`);
          parts.push(`<span class="info-label">Vision</span>`);
          parts.push(`<span class="info-value" style="color:var(--color-green)">${attrs.visionRadius + 1} tile radius</span>`);
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

        // Construction unit building status
        if (u.type === UnitType.Construction) {
          const building = gameState.buildings.find(
            (b) => b.constructorId === u.id && !b.complete,
          );
          if (building) {
            const pct = Math.floor((building.work / building.buildTime) * 100);
            const turnsLeft = building.buildTime - building.work;
            parts.push(`<div class="info-section">`);
            parts.push(`<div class="info-label" style="color:var(--color-orange)">Building</div>`);
            parts.push(`<div class="info-row">`);
            parts.push(`<span class="info-label">Project</span>`);
            parts.push(`<span class="info-value">${BUILDING_NAMES[building.type]}${building.level > 1 ? ` Lv${building.level}` : ""}</span>`);
            parts.push(`</div>`);
            parts.push(`<div class="info-row">`);
            parts.push(`<span class="info-label">Progress</span>`);
            parts.push(`<span class="info-value">${pct}% (${turnsLeft} turns)</span>`);
            parts.push(`</div>`);
            parts.push(`<div class="progress-bar" style="height:4px;margin:4px 0"><div class="fill" style="width:${pct}%;background:var(--color-orange)"></div></div>`);
            parts.push(`</div>`);
          }
        }

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
          const ownerLabel = city.owner === UNOWNED ? "Neutral" : "Player " + city.owner;

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

          // Resource cost
          const cost = UNIT_COSTS[city.production];
          const costParts: string[] = [];
          if (cost[0] > 0) costParts.push(`<span style="color:#c08040">${cost[0]} ore</span>`);
          if (cost[1] > 0) costParts.push(`<span style="color:#8888aa">${cost[1]} oil</span>`);
          if (cost[2] > 0) costParts.push(`<span style="color:#60b050">${cost[2]} txt</span>`);
          if (costParts.length > 0) {
            parts.push(`<div class="info-row">`);
            parts.push(`<span class="info-label">Cost</span>`);
            parts.push(`<span class="info-value">${costParts.join(" ")}</span>`);
            parts.push(`</div>`);
          }

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
