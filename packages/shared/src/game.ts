// Empire Reborn — Core Game Engine
// Phase 3: Unit management, vision, movement, combat, production, turn execution
// Ported from VMS-Empire (object.c, attack.c, usermove.c, compmove.c)

import {
  MAP_SIZE,
  DIR_OFFSET,
  Direction,
  Owner,
  TerrainType,
  UnitType,
  UnitBehavior,
  MOVE_ORDER,
  INFINITY,
} from "./constants.js";
import { UNIT_ATTRIBUTES, canTraverse } from "./units.js";
import type {
  Loc,
  MapCell,
  ViewMapCell,
  CityState,
  UnitState,
  GameState,
  TurnEvent,
  TurnResult,
  PlayerAction,
} from "./types.js";
import { isOnBoard, getAdjacentLocs, locCol } from "./utils.js";

// ─── RNG ────────────────────────────────────────────────────────────────────────

/** Advance the game PRNG state and return a float in [0, 1). Mutates state.rngState. */
export function gameRandom(state: GameState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(state.rngState ^ (state.rngState >>> 15), 1 | state.rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Return a random integer in [0, n). */
export function gameRandomInt(state: GameState, n: number): number {
  return Math.floor(gameRandom(state) * n);
}

// ─── Unit Lookup ────────────────────────────────────────────────────────────────

/** Find a unit by id. Returns undefined if not found (dead). */
export function findUnit(state: GameState, id: number): UnitState | undefined {
  return state.units.find((u) => u.id === id);
}

/** Find all living units at a location. */
export function findUnitsAtLoc(state: GameState, loc: Loc): UnitState[] {
  return state.units.filter((u) => u.loc === loc);
}

/** Find the "top" (first) unit at a location for a given owner. */
export function findUnitAtLoc(state: GameState, loc: Loc, owner: Owner): UnitState | undefined {
  return state.units.find((u) => u.loc === loc && u.owner === owner);
}

/** Find a non-full ship of the given type at loc owned by owner. */
export function findNonFullShip(
  state: GameState,
  shipType: UnitType,
  loc: Loc,
  owner: Owner,
): UnitState | null {
  for (const u of state.units) {
    if (
      u.type === shipType &&
      u.loc === loc &&
      u.owner === owner &&
      u.cargoIds.length < objCapacity(u)
    ) {
      return u;
    }
  }
  return null;
}

// ─── Unit Stats ─────────────────────────────────────────────────────────────────

/** Effective moves per turn (scales with damage). */
export function objMoves(unit: UnitState): number {
  const attrs = UNIT_ATTRIBUTES[unit.type];
  return Math.floor(
    (attrs.speed * unit.hits + attrs.maxHits - 1) / attrs.maxHits,
  );
}

/** Effective cargo capacity (scales with damage for multi-hit ships). */
export function objCapacity(unit: UnitState): number {
  const attrs = UNIT_ATTRIBUTES[unit.type];
  if (attrs.capacity === 0) return 0;
  return Math.floor(
    (attrs.capacity * unit.hits + attrs.maxHits - 1) / attrs.maxHits,
  );
}

// ─── Unit Management ────────────────────────────────────────────────────────────

/** Create a new unit and add it to the game state. Returns the new unit. */
export function createUnit(
  state: GameState,
  type: UnitType,
  owner: Owner,
  loc: Loc,
): UnitState {
  const attrs = UNIT_ATTRIBUTES[type];
  const unit: UnitState = {
    id: state.nextUnitId++,
    type,
    owner,
    loc,
    hits: attrs.maxHits,
    moved: 0,
    func: UnitBehavior.None,
    shipId: null,
    cargoIds: [],
    range: attrs.range,
  };

  // Satellites get a random diagonal direction
  if (type === UnitType.Satellite) {
    const dirs = [UnitBehavior.MoveNE, UnitBehavior.MoveNW, UnitBehavior.MoveSE, UnitBehavior.MoveSW];
    unit.func = dirs[gameRandomInt(state, 4)];
  }

  state.units.push(unit);
  scan(state, owner, loc);
  return unit;
}

/**
 * Kill a unit and all its cargo recursively.
 * Removes from parent ship if embarked.
 * Returns events for all deaths.
 */
export function killUnit(state: GameState, unitId: number): TurnEvent[] {
  const unit = findUnit(state, unitId);
  if (!unit) return [];

  const events: TurnEvent[] = [];

  // Kill all cargo first (recursive)
  for (const cargoId of [...unit.cargoIds]) {
    events.push(...killUnit(state, cargoId));
  }

  // Remove from parent ship's cargo list
  if (unit.shipId !== null) {
    const ship = findUnit(state, unit.shipId);
    if (ship) {
      ship.cargoIds = ship.cargoIds.filter((id) => id !== unitId);
    }
  }

  // Remove from units array
  const idx = state.units.indexOf(unit);
  if (idx !== -1) state.units.splice(idx, 1);

  events.push({
    type: "death",
    loc: unit.loc,
    description: `${UNIT_ATTRIBUTES[unit.type].article} was destroyed`,
    data: { unitId, unitType: unit.type, owner: unit.owner },
  });

  // Update vision at death location
  scan(state, unit.owner, unit.loc);

  return events;
}

/** Load a unit onto a ship. */
export function embarkUnit(state: GameState, unitId: number, shipId: number): void {
  const unit = findUnit(state, unitId);
  const ship = findUnit(state, shipId);
  if (!unit || !ship) return;

  unit.shipId = shipId;
  ship.cargoIds.push(unitId);
}

/** Unload a unit from its ship. */
export function disembarkUnit(state: GameState, unitId: number): void {
  const unit = findUnit(state, unitId);
  if (!unit || unit.shipId === null) return;

  const ship = findUnit(state, unit.shipId);
  if (ship) {
    ship.cargoIds = ship.cargoIds.filter((id) => id !== unitId);
  }
  unit.shipId = null;
}

// ─── Vision ─────────────────────────────────────────────────────────────────────

/** Create a fresh (unseen) view map. */
export function initViewMap(): ViewMapCell[] {
  const vm: ViewMapCell[] = new Array(MAP_SIZE);
  for (let i = 0; i < MAP_SIZE; i++) {
    vm[i] = { contents: " ", seen: -1 };
  }
  return vm;
}

/** Update a single view map cell with current ground truth. */
export function updateViewCell(state: GameState, owner: Owner, loc: Loc): void {
  if (loc < 0 || loc >= MAP_SIZE) return;
  if (!state.map[loc].onBoard) return;

  const vm = state.viewMaps[owner];
  if (!vm) return;

  vm[loc].seen = state.turn;

  const cell = state.map[loc];

  // City takes priority
  if (cell.cityId !== null) {
    const city = state.cities[cell.cityId];
    if (city.owner === Owner.Unowned) {
      vm[loc].contents = "*";
    } else if (city.owner === owner) {
      vm[loc].contents = "O";
    } else {
      vm[loc].contents = "X";
    }
    return;
  }

  // Check for units at this location
  const topUnit = findTopUnitAtLoc(state, loc);
  if (topUnit) {
    const ch = UNIT_ATTRIBUTES[topUnit.type].char;
    // Own units uppercase, enemy units lowercase
    vm[loc].contents = topUnit.owner === owner ? ch : ch.toLowerCase();
    return;
  }

  // Bare terrain
  vm[loc].contents = cell.terrain;
}

/** Find the "top" visible unit at a location (non-embarked). */
function findTopUnitAtLoc(state: GameState, loc: Loc): UnitState | undefined {
  return state.units.find((u) => u.loc === loc && u.shipId === null);
}

/** Scan a location + 8 adjacent cells for a player's view. */
export function scan(state: GameState, owner: Owner, loc: Loc): void {
  updateViewCell(state, owner, loc);
  for (let i = 0; i < 8; i++) {
    const adj = loc + DIR_OFFSET[i];
    if (adj >= 0 && adj < MAP_SIZE) {
      // Guard against column wrapping
      const colDiff = Math.abs(locCol(adj) - locCol(loc));
      if (colDiff <= 1) {
        updateViewCell(state, owner, adj);
      }
    }
  }
}

/** Satellite scan: scan at 2x distance in all 8 directions, plus normal scan. */
export function scanSatellite(state: GameState, owner: Owner, loc: Loc): void {
  for (let i = 0; i < 8; i++) {
    const farLoc = loc + 2 * DIR_OFFSET[i];
    if (farLoc >= 0 && farLoc < MAP_SIZE && state.map[farLoc].onBoard) {
      scan(state, owner, farLoc);
    }
  }
  scan(state, owner, loc);
}

// ─── Movement ───────────────────────────────────────────────────────────────────

/**
 * Check if a unit can legally move to the given location.
 * Considers terrain, ships at destination, and cities.
 */
export function goodLoc(state: GameState, unit: UnitState, loc: Loc): boolean {
  if (!isOnBoard(loc)) return false;

  const cell = state.map[loc];

  // Check basic terrain traversal
  if (canTraverse(unit.type, cell.terrain)) return true;

  // Cities act as ports — any unit can enter its own city
  if (cell.cityId !== null) {
    const city = state.cities[cell.cityId];
    if (city.owner === unit.owner) return true;
  }

  // Armies can board transports
  if (unit.type === UnitType.Army) {
    const tt = findNonFullShip(state, UnitType.Transport, loc, unit.owner);
    if (tt) return true;
  }

  // Fighters can land on carriers
  if (unit.type === UnitType.Fighter) {
    const carrier = findNonFullShip(state, UnitType.Carrier, loc, unit.owner);
    if (carrier) return true;
  }

  return false;
}

/**
 * Move a unit to a new location.
 * Handles disembark, cargo movement, auto-embark, and vision updates.
 */
export function moveUnit(state: GameState, unit: UnitState, newLoc: Loc): void {
  const oldLoc = unit.loc;

  unit.moved += 1;
  if (UNIT_ATTRIBUTES[unit.type].range !== INFINITY) {
    unit.range -= 1;
  }

  // Auto-disembark when moving
  disembarkUnit(state, unit.id);

  // Move the unit
  unit.loc = newLoc;

  // Move all cargo with the unit
  for (const cargoId of unit.cargoIds) {
    const cargo = findUnit(state, cargoId);
    if (cargo) {
      cargo.loc = newLoc;
    }
  }

  // Auto-embark
  if (unit.type === UnitType.Army) {
    const tt = findNonFullShip(state, UnitType.Transport, newLoc, unit.owner);
    if (tt) {
      embarkUnit(state, unit.id, tt.id);
    }
  } else if (unit.type === UnitType.Fighter) {
    // Fighters auto-board carriers only when not in a city
    const cell = state.map[newLoc];
    if (cell.cityId === null || state.cities[cell.cityId].owner !== unit.owner) {
      const carrier = findNonFullShip(state, UnitType.Carrier, newLoc, unit.owner);
      if (carrier) {
        embarkUnit(state, unit.id, carrier.id);
      }
    }
  }

  // Update vision
  if (unit.type === UnitType.Satellite) {
    scanSatellite(state, unit.owner, newLoc);
  }
  scan(state, unit.owner, newLoc);
  // Also re-scan old location so it reflects the unit leaving
  scan(state, unit.owner, oldLoc);
}

/** Satellite directional behavior to Direction mapping. */
const SAT_BEHAVIOR_TO_DIR: Partial<Record<UnitBehavior, Direction>> = {
  [UnitBehavior.MoveNE]: Direction.NorthEast,
  [UnitBehavior.MoveNW]: Direction.NorthWest,
  [UnitBehavior.MoveSE]: Direction.SouthEast,
  [UnitBehavior.MoveSW]: Direction.SouthWest,
  [UnitBehavior.MoveN]: Direction.North,
  [UnitBehavior.MoveE]: Direction.East,
  [UnitBehavior.MoveS]: Direction.South,
  [UnitBehavior.MoveW]: Direction.West,
};

/**
 * Move a satellite according to its directional behavior.
 * Bounces off map edges. Dies when range reaches 0.
 * Returns events (death if range exhausted).
 */
export function moveSatellite(state: GameState, unit: UnitState): TurnEvent[] {
  const events: TurnEvent[] = [];
  const speed = UNIT_ATTRIBUTES[UnitType.Satellite].speed;

  for (let step = 0; step < speed && unit.range > 0; step++) {
    const dir = SAT_BEHAVIOR_TO_DIR[unit.func];
    if (dir === undefined) break;

    let newLoc = unit.loc + DIR_OFFSET[dir];

    // Bounce off edges
    if (newLoc < 0 || newLoc >= MAP_SIZE || !state.map[newLoc].onBoard) {
      // Reverse direction component that went off-board
      unit.func = bounceSatellite(unit.func, unit.loc, newLoc);
      const newDir = SAT_BEHAVIOR_TO_DIR[unit.func];
      if (newDir === undefined) break;
      newLoc = unit.loc + DIR_OFFSET[newDir];
      if (newLoc < 0 || newLoc >= MAP_SIZE || !state.map[newLoc].onBoard) break;
    }

    moveUnit(state, unit, newLoc);

    if (unit.range <= 0) {
      events.push(...killUnit(state, unit.id));
      break;
    }
  }

  return events;
}

/** Bounce a satellite's direction off the board edge. */
function bounceSatellite(behavior: UnitBehavior, oldLoc: Loc, _newLoc: Loc): UnitBehavior {
  // Determine which edge was hit and reverse that component
  const col = locCol(oldLoc);
  const row = Math.floor(oldLoc / 100); // MAP_WIDTH

  const isNorth = row <= 1;
  const isSouth = row >= 58; // MAP_HEIGHT - 2
  const isWest = col <= 1;
  const isEast = col >= 98; // MAP_WIDTH - 2

  switch (behavior) {
    case UnitBehavior.MoveNE:
      if (isNorth && isEast) return UnitBehavior.MoveSW;
      if (isNorth) return UnitBehavior.MoveSE;
      return UnitBehavior.MoveNW;
    case UnitBehavior.MoveNW:
      if (isNorth && isWest) return UnitBehavior.MoveSE;
      if (isNorth) return UnitBehavior.MoveSW;
      return UnitBehavior.MoveNE;
    case UnitBehavior.MoveSE:
      if (isSouth && isEast) return UnitBehavior.MoveNW;
      if (isSouth) return UnitBehavior.MoveSW;
      return UnitBehavior.MoveNE;
    case UnitBehavior.MoveSW:
      if (isSouth && isWest) return UnitBehavior.MoveNE;
      if (isSouth) return UnitBehavior.MoveNW;
      return UnitBehavior.MoveSE;
    default:
      return behavior;
  }
}

// ─── Combat ─────────────────────────────────────────────────────────────────────

/**
 * Attack a city.
 * 50% capture chance; attacker always dies.
 * On capture: city changes owner, production resets, enemy armies in city die,
 * enemy ships in city transfer ownership.
 */
export function attackCity(
  state: GameState,
  attacker: UnitState,
  cityId: number,
): TurnEvent[] {
  const events: TurnEvent[] = [];
  const city = state.cities[cityId];
  const oldOwner = city.owner;
  const attackerOwner = attacker.owner;

  if (gameRandom(state) < 0.5) {
    // Capture!
    events.push({
      type: "capture",
      loc: city.loc,
      description: `${UNIT_ATTRIBUTES[attacker.type].article} captured a city!`,
      data: { attackerOwner, oldOwner, cityId },
    });

    // Kill all enemy armies at the city, transfer ships
    const unitsAtCity = findUnitsAtLoc(state, city.loc);
    for (const u of unitsAtCity) {
      if (u.id === attacker.id) continue;
      if (u.owner !== attackerOwner) {
        if (u.type === UnitType.Army) {
          events.push(...killUnit(state, u.id));
        } else if (u.type !== UnitType.Satellite) {
          // Kill cargo on ships being captured
          for (const cargoId of [...u.cargoIds]) {
            events.push(...killUnit(state, cargoId));
          }
          u.cargoIds = [];
          // Transfer ship ownership
          u.owner = attackerOwner;
          u.func = UnitBehavior.None;
        }
      }
    }

    // Transfer city
    city.owner = attackerOwner;
    city.work = 0;
    city.production = UnitType.Army; // default to army
  } else {
    events.push({
      type: "combat",
      loc: city.loc,
      description: `${UNIT_ATTRIBUTES[attacker.type].article} failed to capture a city`,
      data: { attackerOwner, cityId },
    });
  }

  // Attacker always dies
  events.push(...killUnit(state, attacker.id));

  // Update vision for both players
  if (oldOwner !== Owner.Unowned) scan(state, oldOwner, city.loc);
  scan(state, attackerOwner, city.loc);

  return events;
}

/**
 * Unit vs unit combat.
 * Alternating rounds: each round one side takes damage (50/50).
 * Damage = attacker/defender strength.
 * Loser dies; winner moves to loser's loc; excess cargo overflows.
 */
export function attackUnit(
  state: GameState,
  attacker: UnitState,
  defender: UnitState,
): TurnEvent[] {
  const events: TurnEvent[] = [];
  const attAttrs = UNIT_ATTRIBUTES[attacker.type];
  const defAttrs = UNIT_ATTRIBUTES[defender.type];

  // Alternating combat rounds
  while (attacker.hits > 0 && defender.hits > 0) {
    if (gameRandom(state) < 0.5) {
      attacker.hits -= defAttrs.strength;
    } else {
      defender.hits -= attAttrs.strength;
    }
  }

  if (attacker.hits > 0) {
    // Attacker wins
    events.push({
      type: "combat",
      loc: defender.loc,
      description: `${attAttrs.article} defeated ${defAttrs.article}`,
      data: {
        winnerId: attacker.id,
        loserId: defender.id,
        winnerType: attacker.type,
        loserType: defender.type,
      },
    });

    const destLoc = defender.loc;
    events.push(...killUnit(state, defender.id));

    // Handle cargo overflow from damage
    events.push(...handleCargoOverflow(state, attacker));

    // Winner moves to loser's location
    moveUnit(state, attacker, destLoc);
  } else {
    // Defender wins
    events.push({
      type: "combat",
      loc: attacker.loc,
      description: `${defAttrs.article} defeated ${attAttrs.article}`,
      data: {
        winnerId: defender.id,
        loserId: attacker.id,
        winnerType: defender.type,
        loserType: attacker.type,
      },
    });

    events.push(...killUnit(state, attacker.id));

    // Handle cargo overflow on defender too
    events.push(...handleCargoOverflow(state, defender));
  }

  return events;
}

/** Kill excess cargo if a ship's capacity dropped below its cargo count. */
function handleCargoOverflow(state: GameState, unit: UnitState): TurnEvent[] {
  const events: TurnEvent[] = [];
  const cap = objCapacity(unit);
  while (unit.cargoIds.length > cap) {
    const excessId = unit.cargoIds[unit.cargoIds.length - 1];
    events.push(...killUnit(state, excessId));
  }
  return events;
}

// ─── City Production ────────────────────────────────────────────────────────────

/**
 * Set a city's production type. Applies 20% penalty if switching.
 */
export function setProduction(
  state: GameState,
  cityId: number,
  unitType: UnitType,
): void {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return;
  if (city.production !== unitType) {
    city.production = unitType;
    city.work = -Math.floor(UNIT_ATTRIBUTES[unitType].buildTime / 5);
  }
}

/**
 * Tick city production for a given owner.
 * Cities that complete production spawn a unit and reset work.
 * Returns production events.
 */
export function tickCityProduction(
  state: GameState,
  owner: Owner,
): TurnEvent[] {
  const events: TurnEvent[] = [];

  for (const city of state.cities) {
    if (city.owner !== owner) continue;

    city.work += 1;

    const buildTime = UNIT_ATTRIBUTES[city.production].buildTime;
    if (city.work >= buildTime) {
      // Produce the unit
      const unit = createUnit(state, city.production, owner, city.loc);
      city.work = 0;

      events.push({
        type: "production",
        loc: city.loc,
        description: `A city produced ${UNIT_ATTRIBUTES[city.production].article}`,
        data: { cityId: city.id, unitType: city.production, unitId: unit.id },
      });
    }
  }

  return events;
}

/**
 * Repair ships that are stationary in own ports.
 * +1 hit per turn for ships that didn't move and are in an owned city.
 * @param movedUnitIds - set of unit IDs that moved this turn
 */
export function repairShips(
  state: GameState,
  owner: Owner,
  movedUnitIds: Set<number>,
): void {
  for (const unit of state.units) {
    if (unit.owner !== owner) continue;
    if (movedUnitIds.has(unit.id)) continue;

    const attrs = UNIT_ATTRIBUTES[unit.type];
    // Only ships (not army, not fighter, not satellite)
    if (
      unit.type === UnitType.Army ||
      unit.type === UnitType.Fighter ||
      unit.type === UnitType.Satellite
    ) continue;

    // Must be damaged
    if (unit.hits >= attrs.maxHits) continue;

    // Must be in own city
    const cell = state.map[unit.loc];
    if (cell.cityId === null) continue;
    const city = state.cities[cell.cityId];
    if (city.owner !== owner) continue;

    unit.hits += 1;
  }
}

// ─── Turn Execution ─────────────────────────────────────────────────────────────

/**
 * Check end-game conditions.
 * Returns winner and win type, or null if game continues.
 */
export function checkEndGame(
  state: GameState,
): { winner: Owner; winType: "elimination" | "resignation" } | null {
  let p1Cities = 0, p1Armies = 0;
  let p2Cities = 0, p2Armies = 0;

  for (const city of state.cities) {
    if (city.owner === Owner.Player1) p1Cities++;
    else if (city.owner === Owner.Player2) p2Cities++;
  }

  for (const unit of state.units) {
    if (unit.type === UnitType.Army) {
      if (unit.owner === Owner.Player1) p1Armies++;
      else if (unit.owner === Owner.Player2) p2Armies++;
    }
  }

  // Elimination: 0 cities AND 0 armies (only after both players have had cities)
  // Don't trigger if neither player has anything
  const p1Total = p1Cities + p1Armies;
  const p2Total = p2Cities + p2Armies;
  if (p1Total === 0 && p2Total === 0) return null;

  if (p1Cities === 0 && p1Armies === 0 && p2Total > 0) {
    return { winner: Owner.Player2, winType: "elimination" };
  }
  if (p2Cities === 0 && p2Armies === 0 && p1Total > 0) {
    return { winner: Owner.Player1, winType: "elimination" };
  }

  // 3:1 resignation
  if (p2Cities > 0 && p1Cities > p2Cities * 3 && p1Armies > p2Armies * 3) {
    return { winner: Owner.Player1, winType: "resignation" };
  }
  if (p1Cities > 0 && p2Cities > p1Cities * 3 && p2Armies > p1Armies * 3) {
    return { winner: Owner.Player2, winType: "resignation" };
  }

  return null;
}

/**
 * Process a single player action. Returns events generated.
 */
export function processAction(
  state: GameState,
  action: PlayerAction,
  owner: Owner,
): TurnEvent[] {
  const events: TurnEvent[] = [];

  switch (action.type) {
    case "move": {
      const unit = findUnit(state, action.unitId);
      if (!unit || unit.owner !== owner) break;
      if (!goodLoc(state, unit, action.loc)) break;
      if (unit.moved >= objMoves(unit)) break;
      moveUnit(state, unit, action.loc);
      break;
    }

    case "attack": {
      const unit = findUnit(state, action.unitId);
      if (!unit || unit.owner !== owner) break;

      // Check if target is a city
      const cell = state.map[action.targetLoc];
      if (cell.cityId !== null) {
        const city = state.cities[cell.cityId];
        if (city.owner !== owner) {
          events.push(...attackCity(state, unit, cell.cityId));
          break;
        }
      }

      // Check for enemy unit at target
      const defender = state.units.find(
        (u) => u.loc === action.targetLoc && u.owner !== owner && u.shipId === null,
      );
      if (defender) {
        events.push(...attackUnit(state, unit, defender));
      }
      break;
    }

    case "setProduction": {
      const city = state.cities.find((c) => c.id === action.cityId);
      if (!city || city.owner !== owner) break;
      setProduction(state, action.cityId, action.unitType);
      break;
    }

    case "setBehavior": {
      const unit = findUnit(state, action.unitId);
      if (!unit || unit.owner !== owner) break;
      unit.func = action.behavior;
      break;
    }

    case "embark": {
      const unit = findUnit(state, action.unitId);
      if (!unit || unit.owner !== owner) break;
      const ship = findUnit(state, action.shipId);
      if (!ship || ship.owner !== owner) break;
      if (unit.loc !== ship.loc) break;
      if (ship.cargoIds.length >= objCapacity(ship)) break;
      embarkUnit(state, unit.id, ship.id);
      break;
    }

    case "disembark": {
      const unit = findUnit(state, action.unitId);
      if (!unit || unit.owner !== owner) break;
      disembarkUnit(state, unit.id);
      break;
    }

    case "resign": {
      // Mark the other player as winner
      const winner = owner === Owner.Player1 ? Owner.Player2 : Owner.Player1;
      events.push({
        type: "combat",
        loc: 0,
        description: `Player ${owner} resigned`,
        data: { winner, winType: "resignation" },
      });
      break;
    }

    case "endTurn":
      // No-op; handled at the turn level
      break;
  }

  return events;
}

/**
 * Execute a full game turn.
 * Processes Player1 actions, then Player2 actions,
 * then ticks production, moves satellites, repairs ships, checks endgame.
 */
export function executeTurn(
  state: GameState,
  player1Actions: PlayerAction[],
  player2Actions: PlayerAction[],
): TurnResult {
  const events: TurnEvent[] = [];
  const movedUnits1 = new Set<number>();
  const movedUnits2 = new Set<number>();

  // Check for resignation
  for (const action of player1Actions) {
    if (action.type === "resign") {
      return {
        turn: state.turn,
        events: [{ type: "combat", loc: 0, description: "Player 1 resigned", data: {} }],
        winner: Owner.Player2,
        winType: "resignation",
      };
    }
  }
  for (const action of player2Actions) {
    if (action.type === "resign") {
      return {
        turn: state.turn,
        events: [{ type: "combat", loc: 0, description: "Player 2 resigned", data: {} }],
        winner: Owner.Player1,
        winType: "resignation",
      };
    }
  }

  // Track which units moved for repair purposes
  const trackMoves = (actions: PlayerAction[], movedSet: Set<number>) => {
    for (const a of actions) {
      if (a.type === "move" || a.type === "attack") {
        movedSet.add(a.unitId);
      }
    }
  };
  trackMoves(player1Actions, movedUnits1);
  trackMoves(player2Actions, movedUnits2);

  // Process Player1 actions
  for (const action of player1Actions) {
    events.push(...processAction(state, action, Owner.Player1));
  }

  // Process Player2 actions
  for (const action of player2Actions) {
    events.push(...processAction(state, action, Owner.Player2));
  }

  // Move satellites (for both players)
  const satellites = state.units.filter((u) => u.type === UnitType.Satellite);
  for (const sat of satellites) {
    events.push(...moveSatellite(state, sat));
  }

  // Tick city production
  events.push(...tickCityProduction(state, Owner.Player1));
  events.push(...tickCityProduction(state, Owner.Player2));

  // Repair ships in port
  repairShips(state, Owner.Player1, movedUnits1);
  repairShips(state, Owner.Player2, movedUnits2);

  // Reset moved counters for all units
  for (const unit of state.units) {
    unit.moved = 0;
  }

  // Advance turn
  state.turn += 1;

  // Check endgame
  const endgame = checkEndGame(state);

  return {
    turn: state.turn,
    events,
    winner: endgame?.winner ?? null,
    winType: endgame?.winType ?? null,
  };
}
