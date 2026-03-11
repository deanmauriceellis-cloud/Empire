// Empire Reborn — Core Game Engine
// Phase 3: Unit management, vision, movement, combat, production, turn execution
// Ported from VMS-Empire (object.c, attack.c, usermove.c, compmove.c)

import {
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_SIZE,
  DIR_OFFSET,
  Direction,
  Owner,
  TerrainType,
  UnitType,
  UnitBehavior,
  MOVE_ORDER,
  INFINITY,
  ResourceType,
  DEPOSIT_RESOURCE,
  DEPOSIT_INCOME,
  NUM_RESOURCE_TYPES,
  CITY_INCOME,
  BuildingType,
  DepositType,
  NUM_TECH_TYPES,
  CROWN_PRODUCTION_BONUS,
} from "./constants.js";
import { UNIT_ATTRIBUTES, canTraverse, UNIT_COSTS, canAffordUnit } from "./units.js";
import {
  BUILDING_ATTRIBUTES,
  getBuildingCost,
  getBuildingTime,
  getBuildingTechOutput,
  canAffordBuilding,
  depositToBuildingType,
  isCityUpgradeType,
  isDefensiveStructureType,
  isNavalStructureType,
  isStructureType,
  canStructureTarget,
  cityHasUpgradeSlot,
  cityHasUpgradeType,
} from "./buildings.js";
import type {
  Loc,
  MapCell,
  ViewMapCell,
  CityState,
  UnitState,
  BuildingState,
  GameState,
  TurnEvent,
  TurnResult,
  PlayerAction,
} from "./types.js";
import { isOnBoard, getAdjacentLocs, locCol, locRow, rowColLoc, dist } from "./utils.js";
import {
  createPathMap,
  findObjective,
  markPath,
  findDirection,
  landMoveInfo,
  waterMoveInfo,
  airMoveInfo,
} from "./pathfinding.js";
import { mapContinent } from "./continent.js";
import { VM_UNEXPLORED, VM_ENEMY_CITY, VM_OWN_CITY, VM_UNOWNED_CITY, isEnemyUnit } from "./viewmap-chars.js";
import {
  getPlayerTechLevels,
  getEffectiveStrength,
  getEffectiveMaxHp,
  getEffectiveSpeed,
  getEffectiveFighterRange,
  getEffectiveSatelliteRange,
  techVisionBonus,
  techCityHealRate,
  techShipsHealAtSea,
  canBuildStructure,
} from "./tech.js";
import {
  isOwnCrownCity,
  hasCrownProductionBonus,
  getCrownDefenseBonus,
  getCrownHealBonus,
  getCrownGarrisonBonus,
  handleCrownCapture,
  collectTributeIncome,
  processRebellions,
  scanCrownVision,
} from "./kingdom.js";

// ─── Shield ─────────────────────────────────────────────────────────────────────

/** Check if a player is currently shielded (immune to attack) in world mode. */
export function isShielded(state: GameState, playerId: number): boolean {
  return state.shields?.[playerId]?.isActive === true;
}

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

/** Effective moves per turn (scales with damage). Optionally tech-boosted. */
export function objMoves(unit: UnitState, state?: GameState): number {
  const attrs = UNIT_ATTRIBUTES[unit.type];
  let speed = attrs.speed;
  let maxHits = attrs.maxHits;
  if (state) {
    speed = getEffectiveSpeed(state, unit);
    maxHits = getEffectiveMaxHp(state, unit);
  }
  return Math.floor(
    (speed * unit.hits + maxHits - 1) / maxHits,
  );
}

/** Effective cargo capacity (scales with damage for multi-hit ships). */
export function objCapacity(unit: UnitState, state?: GameState): number {
  const attrs = UNIT_ATTRIBUTES[unit.type];
  if (attrs.capacity === 0) return 0;
  let maxHits = attrs.maxHits;
  if (state) {
    maxHits = getEffectiveMaxHp(state, unit);
  }
  return Math.floor(
    (attrs.capacity * unit.hits + maxHits - 1) / maxHits,
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
  const effectiveMaxHp = getEffectiveMaxHp(state, { type, owner });
  const effectiveRange = type === UnitType.Fighter || type === UnitType.AWACS
    ? (type === UnitType.Fighter ? getEffectiveFighterRange(state, owner) : attrs.range)
    : type === UnitType.Satellite
      ? getEffectiveSatelliteRange(state, owner)
      : attrs.range;
  const unit: UnitState = {
    id: state.nextUnitId++,
    type,
    owner,
    loc,
    hits: effectiveMaxHp,
    moved: 0,
    func: UnitBehavior.None,
    shipId: null,
    cargoIds: [],
    range: effectiveRange,
    targetLoc: null,
  };

  // Satellites get a random diagonal direction
  if (type === UnitType.Satellite) {
    const dirs = [UnitBehavior.MoveNE, UnitBehavior.MoveNW, UnitBehavior.MoveSE, UnitBehavior.MoveSW];
    unit.func = dirs[gameRandomInt(state, 4)];
  }

  state.units.push(unit);
  scan(state, owner, loc, attrs.visionRadius);
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

// ─── Building/Structure Helpers ──────────────────────────────────────────────────

/** Find a completed bridge building at a given location. */
export function findBridgeAtLoc(state: GameState, loc: Loc): BuildingState | undefined {
  return state.buildings.find(
    (b) => b.loc === loc && b.type === BuildingType.Bridge && b.complete,
  );
}

/** Find a completed structure at a given location owned by a specific player. */
export function findStructureAtLoc(state: GameState, loc: Loc, owner?: Owner): BuildingState | undefined {
  return state.buildings.find(
    (b) => b.loc === loc && b.complete && isStructureType(b.type) &&
    (owner === undefined || b.owner === owner),
  );
}

/** Find all completed structures of a given owner. */
export function findOwnerStructures(state: GameState, owner: Owner): BuildingState[] {
  return state.buildings.filter(
    (b) => b.owner === owner && b.complete && isStructureType(b.type),
  );
}

/**
 * Destroy a building: remove from state, clear references.
 * Returns events.
 */
export function destroyBuilding(state: GameState, buildingId: number): TurnEvent[] {
  const idx = state.buildings.findIndex((b) => b.id === buildingId);
  if (idx === -1) return [];

  const building = state.buildings[idx];
  const attrs = BUILDING_ATTRIBUTES[building.type];

  // Clear deposit reference if this is a deposit building
  if (attrs.isDepositBuilding) {
    const cell = state.map[building.loc];
    if (cell.depositId !== null) {
      const deposit = state.deposits[cell.depositId];
      if (deposit.buildingId === buildingId) {
        deposit.buildingId = null;
        deposit.buildingComplete = false;
        deposit.owner = Owner.Unowned;
      }
    }
  }

  // Clear city upgrade reference if this is a city upgrade
  if (attrs.isCityUpgrade) {
    const cell = state.map[building.loc];
    if (cell.cityId !== null) {
      const city = state.cities[cell.cityId];
      city.upgradeIds = city.upgradeIds.filter((id) => id !== buildingId);
    }
  }

  // Kill the constructor if still building
  const events: TurnEvent[] = [];
  if (building.constructorId !== null) {
    events.push(...killUnit(state, building.constructorId));
  }

  // Remove from buildings array
  state.buildings.splice(idx, 1);

  events.push({
    type: "structure",
    loc: building.loc,
    description: `${attrs.name} was destroyed`,
    data: { buildingId, buildingType: building.type, owner: building.owner },
  });

  return events;
}

/**
 * Deal damage to a structure. If HP reaches 0, destroy it.
 * Returns events.
 */
export function bombardStructure(
  state: GameState,
  attacker: UnitState,
  building: BuildingState,
): TurnEvent[] {
  const events: TurnEvent[] = [];
  const attAttrs = UNIT_ATTRIBUTES[attacker.type];
  const bldgAttrs = BUILDING_ATTRIBUTES[building.type];
  const damage = getEffectiveStrength(state, attacker);

  building.hp -= damage;

  if (building.hp <= 0) {
    events.push({
      type: "combat",
      loc: building.loc,
      description: `${attAttrs.article} bombarded and destroyed ${bldgAttrs.name}`,
      data: { winnerId: attacker.id, buildingId: building.id, bombard: true },
    });
    events.push(...destroyBuilding(state, building.id));
  } else {
    events.push({
      type: "combat",
      loc: building.loc,
      description: `${attAttrs.article} bombarded ${bldgAttrs.name} (${building.hp} HP left)`,
      data: { attackerId: attacker.id, buildingId: building.id, bombard: true, remainingHp: building.hp },
    });
  }

  attacker.moved += 1;
  return events;
}

/**
 * Trigger a mine (land or sea). Deals mine strength to the entering unit.
 * Mine is destroyed after triggering.
 */
export function triggerMine(
  state: GameState,
  mine: BuildingState,
  victim: UnitState,
): TurnEvent[] {
  const events: TurnEvent[] = [];
  const mineAttrs = BUILDING_ATTRIBUTES[mine.type];
  const victimAttrs = UNIT_ATTRIBUTES[victim.type];

  victim.hits -= mineAttrs.strength;

  if (victim.hits <= 0) {
    events.push({
      type: "combat",
      loc: mine.loc,
      description: `${victimAttrs.article} hit a ${mineAttrs.name} and was destroyed`,
      data: { loserId: victim.id, buildingId: mine.id, mine: true },
    });
    events.push(...killUnit(state, victim.id));
  } else {
    events.push({
      type: "combat",
      loc: mine.loc,
      description: `${victimAttrs.article} hit a ${mineAttrs.name} (${victim.hits} HP left)`,
      data: { defenderId: victim.id, buildingId: mine.id, mine: true, remainingHp: victim.hits },
    });
  }

  // Destroy the mine (single-use)
  events.push(...destroyBuilding(state, mine.id));
  return events;
}

/**
 * Check and trigger mines at a location for an entering unit.
 * Called after unit moves to a new tile.
 */
export function checkMineTrigger(
  state: GameState,
  unit: UnitState,
): TurnEvent[] {
  // Shield check: shielded player's units don't trigger enemy mines
  if (isShielded(state, unit.owner as number)) return [];
  // Find enemy mines at unit's location
  const mine = state.buildings.find(
    (b) => b.loc === unit.loc && b.complete && b.owner !== unit.owner &&
    BUILDING_ATTRIBUTES[b.type].singleUse &&
    canStructureTarget(b.type, unit.type),
  );
  if (!mine) return [];
  return triggerMine(state, mine, unit);
}

/**
 * Auto-attack from all completed structures for a given owner.
 * Structures with strength > 0 and attackRange fire at nearest valid enemy.
 * Bunkers (range 0) auto-attack adjacent enemies.
 */
export function autoAttackStructures(state: GameState, owner: Owner): TurnEvent[] {
  const events: TurnEvent[] = [];
  const structures = findOwnerStructures(state, owner);

  for (const structure of structures) {
    const attrs = BUILDING_ATTRIBUTES[structure.type];
    if (attrs.strength <= 0) continue;
    if (attrs.singleUse) continue; // mines trigger on entry, not auto-attack

    const range = attrs.attackRange === 0 ? 1 : attrs.attackRange;

    // Find nearest valid enemy target within range
    let bestTarget: UnitState | null = null;
    let bestDist = INFINITY;

    for (const unit of state.units) {
      if (unit.owner === owner || unit.shipId !== null) continue;
      // Shield check: don't auto-attack shielded players' units
      if (isShielded(state, unit.owner as number)) continue;
      if (!canStructureTarget(structure.type, unit.type)) continue;

      const d = chebyshevDist(state, structure.loc, unit.loc);
      // Bunkers (attackRange 0) only hit adjacent (d === 1)
      // Ranged structures hit within range but not at their own tile
      if (attrs.attackRange === 0) {
        if (d !== 1) continue;
      } else {
        if (d < 1 || d > range) continue;
      }

      if (d < bestDist) {
        bestDist = d;
        bestTarget = unit;
      }
    }

    if (bestTarget) {
      // Deal damage (no return fire, like bombardment)
      bestTarget.hits -= attrs.strength;
      if (bestTarget.hits <= 0) {
        events.push({
          type: "combat",
          loc: bestTarget.loc,
          description: `${attrs.name} destroyed ${UNIT_ATTRIBUTES[bestTarget.type].article}`,
          data: { buildingId: structure.id, loserId: bestTarget.id, autoAttack: true },
        });
        events.push(...killUnit(state, bestTarget.id));
      } else {
        events.push({
          type: "combat",
          loc: bestTarget.loc,
          description: `${attrs.name} fired at ${UNIT_ATTRIBUTES[bestTarget.type].article} (${bestTarget.hits} HP left)`,
          data: { buildingId: structure.id, defenderId: bestTarget.id, autoAttack: true, remainingHp: bestTarget.hits },
        });
      }
    }
  }

  return events;
}

/**
 * Scan vision for all completed structures with visionRadius > 0 (Radar Stations).
 * Called during turn execution to ensure persistent vision.
 */
export function scanStructureVision(state: GameState, owner: Owner): void {
  for (const building of state.buildings) {
    if (building.owner !== owner || !building.complete) continue;
    const attrs = BUILDING_ATTRIBUTES[building.type];
    if (attrs.visionRadius <= 0) continue;
    scan(state, owner, building.loc, attrs.visionRadius);
  }
}

/**
 * Collect oil income from completed offshore platforms.
 * Each platform produces 1 oil per turn.
 */
export function collectPlatformIncome(state: GameState, owner: Owner): TurnEvent[] {
  let oilIncome = 0;
  for (const building of state.buildings) {
    if (building.owner !== owner || !building.complete) continue;
    if (building.type !== BuildingType.OffshorePlatform) continue;
    oilIncome += 1;
  }
  if (oilIncome > 0) {
    state.resources[owner][ResourceType.Oil] += oilIncome;
  }
  return [];
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
    // Invisible enemy units (Special Forces) only appear as terrain unless
    // the scanning player has a unit adjacent to them
    if (topUnit.owner !== owner && UNIT_ATTRIBUTES[topUnit.type].invisible) {
      if (!hasAdjacentOwnUnit(state, owner, loc)) {
        vm[loc].contents = cell.terrain;
        return;
      }
    }
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

/** Check if the given owner has a non-embarked unit adjacent to loc. */
function hasAdjacentOwnUnit(state: GameState, owner: Owner, loc: Loc): boolean {
  for (let i = 0; i < 8; i++) {
    const adj = loc + DIR_OFFSET[i];
    if (adj < 0 || adj >= MAP_SIZE) continue;
    if (Math.abs(locCol(adj) - locCol(loc)) > 1) continue;
    if (state.units.some((u) => u.loc === adj && u.owner === owner && u.shipId === null)) {
      return true;
    }
  }
  return false;
}

/** Scan a location + 8 adjacent cells for a player's view. */
export function scan(state: GameState, owner: Owner, loc: Loc, extraRange: number = 0): void {
  if (extraRange <= 0) {
    // Standard 1-tile radius scan
    updateViewCell(state, owner, loc);
    for (let i = 0; i < 8; i++) {
      const adj = loc + DIR_OFFSET[i];
      if (adj >= 0 && adj < MAP_SIZE) {
        const colDiff = Math.abs(locCol(adj) - locCol(loc));
        if (colDiff <= 1) {
          updateViewCell(state, owner, adj);
        }
      }
    }
  } else {
    // Extended vision: scan tiles within (1 + extraRange) Chebyshev distance
    const range = 1 + extraRange;
    const baseRow = locRow(loc);
    const baseCol = locCol(loc);
    for (let dr = -range; dr <= range; dr++) {
      for (let dc = -range; dc <= range; dc++) {
        const r = baseRow + dr;
        const c = baseCol + dc;
        if (r < 0 || r >= MAP_HEIGHT || c < 0 || c >= MAP_WIDTH) continue;
        const tileLoc = r * MAP_WIDTH + c;
        if (tileLoc >= 0 && tileLoc < MAP_SIZE) {
          updateViewCell(state, owner, tileLoc);
        }
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

  // Land units can cross bridges on water tiles
  if (cell.terrain === TerrainType.Sea) {
    const bridge = findBridgeAtLoc(state, loc);
    if (bridge && canTraverse(unit.type, TerrainType.Land)) return true;
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

  // Update vision (with tech bonus range + unit-specific vision radius)
  const levels = getPlayerTechLevels(state, unit.owner);
  const visionBonus = techVisionBonus(levels[0], levels[2], unit.type) +
    UNIT_ATTRIBUTES[unit.type].visionRadius;
  if (unit.type === UnitType.Satellite) {
    scanSatellite(state, unit.owner, newLoc);
  }
  scan(state, unit.owner, newLoc, visionBonus);
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
  const row = locRow(oldLoc);

  const isNorth = row <= 1;
  const isSouth = row >= MAP_HEIGHT - 2;
  const isWest = col <= 1;
  const isEast = col >= MAP_WIDTH - 2;

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

  // Crown cities are harder to capture: garrison bonus reduces capture chance
  const oldOwnerId = oldOwner as number;
  const garrisonBonus = oldOwnerId !== 0
    ? getCrownGarrisonBonus(state, oldOwnerId, city.loc)
    : 0;
  // Base 50% capture chance, reduced by 5% per garrison bonus point (min 10%)
  const captureChance = Math.max(0.10, 0.5 - garrisonBonus * 0.05);
  const wasCrown = oldOwnerId !== 0 && isOwnCrownCity(state, cityId);

  if (gameRandom(state) < captureChance) {
    // Capture!
    events.push({
      type: "capture",
      loc: city.loc,
      description: wasCrown
        ? `${UNIT_ATTRIBUTES[attacker.type].article} captured a Crown City!`
        : `${UNIT_ATTRIBUTES[attacker.type].article} captured a city!`,
      data: { attackerOwner, oldOwner, cityId, wasCrown },
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

    // Handle crown city capture — vassalage, tribute, etc.
    if (wasCrown && oldOwnerId !== 0) {
      events.push(...handleCrownCapture(state, cityId, oldOwnerId, attackerOwner));
    }
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

  // Use tech-boosted strength for combat + crown defense bonus
  const attStrength = getEffectiveStrength(state, attacker);
  const defStrength = getEffectiveStrength(state, defender)
    + (state.kingdoms ? getCrownDefenseBonus(state, defender.owner, defender.loc) : 0);

  // Alternating combat rounds
  while (attacker.hits > 0 && defender.hits > 0) {
    if (gameRandom(state) < 0.5) {
      attacker.hits -= defStrength;
    } else {
      defender.hits -= attStrength;
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

/**
 * Bombard: ranged attack dealing damage without return fire.
 * Attacker stays in place. Each bombard shot costs 1 move.
 * Chebyshev distance must be > 1 and <= attackRange.
 */
export function bombardUnit(
  state: GameState,
  attacker: UnitState,
  defender: UnitState,
): TurnEvent[] {
  const events: TurnEvent[] = [];
  const attAttrs = UNIT_ATTRIBUTES[attacker.type];
  const defAttrs = UNIT_ATTRIBUTES[defender.type];

  const attStrength = getEffectiveStrength(state, attacker);
  defender.hits -= attStrength;

  if (defender.hits <= 0) {
    events.push({
      type: "combat",
      loc: defender.loc,
      description: `${attAttrs.article} bombarded and destroyed ${defAttrs.article}`,
      data: {
        winnerId: attacker.id,
        loserId: defender.id,
        winnerType: attacker.type,
        loserType: defender.type,
        bombard: true,
      },
    });
    events.push(...killUnit(state, defender.id));
  } else {
    events.push({
      type: "combat",
      loc: defender.loc,
      description: `${attAttrs.article} bombarded ${defAttrs.article} (${defender.hits} HP left)`,
      data: {
        attackerId: attacker.id,
        defenderId: defender.id,
        attackerType: attacker.type,
        defenderType: defender.type,
        bombard: true,
        remainingHp: defender.hits,
      },
    });
  }

  // Bombard costs 1 move point
  attacker.moved += 1;
  return events;
}

/** Chebyshev distance between two locations. */
export function chebyshevDist(state: GameState, locA: Loc, locB: Loc): number {
  const rowA = locRow(locA);
  const colA = locCol(locA);
  const rowB = locRow(locB);
  const colB = locCol(locB);
  return Math.max(Math.abs(rowA - rowB), Math.abs(colA - colB));
}

/** Check if a unit can bombard a target location. */
export function canBombard(
  state: GameState,
  unit: UnitState,
  targetLoc: Loc,
): boolean {
  const attrs = UNIT_ATTRIBUTES[unit.type];
  if (attrs.attackRange <= 0) return false;
  if (unit.moved >= objMoves(unit)) return false;
  const d = chebyshevDist(state, unit.loc, targetLoc);
  return d > 1 && d <= attrs.attackRange;
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
 * Set a city's production type. Applies a retooling penalty if switching.
 * Penalty is 20% of build time, capped at 3 turns max to prevent paralysis
 * on long builds (e.g., Transport costs -3, not -6).
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
    city.work = -Math.min(Math.floor(UNIT_ATTRIBUTES[unitType].buildTime / 5), 3);
  }
}

/**
 * Tick city production for a given owner.
 * Resources are consumed when production starts (work transitions from <=0 to 1).
 * If the player can't afford the unit, the city stalls with a "stall" event.
 * Cities that complete production spawn a unit and reset work.
 * Returns production events.
 */
export function tickCityProduction(
  state: GameState,
  owner: Owner,
): TurnEvent[] {
  const events: TurnEvent[] = [];
  const res = state.resources[owner];

  for (const city of state.cities) {
    if (city.owner !== owner) continue;

    // Retooling: negative work just ticks toward 0, no resource check needed
    if (city.work < 0) {
      city.work += 1;
      continue;
    }

    // At work === 0, city is about to start production — check resources
    if (city.work === 0) {
      const cost = UNIT_COSTS[city.production];
      if (!canAffordUnit(res, city.production)) {
        // Stall — don't advance work
        events.push({
          type: "stall",
          loc: city.loc,
          description: `City stalled: insufficient resources for ${UNIT_ATTRIBUTES[city.production].article}`,
          data: { cityId: city.id, unitType: city.production },
        });
        continue;
      }
      // Consume resources when production starts (work goes from 0 to 1)
      for (let i = 0; i < NUM_RESOURCE_TYPES; i++) {
        res[i] -= cost[i];
      }
    }

    city.work += 1;

    // Crown city production bonus: +50% speed via bonus work tick every 2nd turn
    if (state.kingdoms && hasCrownProductionBonus(state, city.id) && state.turn % 2 === 0) {
      city.work += 1;
    }

    // VIP production bonus: 10% faster builds (reduced buildTime)
    const isVip = state.vipPlayers?.includes(owner) ?? false;
    const baseBuildTime = UNIT_ATTRIBUTES[city.production].buildTime;
    const buildTime = isVip ? Math.max(1, Math.floor(baseBuildTime * 0.9)) : baseBuildTime;
    if (city.work >= buildTime) {
      // Produce the unit with city's default behavior for this type
      const unit = createUnit(state, city.production, owner, city.loc);
      const cityBehavior = city.func[city.production];
      if (cityBehavior !== UnitBehavior.None) {
        unit.func = cityBehavior;
      }
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
 * Collect resource income from completed deposit buildings.
 * Each completed building on a deposit owned by this player generates income per turn.
 */
export function collectResourceIncome(
  state: GameState,
  owner: Owner,
): TurnEvent[] {
  const events: TurnEvent[] = [];
  const res = state.resources[owner];
  let totalIncome = [0, 0, 0];

  // Passive income: each owned city generates a small baseline
  for (const city of state.cities) {
    if (city.owner !== owner) continue;
    for (let i = 0; i < NUM_RESOURCE_TYPES; i++) {
      res[i] += CITY_INCOME[i];
      totalIncome[i] += CITY_INCOME[i];
    }
  }

  // Deposit income: completed buildings on owned deposits
  for (const deposit of state.deposits) {
    if (deposit.owner !== owner) continue;
    if (!deposit.buildingComplete) continue;

    const resourceIdx = DEPOSIT_RESOURCE[deposit.type];
    res[resourceIdx] += DEPOSIT_INCOME;
    totalIncome[resourceIdx] += DEPOSIT_INCOME;
  }

  const hasIncome = totalIncome[0] > 0 || totalIncome[1] > 0 || totalIncome[2] > 0;
  if (hasIncome) {
    const parts: string[] = [];
    if (totalIncome[0] > 0) parts.push(`+${totalIncome[0]} ore`);
    if (totalIncome[1] > 0) parts.push(`+${totalIncome[1]} oil`);
    if (totalIncome[2] > 0) parts.push(`+${totalIncome[2]} textile`);
    events.push({
      type: "income",
      loc: 0,
      description: `Resource income: ${parts.join(", ")}`,
      data: { ore: totalIncome[0], oil: totalIncome[1], textile: totalIncome[2] },
    });
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
  const levels = getPlayerTechLevels(state, owner);
  const healthLevel = levels[1]; // Health tech level
  const healAtSea = techShipsHealAtSea(healthLevel);

  for (const unit of state.units) {
    if (unit.owner !== owner) continue;
    if (movedUnitIds.has(unit.id)) continue;

    const attrs = UNIT_ATTRIBUTES[unit.type];
    // Only ships (not army, not fighter, not satellite, not construction)
    if (
      unit.type === UnitType.Army ||
      unit.type === UnitType.Fighter ||
      unit.type === UnitType.Satellite ||
      unit.type === UnitType.Construction
    ) continue;

    // Must be damaged (use effective max HP)
    const effectiveMax = getEffectiveMaxHp(state, unit);
    if (unit.hits >= effectiveMax) continue;

    const cell = state.map[unit.loc];
    const inOwnCity = cell.cityId !== null && state.cities[cell.cityId].owner === owner;

    if (inOwnCity) {
      // Heal in port: use tech city heal rate + crown heal bonus
      const crownHeal = state.kingdoms ? getCrownHealBonus(state, owner, unit.loc) : 0;
      unit.hits = Math.min(unit.hits + techCityHealRate(healthLevel) + crownHeal, effectiveMax);
    } else if (healAtSea) {
      // Health 4: ships heal 1 HP/turn at sea
      unit.hits = Math.min(unit.hits + 1, effectiveMax);
    }
  }
}

// ─── Construction & Buildings ────────────────────────────────────────────────────

/**
 * Start building on a deposit. Construction unit must be at the deposit's location.
 * Resources are consumed immediately. Returns events.
 */
export function startBuildOnDeposit(
  state: GameState,
  constructorId: number,
): TurnEvent[] {
  const unit = findUnit(state, constructorId);
  if (!unit || unit.type !== UnitType.Construction) return [];

  const cell = state.map[unit.loc];
  if (cell.depositId === null) return [];

  const deposit = state.deposits[cell.depositId];
  if (deposit.buildingComplete || deposit.buildingId !== null) return [];

  const buildingType = depositToBuildingType(deposit.type);
  const attrs = BUILDING_ATTRIBUTES[buildingType];
  const cost = attrs.cost;
  const res = state.resources[unit.owner];

  if (!canAffordBuilding(res, buildingType, 1)) return [];

  // Consume resources
  for (let i = 0; i < NUM_RESOURCE_TYPES; i++) {
    res[i] -= cost[i];
  }

  // Create building
  const building: BuildingState = {
    id: state.nextBuildingId++,
    loc: unit.loc,
    type: buildingType,
    owner: unit.owner,
    level: 1,
    work: 0,
    buildTime: attrs.buildTime,
    complete: false,
    constructorId: unit.id,
    hp: 0,
  };
  state.buildings.push(building);
  deposit.buildingId = building.id;
  deposit.owner = unit.owner;

  return [{
    type: "building",
    loc: unit.loc,
    description: `Construction started: ${attrs.name}`,
    data: { buildingId: building.id, buildingType, constructorId: unit.id },
  }];
}

/**
 * Start building a city upgrade. Construction unit must be at the city's location.
 * Resources are consumed immediately. Returns events.
 */
export function startBuildCityUpgrade(
  state: GameState,
  constructorId: number,
  cityId: number,
  buildingType: BuildingType,
): TurnEvent[] {
  const unit = findUnit(state, constructorId);
  if (!unit || unit.type !== UnitType.Construction) return [];

  const city = state.cities.find((c) => c.id === cityId);
  if (!city || city.owner !== unit.owner || city.loc !== unit.loc) return [];

  if (!isCityUpgradeType(buildingType)) return [];

  // Check for existing building of same type — upgrade it
  const existingBId = city.upgradeIds.find((bid) => {
    const b = state.buildings.find((building) => building.id === bid);
    return b && b.type === buildingType && b.complete && b.level < 3;
  });

  if (existingBId !== undefined) {
    // Upgrade existing building
    const existing = state.buildings.find((b) => b.id === existingBId)!;
    const newLevel = existing.level + 1;
    const cost = getBuildingCost(buildingType, newLevel);
    const res = state.resources[unit.owner];

    if (!canAffordBuilding(res, buildingType, newLevel)) return [];

    for (let i = 0; i < NUM_RESOURCE_TYPES; i++) {
      res[i] -= cost[i];
    }

    existing.work = 0;
    existing.buildTime = getBuildingTime(buildingType, newLevel);
    existing.complete = false;
    existing.constructorId = unit.id;
    existing.level = newLevel;

    return [{
      type: "building",
      loc: unit.loc,
      description: `Upgrade started: ${BUILDING_ATTRIBUTES[buildingType].name} Lv${newLevel}`,
      data: { buildingId: existing.id, buildingType, level: newLevel, constructorId: unit.id },
    }];
  }

  // New building — check for slot
  if (!cityHasUpgradeSlot(city.upgradeIds)) return [];
  if (cityHasUpgradeType(city.upgradeIds, state.buildings, buildingType)) return [];

  const cost = getBuildingCost(buildingType, 1);
  const res = state.resources[unit.owner];
  if (!canAffordBuilding(res, buildingType, 1)) return [];

  for (let i = 0; i < NUM_RESOURCE_TYPES; i++) {
    res[i] -= cost[i];
  }

  const building: BuildingState = {
    id: state.nextBuildingId++,
    loc: city.loc,
    type: buildingType,
    owner: unit.owner,
    level: 1,
    work: 0,
    buildTime: BUILDING_ATTRIBUTES[buildingType].buildTime,
    complete: false,
    constructorId: unit.id,
    hp: 0,
  };
  state.buildings.push(building);
  city.upgradeIds.push(building.id);

  return [{
    type: "building",
    loc: unit.loc,
    description: `Construction started: ${BUILDING_ATTRIBUTES[buildingType].name}`,
    data: { buildingId: building.id, buildingType, constructorId: unit.id },
  }];
}

/**
 * Tick building construction for all buildings.
 * Advances work by 1 for each building with an active constructor.
 * On completion: deposit buildings mark buildingComplete=true, constructor is consumed.
 */
export function tickBuildingConstruction(state: GameState): TurnEvent[] {
  const events: TurnEvent[] = [];

  for (const building of state.buildings) {
    if (building.complete) continue;
    if (building.constructorId === null) continue;

    // Verify constructor still alive and at building location
    const constructor = findUnit(state, building.constructorId);
    if (!constructor || constructor.loc !== building.loc) {
      building.constructorId = null;
      continue;
    }

    building.work += 1;

    if (building.work >= building.buildTime) {
      building.complete = true;
      building.constructorId = null;

      // Mark deposit as complete if this is a deposit building
      const attrs = BUILDING_ATTRIBUTES[building.type];
      if (attrs.isDepositBuilding) {
        const cell = state.map[building.loc];
        if (cell.depositId !== null) {
          state.deposits[cell.depositId].buildingComplete = true;
        }
      }

      events.push({
        type: "building",
        loc: building.loc,
        description: `${attrs.name}${building.level > 1 ? ` Lv${building.level}` : ""} completed`,
        data: { buildingId: building.id, buildingType: building.type, owner: building.owner },
      });

      // Consume (destroy) the construction unit
      events.push(...killUnit(state, constructor.id));
    }
  }

  return events;
}

/**
 * Start building a defensive/naval structure.
 * Construction unit builds defensive structures on land.
 * Engineer Boat builds naval structures on water.
 * Resources are consumed immediately. Returns events.
 */
export function startBuildStructure(
  state: GameState,
  constructorId: number,
  buildingType: BuildingType,
): TurnEvent[] {
  const unit = findUnit(state, constructorId);
  if (!unit) return [];

  const attrs = BUILDING_ATTRIBUTES[buildingType];
  const cell = state.map[unit.loc];

  // Validate builder type vs structure type
  if (attrs.isDefensiveStructure) {
    if (unit.type !== UnitType.Construction) return [];
    // Must be on land (not water, not city)
    if (cell.terrain !== TerrainType.Land) return [];
    // No other structure already at this location
    if (state.buildings.some((b) => b.loc === unit.loc && isStructureType(b.type))) return [];
  } else if (attrs.isNavalStructure) {
    if (unit.type !== UnitType.EngineerBoat) return [];
    // Must be on water
    if (cell.terrain !== TerrainType.Sea) return [];
    // No other structure already at this location
    if (state.buildings.some((b) => b.loc === unit.loc && isStructureType(b.type))) return [];
  } else {
    return []; // not a structure type
  }

  // Tech gating
  if (!canBuildStructure(state, unit.owner, buildingType)) return [];

  // Check affordability
  const res = state.resources[unit.owner];
  if (!canAffordBuilding(res, buildingType, 1)) return [];

  // Consume resources
  for (let i = 0; i < NUM_RESOURCE_TYPES; i++) {
    res[i] -= attrs.cost[i];
  }

  // Create building
  const building: BuildingState = {
    id: state.nextBuildingId++,
    loc: unit.loc,
    type: buildingType,
    owner: unit.owner,
    level: 1,
    work: 0,
    buildTime: attrs.buildTime,
    complete: false,
    constructorId: unit.id,
    hp: attrs.maxHp,
  };
  state.buildings.push(building);

  return [{
    type: "building",
    loc: unit.loc,
    description: `Construction started: ${attrs.name}`,
    data: { buildingId: building.id, buildingType, constructorId: unit.id },
  }];
}

/**
 * Collect tech research from completed city upgrade buildings.
 * Each building with techOutput generates points per turn based on level.
 */
export function collectTechResearch(state: GameState, owner: Owner): void {
  const tech = state.techResearch[owner];

  for (const building of state.buildings) {
    if (building.owner !== owner) continue;
    if (!building.complete) continue;

    const attrs = BUILDING_ATTRIBUTES[building.type];
    if (attrs.techOutput === null) continue;

    tech[attrs.techOutput] += getBuildingTechOutput(building.type, building.level);
  }
}

// ─── Turn Execution ─────────────────────────────────────────────────────────────

/**
 * Check end-game conditions.
 * Returns winner and win type, or null if game continues.
 */
export function checkEndGame(
  state: GameState,
): { winner: number; winType: "elimination" | "resignation" } | null {
  const activePlayers = state.players.filter(p => p.status === "active");
  if (activePlayers.length <= 1) {
    // Last player standing wins
    if (activePlayers.length === 1) {
      return { winner: activePlayers[0].id, winType: "elimination" };
    }
    return null; // no players (shouldn't happen)
  }

  // Count cities and armies per active player
  const cityCounts = new Map<number, number>();
  const armyCounts = new Map<number, number>();
  for (const p of activePlayers) {
    cityCounts.set(p.id, 0);
    armyCounts.set(p.id, 0);
  }

  for (const city of state.cities) {
    if (cityCounts.has(city.owner)) {
      cityCounts.set(city.owner, cityCounts.get(city.owner)! + 1);
    }
  }

  for (const unit of state.units) {
    if (unit.type === UnitType.Army && armyCounts.has(unit.owner)) {
      armyCounts.set(unit.owner, armyCounts.get(unit.owner)! + 1);
    }
  }

  // Check for eliminated players (0 cities AND 0 armies)
  const eliminated: typeof activePlayers = [];
  for (const p of activePlayers) {
    const cities = cityCounts.get(p.id)!;
    const armies = armyCounts.get(p.id)!;
    if (cities === 0 && armies === 0) {
      eliminated.push(p);
    }
  }

  // Don't eliminate everyone at once — if all would be eliminated, it's a draw (no winner)
  if (eliminated.length > 0 && eliminated.length < activePlayers.length) {
    for (const p of eliminated) {
      p.status = "defeated";
    }
  } else if (eliminated.length === activePlayers.length) {
    // All players eliminated simultaneously — shouldn't happen but handle gracefully
    return null;
  }

  // Check if only one active player remains after eliminations
  const remaining = state.players.filter(p => p.status === "active");
  if (remaining.length === 1) {
    return { winner: remaining[0].id, winType: "elimination" };
  }
  if (remaining.length === 0) return null;

  // 3:1 resignation: strongest player dominates all others combined
  // (Only in 2-player for now; N-player uses individual surrender via AI)
  if (remaining.length === 2) {
    const [a, b] = remaining;
    const aCities = cityCounts.get(a.id) ?? 0;
    const bCities = cityCounts.get(b.id) ?? 0;
    const aArmies = armyCounts.get(a.id) ?? 0;
    const bArmies = armyCounts.get(b.id) ?? 0;

    if (bCities > 0 && aCities > bCities * 3 && aArmies > bArmies * 3) {
      return { winner: a.id, winType: "resignation" };
    }
    if (aCities > 0 && bCities > aCities * 3 && bArmies > aArmies * 3) {
      return { winner: b.id, winType: "resignation" };
    }
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
      // Check for mine triggers at destination
      if (findUnit(state, action.unitId)) {
        events.push(...checkMineTrigger(state, unit));
      }
      break;
    }

    case "attack": {
      const unit = findUnit(state, action.unitId);
      if (!unit || unit.owner !== owner) break;
      // Ranged-only units (Artillery) cannot melee — must use bombard action
      if (UNIT_ATTRIBUTES[unit.type].attackRange > 0 && unit.type === UnitType.Artillery) break;
      // Non-combat units (AWACS, EngineerBoat, Construction, Satellite) cannot attack
      if (UNIT_ATTRIBUTES[unit.type].strength === 0) break;

      // Check if target is a city
      const cell = state.map[action.targetLoc];
      if (cell.cityId !== null) {
        const city = state.cities[cell.cityId];
        if (city.owner !== owner) {
          // Shield check: shielded player's city cannot be attacked
          if (isShielded(state, city.owner as number)) break;
          events.push(...attackCity(state, unit, cell.cityId));
          break;
        }
      }

      // Check for enemy unit at target
      const defender = state.units.find(
        (u) => u.loc === action.targetLoc && u.owner !== owner && u.shipId === null,
      );
      if (defender) {
        // Shield check: shielded player's units cannot be attacked
        if (isShielded(state, defender.owner as number)) break;
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
      if (action.behavior !== UnitBehavior.GoTo) {
        unit.targetLoc = null;
      }
      break;
    }

    case "setTarget": {
      const unit = findUnit(state, action.unitId);
      if (!unit || unit.owner !== owner) break;
      unit.targetLoc = action.targetLoc;
      unit.func = UnitBehavior.GoTo;
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

    case "buildOnDeposit": {
      const unit = findUnit(state, action.unitId);
      if (!unit || unit.owner !== owner) break;
      if (unit.type !== UnitType.Construction) break;
      events.push(...startBuildOnDeposit(state, action.unitId));
      break;
    }

    case "buildCityUpgrade": {
      const unit = findUnit(state, action.unitId);
      if (!unit || unit.owner !== owner) break;
      if (unit.type !== UnitType.Construction) break;
      events.push(...startBuildCityUpgrade(state, action.unitId, action.cityId, action.buildingType));
      break;
    }

    case "buildStructure": {
      const unit = findUnit(state, action.unitId);
      if (!unit || unit.owner !== owner) break;
      // Construction builds defensive structures, EngineerBoat builds naval structures
      if (unit.type !== UnitType.Construction && unit.type !== UnitType.EngineerBoat) break;
      events.push(...startBuildStructure(state, action.unitId, action.buildingType));
      break;
    }

    case "bombard": {
      const unit = findUnit(state, action.unitId);
      if (!unit || unit.owner !== owner) break;
      if (!canBombard(state, unit, action.targetLoc)) break;

      // Find enemy unit at target (topmost non-embarked unit)
      const target = state.units.find(
        (u) => u.loc === action.targetLoc && u.owner !== owner && u.shipId === null,
      );
      if (target) {
        // Shield check: shielded player's units cannot be bombarded
        if (isShielded(state, target.owner as number)) break;
        events.push(...bombardUnit(state, unit, target));
      }
      // Also check for enemy structure at target
      if (!target) {
        const targetBuilding = state.buildings.find(
          (b) => b.loc === action.targetLoc && b.owner !== owner && b.complete &&
          isStructureType(b.type),
        );
        if (targetBuilding) {
          // Shield check: shielded player's structures cannot be bombarded
          if (isShielded(state, targetBuilding.owner as number)) break;
          events.push(...bombardStructure(state, unit, targetBuilding));
        }
      }
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

// ─── Unit Behavior Processing ─────────────────────────────────────────────────

/**
 * Get the explore MoveInfo for a given unit type.
 * Armies also target enemy/unowned cities while exploring.
 */
function getExploreMoveInfo(unitType: UnitType) {
  const defaultWeights = new Map([[" ", 1]]);
  switch (unitType) {
    case UnitType.Army:
      // Armies explore + seek unowned cities (*) and enemy cities (X)
      // Low weights = high priority: cities strongly preferred over raw exploration
      return landMoveInfo("*X ", new Map([["*", 1], ["X", 1], [" ", 8]]));
    case UnitType.Fighter:
      return airMoveInfo(" ", defaultWeights);
    case UnitType.Patrol:
    case UnitType.Destroyer:
    case UnitType.Submarine:
    case UnitType.Battleship:
    case UnitType.Carrier:
    case UnitType.Transport:
      return waterMoveInfo(" ", defaultWeights);
    default:
      return null;
  }
}

/**
 * Fighter fuel management helper.
 * Returns "ok" if the fighter has enough fuel to keep going,
 * "return" if it needs to head back to base (and moves one step toward it),
 * or "stranded" if no path to base exists.
 * Fighters that reach range 0 are killed.
 */
function fighterFuelCheck(
  state: GameState,
  unit: UnitState,
  owner: Owner,
  events: TurnEvent[],
): "ok" | "return" | "stranded" {
  if (unit.type !== UnitType.Fighter && unit.type !== UnitType.AWACS) return "ok";

  // Kill fighter if fuel is exhausted
  if (unit.range <= 0) {
    events.push(...killUnit(state, unit.id));
    return "stranded";
  }

  // Find nearest own city distance
  let nearestCityDist = INFINITY;
  let nearestCityLoc: Loc = -1;
  for (const city of state.cities) {
    if (city.owner === owner) {
      const d = dist(unit.loc, city.loc);
      if (d < nearestCityDist) {
        nearestCityDist = d;
        nearestCityLoc = city.loc;
      }
    }
  }

  // If in a city and fuel isn't full, stop moving — refueling happens at end-of-turn.
  // Without this, the fighter explores away from the city in the same turn and misses refueling.
  if (nearestCityDist === 0) {
    const maxRange = UNIT_ATTRIBUTES[unit.type].range;
    if (unit.range < maxRange) return "stranded"; // stop to refuel
    return "ok";
  }

  // Safety margin: need enough range to fly back + 1 turn of speed buffer
  const speed = UNIT_ATTRIBUTES[unit.type].speed;
  if (unit.range > nearestCityDist + speed) return "ok";

  // Must return to base — fly directly toward nearest city
  if (nearestCityLoc >= 0) {
    const unitRow = locRow(unit.loc);
    const unitCol = locCol(unit.loc);
    const cityRow = locRow(nearestCityLoc);
    const cityCol = locCol(nearestCityLoc);
    const dr = Math.sign(cityRow - unitRow);
    const dc = Math.sign(cityCol - unitCol);
    const targetLoc = rowColLoc(unitRow + dr, unitCol + dc);
    if (targetLoc >= 0 && targetLoc < MAP_SIZE && goodLoc(state, unit, targetLoc)) {
      moveUnit(state, unit, targetLoc);
      scan(state, owner, unit.loc);
      return "return";
    }
  }

  // Fallback: BFS toward own city
  const viewMap = state.viewMaps[owner];
  const pathMap = createPathMap();
  const cityMoveInfo = airMoveInfo("O", new Map([["O", 1]]));
  const objective = findObjective(pathMap, viewMap, unit.loc, cityMoveInfo);
  if (objective !== null) {
    markPath(pathMap, objective);
    const dir = findDirection(pathMap, unit.loc);
    if (dir !== null) {
      const targetLoc = unit.loc + DIR_OFFSET[dir];
      if (targetLoc >= 0 && targetLoc < MAP_SIZE && goodLoc(state, unit, targetLoc)) {
        moveUnit(state, unit, targetLoc);
        scan(state, owner, unit.loc);
        return "return";
      }
    }
  }

  return "stranded";
}

/**
 * Smart move for behavior-driven units.
 * Checks for enemies and capturable cities at target before moving.
 * Returns events and whether the move was successful.
 */
function behaviorMove(
  state: GameState,
  unit: UnitState,
  targetLoc: Loc,
  owner: Owner,
): { events: TurnEvent[]; moved: boolean; died: boolean } {
  const events: TurnEvent[] = [];

  // Check for enemy units at target
  const enemy = state.units.find(
    (u) => u.loc === targetLoc && u.owner !== owner && u.shipId === null,
  );
  if (enemy) {
    events.push(...attackUnit(state, unit, enemy));
    return { events, moved: true, died: findUnit(state, unit.id) === undefined };
  }

  // Check for cities at target
  const cell = state.map[targetLoc];
  if (cell.cityId !== null) {
    const city = state.cities[cell.cityId];
    // Enemy city — attack it
    if (city.owner !== owner && city.owner !== Owner.Unowned) {
      events.push(...attackCity(state, unit, cell.cityId));
      return { events, moved: true, died: true }; // attacker always dies in city attack
    }
    // Unowned city — army captures it
    if (city.owner === Owner.Unowned && unit.type === UnitType.Army) {
      events.push(...attackCity(state, unit, cell.cityId));
      return { events, moved: true, died: true };
    }
  }

  // Normal move
  if (goodLoc(state, unit, targetLoc)) {
    moveUnit(state, unit, targetLoc);
    scan(state, owner, unit.loc);
    // Check for mine triggers at destination
    if (findUnit(state, unit.id)) {
      const mineEvents = checkMineTrigger(state, unit);
      events.push(...mineEvents);
      if (!findUnit(state, unit.id)) {
        return { events, moved: true, died: true };
      }
    }
    return { events, moved: true, died: false };
  }

  return { events, moved: false, died: false };
}

/**
 * Check if any enemy unit or city is visible in the sentry detection range
 * (adjacent tiles, matching the scan radius).
 */
function hasVisibleEnemyNearby(state: GameState, unit: UnitState, owner: Owner): boolean {
  const viewMap = state.viewMaps[owner];
  const adjacent = getAdjacentLocs(unit.loc);
  for (const adj of adjacent) {
    const contents = viewMap[adj].contents;
    // Lowercase letters = enemy units, X = enemy city
    if (contents === VM_ENEMY_CITY) return true;
    if (isEnemyUnit(contents)) return true;
  }
  return false;
}

/**
 * Count how many unseen tiles would be revealed by scanning from a location.
 * scan() reveals the location itself plus all 8 adjacent tiles (up to 9 tiles).
 */
function countNewTilesRevealed(viewMap: ViewMapCell[], loc: Loc): number {
  let count = 0;
  if (viewMap[loc].contents === VM_UNEXPLORED) count++;
  for (let d = 0; d < 8; d++) {
    const adj = loc + DIR_OFFSET[d];
    if (adj >= 0 && adj < MAP_SIZE && isOnBoard(adj)) {
      const colDiff = Math.abs(locCol(adj) - locCol(loc));
      if (colDiff <= 1 && viewMap[adj].contents === VM_UNEXPLORED) count++;
    }
  }
  return count;
}

/**
 * Move an army toward the nearest coastal land tile for transport pickup.
 * Uses BFS over land/city tiles to find a tile adjacent to water,
 * then moves the army one step along the path.
 */
function moveArmyTowardCoast(state: GameState, unit: UnitState): TurnEvent[] {
  const events: TurnEvent[] = [];

  // BFS over land to find the best coastal destination:
  // Priority 1: land tile adjacent to a non-full own transport (walk TO the transport)
  // Priority 2: any coastal land tile (general coast)
  const visited = new Uint8Array(MAP_SIZE);
  const parent = new Int32Array(MAP_SIZE).fill(-1);
  const queue: Loc[] = [unit.loc];
  visited[unit.loc] = 1;

  let transportCoastLoc: Loc = -1; // best: adjacent to an actual transport
  let anyCoastLoc: Loc = -1;       // fallback: any coast

  while (queue.length > 0 && transportCoastLoc === -1) {
    const loc = queue.shift()!;
    if (loc !== unit.loc && (state.map[loc].terrain === TerrainType.Land || state.map[loc].terrain === TerrainType.City)) {
      const adj = getAdjacentLocs(loc);
      for (const a of adj) {
        if (state.map[a].terrain === TerrainType.Sea) {
          // Check for a non-full own transport at this water tile
          const hasTransport = state.units.some(u =>
            u.owner === unit.owner && u.type === UnitType.Transport
            && u.loc === a && u.cargoIds.length < UNIT_ATTRIBUTES[u.type].capacity,
          );
          if (hasTransport) {
            transportCoastLoc = loc;
            break;
          }
          if (anyCoastLoc === -1) anyCoastLoc = loc;
        }
      }
      if (transportCoastLoc !== -1) break;
    }
    for (const a of getAdjacentLocs(loc)) {
      if (!visited[a] && (state.map[a].terrain === TerrainType.Land || state.map[a].terrain === TerrainType.City)) {
        visited[a] = 1;
        parent[a] = loc;
        queue.push(a);
      }
    }
  }

  const target = transportCoastLoc !== -1 ? transportCoastLoc : anyCoastLoc;
  if (target === -1) return events; // no coast reachable
  if (target === unit.loc) return events; // already there

  // Trace back to first step from unit's location
  let cur = target;
  while (parent[cur] !== unit.loc && parent[cur] !== -1) {
    cur = parent[cur];
  }
  const r = behaviorMove(state, unit, cur, unit.owner);
  events.push(...r.events);
  return events;
}

/**
 * Auto-move a unit in explore mode.
 * Air units: greedy — each step picks the adjacent tile that reveals the most unseen tiles.
 * Ground/sea units: BFS pathfind toward nearest unexplored territory.
 */
function exploreUnit(state: GameState, unit: UnitState, owner: Owner): TurnEvent[] {
  const events: TurnEvent[] = [];
  const viewMap = state.viewMaps[owner];
  const movesAvailable = objMoves(unit) - unit.moved;
  const isAirUnit = unit.type === UnitType.Fighter;

  for (let step = 0; step < movesAvailable; step++) {
    if (findUnit(state, unit.id) === undefined) break;

    // Fighter fuel management
    const fuelStatus = fighterFuelCheck(state, unit, owner, events);
    if (fuelStatus === "stranded") break;
    if (fuelStatus === "return") continue;

    // Non-fighter units: check for adjacent enemies and capturable cities
    // Fighters skip this — they're too fragile (1 HP) to auto-engage
    if (!isAirUnit) {
      const adjacent = getAdjacentLocs(unit.loc);
      let engaged = false;

      // Armies: stop exploring when adjacent to unowned/enemy cities
      // Unit gets func=None so turnFlow alerts the player (or AI picks it up next cycle)
      if (unit.type === UnitType.Army) {
        for (const adj of adjacent) {
          const cell = state.map[adj];
          if (cell.cityId !== null) {
            const city = state.cities[cell.cityId];
            if (city.owner !== owner) {
              unit.func = UnitBehavior.None;
              engaged = true;
              break;
            }
          }
        }
      }

      // Check for adjacent enemy units
      if (!engaged) {
        for (const adj of adjacent) {
          const enemy = state.units.find(
            (u) => u.loc === adj && u.owner !== owner && u.shipId === null,
          );
          if (enemy) {
            events.push(...attackUnit(state, unit, enemy));
            engaged = true;
            break;
          }
        }
      }
      if (engaged) break;
    }

    if (isAirUnit) {
      // Greedy: pick the adjacent tile that reveals the most unseen tiles
      let bestLoc: Loc = -1;
      let bestScore = 0;
      // Shuffle direction order with game RNG to break ties randomly
      const dirs = [0, 1, 2, 3, 4, 5, 6, 7];
      for (let i = dirs.length - 1; i > 0; i--) {
        const j = gameRandomInt(state, i + 1);
        [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
      }
      for (const d of dirs) {
        const adj = unit.loc + DIR_OFFSET[d];
        if (adj < 0 || adj >= MAP_SIZE || !isOnBoard(adj)) continue;
        const colDiff = Math.abs(locCol(adj) - locCol(unit.loc));
        if (colDiff > 1) continue;
        if (!goodLoc(state, unit, adj)) continue;
        const score = countNewTilesRevealed(viewMap, adj);
        if (score > bestScore) {
          bestScore = score;
          bestLoc = adj;
        }
      }

      if (bestLoc === -1 || bestScore === 0) {
        // No adjacent move reveals new tiles — use BFS to reach distant unseen area
        // Include own cities ('O') as low-priority targets for base-hopping
        const pathMap = createPathMap();
        const moveInfo = airMoveInfo(" O", new Map([[" ", 1], ["O", 11]]));
        const objective = findObjective(pathMap, viewMap, unit.loc, moveInfo);
        let bfsMoved = false;
        if (objective !== null) {
          markPath(pathMap, objective);
          const dir = findDirection(pathMap, unit.loc);
          if (dir !== null) {
            const targetLoc = unit.loc + DIR_OFFSET[dir];
            if (targetLoc >= 0 && targetLoc < MAP_SIZE) {
              const r = behaviorMove(state, unit, targetLoc, owner);
              events.push(...r.events);
              if (r.died) break;
              bfsMoved = r.moved;
            }
          }
        }
        if (!bfsMoved) {
          // BFS found nothing or couldn't move — fly toward furthest own city to reposition.
          // This enables base-hopping across the map to reach unexplored areas.
          let farthestCityLoc: Loc = -1;
          let farthestDist = 0;
          for (const city of state.cities) {
            if (city.owner === owner) {
              const d = dist(unit.loc, city.loc);
              if (d > farthestDist) {
                farthestDist = d;
                farthestCityLoc = city.loc;
              }
            }
          }
          if (farthestCityLoc >= 0 && farthestDist > 0) {
            const unitRow = locRow(unit.loc);
            const unitCol = locCol(unit.loc);
            const cityRow = locRow(farthestCityLoc);
            const cityCol = locCol(farthestCityLoc);
            const dr = Math.sign(cityRow - unitRow);
            const dc = Math.sign(cityCol - unitCol);
            const flyTarget = rowColLoc(unitRow + dr, unitCol + dc);
            if (flyTarget >= 0 && flyTarget < MAP_SIZE && goodLoc(state, unit, flyTarget)) {
              moveUnit(state, unit, flyTarget);
              scan(state, owner, unit.loc);
              continue;
            }
          }
          break;
        }
      } else {
        const r = behaviorMove(state, unit, bestLoc, owner);
        events.push(...r.events);
        if (r.died) break;
      }
    } else {
      // Ground/sea explore: BFS pathfind toward nearest unexplored or city
      const moveInfo = getExploreMoveInfo(unit.type);
      if (!moveInfo) break;

      const pathMap = createPathMap();
      const objective = findObjective(pathMap, viewMap, unit.loc, moveInfo);
      if (objective === null) {
        // Nothing reachable to explore
        if (unit.type === UnitType.Army) {
          // Check if this army is on an enemy continent (has enemy/unowned cities, no own cities).
          // If so, stay Aggressive — don't request transport pickup from enemy territory.
          const continent = mapContinent(viewMap, unit.loc, ".");
          const owner = state.map[unit.loc].terrain === TerrainType.City
            ? state.cities.find(c => c.loc === unit.loc)?.owner : undefined;
          let hasOwnCity = false;
          let hasEnemyCity = false;
          for (const loc of continent) {
            const cell = viewMap[loc];
            if (cell.contents === VM_OWN_CITY) hasOwnCity = true;
            if (cell.contents === VM_ENEMY_CITY || cell.contents === VM_UNOWNED_CITY) hasEnemyCity = true;
          }
          if (!hasOwnCity && hasEnemyCity) {
            // On enemy continent — stay aggressive, don't request transport
            unit.func = UnitBehavior.Aggressive;
          } else {
            // Home/neutral island — wait for transport pickup
            unit.func = UnitBehavior.WaitForTransport;
            events.push(...moveArmyTowardCoast(state, unit));
          }
        } else {
          unit.func = UnitBehavior.None;
        }
        break;
      }

      markPath(pathMap, objective);
      const dir = findDirection(pathMap, unit.loc);
      if (dir === null) break;

      const targetLoc = unit.loc + DIR_OFFSET[dir];
      if (targetLoc < 0 || targetLoc >= MAP_SIZE) break;

      const r = behaviorMove(state, unit, targetLoc, owner);
      events.push(...r.events);
      if (!r.moved || r.died) break;
    }
  }

  return events;
}

/**
 * Auto-move a unit toward its targetLoc waypoint using pathfinding.
 * Clears waypoint and resets behavior when reached.
 */
function goToUnit(state: GameState, unit: UnitState, owner: Owner): TurnEvent[] {
  const events: TurnEvent[] = [];
  const viewMap = state.viewMaps[owner];
  const movesAvailable = objMoves(unit) - unit.moved;
  if (unit.targetLoc === null) {
    unit.func = UnitBehavior.None;
    return events;
  }

  for (let step = 0; step < movesAvailable; step++) {
    if (findUnit(state, unit.id) === undefined) break;
    if (unit.targetLoc === null) break;

    // Fighter fuel management
    const fuelStatus = fighterFuelCheck(state, unit, owner, events);
    if (fuelStatus === "stranded") break;
    if (fuelStatus === "return") continue;

    // Reached target?
    if (unit.loc === unit.targetLoc) {
      unit.func = UnitBehavior.None;
      unit.targetLoc = null;
      break;
    }

    // Get the right MoveInfo for this unit's terrain type
    const moveInfo = getExploreMoveInfo(unit.type);
    if (!moveInfo) break;

    // BFS from unit toward the target — use targetLoc's viewMap char as objective
    // We create a custom MoveInfo that targets the destination
    const targetContents = viewMap[unit.targetLoc].contents;
    const gotoMoveInfo = {
      canMove: moveInfo.canMove,
      objectives: targetContents + "+. OX*",  // target + traversable tiles near it
      weights: new Map([[targetContents, 1], ["+", 100], [".", 100], [" ", 100],
        ["O", 1], ["X", 1], ["*", 1]]),
    };

    const pathMap = createPathMap();
    const objective = findObjective(pathMap, viewMap, unit.loc, gotoMoveInfo);
    if (objective === null) {
      // Can't reach — cancel
      unit.func = UnitBehavior.None;
      unit.targetLoc = null;
      break;
    }

    markPath(pathMap, objective);
    const dir = findDirection(pathMap, unit.loc);
    if (dir === null) break;

    const targetLoc = unit.loc + DIR_OFFSET[dir];
    if (targetLoc < 0 || targetLoc >= MAP_SIZE) break;

    const r = behaviorMove(state, unit, targetLoc, owner);
    events.push(...r.events);
    if (!r.moved || r.died) break;
  }

  return events;
}

/**
 * Aggressive behavior: seek out and attack enemies.
 * Uses pathfinding to find nearest enemy unit or city, moves toward it.
 */
function aggressiveUnit(state: GameState, unit: UnitState, owner: Owner): TurnEvent[] {
  const events: TurnEvent[] = [];
  const viewMap = state.viewMaps[owner];
  const movesAvailable = objMoves(unit) - unit.moved;
  const isAirUnit = unit.type === UnitType.Fighter;

  for (let step = 0; step < movesAvailable; step++) {
    if (findUnit(state, unit.id) === undefined) break;

    // Fighter fuel management
    const fuelStatus = fighterFuelCheck(state, unit, owner, events);
    if (fuelStatus === "stranded") break;
    if (fuelStatus === "return") continue;

    // Check for adjacent enemies — attack immediately
    const adjacent = getAdjacentLocs(unit.loc);
    let attacked = false;
    let waitingAtCity = false;
    for (const adj of adjacent) {
      const enemy = state.units.find(
        (u) => u.loc === adj && u.owner !== owner && u.shipId === null,
      );
      if (enemy) {
        events.push(...attackUnit(state, unit, enemy));
        attacked = true;
        break;
      }
      // Attack cities — but for enemy cities, wait for 2+ friendly armies nearby
      const cell = state.map[adj];
      if (cell.cityId !== null) {
        const city = state.cities[cell.cityId];
        if (city.owner !== owner && city.owner !== Owner.Unowned) {
          // Count friendly armies within 2 tiles of the city
          const nearbyAllies = state.units.filter(u =>
            u.owner === owner && u.type === UnitType.Army &&
            u.id !== unit.id && dist(u.loc, city.loc) <= 2,
          ).length;
          if (nearbyAllies >= 1) {
            // 2+ armies (self + ally), attack!
            events.push(...attackCity(state, unit, cell.cityId));
            attacked = true;
          } else {
            // Wait for reinforcements — hold position near city
            waitingAtCity = true;
          }
          break;
        }
        if (city.owner === Owner.Unowned && unit.type === UnitType.Army) {
          events.push(...attackCity(state, unit, cell.cityId));
          attacked = true;
          break;
        }
      }
    }
    if (attacked || waitingAtCity) break;

    // Pathfind toward enemies: lowercase = enemy units, X = enemy city, * = unowned city
    const enemyTargets = unit.type === UnitType.Army
      ? "Xatcfbsdp* "   // armies also target unowned cities, then explore
      : "Xatcfbsdp ";
    const enemyWeights = new Map([
      ["X", 1], ["a", 2], ["t", 2], ["c", 3], ["f", 3],
      ["b", 3], ["s", 3], ["d", 3], ["p", 3], ["*", 4], [" ", 15],
    ]);

    const moveInfoBase = getExploreMoveInfo(unit.type);
    if (!moveInfoBase) break;

    const aggroMoveInfo = {
      canMove: moveInfoBase.canMove,
      objectives: enemyTargets,
      weights: enemyWeights,
    };

    const pathMap = createPathMap();
    const objective = findObjective(pathMap, viewMap, unit.loc, aggroMoveInfo);
    if (objective === null) {
      unit.func = UnitBehavior.None;
      break;
    }

    markPath(pathMap, objective);
    const dir = findDirection(pathMap, unit.loc);
    if (dir === null) break;

    const targetLoc = unit.loc + DIR_OFFSET[dir];
    if (targetLoc < 0 || targetLoc >= MAP_SIZE) break;

    const r = behaviorMove(state, unit, targetLoc, owner);
    events.push(...r.events);
    if (!r.moved || r.died) break;
  }

  return events;
}

/**
 * Cautious behavior: explore but avoid enemies.
 * Moves toward unexplored territory but flees if enemies are adjacent.
 */
function cautiousUnit(state: GameState, unit: UnitState, owner: Owner): TurnEvent[] {
  const events: TurnEvent[] = [];
  const viewMap = state.viewMaps[owner];
  const movesAvailable = objMoves(unit) - unit.moved;

  for (let step = 0; step < movesAvailable; step++) {
    if (findUnit(state, unit.id) === undefined) break;

    // Fighter fuel management
    const fuelStatus = fighterFuelCheck(state, unit, owner, events);
    if (fuelStatus === "stranded") break;
    if (fuelStatus === "return") continue;

    // Check for adjacent enemies — flee away from them
    const adjacent = getAdjacentLocs(unit.loc);
    let nearestEnemyLoc: Loc | null = null;
    let nearestEnemyDist = INFINITY;
    for (const adj of adjacent) {
      const enemy = state.units.find(
        (u) => u.loc === adj && u.owner !== owner && u.shipId === null,
      );
      if (enemy) {
        const d = dist(unit.loc, adj);
        if (d < nearestEnemyDist) {
          nearestEnemyDist = d;
          nearestEnemyLoc = adj;
        }
      }
    }

    if (nearestEnemyLoc !== null) {
      // Flee: move to the adjacent tile furthest from the enemy
      let bestFleeLoc: Loc = -1;
      let bestFleeDist = -1;
      for (const adj of adjacent) {
        if (!goodLoc(state, unit, adj)) continue;
        // Don't flee into other enemies
        const hasEnemy = state.units.some(
          (u) => u.loc === adj && u.owner !== owner && u.shipId === null,
        );
        if (hasEnemy) continue;
        const d = dist(adj, nearestEnemyLoc);
        if (d > bestFleeDist) {
          bestFleeDist = d;
          bestFleeLoc = adj;
        }
      }
      if (bestFleeLoc !== -1) {
        const r = behaviorMove(state, unit, bestFleeLoc, owner);
        events.push(...r.events);
        if (r.died) break;
        continue;
      }
      break; // cornered
    }

    // No enemies nearby — explore normally (same as explore behavior)
    const moveInfo = getExploreMoveInfo(unit.type);
    if (!moveInfo) break;

    const pathMap = createPathMap();
    const objective = findObjective(pathMap, viewMap, unit.loc, moveInfo);
    if (objective === null) {
      unit.func = UnitBehavior.None;
      break;
    }

    markPath(pathMap, objective);
    const dir = findDirection(pathMap, unit.loc);
    if (dir === null) break;

    const targetLoc = unit.loc + DIR_OFFSET[dir];
    if (targetLoc < 0 || targetLoc >= MAP_SIZE) break;

    const r = behaviorMove(state, unit, targetLoc, owner);
    events.push(...r.events);
    if (!r.moved || r.died) break;
  }

  return events;
}

/**
 * Process automatic behaviors for a player's units.
 * Called during executeTurn after explicit player actions.
 */
export function processUnitBehaviors(
  state: GameState,
  owner: Owner,
  movedUnits: Set<number>,
): TurnEvent[] {
  const events: TurnEvent[] = [];

  // Iterate over a snapshot since units can die during processing
  const units = [...state.units];
  for (const unit of units) {
    if (unit.owner !== owner) continue;
    if (unit.shipId !== null) continue;
    if (movedUnits.has(unit.id)) continue;
    if (unit.type === UnitType.Satellite) continue;
    if (findUnit(state, unit.id) === undefined) continue;
    // Skip construction units that are actively building
    if (unit.type === UnitType.Construction) {
      const isBuilding = state.buildings.some(
        (b) => b.constructorId === unit.id && !b.complete,
      );
      if (isBuilding) continue;
    }

    switch (unit.func) {
      case UnitBehavior.Sentry:
        if (hasVisibleEnemyNearby(state, unit, owner)) {
          unit.func = UnitBehavior.None;
        }
        break;

      case UnitBehavior.Explore:
        events.push(...exploreUnit(state, unit, owner));
        break;

      case UnitBehavior.GoTo:
        events.push(...goToUnit(state, unit, owner));
        break;

      case UnitBehavior.Aggressive:
        events.push(...aggressiveUnit(state, unit, owner));
        break;

      case UnitBehavior.Cautious:
        events.push(...cautiousUnit(state, unit, owner));
        break;

      case UnitBehavior.WaitForTransport: {
        // Check if new territory has been revealed — switch back to explore
        const exploreInfo = getExploreMoveInfo(unit.type);
        if (exploreInfo) {
          const pm = createPathMap();
          const obj = findObjective(pm, state.viewMaps[owner], unit.loc, exploreInfo);
          if (obj !== null) {
            unit.func = UnitBehavior.Explore;
            events.push(...exploreUnit(state, unit, owner));
            break;
          }
        }
        // Keep moving toward coast if not there yet; otherwise just wait
        events.push(...moveArmyTowardCoast(state, unit));
        break;
      }
    }
  }

  return events;
}

export function executeTurn(
  state: GameState,
  allActions: Map<number, PlayerAction[]>,
): TurnResult {
  const events: TurnEvent[] = [];
  const movedUnitsMap = new Map<number, Set<number>>();
  const activePlayers = state.players.filter(p => p.status === "active");

  // Check for resignations
  for (const player of activePlayers) {
    const actions = allActions.get(player.id) ?? [];
    for (const action of actions) {
      if (action.type === "resign") {
        player.status = "resigned";
        events.push({
          type: "combat", loc: 0,
          description: `${player.name} resigned`, data: {},
        });
      }
    }
  }

  // If resignation reduced to 1 active player, they win
  const postResignActive = state.players.filter(p => p.status === "active");
  if (postResignActive.length === 1 && activePlayers.length > 1) {
    state.turn += 1;
    return {
      turn: state.turn,
      events,
      winner: postResignActive[0].id,
      winType: "resignation",
    };
  }

  // Track which units moved for repair purposes
  for (const player of postResignActive) {
    const actions = allActions.get(player.id) ?? [];
    const movedSet = new Set<number>();
    for (const a of actions) {
      if (a.type === "move" || a.type === "attack") {
        movedSet.add(a.unitId);
      }
    }
    movedUnitsMap.set(player.id, movedSet);
  }

  // Process actions for all active players
  for (const player of postResignActive) {
    const actions = allActions.get(player.id) ?? [];
    for (const action of actions) {
      events.push(...processAction(state, action, player.id));
    }
  }

  // Process unit behaviors for all players
  for (const player of postResignActive) {
    events.push(...processUnitBehaviors(state, player.id, movedUnitsMap.get(player.id) ?? new Set()));
  }

  // Defensive structure auto-attack for all players
  for (const player of postResignActive) {
    events.push(...autoAttackStructures(state, player.id));
  }

  // Move satellites (all players)
  const satellites = state.units.filter((u) => u.type === UnitType.Satellite);
  for (const sat of satellites) {
    events.push(...moveSatellite(state, sat));
  }

  // Collect resource income for all players
  for (const player of postResignActive) {
    events.push(...collectResourceIncome(state, player.id));
  }

  // Collect offshore platform income for all players
  for (const player of postResignActive) {
    collectPlatformIncome(state, player.id);
  }

  // Collect tribute from vassals (after normal income, before production)
  if (state.kingdoms) {
    events.push(...collectTributeIncome(state));
  }

  // Tick city production for all players
  for (const player of postResignActive) {
    events.push(...tickCityProduction(state, player.id));
  }

  // Tick building construction (advance work, complete buildings, consume constructors)
  events.push(...tickBuildingConstruction(state));

  // Collect tech research for all players
  for (const player of postResignActive) {
    collectTechResearch(state, player.id);
  }

  // Scan vision from structures for all players
  for (const player of postResignActive) {
    scanStructureVision(state, player.id);
  }

  // Scan vision from crown cities
  if (state.kingdoms) {
    scanCrownVision(state, scan);
  }

  // Process rebellions (tributaries with more military than overlord auto-revolt)
  if (state.kingdoms) {
    events.push(...processRebellions(state));
  }

  // Repair ships in port for all players
  for (const player of postResignActive) {
    repairShips(state, player.id, movedUnitsMap.get(player.id) ?? new Set());
  }

  // Reset moved counters and refuel fighters in cities/carriers
  for (const unit of state.units) {
    unit.moved = 0;

    // Refuel fighters and AWACS at cities or on carriers
    if ((unit.type === UnitType.Fighter || unit.type === UnitType.AWACS) &&
        UNIT_ATTRIBUTES[unit.type].range !== INFINITY) {
      const cell = state.map[unit.loc];
      const inOwnCity = cell.cityId !== null && state.cities[cell.cityId].owner === unit.owner;
      const onCarrier = unit.shipId !== null;
      if (inOwnCity || onCarrier) {
        unit.range = unit.type === UnitType.Fighter
          ? getEffectiveFighterRange(state, unit.owner)
          : UNIT_ATTRIBUTES[unit.type].range;
      }
    }
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
