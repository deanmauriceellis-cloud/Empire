// Empire Reborn — Diagnostic Logging
// Generates comprehensive game state snapshots for AI debugging.

import {
  MAP_WIDTH, MAP_HEIGHT, MAP_SIZE,
  Owner, UnitType, UnitBehavior, TerrainType,
  UNIT_TYPE_CHARS,
  RESOURCE_NAMES,
  TECH_NAMES,
  CITY_INCOME,
  DEPOSIT_INCOME,
  DEPOSIT_RESOURCE,
  DEPOSIT_NAMES,
} from "./constants.js";
import { UNIT_ATTRIBUTES } from "./units.js";
import { BUILDING_ATTRIBUTES, getBuildingTechOutput } from "./buildings.js";
import { locRow, locCol } from "./utils.js";
import type { GameState, TurnEvent, Loc, ViewMapCell } from "./types.js";

const BEHAVIOR_NAMES: Record<number, string> = {
  [-1]: "none",
  [-2]: "random",
  [-3]: "sentry",
  [-4]: "fill",
  [-5]: "land",
  [-6]: "explore",
  [-7]: "armyLoad",
  [-8]: "armyAttack",
  [-9]: "transportLoad",
  [-10]: "repair",
  [-11]: "waitTransport",
  [-12]: "moveN",
  [-13]: "moveNE",
  [-14]: "moveE",
  [-15]: "moveSE",
  [-16]: "moveS",
  [-17]: "moveSW",
  [-18]: "moveW",
  [-19]: "moveNW",
  [-20]: "goto",
  [-21]: "aggressive",
  [-22]: "cautious",
};

function behaviorName(b: UnitBehavior): string {
  return BEHAVIOR_NAMES[b] ?? `behavior(${b})`;
}

function locStr(loc: Loc): string {
  return `(${locCol(loc)},${locRow(loc)})`;
}

function ownerStr(o: Owner): string {
  return o === Owner.Player1 ? "P1" : o === Owner.Player2 ? "P2" : "neutral";
}

/**
 * Generate a compact text map showing terrain, cities, and units.
 * Legend: .=water +=land O=own_city X=enemy_city *=unowned_city
 *         A/F/P/D/S/T/C/B/Z = unit types (uppercase=P1, lowercase=P2)
 * Map is compressed: 1 char per tile, newline per row.
 */
function renderMiniMap(state: GameState): string {
  const lines: string[] = [];
  for (let row = 0; row < MAP_HEIGHT; row++) {
    let line = "";
    for (let col = 0; col < MAP_WIDTH; col++) {
      const loc = row * MAP_WIDTH + col;
      const cell = state.map[loc];

      if (!cell.onBoard) {
        line += " ";
        continue;
      }

      // Check for units at this location (show highest priority)
      const unit = state.units.find(u => u.loc === loc && u.shipId === null);
      if (unit) {
        const ch = UNIT_TYPE_CHARS[unit.type];
        line += unit.owner === Owner.Player1 ? ch : ch.toLowerCase();
        continue;
      }

      // Check for cities
      if (cell.cityId !== null) {
        const city = state.cities[cell.cityId];
        if (city.owner === Owner.Player1) line += "O";
        else if (city.owner === Owner.Player2) line += "X";
        else line += "*";
        continue;
      }

      // Terrain
      line += cell.terrain === TerrainType.Sea ? "." : "+";
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/**
 * Generate a full diagnostic snapshot of the game state.
 * Designed to be human-readable and AI-parseable.
 */
export function generateDiagnostic(
  state: GameState,
  events: TurnEvent[],
  aiLogs?: string[],
): string {
  const lines: string[] = [];
  const hr = "═".repeat(80);

  lines.push(hr);
  lines.push(`TURN ${state.turn} DIAGNOSTIC — ${new Date().toISOString()}`);
  lines.push(`Map: ${MAP_WIDTH}x${MAP_HEIGHT} (seed=${state.config.seed})`);
  lines.push(hr);

  // ── Player Summary ──
  for (const owner of [Owner.Player1, Owner.Player2]) {
    const tag = ownerStr(owner);
    const cities = state.cities.filter(c => c.owner === owner);
    const units = state.units.filter(u => u.owner === owner);
    const unownedCities = state.cities.filter(c => c.owner === Owner.Unowned).length;

    lines.push(`\n── ${tag}: ${cities.length} cities, ${units.length} units ──`);

    // Unit type counts
    const typeCounts: Record<string, number> = {};
    for (const u of units) {
      const name = UNIT_ATTRIBUTES[u.type].name;
      typeCounts[name] = (typeCounts[name] ?? 0) + 1;
    }
    lines.push(`  Units: ${Object.entries(typeCounts).map(([k, v]) => `${k}=${v}`).join(" ")}`);

    // Behavior breakdown
    const behavCounts: Record<string, number> = {};
    for (const u of units) {
      const name = behaviorName(u.func);
      behavCounts[name] = (behavCounts[name] ?? 0) + 1;
    }
    lines.push(`  Behaviors: ${Object.entries(behavCounts).map(([k, v]) => `${k}=${v}`).join(" ")}`);

    // Cities with production
    lines.push(`  Cities:`);
    for (const city of cities) {
      const prodName = UNIT_ATTRIBUTES[city.production].name;
      const bt = UNIT_ATTRIBUTES[city.production].buildTime;
      const pct = Math.round((city.work / bt) * 100);
      lines.push(`    #${city.id} ${locStr(city.loc)} building ${prodName} (${city.work}/${bt} = ${pct}%)`);
    }

    // Transports detail
    const transports = units.filter(u => u.type === UnitType.Transport);
    if (transports.length > 0) {
      lines.push(`  Transports:`);
      for (const t of transports) {
        const cap = UNIT_ATTRIBUTES[t.type].capacity;
        lines.push(`    #${t.id} ${locStr(t.loc)} cargo=${t.cargoIds.length}/${cap} behavior=${behaviorName(t.func)} moved=${t.moved}`);
      }
    }

    // Fighters detail
    const fighters = units.filter(u => u.type === UnitType.Fighter);
    if (fighters.length > 0) {
      lines.push(`  Fighters:`);
      for (const f of fighters) {
        lines.push(`    #${f.id} ${locStr(f.loc)} range=${f.range}/${UNIT_ATTRIBUTES[f.type].range} behavior=${behaviorName(f.func)}`);
      }
    }

    // Armies near enemy/unowned cities (key diagnostic for "armies not attacking")
    const armies = units.filter(u => u.type === UnitType.Army && u.shipId === null);
    const enemyCities = state.cities.filter(c => c.owner !== owner && c.owner !== Owner.Unowned);
    const capturable = state.cities.filter(c => c.owner !== owner);

    // Find armies adjacent to capturable cities
    const armiesNearCities: string[] = [];
    for (const army of armies) {
      const adjLocs = getAdjLocs(army.loc);
      for (const adj of adjLocs) {
        const cell = state.map[adj];
        if (cell.cityId !== null) {
          const city = state.cities[cell.cityId];
          if (city.owner !== owner) {
            const cityOwner = ownerStr(city.owner);
            armiesNearCities.push(
              `    army #${army.id} ${locStr(army.loc)} behavior=${behaviorName(army.func)} ← ADJACENT to ${cityOwner} city #${city.id} ${locStr(city.loc)}`
            );
          }
        }
      }
    }
    if (armiesNearCities.length > 0) {
      lines.push(`  ⚠ Armies adjacent to capturable cities:`);
      lines.push(...armiesNearCities);
    }

    if (owner === Owner.Player1) {
      lines.push(`  Unowned cities remaining: ${unownedCities}`);
    }
  }

  // ── Economy ──
  lines.push(`\n── Economy ──`);
  for (const owner of [Owner.Player1, Owner.Player2]) {
    const tag = ownerStr(owner);
    const res = state.resources[owner];
    const tech = state.techResearch[owner];
    const playerCities = state.cities.filter(c => c.owner === owner);
    const cityCount = playerCities.length;

    // Resource stockpile and income
    const cityIncome = [cityCount * CITY_INCOME[0], cityCount * CITY_INCOME[1], cityCount * CITY_INCOME[2]];
    const depIncome = [0, 0, 0];
    for (const dep of state.deposits) {
      if (dep.owner === owner && dep.buildingComplete) {
        depIncome[DEPOSIT_RESOURCE[dep.type]] += DEPOSIT_INCOME;
      }
    }
    const totalIncome = [cityIncome[0] + depIncome[0], cityIncome[1] + depIncome[1], cityIncome[2] + depIncome[2]];

    lines.push(`  ${tag} Resources: ${RESOURCE_NAMES.map((n, i) => `${n}=${res[i]}(+${totalIncome[i]}/t)`).join(" ")}`);
    lines.push(`  ${tag} Tech: ${TECH_NAMES.map((n, i) => `${n}=${tech[i]}`).join(" ")}`);

    // Stalled/retooling cities
    const stalledCities = playerCities.filter(c => c.work === 0);
    const retoolingCities = playerCities.filter(c => c.work < 0);
    if (stalledCities.length > 0) {
      lines.push(`  ${tag} ⚠ ${stalledCities.length} stalled cities: ${stalledCities.map(c => `#${c.id}`).join(", ")}`);
    }
    if (retoolingCities.length > 0) {
      lines.push(`  ${tag} ⚠ ${retoolingCities.length} retooling cities: ${retoolingCities.map(c => `#${c.id}(${Math.abs(c.work)}t left)`).join(", ")}`);
    }
  }

  // ── Deposits ──
  const ownedDeposits = state.deposits.filter(d => d.owner !== Owner.Unowned);
  const unbuiltDeposits = state.deposits.filter(d => d.owner === Owner.Unowned);
  if (state.deposits.length > 0) {
    lines.push(`\n── Deposits (${state.deposits.length} total, ${ownedDeposits.length} owned, ${unbuiltDeposits.length} unclaimed) ──`);
    for (const dep of state.deposits) {
      const status = dep.buildingComplete ? "active" : dep.owner !== Owner.Unowned ? "building" : "unclaimed";
      lines.push(`  #${dep.id} ${DEPOSIT_NAMES[dep.type]} ${locStr(dep.loc)} owner=${ownerStr(dep.owner)} status=${status}`);
    }
  }

  // ── Buildings ──
  const allBuildings = state.buildings;
  if (allBuildings.length > 0) {
    const complete = allBuildings.filter(b => b.complete);
    const inProgress = allBuildings.filter(b => !b.complete);
    lines.push(`\n── Buildings (${allBuildings.length} total, ${complete.length} complete, ${inProgress.length} in-progress) ──`);

    if (inProgress.length > 0) {
      lines.push(`  In-progress:`);
      for (const b of inProgress) {
        const attrs = BUILDING_ATTRIBUTES[b.type];
        const pct = Math.round((b.work / b.buildTime) * 100);
        lines.push(`    #${b.id} ${attrs.name} Lv${b.level} ${locStr(b.loc)} owner=${ownerStr(b.owner)} ${b.work}/${b.buildTime}(${pct}%) constructor=#${b.constructorId}`);
      }
    }

    if (complete.length > 0) {
      lines.push(`  Complete:`);
      for (const b of complete) {
        const attrs = BUILDING_ATTRIBUTES[b.type];
        let output = "";
        if (attrs.techOutput !== null) {
          output = ` → +${getBuildingTechOutput(b.type, b.level)} ${TECH_NAMES[attrs.techOutput]}/turn`;
        } else if (attrs.isDepositBuilding) {
          output = ` → +${DEPOSIT_INCOME} ${RESOURCE_NAMES[b.type]}/turn`;
        }
        lines.push(`    #${b.id} ${attrs.name} Lv${b.level} ${locStr(b.loc)} owner=${ownerStr(b.owner)}${output}`);
      }
    }

    // City upgrade summary
    const citiesWithUpgrades = state.cities.filter(c => c.upgradeIds.length > 0);
    if (citiesWithUpgrades.length > 0) {
      lines.push(`  City upgrades:`);
      for (const city of citiesWithUpgrades) {
        const upgrades = city.upgradeIds.map(bid => {
          const b = state.buildings.find(bld => bld.id === bid);
          return b ? `${BUILDING_ATTRIBUTES[b.type].name}Lv${b.level}${b.complete ? "" : "*"}` : "?";
        });
        lines.push(`    City #${city.id} ${locStr(city.loc)} [${city.upgradeIds.length}/4]: ${upgrades.join(", ")}`);
      }
    }
  }

  // ── Events ──
  if (events.length > 0) {
    lines.push(`\n── Events (${events.length}) ──`);
    for (const e of events) {
      lines.push(`  [${e.type.toUpperCase()}] ${locStr(e.loc)} ${e.description}${e.data ? " " + JSON.stringify(e.data) : ""}`);
    }
  }

  // ── AI Decision Log ──
  if (aiLogs && aiLogs.length > 0) {
    lines.push(`\n── AI Decisions (${aiLogs.length} lines) ──`);
    for (const log of aiLogs) {
      lines.push("  " + log);
    }
  }

  // ── Map ──
  lines.push(`\n── Map ──`);
  lines.push(renderMiniMap(state));

  lines.push("\n" + hr);

  return lines.join("\n");
}

/** Simple adjacency helper (avoids importing from utils to keep this self-contained) */
function getAdjLocs(loc: Loc): Loc[] {
  const row = locRow(loc);
  const col = locCol(loc);
  const result: Loc[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < MAP_HEIGHT && c >= 0 && c < MAP_WIDTH) {
        result.push(r * MAP_WIDTH + c);
      }
    }
  }
  return result;
}
