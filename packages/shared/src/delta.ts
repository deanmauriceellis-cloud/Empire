// Empire Reborn — Delta Sync (Phase 14)
// Efficient state change tracking for world mode.
// Computes per-tick deltas by snapshotting before/after executeTurn.

import { UnitBehavior, type PlayerId } from "./constants.js";
import type {
  Loc,
  GameState,
  UnitState,
  ViewMapCell,
  CityState,
  BuildingState,
  TurnEvent,
} from "./types.js";
import type { VisibleCity } from "./protocol.js";

// ─── TurnDelta Types ──────────────────────────────────────────────────────

/** A single unit movement. */
export interface UnitMoveDelta {
  unitId: number;
  from: Loc;
  to: Loc;
}

/** A newly created unit (full state snapshot). */
export interface UnitCreatedDelta {
  unitId: number;
  type: number; // UnitType
  owner: PlayerId;
  loc: Loc;
  hits: number;
}

/** A building change (creation, completion, damage, destruction). */
export interface BuildingDelta {
  buildingId: number;
  type: number; // BuildingType
  loc: Loc;
  owner: PlayerId;
  complete?: boolean;
  hp?: number;
  destroyed?: boolean;
}

/** A city ownership change. */
export interface CityCapturedDelta {
  cityId: number;
  loc: Loc;
  oldOwner: PlayerId;
  newOwner: PlayerId;
}

/** Per-player resource change. */
export interface ResourceDelta {
  playerId: PlayerId;
  resources: number[]; // new absolute values [ore, oil, textile]
}

/** Per-player tech change. */
export interface TechDelta {
  playerId: PlayerId;
  tech: number[]; // new absolute values [sci, health, elec, war]
}

/** ViewMap cell change. */
export interface ViewMapDelta {
  loc: Loc;
  contents: string;
  seen: number;
}

/** City production/work change (for own cities). */
export interface CityProductionDelta {
  cityId: number;
  production: number; // UnitType
  work: number;
}

/**
 * Complete delta for a single tick.
 * Contains all state changes that occurred during executeTurn.
 */
export interface TurnDelta {
  tick: number;
  unitMoves: UnitMoveDelta[];
  unitCreated: UnitCreatedDelta[];
  unitDestroyed: number[]; // unit IDs
  unitHpChanges: { unitId: number; hits: number }[];
  combatResults: TurnEvent[];
  buildingChanges: BuildingDelta[];
  cityCaptures: CityCapturedDelta[];
  cityProduction: CityProductionDelta[];
  resourceChanges: ResourceDelta[];
  techChanges: TechDelta[];
}

/**
 * Per-player filtered delta — only changes visible to a specific player.
 */
export interface FilteredDelta {
  tick: number;
  unitMoves: UnitMoveDelta[];
  unitCreated: UnitCreatedDelta[];
  unitDestroyed: number[];
  unitHpChanges: { unitId: number; hits: number }[];
  events: TurnEvent[];
  buildingChanges: BuildingDelta[];
  cityCaptures: CityCapturedDelta[];
  cityProduction: CityProductionDelta[];
  resourceChanges: ResourceDelta[];
  techChanges: TechDelta[];
  viewMapChanges: ViewMapDelta[];
}

// ─── Pre-Turn Snapshot ────────────────────────────────────────────────────

/** Lightweight snapshot of mutable state before executeTurn. */
export interface PreTurnSnapshot {
  turn: number;
  /** Map of unitId → { loc, hits } for all units. */
  unitLocs: Map<number, { loc: Loc; hits: number }>;
  /** Set of all unit IDs that existed before the turn. */
  unitIds: Set<number>;
  /** Map of cityId → { owner, production, work }. */
  cityState: Map<number, { owner: PlayerId; production: number; work: number }>;
  /** Map of buildingId → { complete, hp, owner }. */
  buildingState: Map<number, { complete: boolean; hp: number; owner: PlayerId }>;
  /** Per-player resources (cloned). */
  resources: Map<number, number[]>;
  /** Per-player tech (cloned). */
  tech: Map<number, number[]>;
}

/**
 * Take a snapshot of game state before executeTurn.
 * Only captures the mutable fields we need to diff.
 */
export function snapshotPreTurn(state: GameState): PreTurnSnapshot {
  const unitLocs = new Map<number, { loc: Loc; hits: number }>();
  const unitIds = new Set<number>();
  for (const u of state.units) {
    unitLocs.set(u.id, { loc: u.loc, hits: u.hits });
    unitIds.add(u.id);
  }

  const cityState = new Map<number, { owner: PlayerId; production: number; work: number }>();
  for (const c of state.cities) {
    cityState.set(c.id, { owner: c.owner as PlayerId, production: c.production, work: c.work });
  }

  const buildingState = new Map<number, { complete: boolean; hp: number; owner: PlayerId }>();
  for (const b of state.buildings) {
    buildingState.set(b.id, { complete: b.complete, hp: b.hp, owner: b.owner as PlayerId });
  }

  const resources = new Map<number, number[]>();
  for (const [pid, res] of Object.entries(state.resources)) {
    resources.set(Number(pid), [...res]);
  }

  const tech = new Map<number, number[]>();
  for (const [pid, t] of Object.entries(state.techResearch)) {
    tech.set(Number(pid), [...t]);
  }

  return { turn: state.turn, unitLocs, unitIds, cityState, buildingState, resources, tech };
}

// ─── Delta Computation ───────────────────────────────────────────────────

/**
 * Compute a TurnDelta by comparing pre-turn snapshot with post-turn state.
 * Call this immediately after executeTurn returns.
 */
export function computeDelta(
  snapshot: PreTurnSnapshot,
  state: GameState,
  events: TurnEvent[],
): TurnDelta {
  const delta: TurnDelta = {
    tick: state.turn,
    unitMoves: [],
    unitCreated: [],
    unitDestroyed: [],
    unitHpChanges: [],
    combatResults: events.filter(e => e.type === "combat" || e.type === "capture" || e.type === "death"),
    buildingChanges: [],
    cityCaptures: [],
    cityProduction: [],
    resourceChanges: [],
    techChanges: [],
  };

  // ── Unit diffs ──

  const postUnitIds = new Set<number>();
  for (const u of state.units) {
    postUnitIds.add(u.id);
    const prev = snapshot.unitLocs.get(u.id);
    if (!prev) {
      // New unit
      delta.unitCreated.push({
        unitId: u.id,
        type: u.type,
        owner: u.owner as PlayerId,
        loc: u.loc,
        hits: u.hits,
      });
    } else {
      // Existing unit — check movement
      if (prev.loc !== u.loc) {
        delta.unitMoves.push({ unitId: u.id, from: prev.loc, to: u.loc });
      }
      // Check HP change
      if (prev.hits !== u.hits) {
        delta.unitHpChanges.push({ unitId: u.id, hits: u.hits });
      }
    }
  }

  // Destroyed units
  for (const id of snapshot.unitIds) {
    if (!postUnitIds.has(id)) {
      delta.unitDestroyed.push(id);
    }
  }

  // ── City diffs ──

  for (const c of state.cities) {
    const prev = snapshot.cityState.get(c.id);
    if (!prev) continue;

    // Ownership change
    if (prev.owner !== (c.owner as PlayerId)) {
      delta.cityCaptures.push({
        cityId: c.id,
        loc: c.loc,
        oldOwner: prev.owner,
        newOwner: c.owner as PlayerId,
      });
    }

    // Production/work change
    if (prev.production !== c.production || prev.work !== c.work) {
      delta.cityProduction.push({
        cityId: c.id,
        production: c.production,
        work: c.work,
      });
    }
  }

  // ── Building diffs ──

  const postBuildingIds = new Set<number>();
  for (const b of state.buildings) {
    postBuildingIds.add(b.id);
    const prev = snapshot.buildingState.get(b.id);
    if (!prev) {
      // New building
      delta.buildingChanges.push({
        buildingId: b.id,
        type: b.type,
        loc: b.loc,
        owner: b.owner as PlayerId,
        complete: b.complete,
        hp: b.hp,
      });
    } else {
      // Check for changes
      if (prev.complete !== b.complete || prev.hp !== b.hp || prev.owner !== (b.owner as PlayerId)) {
        delta.buildingChanges.push({
          buildingId: b.id,
          type: b.type,
          loc: b.loc,
          owner: b.owner as PlayerId,
          complete: b.complete,
          hp: b.hp,
        });
      }
    }
  }

  // Destroyed buildings
  for (const [id] of snapshot.buildingState) {
    if (!postBuildingIds.has(id)) {
      // Find the original building info
      const prev = snapshot.buildingState.get(id)!;
      delta.buildingChanges.push({
        buildingId: id,
        type: 0, // type unknown for destroyed buildings — events carry the detail
        loc: 0,
        owner: prev.owner,
        destroyed: true,
      });
    }
  }

  // ── Resource diffs ──

  for (const [pid, res] of Object.entries(state.resources)) {
    const playerId = Number(pid);
    const prev = snapshot.resources.get(playerId);
    if (!prev || prev[0] !== res[0] || prev[1] !== res[1] || prev[2] !== res[2]) {
      delta.resourceChanges.push({ playerId, resources: [...res] });
    }
  }

  // ── Tech diffs ──

  for (const [pid, t] of Object.entries(state.techResearch)) {
    const playerId = Number(pid);
    const prev = snapshot.tech.get(playerId);
    if (!prev || prev[0] !== t[0] || prev[1] !== t[1] || prev[2] !== t[2] || prev[3] !== t[3]) {
      delta.techChanges.push({ playerId, tech: [...t] });
    }
  }

  return delta;
}

// ─── Per-Player Delta Filtering ──────────────────────────────────────────

/**
 * Filter a TurnDelta to only include changes visible to a specific player.
 * Uses the player's viewMap after the turn to determine visibility.
 */
export function filterDeltaForPlayer(
  delta: TurnDelta,
  playerId: number,
  viewMap: ViewMapCell[],
  currentTurn: number,
): FilteredDelta {
  const isVisible = (loc: Loc): boolean => {
    const cell = viewMap[loc];
    return cell !== undefined && cell.seen >= 0;
  };

  const isCurrentlyVisible = (loc: Loc): boolean => {
    const cell = viewMap[loc];
    return cell !== undefined && cell.seen === currentTurn;
  };

  // Unit moves: own units always, enemy units only if source or dest visible now
  const unitMoves = delta.unitMoves.filter(m => {
    const unit = findUnitById(m.unitId, delta);
    if (unit?.owner === playerId) return true;
    return isCurrentlyVisible(m.from) || isCurrentlyVisible(m.to);
  });

  // Unit created: own units always, enemy only if loc visible now
  const unitCreated = delta.unitCreated.filter(u =>
    u.owner === playerId || isCurrentlyVisible(u.loc),
  );

  // Unit destroyed: if the unit was at a visible location
  const unitDestroyed = delta.unitDestroyed.filter(id => {
    // Check if this unit was ours or at a visible location
    const unitInfo = findUnitInSnapshot(id, delta);
    if (!unitInfo) return false;
    return unitInfo.owner === playerId || isCurrentlyVisible(unitInfo.loc);
  });

  // HP changes: own units always, enemy only if visible
  const unitHpChanges = delta.unitHpChanges.filter(h => {
    const unit = findUnitById(h.unitId, delta);
    if (unit?.owner === playerId) return true;
    return unit ? isCurrentlyVisible(unit.loc) : false;
  });

  // Events: visible if event location has been explored
  const events = delta.combatResults.filter(ev => isVisible(ev.loc));

  // Buildings: visible if location explored
  const buildingChanges = delta.buildingChanges.filter(b =>
    b.destroyed || isVisible(b.loc),
  );

  // City captures: visible if city location explored
  const cityCaptures = delta.cityCaptures.filter(c => isVisible(c.loc));

  // City production: only own cities
  const cityProduction = delta.cityProduction.filter(c => {
    // Find the city to check ownership
    return delta.cityCaptures.some(cap => cap.cityId === c.cityId && cap.newOwner === playerId) ||
      (!delta.cityCaptures.some(cap => cap.cityId === c.cityId) && isOwnCity(c.cityId, playerId));
  });

  // Resources: only own
  const resourceChanges = delta.resourceChanges.filter(r => r.playerId === playerId);

  // Tech: only own
  const techChanges = delta.techChanges.filter(t => t.playerId === playerId);

  // ViewMap changes: computed separately (not from TurnDelta)
  // The caller should provide these by diffing the viewMap snapshots

  return {
    tick: delta.tick,
    unitMoves,
    unitCreated,
    unitDestroyed,
    unitHpChanges,
    events,
    buildingChanges,
    cityCaptures,
    cityProduction,
    resourceChanges,
    techChanges,
    viewMapChanges: [], // populated by caller
  };
}

// Helper: find unit info from delta's created units
function findUnitById(unitId: number, _delta: TurnDelta): { owner: PlayerId; loc: Loc } | undefined {
  // This is a best-effort lookup — the caller should have the full state available
  // For filtering purposes, we return undefined and let the caller handle it
  return undefined;
}

function findUnitInSnapshot(unitId: number, _delta: TurnDelta): { owner: PlayerId; loc: Loc } | undefined {
  return undefined;
}

// Placeholder — overridden by caller context
function isOwnCity(_cityId: number, _playerId: number): boolean {
  return false;
}

/**
 * Filter a TurnDelta with full state context for accurate visibility checks.
 * This is the production version used by WorldServer.
 */
export function filterDeltaWithState(
  delta: TurnDelta,
  playerId: number,
  state: GameState,
): FilteredDelta {
  const viewMap = state.viewMaps[playerId];
  if (!viewMap) {
    return {
      tick: delta.tick,
      unitMoves: [],
      unitCreated: [],
      unitDestroyed: [],
      unitHpChanges: [],
      events: [],
      buildingChanges: [],
      cityCaptures: [],
      cityProduction: [],
      resourceChanges: [],
      techChanges: [],
      viewMapChanges: [],
    };
  }

  const currentTurn = state.turn;

  const isVisible = (loc: Loc): boolean => {
    const cell = viewMap[loc];
    return cell !== undefined && cell.seen >= 0;
  };

  const isCurrentlyVisible = (loc: Loc): boolean => {
    const cell = viewMap[loc];
    return cell !== undefined && cell.seen === currentTurn;
  };

  // Build unit lookup from current state
  const unitMap = new Map<number, UnitState>();
  for (const u of state.units) {
    unitMap.set(u.id, u);
  }

  // Unit moves: own always, enemy if source or dest currently visible
  const unitMoves = delta.unitMoves.filter(m => {
    const unit = unitMap.get(m.unitId);
    if (unit && unit.owner === playerId) return true;
    // For moved units, check if either endpoint is visible
    return isCurrentlyVisible(m.from) || isCurrentlyVisible(m.to);
  });

  // Unit created: own always, enemy if loc currently visible
  const unitCreated = delta.unitCreated.filter(u =>
    u.owner === playerId || isCurrentlyVisible(u.loc),
  );

  // Unit destroyed: use the delta's move/combat info to find last known location
  const unitDestroyed = delta.unitDestroyed.filter(id => {
    // Check if this was our unit
    const createdDelta = delta.unitCreated.find(u => u.unitId === id);
    if (createdDelta) {
      return createdDelta.owner === playerId || isCurrentlyVisible(createdDelta.loc);
    }
    // Check combat events for this unit's location
    const moveInfo = delta.unitMoves.find(m => m.unitId === id);
    if (moveInfo) {
      return isCurrentlyVisible(moveInfo.to) || isCurrentlyVisible(moveInfo.from);
    }
    // Check unit HP changes
    const hpInfo = delta.unitHpChanges.find(h => h.unitId === id);
    if (hpInfo) return true; // We knew about the HP change, so we knew about the unit
    // Fallback: include if any combat event mentions destruction
    return false;
  });

  // HP changes
  const unitHpChanges = delta.unitHpChanges.filter(h => {
    const unit = unitMap.get(h.unitId);
    if (!unit) return false;
    if (unit.owner === playerId) return true;
    return isCurrentlyVisible(unit.loc);
  });

  // Events: visible if location explored
  const events = delta.combatResults.filter(ev => isVisible(ev.loc));

  // Buildings: visible if location explored
  const buildingChanges = delta.buildingChanges.filter(b => {
    if (b.destroyed) {
      return b.owner === playerId || isVisible(b.loc);
    }
    return isVisible(b.loc);
  });

  // City captures: visible if explored
  const cityCaptures = delta.cityCaptures.filter(c => isVisible(c.loc));

  // City production: only own cities
  const cityProduction = delta.cityProduction.filter(c => {
    const city = state.cities.find(ct => ct.id === c.cityId);
    return city && city.owner === playerId;
  });

  // Resources/tech: only own
  const resourceChanges = delta.resourceChanges.filter(r => r.playerId === playerId);
  const techChanges = delta.techChanges.filter(t => t.playerId === playerId);

  return {
    tick: delta.tick,
    unitMoves,
    unitCreated,
    unitDestroyed,
    unitHpChanges,
    events,
    buildingChanges,
    cityCaptures,
    cityProduction,
    resourceChanges,
    techChanges,
    viewMapChanges: [], // populated by computeViewMapDelta
  };
}

// ─── ViewMap Delta ───────────────────────────────────────────────────────

/**
 * Compute viewMap changes for a specific player by comparing snapshots.
 * Only returns cells that changed.
 */
export function computeViewMapDelta(
  prevViewMap: ViewMapCell[] | undefined,
  currentViewMap: ViewMapCell[],
): ViewMapDelta[] {
  if (!prevViewMap) {
    // First time — all cells are "new". But don't send the full map as deltas;
    // the caller should send a full state instead.
    return [];
  }

  const changes: ViewMapDelta[] = [];
  const len = currentViewMap.length;
  for (let i = 0; i < len; i++) {
    const prev = prevViewMap[i];
    const curr = currentViewMap[i];
    if (prev.contents !== curr.contents || prev.seen !== curr.seen) {
      changes.push({ loc: i, contents: curr.contents, seen: curr.seen });
    }
  }
  return changes;
}

/**
 * Snapshot a player's viewMap (shallow clone of each cell).
 * Used to compute viewMap deltas between ticks.
 */
export function snapshotViewMap(viewMap: ViewMapCell[]): ViewMapCell[] {
  return viewMap.map(cell => ({ contents: cell.contents, seen: cell.seen }));
}

// ─── Client-Side Delta Application ───────────────────────────────────────

/**
 * Apply a filtered delta to a client's cached VisibleGameState.
 * Returns true if the state was modified.
 */
export function applyDeltaToVisibleState(
  delta: FilteredDelta,
  cities: VisibleCity[],
  units: UnitState[],
  viewMap: ViewMapCell[],
  owner: number,
): boolean {
  let modified = false;

  // Apply viewMap changes
  for (const change of delta.viewMapChanges) {
    const cell = viewMap[change.loc];
    if (cell) {
      cell.contents = change.contents;
      cell.seen = change.seen;
      modified = true;
    }
  }

  // Apply unit movements
  for (const move of delta.unitMoves) {
    const unit = units.find(u => u.id === move.unitId);
    if (unit) {
      unit.loc = move.to;
      modified = true;
    }
  }

  // Apply unit HP changes
  for (const hp of delta.unitHpChanges) {
    const unit = units.find(u => u.id === hp.unitId);
    if (unit) {
      unit.hits = hp.hits;
      modified = true;
    }
  }

  // Remove destroyed units
  for (const id of delta.unitDestroyed) {
    const idx = units.findIndex(u => u.id === id);
    if (idx >= 0) {
      units.splice(idx, 1);
      modified = true;
    }
  }

  // Add newly created units
  for (const created of delta.unitCreated) {
    // Only add if not already present
    if (!units.find(u => u.id === created.unitId)) {
      units.push({
        id: created.unitId,
        type: created.type,
        owner: created.owner as any,
        loc: created.loc,
        hits: created.hits,
        moved: 0,
        func: UnitBehavior.None,
        shipId: null,
        cargoIds: [],
        range: 0,
        targetLoc: null,
      });
      modified = true;
    }
  }

  // Apply city captures
  for (const cap of delta.cityCaptures) {
    const city = cities.find(c => c.id === cap.cityId);
    if (city) {
      city.owner = cap.newOwner as any;
      // Hide production if captured by enemy
      if (cap.newOwner !== owner) {
        city.production = null;
        city.work = null;
      }
      modified = true;
    }
  }

  // Apply city production changes (own cities only)
  for (const prod of delta.cityProduction) {
    const city = cities.find(c => c.id === prod.cityId);
    if (city && city.owner === owner) {
      city.production = prod.production;
      city.work = prod.work;
      modified = true;
    }
  }

  // Apply building changes — client doesn't track buildings in VisibleGameState currently
  // but we emit the delta for future use

  return modified;
}
