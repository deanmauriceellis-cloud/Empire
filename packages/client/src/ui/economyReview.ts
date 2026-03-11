// Empire Reborn — Economy Review Screen
// Phase 5: Modal dialog shown before turn execution with tabbed economy overview.

import {
  Owner,
  UNIT_ATTRIBUTES,
  BUILDING_ATTRIBUTES,
  RESOURCE_NAMES,
  TECH_NAMES,
  CITY_INCOME,
  DEPOSIT_INCOME,
  DEPOSIT_RESOURCE,
  UnitType,
  locCol,
  locRow,
  getBuildingTechOutput,
} from "@empire/shared";
import type { GameState, TurnEvent } from "@empire/shared";

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = "events" | "resources" | "cities" | "tech" | "construction" | "buildings";

export interface EconomyReview {
  readonly element: HTMLDivElement;
  /** Show the review screen. Returns a promise that resolves when user confirms. */
  open(state: GameState, owner: Owner, events: TurnEvent[]): Promise<void>;
  /** Close without confirming (e.g. if game ends). */
  forceClose(): void;
  readonly isOpen: boolean;
}

// ─── Resource colors ─────────────────────────────────────────────────────────

const RES_COLORS = ["#c08040", "#8888aa", "#60b050"]; // ore, oil, textile
const TECH_COLORS = ["#66aaff", "#44cc88", "#ffaa44", "#ff6644"];

// ─── Create Economy Review ──────────────────────────────────────────────────

export function createEconomyReview(): EconomyReview {
  let resolvePromise: (() => void) | null = null;
  let isOpen = false;
  let activeTab: Tab = "resources";

  // Root element
  const element = document.createElement("div");
  element.id = "economy-review";

  // Header
  const header = document.createElement("div");
  header.className = "er-header";
  header.innerHTML = `<h2>Economy Review</h2>`;

  const turnLabel = document.createElement("span");
  turnLabel.className = "er-turn-label";
  header.appendChild(turnLabel);

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => confirm());
  header.appendChild(closeBtn);

  // Tab bar
  const tabBar = document.createElement("div");
  tabBar.className = "er-tabs";

  const tabs: { key: Tab; label: string }[] = [
    { key: "events", label: "Events" },
    { key: "resources", label: "Resources" },
    { key: "cities", label: "Cities" },
    { key: "tech", label: "Tech" },
    { key: "construction", label: "Construction" },
    { key: "buildings", label: "Buildings" },
  ];

  const tabButtons = new Map<Tab, HTMLButtonElement>();
  for (const t of tabs) {
    const btn = document.createElement("button");
    btn.className = "er-tab-btn";
    btn.textContent = t.label;
    btn.addEventListener("click", () => switchTab(t.key));
    tabBar.appendChild(btn);
    tabButtons.set(t.key, btn);
  }

  // Content area
  const content = document.createElement("div");
  content.className = "er-content";

  // Confirm button
  const confirmBtn = document.createElement("button");
  confirmBtn.className = "er-confirm-btn";
  confirmBtn.innerHTML = `Confirm &amp; Execute Turn →`;
  confirmBtn.addEventListener("click", () => confirm());

  // Assemble
  element.appendChild(header);
  element.appendChild(tabBar);
  element.appendChild(content);
  element.appendChild(confirmBtn);

  // State refs (set on open)
  let currentState: GameState | null = null;
  let currentOwner: Owner = Owner.Player1;
  let currentEvents: TurnEvent[] = [];

  function switchTab(tab: Tab): void {
    activeTab = tab;
    for (const [key, btn] of tabButtons) {
      btn.classList.toggle("active", key === tab);
    }
    renderContent();
  }

  function confirm(): void {
    isOpen = false;
    element.classList.remove("visible");
    if (resolvePromise) {
      resolvePromise();
      resolvePromise = null;
    }
  }

  function renderContent(): void {
    if (!currentState) return;
    const s = currentState;
    const o = currentOwner;

    switch (activeTab) {
      case "events": renderEvents(s, o); break;
      case "resources": renderResources(s, o); break;
      case "cities": renderCities(s, o); break;
      case "tech": renderTech(s, o); break;
      case "construction": renderConstruction(s, o); break;
      case "buildings": renderBuildings(s, o); break;
    }
  }

  // ─── Events Tab ─────────────────────────────────────────────────────────

  function renderEvents(s: GameState, o: Owner): void {
    const events = currentEvents;
    if (events.length === 0) {
      content.innerHTML = `<div class="er-empty">No events this turn</div>`;
      return;
    }

    const rows: string[] = [];
    for (const e of events) {
      const col = locCol(e.loc);
      const row = locRow(e.loc);
      let icon = "";
      let cls = "";
      let desc = e.description ?? e.type;

      switch (e.type) {
        case "combat": icon = "⚔"; cls = "ev-combat"; break;
        case "capture": icon = "🏴"; cls = "ev-capture"; break;
        case "production": icon = "🏭"; cls = "ev-production"; break;
        case "death": icon = "💀"; cls = "ev-death"; break;
        default: icon = "•"; cls = "ev-other"; break;
      }

      rows.push(
        `<div class="er-event-row ${cls}">` +
        `<span class="er-ev-icon">${icon}</span>` +
        `<span class="er-ev-desc">${desc}</span>` +
        `<span class="er-ev-loc">(${col},${row})</span>` +
        `</div>`
      );
    }
    content.innerHTML = rows.join("");
  }

  // ─── Resources Tab ──────────────────────────────────────────────────────

  function renderResources(s: GameState, o: Owner): void {
    const res = s.resources[o];

    // Calculate income breakdown
    const playerCities = s.cities.filter(c => c.owner === o);
    const cityCount = playerCities.length;
    const cityIncome = [
      cityCount * CITY_INCOME[0],
      cityCount * CITY_INCOME[1],
      cityCount * CITY_INCOME[2],
    ];

    const depositIncome = [0, 0, 0];
    for (const dep of s.deposits) {
      if (dep.owner === o && dep.buildingComplete) {
        const ri = DEPOSIT_RESOURCE[dep.type];
        depositIncome[ri] += DEPOSIT_INCOME;
      }
    }

    const totalIncome = [
      cityIncome[0] + depositIncome[0],
      cityIncome[1] + depositIncome[1],
      cityIncome[2] + depositIncome[2],
    ];

    const html = `
      <div class="er-res-grid">
        <div class="er-res-header">
          <span></span>
          <span>Stockpile</span>
          <span>City Income</span>
          <span>Deposits</span>
          <span>Total/turn</span>
        </div>
        ${[0, 1, 2].map(i => `
          <div class="er-res-row">
            <span class="er-res-name" style="color:${RES_COLORS[i]}">${RESOURCE_NAMES[i]}</span>
            <span class="er-res-val">${res[i]}</span>
            <span class="er-res-val" style="color:#8a8">+${cityIncome[i]}</span>
            <span class="er-res-val" style="color:#8a8">+${depositIncome[i]}</span>
            <span class="er-res-val er-res-total" style="color:#8f8">+${totalIncome[i]}</span>
          </div>
        `).join("")}
      </div>
      <div class="er-res-note">
        ${cityCount} cities × [${CITY_INCOME.join(",")}] passive income/turn
        ${depositIncome.some(v => v > 0) ? `<br>${s.deposits.filter(d => d.owner === o && d.buildingComplete).length} active deposits × ${DEPOSIT_INCOME}/turn` : ""}
      </div>
    `;
    content.innerHTML = html;
  }

  // ─── Cities Tab ─────────────────────────────────────────────────────────

  function renderCities(s: GameState, o: Owner): void {
    const playerCities = s.cities.filter(c => c.owner === o);
    if (playerCities.length === 0) {
      content.innerHTML = `<div class="er-empty">No cities</div>`;
      return;
    }

    const rows: string[] = [];
    for (const city of playerCities) {
      const attrs = UNIT_ATTRIBUTES[city.production];
      const pct = city.work < 0
        ? 0
        : Math.min(100, Math.floor((city.work / attrs.buildTime) * 100));
      const turnsLeft = city.work < 0
        ? Math.abs(city.work) + attrs.buildTime
        : Math.max(1, attrs.buildTime - city.work);
      const stalled = city.work === 0;
      const retooling = city.work < 0;
      const col = locCol(city.loc);
      const row = locRow(city.loc);

      // Upgrade slot info
      const upgradeCount = city.upgradeIds.length;
      const upgrades = city.upgradeIds.map(bid => {
        const b = s.buildings.find(bld => bld.id === bid);
        return b ? `${BUILDING_ATTRIBUTES[b.type].name} Lv${b.level}` : "?";
      });

      let statusHtml: string;
      if (retooling) {
        statusHtml = `<span style="color:var(--color-orange)">Retooling → ${attrs.name}</span>`;
      } else if (stalled) {
        statusHtml = `<span style="color:var(--color-red)">Stalled — waiting for resources</span>`;
      } else {
        statusHtml = `<span>${attrs.name} — ${pct}% (${turnsLeft}t)</span>`;
      }

      rows.push(
        `<div class="er-city-row">` +
        `<div class="er-city-header">` +
        `<span class="er-city-name">City #${city.id}</span>` +
        `<span class="er-city-loc">(${col},${row})</span>` +
        `</div>` +
        `<div class="er-city-prod">${statusHtml}</div>` +
        (pct > 0 && !retooling ? `<div class="er-prog-bar"><div class="er-prog-fill" style="width:${pct}%"></div></div>` : "") +
        (upgradeCount > 0 ? `<div class="er-city-upgrades">Upgrades: ${upgrades.join(", ")}</div>` : "") +
        `</div>`
      );
    }
    content.innerHTML = rows.join("");
  }

  // ─── Tech Tab ───────────────────────────────────────────────────────────

  function renderTech(s: GameState, o: Owner): void {
    const tech = s.techResearch[o];

    // Calculate tech income per turn from buildings
    const techIncome = [0, 0, 0, 0];
    for (const b of s.buildings) {
      if (b.owner === o && b.complete) {
        const attrs = BUILDING_ATTRIBUTES[b.type];
        if (attrs.techOutput !== null) {
          techIncome[attrs.techOutput] += getBuildingTechOutput(b.type, b.level);
        }
      }
    }

    const rows: string[] = [];
    for (let i = 0; i < 4; i++) {
      const income = techIncome[i];
      rows.push(
        `<div class="er-tech-row">` +
        `<span class="er-tech-name" style="color:${TECH_COLORS[i]}">${TECH_NAMES[i]}</span>` +
        `<span class="er-tech-points">${tech[i]} pts</span>` +
        `<span class="er-tech-income">${income > 0 ? `+${income}/turn` : "—"}</span>` +
        `</div>`
      );
    }

    // List buildings contributing
    const techBuildings = s.buildings.filter(b =>
      b.owner === o && b.complete && BUILDING_ATTRIBUTES[b.type].techOutput !== null
    );

    let buildingList = "";
    if (techBuildings.length > 0) {
      buildingList = `<div class="er-tech-sources"><div class="er-section-label">Research Sources</div>`;
      for (const b of techBuildings) {
        const attrs = BUILDING_ATTRIBUTES[b.type];
        const output = getBuildingTechOutput(b.type, b.level);
        const col = locCol(b.loc);
        const row = locRow(b.loc);
        buildingList += `<div class="er-tech-source-row">` +
          `<span>${attrs.name} Lv${b.level}</span>` +
          `<span style="color:${TECH_COLORS[attrs.techOutput!]}">+${output} ${TECH_NAMES[attrs.techOutput!]}/turn</span>` +
          `<span class="er-loc">(${col},${row})</span>` +
          `</div>`;
      }
      buildingList += `</div>`;
    }

    content.innerHTML = `<div class="er-tech-grid">${rows.join("")}</div>${buildingList}`;
  }

  // ─── Construction Tab ───────────────────────────────────────────────────

  function renderConstruction(s: GameState, o: Owner): void {
    // Find construction units and in-progress buildings
    const constructionUnits = s.units.filter(u => u.owner === o && u.type === UnitType.Construction);
    const inProgressBuildings = s.buildings.filter(b => b.owner === o && !b.complete);

    if (constructionUnits.length === 0 && inProgressBuildings.length === 0) {
      content.innerHTML = `<div class="er-empty">No construction units or active builds</div>`;
      return;
    }

    let html = "";

    // In-progress buildings
    if (inProgressBuildings.length > 0) {
      html += `<div class="er-section-label">Active Construction</div>`;
      for (const b of inProgressBuildings) {
        const attrs = BUILDING_ATTRIBUTES[b.type];
        const pct = Math.min(100, Math.floor((b.work / b.buildTime) * 100));
        const turnsLeft = Math.max(1, b.buildTime - b.work);
        const col = locCol(b.loc);
        const row = locRow(b.loc);
        html += `<div class="er-build-row">` +
          `<span class="er-build-name">${attrs.name} Lv${b.level}</span>` +
          `<span class="er-build-status">${pct}% (${turnsLeft}t left)</span>` +
          `<span class="er-loc">(${col},${row})</span>` +
          `</div>` +
          `<div class="er-prog-bar"><div class="er-prog-fill" style="width:${pct}%"></div></div>`;
      }
    }

    // Idle construction units
    const busyUnitIds = new Set(inProgressBuildings.map(b => b.constructorId).filter(id => id !== null));
    const idleUnits = constructionUnits.filter(u => !busyUnitIds.has(u.id));

    if (idleUnits.length > 0) {
      html += `<div class="er-section-label" style="margin-top:8px">Idle Construction Units</div>`;
      for (const u of idleUnits) {
        const col = locCol(u.loc);
        const row = locRow(u.loc);
        html += `<div class="er-build-row">` +
          `<span class="er-build-name">Constructor #${u.id}</span>` +
          `<span class="er-build-status" style="color:var(--color-orange)">idle</span>` +
          `<span class="er-loc">(${col},${row})</span>` +
          `</div>`;
      }
    }

    // Busy construction units
    const busyUnits = constructionUnits.filter(u => busyUnitIds.has(u.id));
    if (busyUnits.length > 0) {
      html += `<div class="er-section-label" style="margin-top:8px">Assigned Constructors</div>`;
      for (const u of busyUnits) {
        const building = inProgressBuildings.find(b => b.constructorId === u.id);
        const bName = building ? BUILDING_ATTRIBUTES[building.type].name : "?";
        const col = locCol(u.loc);
        const row = locRow(u.loc);
        html += `<div class="er-build-row">` +
          `<span class="er-build-name">Constructor #${u.id}</span>` +
          `<span class="er-build-status" style="color:var(--color-green)">building ${bName}</span>` +
          `<span class="er-loc">(${col},${row})</span>` +
          `</div>`;
      }
    }

    content.innerHTML = html;
  }

  // ─── Buildings Tab ──────────────────────────────────────────────────────

  function renderBuildings(s: GameState, o: Owner): void {
    const playerBuildings = s.buildings.filter(b => b.owner === o && b.complete);
    if (playerBuildings.length === 0) {
      content.innerHTML = `<div class="er-empty">No completed buildings</div>`;
      return;
    }

    const rows: string[] = [];
    for (const b of playerBuildings) {
      const attrs = BUILDING_ATTRIBUTES[b.type];
      const col = locCol(b.loc);
      const row = locRow(b.loc);

      let output = "";
      if (attrs.techOutput !== null) {
        const pts = getBuildingTechOutput(b.type, b.level);
        output = `<span style="color:${TECH_COLORS[attrs.techOutput]}">+${pts} ${TECH_NAMES[attrs.techOutput]}/turn</span>`;
      } else if (attrs.isDepositBuilding) {
        output = `<span style="color:${RES_COLORS[b.type]}">+${DEPOSIT_INCOME} ${RESOURCE_NAMES[b.type]}/turn</span>`;
      }

      rows.push(
        `<div class="er-bldg-row">` +
        `<span class="er-bldg-name">${attrs.name}</span>` +
        `<span class="er-bldg-level">Lv${b.level}</span>` +
        `<span class="er-bldg-output">${output}</span>` +
        `<span class="er-loc">(${col},${row})</span>` +
        `</div>`
      );
    }
    content.innerHTML = rows.join("");
  }

  // ─── Keyboard handler ─────────────────────────────────────────────────────

  function onKeyDown(e: KeyboardEvent): void {
    if (!isOpen) return;
    if (e.key === "Escape" || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      confirm();
    }
    // Tab switching with number keys
    const num = parseInt(e.key);
    if (num >= 1 && num <= 6) {
      e.preventDefault();
      e.stopPropagation();
      switchTab(tabs[num - 1].key);
    }
  }

  document.addEventListener("keydown", onKeyDown, true);

  return {
    element,

    get isOpen(): boolean {
      return isOpen;
    },

    open(state: GameState, owner: Owner, events: TurnEvent[]): Promise<void> {
      currentState = state;
      currentOwner = owner;
      currentEvents = events;
      isOpen = true;

      turnLabel.textContent = `Turn ${state.turn}`;
      element.classList.add("visible");

      // Default to events tab if there are events, otherwise resources
      switchTab(events.length > 0 ? "events" : "resources");

      return new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });
    },

    forceClose(): void {
      if (isOpen) {
        isOpen = false;
        element.classList.remove("visible");
        if (resolvePromise) {
          resolvePromise();
          resolvePromise = null;
        }
      }
    },
  };
}
