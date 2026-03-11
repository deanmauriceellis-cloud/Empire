// Empire Reborn — AI Production Strategy

import { Owner, UnitType, UnitBehavior, NUM_UNIT_TYPES } from "./constants.js";
import { UNIT_ATTRIBUTES, canAffordUnit } from "./units.js";
import type { Loc, ViewMapCell, CityState, UnitState, GameState, PlayerAction } from "./types.js";
import { getAdjacentLocs } from "./utils.js";
import { objCapacity } from "./game.js";
import { mapContinent } from "./continent.js";
import { VM_WATER, VM_ENEMY_CITY, VM_UNOWNED_CITY, VM_UNEXPLORED } from "./viewmap-chars.js";
import { aiLog, getRatioTable, isCityCoastal, isCityOnLake } from "./ai-helpers.js";
import { canProduceUnit } from "./tech.js";
import { needsConstruction, canAffordProduction } from "./ai-economy.js";

// ─── Step 4.1: AI Production Strategy ──────────────────────────────────────────

/**
 * Count how many AI cities are producing each unit type.
 */
export function countProduction(state: GameState, aiOwner: Owner): number[] {
  const counts = new Array(NUM_UNIT_TYPES).fill(0);
  for (const city of state.cities) {
    if (city.owner === aiOwner) {
      counts[city.production]++;
    }
  }
  return counts;
}

/**
 * Check if a type is overproduced relative to the ratio table.
 * Returns true if we should switch away from this type.
 */
export function overproduced(prodCounts: number[], ratio: number[], unitType: UnitType): boolean {
  if (ratio[unitType] === 0) return true; // never want this type
  // Check if this type has more than its fair share
  const totalProd = prodCounts.reduce((a, b) => a + b, 0);
  if (totalProd === 0) return false;
  const actualRatio = prodCounts[unitType] / totalProd;
  const targetRatio = ratio[unitType] / ratio.reduce((a, b) => a + b, 0);
  return actualRatio > targetRatio * 1.5; // 50% overshoot tolerance
}

/**
 * Find the unit type most needed based on ratio table.
 * Returns the UnitType with the greatest deficit.
 */
export function needMore(prodCounts: number[], ratio: number[], onLake: boolean, state?: GameState, aiOwner?: Owner): UnitType {
  let bestType = UnitType.Army;
  let bestDeficit = -Infinity;
  const totalRatio = ratio.reduce((a, b) => a + b, 0);
  const totalProd = Math.max(prodCounts.reduce((a, b) => a + b, 0), 1);

  for (let i = 0; i < NUM_UNIT_TYPES; i++) {
    if (ratio[i] === 0) continue;
    // Inland/lake cities can't build ships — only armies and fighters
    if (onLake && i !== UnitType.Army && i !== UnitType.Fighter) continue;
    // Never build carriers, satellites via ratio table
    if (i === UnitType.Carrier || i === UnitType.Satellite) continue;
    // Construction is handled separately (not via ratio table)
    if (i === UnitType.Construction) continue;
    // Engineer boats are not yet AI-managed (low value)
    if (i === UnitType.EngineerBoat) continue;
    // Tech-gated units: skip if player doesn't have required tech
    if (state && aiOwner !== undefined && !canProduceUnit(state, aiOwner, i as UnitType)) continue;

    const targetFraction = ratio[i] / totalRatio;
    const actualFraction = prodCounts[i] / totalProd;
    const deficit = targetFraction - actualFraction;

    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      bestType = i as UnitType;
    }
  }

  return bestType;
}

/**
 * Decide what a city should produce.
 * Implements the original's hierarchical production strategy:
 * 1. Defend continents with armies
 * 2. Ensure transport production
 * 3. Follow ratio tables
 */
export function decideProduction(
  state: GameState,
  city: CityState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
  prodCounts: number[],
): UnitType | null {
  const currentAttrs = UNIT_ATTRIBUTES[city.production];
  const coastal = isCityCoastal(viewMap, city.loc);
  const onLake = coastal && isCityOnLake(viewMap, city.loc, state);
  // Can this city build ships? Only coastal, non-lake cities
  const canBuildShips = coastal && !onLake;

  // Map the city's continent and count threats directly from viewMap
  // (scanContinent hardcodes O=P1/X=P2, which is wrong for P2's viewMap
  //  where O=own and X=enemy regardless of player)
  const continent = mapContinent(viewMap, city.loc, VM_WATER);
  let enemyCities = 0;
  let enemyArmies = 0;
  let aiArmies = 0;
  let unownedCities = 0;
  let unexplored = 0;
  for (const cLoc of continent) {
    const c = viewMap[cLoc].contents;
    if (c === VM_ENEMY_CITY) enemyCities++;
    else if (c === VM_UNOWNED_CITY) unownedCities++;
    else if (c === VM_UNEXPLORED) unexplored++;
    else if (c === "a") enemyArmies++;   // lowercase = enemy army on viewMap
    else if (c === "A") aiArmies++;      // uppercase = own army on viewMap
  }
  const hasInterest = unexplored > 0 || enemyCities > 0 || unownedCities > 0;

  // How far along is current production? (0.0 to 1.0, can be negative during penalty)
  const progress = city.work / currentAttrs.buildTime;

  // Starvation check: if current production is unaffordable and hasn't started yet,
  // switch to something the AI can actually afford (Army is cheapest at [5,0,5]).
  // Only apply when work=0 (production hasn't consumed resources yet).
  if (city.work === 0 && !canAffordUnit(state.resources[aiOwner], city.production)) {
    // Find cheapest affordable unit type
    const affordable = [UnitType.Army, UnitType.Fighter, UnitType.Construction]
      .filter(t => canAffordUnit(state.resources[aiOwner], t));
    if (affordable.length > 0 && city.production !== affordable[0]) {
      aiLog(`City #${city.id}: can't afford ${currentAttrs.name}, switching to ${UNIT_ATTRIBUTES[affordable[0]].name} (starvation)`);
      return affordable[0];
    }
  }

  // Guard: never switch away from Transport if no transport exists yet.
  // Once a transport exists, allow switching back to armies (especially with few cities).
  if (city.production === UnitType.Transport && prodCounts[UnitType.Transport] <= 1) {
    const existingTransports = state.units.filter(
      u => u.owner === aiOwner && u.type === UnitType.Transport,
    ).length;
    if (existingTransports === 0) {
      // No transport exists — must keep building
      aiLog(`City #${city.id}: keeping Transport (no transport exists yet)`);
      return null;
    }
    // Transport exists — allow switching (especially critical for 1-city islands
    // where the city needs to produce armies to feed the transport)
    aiLog(`City #${city.id}: allowing switch from Transport (${existingTransports} transports exist)`);
  }

  // Guard: don't switch away from Transport via ratio rebalance if there's still army surplus.
  // This prevents oscillation where surplus→build transport→overproduced→stop→surplus→repeat.
  // BUT: respect the transport production cap to prevent overbuilding transports.
  if (city.production === UnitType.Transport && canBuildShips) {
    const ownCityCount = state.cities.filter(c => c.owner === aiOwner).length;
    const maxTransportCities = Math.max(1, Math.ceil(ownCityCount / 4));
    if (prodCounts[UnitType.Transport] > maxTransportCities) {
      // Over the cap — force switch away from transport immediately
      const capRatio = getRatioTable(ownCityCount);
      const capNeeded = needMore(prodCounts, capRatio, !canBuildShips, state, aiOwner);
      if (capNeeded !== UnitType.Transport) {
        aiLog(`City #${city.id}: over transport cap (${prodCounts[UnitType.Transport]}/${maxTransportCities}), forcing switch to ${UNIT_ATTRIBUTES[capNeeded].name}`);
        return capNeeded;
      }
    } else {
      const waitingArmies = state.units.filter(
        u => u.owner === aiOwner && u.type === UnitType.Army
          && u.func === UnitBehavior.WaitForTransport && u.shipId === null,
      ).length;
      const existingTransports = state.units.filter(
        u => u.owner === aiOwner && u.type === UnitType.Transport,
      ).length;
      const actualCapacity = existingTransports * 6;
      if (waitingArmies > actualCapacity) {
        aiLog(`City #${city.id}: keeping Transport (army surplus: ${waitingArmies} waiting, capacity=${actualCapacity})`);
        return null;
      }
    }
  }

  // Priority 1: Defend against enemy presence on continent
  let armiesNeeded = enemyCities - aiArmies;
  if (hasInterest) armiesNeeded++;
  if (enemyCities > 0) armiesNeeded++;

  if (armiesNeeded > 0 && city.production !== UnitType.Army) {
    // Only switch for defense if enemy armies are present or production barely started
    if (enemyArmies > 0 || progress < 0.25) {
      aiLog(`City #${city.id}: switch to Army (defense: ${armiesNeeded} needed, enemyArmies=${enemyArmies}, progress=${Math.round(progress * 100)}%)`);
      return UnitType.Army;
    }
    aiLog(`City #${city.id}: keeping ${currentAttrs.name} (${Math.round(progress * 100)}% done, no enemy armies on continent)`);
  }

  // Priority 2: Ensure transport production (first ship-capable city)
  // Never switch away from army production when we have only 1 city —
  // the AI needs to build armies to capture more cities first.
  const aiCityCount = state.cities.filter(c => c.owner === aiOwner).length;
  if (aiCityCount <= 1) {
    // Exception: if all our armies are WaitForTransport and city is coastal,
    // we're stuck on an island — build a transport to escape
    if (canBuildShips) {
      const aiArmyUnits = state.units.filter(u => u.owner === aiOwner && u.type === UnitType.Army);
      const existingTransports = state.units.filter(
        u => u.owner === aiOwner && u.type === UnitType.Transport,
      ).length;
      const allWaiting = aiArmyUnits.length > 0
        && aiArmyUnits.every(u => u.func === UnitBehavior.WaitForTransport);
      if (allWaiting && existingTransports === 0) {
        // No transport yet — need to build one to escape
        if (city.production !== UnitType.Transport) {
          aiLog(`City #${city.id}: switch to Transport (island escape — all ${aiArmyUnits.length} armies waiting)`);
          return UnitType.Transport;
        }
        aiLog(`City #${city.id}: keeping Transport (island escape, no transport yet)`);
        return null;
      }
      if (allWaiting && existingTransports > 0 && city.production !== UnitType.Army) {
        // Transport exists but all armies are waiting — need more armies to shuttle
        aiLog(`City #${city.id}: switch to Army (island escape — transport exists, need armies to shuttle)`);
        return UnitType.Army;
      }
    }
    // Check if we're stuck: all armies waiting for transport but can't build ships
    if (!canBuildShips) {
      const aiArmyUnits = state.units.filter(u => u.owner === aiOwner && u.type === UnitType.Army);
      const allWaiting = aiArmyUnits.length > 0
        && aiArmyUnits.every(u => u.func === UnitBehavior.WaitForTransport);
      if (allWaiting) {
        // Landlocked island — build a fighter to scout (armies are useless)
        if (city.production !== UnitType.Fighter) {
          aiLog(`City #${city.id}: switch to Fighter (landlocked island — ${aiArmyUnits.length} armies stuck)`);
          return UnitType.Fighter;
        }
        return null;
      }
    }

    // With 1 city: build armies, but allow a fighter once we have a transport
    // (fighters provide essential recon for finding cities to capture)
    {
      const existingFighters = state.units.filter(
        u => u.owner === aiOwner && u.type === UnitType.Fighter,
      ).length;
      const buildingFighter = city.production === UnitType.Fighter;
      const hasTransport = state.units.some(
        u => u.owner === aiOwner && u.type === UnitType.Transport,
      ) || prodCounts[UnitType.Transport] > 0;
      // Build 1 fighter once transport exists/building and no fighters yet
      if (hasTransport && existingFighters === 0 && !buildingFighter) {
        aiLog(`City #${city.id}: switch to Fighter (1 city, need recon)`);
        return UnitType.Fighter;
      }
      if (buildingFighter) {
        // Let it finish
        return null;
      }
      if (city.production !== UnitType.Army) {
        aiLog(`City #${city.id}: switch to Army (only 1 city)`);
        return UnitType.Army;
      }
      return null;
    }
  }

  // Priority 1b: Ensure early fighter production (2+ cities)
  // Fighters explore at 8 tiles/turn (vs army's 1) — essential for early recon.
  // Allow switching from Army if we have at least 1 other army producer.
  // Never switch from Transport (needed for mobility).
  // First fighter is highest priority (switch up to 60% done); second fighter at 40%.
  {
    const existingFighters = state.units.filter(
      u => u.owner === aiOwner && u.type === UnitType.Fighter,
    ).length;
    const buildingFighters = prodCounts[UnitType.Fighter];
    const totalFighters = existingFighters + buildingFighters;
    // Cap fighter production: max 2 fighters early, max 3 with 10+ cities.
    // Fighters explore fast (speed 8) but are fragile (1 HP) — more than a few is wasteful.
    const maxFighters = aiCityCount >= 10 ? 3 : 2;
    // First fighter: very aggressive — switch even if 60% done
    // Second fighter: moderate — switch if < 40% done (with 3+ cities)
    const wantFighter = totalFighters < maxFighters
      && (totalFighters === 0 || (totalFighters === 1 && aiCityCount >= 3));
    const maxProgress = totalFighters === 0 ? 0.6 : 0.4;
    if (wantFighter) {
      // Don't switch to fighter if no transports exist and none being built — transport is more urgent
      const noTransports = prodCounts[UnitType.Transport] === 0
        && state.units.filter(u => u.owner === aiOwner && u.type === UnitType.Transport).length === 0;
      const canSwitch = city.production !== UnitType.Transport
        && (city.production !== UnitType.Army || prodCounts[UnitType.Army] > 1)
        && !(canBuildShips && noTransports);
      if (canSwitch) {
        if (progress < maxProgress) {
          aiLog(`City #${city.id}: switch to Fighter (fighter #${totalFighters + 1}, ${aiCityCount} cities, armyProducers=${prodCounts[UnitType.Army]})`);
          return UnitType.Fighter;
        }
        aiLog(`City #${city.id}: want Fighter but ${Math.round(progress * 100)}% done with ${currentAttrs.name}, skipping`);
      } else {
        aiLog(`City #${city.id}: want Fighter but won't switch from ${currentAttrs.name} (essential/only producer)`);
      }
    }
  }

  // Only coastal non-lake cities can build transports/ships
  if (canBuildShips && prodCounts[UnitType.Transport] === 0) {
    if (!(armiesNeeded > 0 && prodCounts[UnitType.Army] <= 1)) {
      // If no transports exist yet, switch unconditionally (critical need)
      const existingTransportCount = state.units.filter(
        u => u.owner === aiOwner && u.type === UnitType.Transport,
      ).length;
      if (existingTransportCount === 0 || progress < 0.4) {
        aiLog(`City #${city.id}: switch to Transport (none being built)`);
        return UnitType.Transport;
      }
      aiLog(`City #${city.id}: want Transport but ${Math.round(progress * 100)}% done with ${currentAttrs.name}, finishing`);
    }
  }

  // Priority 2a: Build Construction units when economy needs it
  // Only after we have at least 4 cities and a transport established.
  // Construction units are fragile (0 str, 1 hp) so only build when safe.
  if (aiCityCount >= 4 && city.production !== UnitType.Construction) {
    if (needsConstruction(state, aiOwner) && canAffordProduction(state, aiOwner, UnitType.Construction)) {
      if (prodCounts[UnitType.Construction] === 0) {
        // No construction in production — consider starting one
        const existingConstructors = state.units.filter(
          u => u.owner === aiOwner && u.type === UnitType.Construction,
        ).length;
        const maxConstructors = Math.min(3, Math.max(1, Math.floor(aiCityCount / 4)));
        if (existingConstructors < maxConstructors && progress < 0.25) {
          aiLog(`City #${city.id}: switch to Construction (need economy: ${existingConstructors}/${maxConstructors} constructors)`);
          return UnitType.Construction;
        }
      }
    }
  }

  // Priority 2b: Build more transports when army surplus is overwhelming
  // Each transport carries 6 armies; if wait:transport count far exceeds capacity, add more.
  // Cap: max ceil(cities/4) cities building transports to prevent overproduction.
  if (canBuildShips && city.production !== UnitType.Transport) {
    const maxTransportCities = Math.max(1, Math.ceil(aiCityCount / 4));
    if (prodCounts[UnitType.Transport] < maxTransportCities) {
      const waitingArmies = state.units.filter(
        u => u.owner === aiOwner && u.type === UnitType.Army
          && u.func === UnitBehavior.WaitForTransport && u.shipId === null
      ).length;
      const existingTransports = state.units.filter(
        u => u.owner === aiOwner && u.type === UnitType.Transport
      ).length;
      const transportCapacity = (existingTransports + prodCounts[UnitType.Transport]) * 6;
      if (waitingArmies > transportCapacity + 6 && progress < 0.5) {
        aiLog(`City #${city.id}: switch to Transport (army surplus: ${waitingArmies} waiting, capacity=${transportCapacity}, ${prodCounts[UnitType.Transport]}/${maxTransportCities} transport cities)`);
        return UnitType.Transport;
      }
    } else {
      aiLog(`City #${city.id}: transport cap reached (${prodCounts[UnitType.Transport]}/${maxTransportCities} cities building transports)`);
    }
  }

  // Priority 3: Follow ratio tables if current production is overproduced
  const ratio = getRatioTable(aiCityCount);
  const ratioName = aiCityCount <= 3 ? "EARLY" : aiCityCount <= 10 ? "R1" : aiCityCount <= 20 ? "R2" : aiCityCount <= 30 ? "R3" : "R4";

  if (overproduced(prodCounts, ratio, city.production)) {
    // Don't switch away from fighter if we still need early fighters — prevents
    // oscillation where Priority 1b assigns fighter, then ratio rebalance undoes it every turn
    if (city.production === UnitType.Fighter) {
      const existingFighters = state.units.filter(
        u => u.owner === aiOwner && u.type === UnitType.Fighter,
      ).length;
      const totalFighters = existingFighters + prodCounts[UnitType.Fighter];
      if (totalFighters <= 2) {
        aiLog(`City #${city.id}: fighter overproduced by ratio but only ${totalFighters} total, keeping`);
        return null;
      }
    }
    // Commit to current production until at least 25% done (minimum 2 turns).
    // This prevents pathological oscillation where ratio rebalance flips production
    // every few turns (e.g., transport↔fighter) and nothing ever finishes.
    // Note: work can be negative (retool penalty), so use absolute threshold.
    const minCommitWork = Math.max(2, Math.ceil(currentAttrs.buildTime * 0.25));
    if (city.work < minCommitWork) {
      aiLog(`City #${city.id}: ${currentAttrs.name} overproduced but work=${city.work}/${currentAttrs.buildTime} (need ${minCommitWork} to consider switch), committed`);
      return null;
    }
    // Don't let ratio rebalance pick Fighter when we already have enough
    const maxFighters2 = aiCityCount >= 10 ? 3 : 2;
    const existingFighters2 = state.units.filter(
      u => u.owner === aiOwner && u.type === UnitType.Fighter,
    ).length + prodCounts[UnitType.Fighter];
    const adjustedRatio = [...ratio];
    if (existingFighters2 >= maxFighters2) {
      adjustedRatio[UnitType.Fighter] = 0; // suppress fighter production
    }
    const needed = needMore(prodCounts, adjustedRatio, !canBuildShips, state, aiOwner);
    // Don't switch if we'd switch to the same type we just switched FROM (work penalty wasted)
    if (needed === city.production) return null;
    aiLog(`City #${city.id}: switch from ${currentAttrs.name} to ${UNIT_ATTRIBUTES[needed].name} (ratio rebalance, table=${ratioName}, cities=${aiCityCount})`);
    return needed;
  }

  // Keep current production
  return null;
}

/**
 * Run AI production for all cities.
 * Returns setProduction actions.
 */
export function aiProduction(
  state: GameState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const prodCounts = countProduction(state, aiOwner);

  for (const city of state.cities) {
    if (city.owner !== aiOwner) continue;

    const newProd = decideProduction(state, city, aiOwner, viewMap, prodCounts);
    if (newProd !== null && newProd !== city.production) {
      const oldName = UNIT_ATTRIBUTES[city.production].name;
      const newName = UNIT_ATTRIBUTES[newProd].name;
      aiLog(`City #${city.id}: SWITCHING ${oldName} → ${newName} (work=${city.work}/${UNIT_ATTRIBUTES[city.production].buildTime})`);
      actions.push({ type: "setProduction", cityId: city.id, unitType: newProd });
      // Update counts for subsequent city decisions
      prodCounts[city.production]--;
      prodCounts[newProd]++;
    }
  }

  return actions;
}
