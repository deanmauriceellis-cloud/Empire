// Empire Reborn — Kingdom System
// Phase 10: Crown cities, tributary relationships, and kingdom bonuses.

import {
  UNOWNED,
  TRIBUTE_RATE,
  CROWN_DEFENSE_BONUS,
  CROWN_HEAL_BONUS,
  CROWN_VISION_RADIUS,
  CROWN_GARRISON_BONUS,
  NUM_RESOURCE_TYPES,
  CITY_INCOME,
  DEPOSIT_INCOME,
  DEPOSIT_RESOURCE,
} from "./constants.js";
import type { PlayerId } from "./constants.js";
import type { GameState, KingdomState, TurnEvent, Loc } from "./types.js";

// ─── Kingdom Initialization ────────────────────────────────────────────────

/** Create a KingdomState for a player with their starting crown city. */
export function createKingdomState(playerId: PlayerId, crownCityId: number): KingdomState {
  return {
    playerId,
    crownCityId,
    tributeTarget: null,
    tributaries: [],
    tributeRate: TRIBUTE_RATE,
  };
}

/** Initialize kingdoms for all players, assigning crown cities from starting cities. */
export function initKingdoms(
  state: GameState,
  startingCities: number[],
): void {
  state.kingdoms = {};
  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[i];
    const crownCityId = i < startingCities.length ? startingCities[i] : -1;
    if (crownCityId >= 0) {
      state.kingdoms[player.id] = createKingdomState(player.id, crownCityId);
    }
  }
}

// ─── Crown City Queries ────────────────────────────────────────────────────

/** Get the crown city ID for a player, or null if none. */
export function getCrownCityId(state: GameState, playerId: PlayerId): number | null {
  const kingdom = state.kingdoms[playerId];
  return kingdom?.crownCityId ?? null;
}

/** Check if a city is a crown city. */
export function isCrownCity(state: GameState, cityId: number): boolean {
  for (const k of Object.values(state.kingdoms)) {
    if (k.crownCityId === cityId) return true;
  }
  return false;
}

/** Check if a city is the crown city of its current owner. */
export function isOwnCrownCity(state: GameState, cityId: number): boolean {
  const city = state.cities[cityId];
  if (!city || city.owner === UNOWNED) return false;
  const kingdom = state.kingdoms[city.owner];
  return kingdom?.crownCityId === cityId;
}

/** Get the location of a player's crown city, or null. */
export function getCrownCityLoc(state: GameState, playerId: PlayerId): Loc | null {
  const kingdom = state.kingdoms[playerId];
  if (!kingdom || kingdom.crownCityId < 0) return null;
  const city = state.cities[kingdom.crownCityId];
  return city?.loc ?? null;
}

// ─── Crown City Bonuses ────────────────────────────────────────────────────

/**
 * Get crown defense bonus for a unit at a given location.
 * Returns CROWN_DEFENSE_BONUS if the unit is defending in its own crown city, else 0.
 */
export function getCrownDefenseBonus(state: GameState, owner: PlayerId, loc: Loc): number {
  const kingdom = state.kingdoms[owner];
  if (!kingdom) return 0;
  const crownCity = state.cities[kingdom.crownCityId];
  if (!crownCity || crownCity.loc !== loc) return 0;
  // Only if the crown city still belongs to this player
  if (crownCity.owner !== owner) return 0;
  return CROWN_DEFENSE_BONUS;
}

/**
 * Get the crown heal bonus for a unit at a location.
 * Returns CROWN_HEAL_BONUS if unit is in its own crown city, else 0.
 */
export function getCrownHealBonus(state: GameState, owner: PlayerId, loc: Loc): number {
  const kingdom = state.kingdoms[owner];
  if (!kingdom) return 0;
  const crownCity = state.cities[kingdom.crownCityId];
  if (!crownCity || crownCity.loc !== loc || crownCity.owner !== owner) return 0;
  return CROWN_HEAL_BONUS;
}

/**
 * Get the crown garrison penalty applied to attackers of a crown city.
 * Returns CROWN_GARRISON_BONUS if targetLoc is the crown city of the defending player.
 */
export function getCrownGarrisonBonus(state: GameState, defenderOwner: PlayerId, loc: Loc): number {
  const kingdom = state.kingdoms[defenderOwner];
  if (!kingdom) return 0;
  const crownCity = state.cities[kingdom.crownCityId];
  if (!crownCity || crownCity.loc !== loc || crownCity.owner !== defenderOwner) return 0;
  return CROWN_GARRISON_BONUS;
}

/**
 * Check if a city qualifies for the crown production bonus.
 * Returns true if this city is the crown city of its owner.
 */
export function hasCrownProductionBonus(state: GameState, cityId: number): boolean {
  return isOwnCrownCity(state, cityId);
}

/** Get the crown vision radius for scanning, or 0 if not applicable. */
export function getCrownVisionRadius(): number {
  return CROWN_VISION_RADIUS;
}

// ─── Tributary System ──────────────────────────────────────────────────────

/** Check if a player is a tributary (vassal) of anyone. */
export function isTributary(state: GameState, playerId: PlayerId): boolean {
  const kingdom = state.kingdoms[playerId];
  return kingdom?.tributeTarget !== null && kingdom?.tributeTarget !== undefined;
}

/** Get the overlord of a tributary, or null if independent. */
export function getOverlord(state: GameState, playerId: PlayerId): PlayerId | null {
  return state.kingdoms[playerId]?.tributeTarget ?? null;
}

/** Get all direct tributaries of a player. */
export function getTributaries(state: GameState, playerId: PlayerId): PlayerId[] {
  return state.kingdoms[playerId]?.tributaries ?? [];
}

/**
 * Make a player become a tributary of an overlord.
 * Called when a crown city is captured.
 */
export function makeTributary(
  state: GameState,
  vassalId: PlayerId,
  overlordId: PlayerId,
): void {
  const vassalKingdom = state.kingdoms[vassalId];
  const overlordKingdom = state.kingdoms[overlordId];
  if (!vassalKingdom || !overlordKingdom) return;

  vassalKingdom.tributeTarget = overlordId;
  if (!overlordKingdom.tributaries.includes(vassalId)) {
    overlordKingdom.tributaries.push(vassalId);
  }
}

/**
 * Free a tributary from vassalage.
 * Called when the overlord's crown is captured, or overlord releases voluntarily.
 */
export function freeTributary(
  state: GameState,
  vassalId: PlayerId,
): void {
  const vassalKingdom = state.kingdoms[vassalId];
  if (!vassalKingdom || vassalKingdom.tributeTarget === null) return;

  const overlordKingdom = state.kingdoms[vassalKingdom.tributeTarget];
  if (overlordKingdom) {
    overlordKingdom.tributaries = overlordKingdom.tributaries.filter(id => id !== vassalId);
  }
  vassalKingdom.tributeTarget = null;
}

/**
 * Free all tributaries of a player (called when their crown is captured).
 */
export function freeAllTributaries(state: GameState, overlordId: PlayerId): void {
  const kingdom = state.kingdoms[overlordId];
  if (!kingdom) return;
  for (const vassalId of [...kingdom.tributaries]) {
    const vassalKingdom = state.kingdoms[vassalId];
    if (vassalKingdom) {
      vassalKingdom.tributeTarget = null;
    }
  }
  kingdom.tributaries = [];
}

/**
 * Check if a tributary can rebel (military strength > overlord's).
 * Rebellion condition: vassal's total unit count > overlord's total unit count.
 */
export function canRebel(state: GameState, vassalId: PlayerId): boolean {
  const kingdom = state.kingdoms[vassalId];
  if (!kingdom || kingdom.tributeTarget === null) return false;

  const overlordId = kingdom.tributeTarget;
  const vassalUnits = state.units.filter(u => u.owner === vassalId).length;
  const overlordUnits = state.units.filter(u => u.owner === overlordId).length;
  return vassalUnits > overlordUnits;
}

/**
 * Process rebellion: if a tributary's military exceeds overlord's, they auto-revolt.
 * Returns events for any rebellions that occurred.
 */
export function processRebellions(state: GameState): TurnEvent[] {
  const events: TurnEvent[] = [];

  for (const kingdom of Object.values(state.kingdoms)) {
    if (kingdom.tributeTarget === null) continue;
    if (!canRebel(state, kingdom.playerId)) continue;

    const vassalId = kingdom.playerId;
    const overlordId = kingdom.tributeTarget;
    const vassalName = state.players.find(p => p.id === vassalId)?.name ?? `Player ${vassalId}`;
    const overlordName = state.players.find(p => p.id === overlordId)?.name ?? `Player ${overlordId}`;
    const crownLoc = getCrownCityLoc(state, vassalId) ?? 0;

    freeTributary(state, vassalId);

    events.push({
      type: "crown",
      loc: crownLoc,
      description: `${vassalName} has rebelled against ${overlordName}!`,
      data: { vassalId, overlordId },
    });
  }

  return events;
}

// ─── Tribute Income ────────────────────────────────────────────────────────

/**
 * Collect tribute payments from tributaries and deduct from vassals.
 * Called after normal resource income collection.
 * Returns events for tribute transfers.
 */
export function collectTributeIncome(state: GameState): TurnEvent[] {
  const events: TurnEvent[] = [];

  for (const kingdom of Object.values(state.kingdoms)) {
    if (kingdom.tributeTarget === null) continue;

    const vassalId = kingdom.playerId;
    const overlordId = kingdom.tributeTarget;
    const vassalRes = state.resources[vassalId];
    const overlordRes = state.resources[overlordId];
    if (!vassalRes || !overlordRes) continue;

    // Calculate tribute: tributeRate of the vassal's current stockpile income
    // We compute it as a percentage of what the vassal earned THIS turn
    // (approximated by tributeRate of current stockpile, floor'd per resource)
    const tribute = [0, 0, 0];
    let hasTribute = false;

    // Calculate income this turn: count cities + deposits owned
    const turnIncome = [0, 0, 0];
    for (const city of state.cities) {
      if (city.owner !== vassalId) continue;
      for (let i = 0; i < NUM_RESOURCE_TYPES; i++) {
        turnIncome[i] += CITY_INCOME[i];
      }
    }
    for (const deposit of state.deposits) {
      if (deposit.owner !== vassalId || !deposit.buildingComplete) continue;
      const resIdx = DEPOSIT_RESOURCE[deposit.type] as number;
      turnIncome[resIdx] += DEPOSIT_INCOME;
    }

    for (let i = 0; i < NUM_RESOURCE_TYPES; i++) {
      tribute[i] = Math.floor(turnIncome[i] * kingdom.tributeRate);
      if (tribute[i] > 0) {
        // Don't take more than they have
        tribute[i] = Math.min(tribute[i], vassalRes[i]);
        vassalRes[i] -= tribute[i];
        overlordRes[i] += tribute[i];
        hasTribute = true;
      }
    }

    if (hasTribute) {
      const vassalName = state.players.find(p => p.id === vassalId)?.name ?? `Player ${vassalId}`;
      const overlordName = state.players.find(p => p.id === overlordId)?.name ?? `Player ${overlordId}`;
      const parts: string[] = [];
      if (tribute[0] > 0) parts.push(`${tribute[0]} ore`);
      if (tribute[1] > 0) parts.push(`${tribute[1]} oil`);
      if (tribute[2] > 0) parts.push(`${tribute[2]} textile`);

      events.push({
        type: "tribute",
        loc: 0,
        description: `${vassalName} paid tribute to ${overlordName}: ${parts.join(", ")}`,
        data: { vassalId, overlordId, ore: tribute[0], oil: tribute[1], textile: tribute[2] },
      });
    }
  }

  return events;
}

// ─── Crown Capture ─────────────────────────────────────────────────────────

/**
 * Handle crown city capture: the attacker's kingdom gains a tributary.
 * Called from attackCity when a crown city changes hands.
 * Returns events describing the vassalage change.
 */
export function handleCrownCapture(
  state: GameState,
  capturedCityId: number,
  oldOwner: PlayerId,
  newOwner: PlayerId,
): TurnEvent[] {
  const events: TurnEvent[] = [];
  const oldKingdom = state.kingdoms[oldOwner];
  if (!oldKingdom || oldKingdom.crownCityId !== capturedCityId) return events;

  const oldName = state.players.find(p => p.id === oldOwner)?.name ?? `Player ${oldOwner}`;
  const newName = state.players.find(p => p.id === newOwner)?.name ?? `Player ${newOwner}`;
  const loc = state.cities[capturedCityId]?.loc ?? 0;

  // Free all of the old owner's tributaries (their empire collapses)
  if (oldKingdom.tributaries.length > 0) {
    for (const tribId of [...oldKingdom.tributaries]) {
      const tribName = state.players.find(p => p.id === tribId)?.name ?? `Player ${tribId}`;
      events.push({
        type: "crown",
        loc,
        description: `${tribName} is freed from vassalage to ${oldName}!`,
        data: { freedId: tribId, oldOverlordId: oldOwner },
      });
    }
    freeAllTributaries(state, oldOwner);
  }

  // If old owner was a tributary of someone, free them first
  if (oldKingdom.tributeTarget !== null) {
    freeTributary(state, oldOwner);
  }

  // Old owner becomes tributary of new owner
  makeTributary(state, oldOwner, newOwner);

  events.push({
    type: "crown",
    loc,
    description: `${oldName}'s Crown City has fallen! ${oldName} is now tributary to ${newName}.`,
    data: { vassalId: oldOwner, overlordId: newOwner, cityId: capturedCityId },
  });

  // Reassign the old owner's crown to their next best city (most upgrades, or any)
  reassignCrown(state, oldOwner);

  return events;
}

/**
 * Reassign a player's crown city to their best remaining city.
 * Called after crown capture — picks the city with the most upgrade slots filled.
 */
export function reassignCrown(state: GameState, playerId: PlayerId): void {
  const kingdom = state.kingdoms[playerId];
  if (!kingdom) return;

  const ownedCities = state.cities.filter(c => c.owner === playerId);
  if (ownedCities.length === 0) {
    kingdom.crownCityId = -1;
    return;
  }

  // Pick city with most upgrades, breaking ties by lowest ID (stability)
  let best = ownedCities[0];
  for (const city of ownedCities) {
    if (city.upgradeIds.length > best.upgradeIds.length ||
        (city.upgradeIds.length === best.upgradeIds.length && city.id < best.id)) {
      best = city;
    }
  }
  kingdom.crownCityId = best.id;
}

/**
 * Scan crown city vision for all players.
 * Crown cities provide permanent vision in a radius around them.
 */
export function scanCrownVision(state: GameState, scan: (state: GameState, owner: PlayerId, loc: Loc, extra?: number) => void): void {
  for (const kingdom of Object.values(state.kingdoms)) {
    if (kingdom.crownCityId < 0) continue;
    const city = state.cities[kingdom.crownCityId];
    if (!city || city.owner !== kingdom.playerId) continue;
    scan(state, kingdom.playerId, city.loc, CROWN_VISION_RADIUS);
  }
}
