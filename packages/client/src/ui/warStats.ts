// Empire Reborn — War Stats Panel
// Tracks all battles and displays them in a modal dialog.

import { Owner, UnitType, UNIT_ATTRIBUTES } from "@empire/shared";
import type { TurnEvent, Loc } from "@empire/shared";
import type { Camera } from "../core/camera.js";
import { locCol, locRow } from "@empire/shared";

// ─── Battle Record ──────────────────────────────────────────────────────────

export interface BattleRecord {
  turn: number;
  loc: Loc;
  kind: "unit" | "city_capture" | "city_failed";
  // Unit vs unit combat
  winnerType?: UnitType;
  winnerOwner?: Owner;
  loserType?: UnitType;
  loserOwner?: Owner;
  // City assault
  captured?: boolean;
  attackerOwner?: Owner;
  // All units destroyed in this battle (including cargo)
  deaths: { unitType: UnitType; owner: Owner }[];
}

// ─── War Stats Interface ────────────────────────────────────────────────────

export interface WarStats {
  readonly element: HTMLDivElement;
  readonly button: HTMLButtonElement;
  addEvents(turn: number, events: TurnEvent[]): void;
  clear(): void;
}

// ─── Helper: Unit type name (short) ─────────────────────────────────────────

function unitName(type: UnitType): string {
  return UNIT_ATTRIBUTES[type].name;
}

function ownerLabel(owner: Owner): string {
  return owner === Owner.Player1 ? "P1" : "P2";
}

function ownerClass(owner: Owner): string {
  return owner === Owner.Player1 ? "p1" : "p2";
}

// ─── Summarize deaths into a compact string ─────────────────────────────────

function summarizeDeaths(deaths: { unitType: UnitType; owner: Owner }[], loserOwner: Owner): string {
  // Filter deaths to the losing side
  const loserDeaths = deaths.filter(d => d.owner === loserOwner);
  if (loserDeaths.length === 0) return "";

  // Count by unit type
  const counts = new Map<UnitType, number>();
  for (const d of loserDeaths) {
    counts.set(d.unitType, (counts.get(d.unitType) ?? 0) + 1);
  }

  const parts: string[] = [];
  for (const [type, count] of counts) {
    parts.push(count > 1 ? `${count} ${unitName(type)}` : unitName(type));
  }

  const total = loserDeaths.length;
  const summary = parts.join(" + ");
  return total > 1 ? `${summary} (${total} lost)` : summary;
}

// ─── Build battle records from a turn's events ──────────────────────────────

function buildBattles(turn: number, events: TurnEvent[]): BattleRecord[] {
  const battles: BattleRecord[] = [];

  // Collect all death events indexed by location for fast lookup
  const deathsByLoc = new Map<Loc, { unitType: UnitType; owner: Owner }[]>();
  const usedDeathIndices = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "death" && e.data) {
      const list = deathsByLoc.get(e.loc) ?? [];
      list.push({ unitType: e.data.unitType as UnitType, owner: e.data.owner as Owner });
      deathsByLoc.set(e.loc, list);
    }
  }

  for (const e of events) {
    if (e.type === "combat" && e.data && e.data.winnerType !== undefined) {
      // Unit vs unit combat
      const battle: BattleRecord = {
        turn,
        loc: e.loc,
        kind: "unit",
        winnerType: e.data.winnerType as UnitType,
        winnerOwner: e.data.winnerId !== undefined ? undefined : undefined, // resolved from deaths
        loserType: e.data.loserType as UnitType,
        deaths: deathsByLoc.get(e.loc) ?? [],
      };
      // Determine owners from death events
      for (const d of battle.deaths) {
        if (d.unitType === battle.loserType && battle.loserOwner === undefined) {
          battle.loserOwner = d.owner;
          battle.winnerOwner = d.owner === Owner.Player1 ? Owner.Player2 : Owner.Player1;
        }
      }
      battles.push(battle);
      deathsByLoc.delete(e.loc); // consumed
    } else if (e.type === "capture" && e.data) {
      // City captured
      battles.push({
        turn,
        loc: e.loc,
        kind: "city_capture",
        captured: true,
        attackerOwner: e.data.attackerOwner as Owner,
        loserOwner: e.data.oldOwner as Owner,
        deaths: deathsByLoc.get(e.loc) ?? [],
      });
      deathsByLoc.delete(e.loc);
    } else if (e.type === "combat" && e.data && e.data.cityId !== undefined && e.data.winnerType === undefined) {
      // Failed city assault
      battles.push({
        turn,
        loc: e.loc,
        kind: "city_failed",
        captured: false,
        attackerOwner: e.data.attackerOwner as Owner,
        deaths: deathsByLoc.get(e.loc) ?? [],
      });
      deathsByLoc.delete(e.loc);
    }
  }

  return battles;
}

// ─── Create War Stats Panel ─────────────────────────────────────────────────

export function createWarStats(camera: Camera): WarStats {
  const allBattles: BattleRecord[] = [];

  // Button for the top bar
  const button = document.createElement("button");
  button.id = "war-stats-btn";
  button.textContent = "War Stats";
  button.addEventListener("click", () => {
    element.classList.toggle("visible");
    if (element.classList.contains("visible")) {
      renderBattles();
    }
  });

  // Modal dialog
  const element = document.createElement("div");
  element.id = "war-stats-panel";

  const header = document.createElement("div");
  header.className = "war-stats-header";
  header.innerHTML = `<h2>War Stats</h2>`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => {
    element.classList.remove("visible");
  });
  header.appendChild(closeBtn);

  // Summary row
  const summary = document.createElement("div");
  summary.className = "war-stats-summary";

  // Filter tabs
  const filters = document.createElement("div");
  filters.className = "war-stats-filters";

  let activeFilter: "all" | "unit" | "city" = "all";

  function createFilterBtn(label: string, filter: "all" | "unit" | "city"): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "war-filter-btn" + (filter === "all" ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      activeFilter = filter;
      for (const b of filters.querySelectorAll(".war-filter-btn")) {
        b.classList.toggle("active", b === btn);
      }
      renderBattles();
    });
    return btn;
  }

  filters.appendChild(createFilterBtn("All", "all"));
  filters.appendChild(createFilterBtn("Combat", "unit"));
  filters.appendChild(createFilterBtn("Cities", "city"));

  const list = document.createElement("div");
  list.className = "war-stats-list";

  element.appendChild(header);
  element.appendChild(summary);
  element.appendChild(filters);
  element.appendChild(list);

  function computeSummary(): { p1Kills: number; p2Kills: number; p1Captures: number; p2Captures: number; p1Losses: number; p2Losses: number } {
    let p1Kills = 0, p2Kills = 0, p1Captures = 0, p2Captures = 0, p1Losses = 0, p2Losses = 0;
    for (const b of allBattles) {
      if (b.kind === "unit") {
        if (b.winnerOwner === Owner.Player1) p1Kills++;
        else p2Kills++;
      }
      if (b.kind === "city_capture") {
        if (b.attackerOwner === Owner.Player1) p1Captures++;
        else p2Captures++;
      }
      for (const d of b.deaths) {
        if (d.owner === Owner.Player1) p1Losses++;
        else p2Losses++;
      }
    }
    return { p1Kills, p2Kills, p1Captures, p2Captures, p1Losses, p2Losses };
  }

  function renderBattles(): void {
    const stats = computeSummary();
    summary.innerHTML =
      `<div class="summary-row">` +
      `<span class="summary-p1"><b>Player 1</b> — ${stats.p1Kills} wins, ${stats.p1Captures} captures, ${stats.p1Losses} units lost</span>` +
      `<span class="summary-p2"><b>Player 2</b> — ${stats.p2Kills} wins, ${stats.p2Captures} captures, ${stats.p2Losses} units lost</span>` +
      `</div>`;

    const filtered = activeFilter === "all"
      ? allBattles
      : activeFilter === "unit"
        ? allBattles.filter(b => b.kind === "unit")
        : allBattles.filter(b => b.kind === "city_capture" || b.kind === "city_failed");

    if (filtered.length === 0) {
      list.innerHTML = `<div class="war-empty">No battles yet</div>`;
      return;
    }

    // Show most recent first
    const rows: string[] = [];
    for (let i = filtered.length - 1; i >= 0; i--) {
      const b = filtered[i];
      const col = locCol(b.loc);
      const row = locRow(b.loc);

      let icon = "";
      let desc = "";
      let deathSummary = "";

      if (b.kind === "unit") {
        const winnerName = b.winnerType !== undefined ? unitName(b.winnerType) : "???";
        const loserName = b.loserType !== undefined ? unitName(b.loserType) : "???";
        const winClass = b.winnerOwner !== undefined ? ownerClass(b.winnerOwner) : "";
        const loseClass = b.loserOwner !== undefined ? ownerClass(b.loserOwner) : "";
        icon = "⚔";
        desc = `<span class="${winClass}">${winnerName}</span> defeated <span class="${loseClass}">${loserName}</span>`;
        if (b.deaths.length > 1 && b.loserOwner !== undefined) {
          deathSummary = summarizeDeaths(b.deaths, b.loserOwner);
        }
      } else if (b.kind === "city_capture") {
        const atkClass = b.attackerOwner !== undefined ? ownerClass(b.attackerOwner) : "";
        icon = "🏴";
        desc = `<span class="${atkClass}">${ownerLabel(b.attackerOwner!)}</span> captured a city`;
        if (b.deaths.length > 0 && b.loserOwner !== undefined) {
          deathSummary = summarizeDeaths(b.deaths, b.loserOwner);
        }
      } else {
        const atkClass = b.attackerOwner !== undefined ? ownerClass(b.attackerOwner) : "";
        icon = "🛡";
        desc = `<span class="${atkClass}">${ownerLabel(b.attackerOwner!)}</span> failed to capture a city`;
        if (b.deaths.length > 0 && b.attackerOwner !== undefined) {
          deathSummary = summarizeDeaths(b.deaths, b.attackerOwner);
        }
      }

      rows.push(
        `<div class="war-row" data-loc="${b.loc}">` +
        `<span class="war-icon">${icon}</span>` +
        `<span class="war-turn">T${b.turn}</span>` +
        `<span class="war-desc">${desc}</span>` +
        (deathSummary ? `<span class="war-deaths">${deathSummary}</span>` : "") +
        `<span class="war-loc" data-loc="${b.loc}">(${col},${row})</span>` +
        `</div>`
      );
    }

    list.innerHTML = rows.join("");

    // Attach click handlers for location links
    for (const locEl of list.querySelectorAll(".war-loc")) {
      locEl.addEventListener("click", (e) => {
        e.stopPropagation();
        const loc = Number((locEl as HTMLElement).dataset.loc);
        camera.panToTile(locCol(loc), locRow(loc));
      });
    }

    // Click on row to pan too
    for (const rowEl of list.querySelectorAll(".war-row")) {
      rowEl.addEventListener("click", () => {
        const loc = Number((rowEl as HTMLElement).dataset.loc);
        camera.panToTile(locCol(loc), locRow(loc));
      });
    }
  }

  return {
    element,
    button,

    addEvents(turn: number, events: TurnEvent[]): void {
      const battles = buildBattles(turn, events);
      allBattles.push(...battles);
      // Update button badge
      if (allBattles.length > 0) {
        button.textContent = `War Stats (${allBattles.length})`;
      }
      // If panel is open, refresh it
      if (element.classList.contains("visible")) {
        renderBattles();
      }
    },

    clear(): void {
      allBattles.length = 0;
      button.textContent = "War Stats";
      list.innerHTML = `<div class="war-empty">No battles yet</div>`;
      summary.innerHTML = "";
    },
  };
}
