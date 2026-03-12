// Empire Reborn — AI Transport Movement

import { MAP_SIZE, Owner, UnitType, UnitBehavior, TerrainType } from "./constants.js";
import { UNIT_ATTRIBUTES } from "./units.js";
import type { Loc, ViewMapCell, UnitState, GameState, PlayerAction } from "./types.js";
import { isOnBoard, getAdjacentLocs } from "./utils.js";
import { findUnit, findUnitsAtLoc, objMoves, objCapacity } from "./game.js";
import { waterMoveInfo } from "./pathfinding.js";
import { mapContinent } from "./continent.js";
import {
  VM_WATER, VM_LAND, VM_UNEXPLORED, VM_OWN_CITY, VM_ENEMY_CITY, VM_UNOWNED_CITY,
  VM_HOME_PORT, VM_PICKUP_SINGLE, VM_PICKUP_CLUSTER,
  isTraversableLand, isPickupMarker,
} from "./viewmap-chars.js";
import { aiLog, aiVLog, findMoveToward, findMoveTowardWithObjective, ttLoadMoveInfo, ttExploreMoveInfo, ttUnloadMoveInfo, findAdjacentAttack } from "./ai-helpers.js";
import { TT_ATTACK } from "./units.js";

export function aiTransportMove(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
  claimedUnitIds: Set<number>,
  claimedPickupLocs?: Set<Loc>,
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const movesLeft = objMoves(unit) - unit.moved;
  if (movesLeft <= 0) return actions;

  const capacity = objCapacity(unit);
  // Track projected cargo across steps (actions are batched, cargoIds doesn't update mid-turn)
  let projectedCargo = unit.cargoIds.length;
  let justUnloaded = false;
  // Track whether we've committed to delivering partial cargo (prevents oscillation between loading/delivering)
  let deliveringMode = false;
  // Track position across steps (unit.loc doesn't update mid-turn)
  let currentLoc = unit.loc;
  // Track whether loading happened this turn (unit.cargoIds is stale after batched loads)
  let loadedThisTurn = false;

  aiVLog(`  Transport #${unit.id}: loc=${unit.loc} cargo=${projectedCargo}/${capacity} moves=${movesLeft}`);

  // Track all positions this turn to detect oscillation (prevents 2+ tile cycles)
  // Include cross-turn history to prevent multi-turn ping-pong
  const prevLocs = unit.prevLocs || [];
  const recentLocs = new Set<Loc>([currentLoc, ...prevLocs]);

  // Lazily-created view maps — computed once per transport, reused across steps
  let cachedUnloadMap: ViewMapCell[] | null = null;
  let cachedLoadMap: ViewMapCell[] | null = null;
  let cachedPortMap: ViewMapCell[] | null = null;
  const getUnloadMap = () => cachedUnloadMap ?? (cachedUnloadMap = createUnloadViewMap(viewMap, state, aiOwner));
  const getLoadMap = () => cachedLoadMap ?? (cachedLoadMap = createTTLoadViewMap(viewMap, state, aiOwner, claimedPickupLocs, claimedUnitIds));
  const getPortMap = () => cachedPortMap ?? (cachedPortMap = createPortViewMap(viewMap, state, aiOwner));

  for (let step = 0; step < movesLeft; step++) {
    if (findUnit(state, unit.id) === undefined) break;

    const isFull = projectedCargo >= capacity;
    const isEmpty = projectedCargo === 0;

    aiLog(`    [step ${step}] at=${currentLoc} cargo=${projectedCargo}/${capacity} full=${isFull} delivering=${deliveringMode} loaded=${loadedThisTurn}`);

    // After unloading, sail away (don't sit and reload)
    if (justUnloaded) {
      const exploreTarget = findMoveToward(viewMap, currentLoc, ttExploreMoveInfo());
      if (exploreTarget !== null) {
        aiVLog(`    Transport #${unit.id}: sailing away after unloading toward ${exploreTarget}`);
        actions.push({ type: "move", unitId: unit.id, loc: exploreTarget });
        currentLoc = exploreTarget;
      } else {
        aiVLog(`    Transport #${unit.id}: no sail-away target, staying put`);
      }
      break;
    }

    // UNLOAD MODE: full, or partially loaded near enemy territory
    // Don't attempt unloading on the same turn we loaded (unit.cargoIds is stale)
    if (!loadedThisTurn && (isFull || (!isEmpty && shouldUnload(state, unit, aiOwner, viewMap, currentLoc)))) {
      aiVLog(`    Transport #${unit.id}: UNLOAD MODE (full=${isFull}, shouldUnload=${!isFull})`);
      // Check for adjacent attack
      const attack = findAdjacentAttack(viewMap, currentLoc, TT_ATTACK);
      if (attack) {
        aiVLog(`    Transport #${unit.id}: attacking adjacent target at ${attack.targetLoc}`);
        actions.push({ type: "attack", unitId: unit.id, targetLoc: attack.targetLoc });
        return actions;
      }

      // Try to unload onto enemy/unowned land
      const unloadAction = tryUnloadArmies(state, unit, aiOwner, viewMap, currentLoc);
      if (unloadAction.length > 0) {
        actions.push(...unloadAction);
        projectedCargo = 0;
        justUnloaded = true;
        aiVLog(`    Transport #${unit.id}: unloaded ${unit.cargoIds.length} armies, will sail away`);
        continue; // use remaining move to sail away
      }

      aiVLog(`    Transport #${unit.id}: no valid unload targets adjacent, navigating`);
      // Navigate toward enemy continent
      const unloadMap = getUnloadMap();
      const target = findMoveToward(unloadMap, currentLoc, ttUnloadMoveInfo());
      if (target !== null && !recentLocs.has(target)) {
        aiVLog(`    Transport #${unit.id}: full, navigating toward target at ${target}`);
        actions.push({ type: "move", unitId: unit.id, loc: target });
        recentLocs.add(currentLoc);
        currentLoc = target;
      } else {
        // No unload targets found or would oscillate — explore to discover enemy territory
        const exploreTarget = findMoveToward(viewMap, currentLoc, ttExploreMoveInfo());
        if (exploreTarget !== null && !recentLocs.has(exploreTarget)) {
          aiVLog(`    Transport #${unit.id}: full, exploring toward ${exploreTarget}`);
          actions.push({ type: "move", unitId: unit.id, loc: exploreTarget });
          recentLocs.add(currentLoc);
          currentLoc = exploreTarget;
        } else {
          aiVLog(`    Transport #${unit.id}: full, no movement options, stuck`);
          break;
        }
      }
    } else {
      // LOADING MODE: seek armies to load

      // If we loaded this turn and are full, just navigate toward delivery target
      if (loadedThisTurn && isFull) {
        const unloadMap = createUnloadViewMap(viewMap, state, aiOwner);
        const target = findMoveToward(unloadMap, currentLoc, ttUnloadMoveInfo());
        if (target !== null && !recentLocs.has(target)) {
          aiVLog(`    Transport #${unit.id}: loaded & full, heading to deliver at ${target}`);
          actions.push({ type: "move", unitId: unit.id, loc: target });
          recentLocs.add(currentLoc);
          currentLoc = target;
        } else {
          aiVLog(`    Transport #${unit.id}: loaded & full, no delivery target found`);
          break;
        }
        continue;
      }

      // If carrying cargo and already committed to delivery, keep delivering
      if (projectedCargo > 0 && deliveringMode) {
        const unloadMap = getUnloadMap();
        const deliverTarget = findMoveToward(unloadMap, currentLoc, ttUnloadMoveInfo());
        if (deliverTarget !== null && !recentLocs.has(deliverTarget)) {
          aiVLog(`    Transport #${unit.id}: continuing delivery toward ${deliverTarget}`);
          actions.push({ type: "move", unitId: unit.id, loc: deliverTarget });
          recentLocs.add(currentLoc);
          currentLoc = deliverTarget;
          continue;
        }
        const exploreTarget = findMoveToward(viewMap, currentLoc, ttExploreMoveInfo());
        if (exploreTarget !== null && !recentLocs.has(exploreTarget)) {
          aiVLog(`    Transport #${unit.id}: delivery path blocked, exploring toward ${exploreTarget}`);
          actions.push({ type: "move", unitId: unit.id, loc: exploreTarget });
          recentLocs.add(currentLoc);
          currentLoc = exploreTarget;
          continue;
        }
        aiVLog(`    Transport #${unit.id}: delivery stuck, no movement options`);
        break;
      }

      // Try loading armies every step (claimedUnitIds prevents double-loading)
      {
        const loadActions = tryLoadArmies(state, unit, aiOwner, claimedUnitIds);
        if (loadActions.length > 0) {
          actions.push(...loadActions);
          const willLoad = loadActions.filter(a => a.type === "move" || a.type === "embark").length;
          projectedCargo += willLoad;
          loadedThisTurn = true;
          aiVLog(`    Transport #${unit.id}: loaded ${willLoad} armies (projected ${projectedCargo}/${capacity})`);
          if (projectedCargo >= capacity) {
            aiVLog(`    Transport #${unit.id}: will be full, switching to navigate toward target`);
            continue; // next step: navigate toward delivery (loadedThisTurn + isFull path)
          }
          // If we loaded some but not full, check if more armies are nearby — wait for them
          // Patience: wait up to 6 turns at a coastline. Each new army loaded resets the timer
          // (prevLocs is cleared on load, so stuckTurns resets to 0 when cargo changes).
          if (projectedCargo > 0) {
            const nearbyArmies = countNearbyArmies(state, currentLoc, aiOwner, claimedUnitIds);
            const pLocs = unit.prevLocs || [];
            const stuckTurns = pLocs.filter(l => l === currentLoc).length;
            if (nearbyArmies > 0 && stuckTurns < 6) {
              aiVLog(`    Transport #${unit.id}: waiting for ${nearbyArmies} more nearby armies (patience=${6 - stuckTurns} turns left)`);
              break; // stay put and wait
            }
            if (stuckTurns >= 6) {
              aiVLog(`    Transport #${unit.id}: patience exhausted after ${stuckTurns} turns, delivering ${projectedCargo}/${capacity}`);
              deliveringMode = true;
            }
            // Not full and no nearby armies — fall through to navigate toward distant armies
            aiVLog(`    Transport #${unit.id}: partially loaded, seeking more armies`);
          }
        }
        // Don't enter delivery mode here — fall through to navigate-toward-armies
        // which will check if there are any loadable armies elsewhere
      }

      // Navigate toward waiting armies or targets (only when empty or still loading)
      if (!deliveringMode) {
        const loadMap = getLoadMap();
        const loadResult = findMoveTowardWithObjective(loadMap, currentLoc, ttLoadMoveInfo());
        const target = loadResult ? loadResult.nextStep : null;
        if (target !== null && !recentLocs.has(target)) {
          aiVLog(`    Transport #${unit.id}: loading mode, moving toward armies at ${target}`);
          actions.push({ type: "move", unitId: unit.id, loc: target });
          recentLocs.add(currentLoc);
          currentLoc = target;
          // Claim pickup zone around the OBJECTIVE (not transport position)
          // so other transports seek different army clusters
          if (claimedPickupLocs && loadResult) {
            claimPickupZone(loadMap, loadResult.objective, claimedPickupLocs);
          }
        } else if (projectedCargo > 0) {
          // Have some cargo but can't find more armies via loadMap.
          // Deliver what we have rather than circling forever.
          // The transport already tried loading (lines above) and navigating toward armies —
          // if we're here, there are no reachable loadable armies.
          // Partially loaded with no armies to find — head toward enemy territory
          aiVLog(`    Transport #${unit.id}: delivering ${projectedCargo}/${capacity} (no more armies available)`);
          deliveringMode = true;
          const unloadMap = getUnloadMap();
          const unloadTarget = findMoveToward(unloadMap, currentLoc, ttUnloadMoveInfo());
          if (unloadTarget !== null && !recentLocs.has(unloadTarget)) {
            aiVLog(`    Transport #${unit.id}: delivering toward ${unloadTarget}`);
            actions.push({ type: "move", unitId: unit.id, loc: unloadTarget });
            recentLocs.add(currentLoc);
            currentLoc = unloadTarget;
          } else {
            const exploreTarget = findMoveToward(viewMap, currentLoc, ttExploreMoveInfo());
            if (exploreTarget !== null && !recentLocs.has(exploreTarget)) {
              aiVLog(`    Transport #${unit.id}: exploring toward ${exploreTarget}`);
              actions.push({ type: "move", unitId: unit.id, loc: exploreTarget });
              recentLocs.add(currentLoc);
              currentLoc = exploreTarget;
            } else {
              aiVLog(`    Transport #${unit.id}: stuck, no movement options`);
              break;
            }
          }
        } else {
          // Empty with no targets — on river maps, prioritize returning to own shoreline
          // where armies congregate; on standard maps, explore first.
          const isRiver = state.config.mapType === "river";
          let moved = false;

          // River maps: return to own shore/port first (armies cluster at river bank)
          if (isRiver) {
            const returnTarget = findMoveToward(getLoadMap(), currentLoc, ttLoadMoveInfo());
            if (returnTarget !== null && !recentLocs.has(returnTarget)) {
              aiVLog(`    Transport #${unit.id}: empty, heading to own shoreline for pickup at ${returnTarget}`);
              actions.push({ type: "move", unitId: unit.id, loc: returnTarget });
              recentLocs.add(currentLoc);
              currentLoc = returnTarget;
              moved = true;
            }
            if (!moved) {
              const homeTarget = findMoveToward(getPortMap(), currentLoc, waterMoveInfo("H", new Map([["H", 1]])));
              if (homeTarget !== null && !recentLocs.has(homeTarget)) {
                aiVLog(`    Transport #${unit.id}: empty, returning to own port at ${homeTarget}`);
                actions.push({ type: "move", unitId: unit.id, loc: homeTarget });
                recentLocs.add(currentLoc);
                currentLoc = homeTarget;
                moved = true;
              }
            }
          }

          // Standard path: explore, then return to armies, then port, then escape
          if (!moved) {
            const exploreTarget = findMoveToward(viewMap, currentLoc, ttExploreMoveInfo());
            if (exploreTarget !== null && !recentLocs.has(exploreTarget)) {
              aiVLog(`    Transport #${unit.id}: empty, exploring toward ${exploreTarget}`);
              actions.push({ type: "move", unitId: unit.id, loc: exploreTarget });
              recentLocs.add(currentLoc);
              currentLoc = exploreTarget;
              moved = true;
            }
          }
          if (!moved) {
            const returnTarget = findMoveToward(getLoadMap(), currentLoc, ttLoadMoveInfo());
            if (returnTarget !== null && !recentLocs.has(returnTarget)) {
              aiVLog(`    Transport #${unit.id}: empty, returning toward waiting armies at ${returnTarget}`);
              actions.push({ type: "move", unitId: unit.id, loc: returnTarget });
              recentLocs.add(currentLoc);
              currentLoc = returnTarget;
              moved = true;
            }
          }
          if (!moved) {
            const homeTarget = findMoveToward(getPortMap(), currentLoc, waterMoveInfo("H", new Map([["H", 1]])));
            if (homeTarget !== null && !recentLocs.has(homeTarget)) {
              aiVLog(`    Transport #${unit.id}: empty, returning to own port at ${homeTarget}`);
              actions.push({ type: "move", unitId: unit.id, loc: homeTarget });
              recentLocs.add(currentLoc);
              currentLoc = homeTarget;
              moved = true;
            }
          }
          if (!moved) {
            // Last resort: move to ANY adjacent water tile to break deadlock
            const adjCells = getAdjacentLocs(currentLoc);
            for (const adj of adjCells) {
              if (recentLocs.has(adj)) continue;
              const c = viewMap[adj].contents;
              if (c === VM_WATER || c === VM_UNEXPLORED) {
                aiVLog(`    Transport #${unit.id}: empty, escaping deadlock toward ${adj}`);
                actions.push({ type: "move", unitId: unit.id, loc: adj });
                recentLocs.add(currentLoc);
                currentLoc = adj;
                moved = true;
                break;
              }
            }
            if (!moved) {
              aiVLog(`    Transport #${unit.id}: empty, truly stuck (enclosed water or lake)`);
              break;
            }
          }
        }
      }
    }
  }

  // Save ALL visited positions for cross-turn oscillation detection (keep last 12)
  // Using recentLocs captures intermediate positions (not just final), preventing
  // 2-tile ping-pong where the transport visits A→B→C one turn, C→B→A the next
  // Size 12 accommodates the 6-turn patience window for waiting transports
  const allVisited = [...recentLocs];
  // Clear history when transport loaded/unloaded cargo (mission changed — allow revisiting)
  if (loadedThisTurn || justUnloaded) {
    unit.prevLocs = [];
  } else {
    unit.prevLocs = allVisited.slice(0, 12);
  }

  aiVLog(`    Transport #${unit.id}: turn done, ${actions.length} actions, final loc=${currentLoc}`);
  return actions;
}

/**
 * Decide if a partially-loaded transport should start unloading.
 * Only trigger near enemy/unowned territory — NOT near own cities.
 */
export function shouldUnload(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
  atLoc?: Loc,
): boolean {
  // Only unload near enemy cities/armies — NOT random land or home territory.
  const loc = atLoc ?? unit.loc;
  const capacity = objCapacity(unit);

  const adjacent = getAdjacentLocs(loc);

  // Direct adjacency to enemy/unowned city or enemy army — always unload with ANY cargo.
  // These are high-value targets worth unloading even 1 army for.
  for (const adj of adjacent) {
    const contents = viewMap[adj].contents;
    if (contents === VM_ENEMY_CITY || contents === VM_UNOWNED_CITY || contents === "a") {
      return true;
    }
  }

  // For BFS-based proximity checks, require at least 25% cargo to avoid
  // tiny wasteful deliveries on random neutral coastline.
  if (unit.cargoIds.length < Math.max(1, Math.ceil(capacity / 4))) {
    aiVLog(`    Transport #${unit.id}: shouldUnload=false (cargo ${unit.cargoIds.length}/${capacity} below 25% threshold, no adjacent targets)`);
    return false;
  }

  // Check if immediately adjacent to own city — don't unload right at home
  for (const adj of adjacent) {
    if (viewMap[adj].contents === VM_OWN_CITY) {
      aiVLog(`    Transport #${unit.id}: shouldUnload=false (adjacent to own city)`);
      return false;
    }
  }
  // Not adjacent to own city — allow unloading. The transport loaded these armies
  // for a reason, and tryUnloadArmies will still skip tiles very close to own cities.
  return true;
}

/**
 * Try to unload armies from transport onto adjacent land near enemy/unowned territory.
 * Will NOT unload onto friendly territory (home island).
 */
export function tryUnloadArmies(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  viewMap: ViewMapCell[],
  atLoc?: Loc,
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const loc = atLoc ?? unit.loc;
  const adjacent = getAdjacentLocs(loc);

  // Only unload onto land that is enemy, unowned, or near enemy/unowned cities
  // viewMap contents: 'X'=enemy city, 'O'=own city, '*'=unowned city, '+'=land
  const landTargets: { loc: Loc; priority: number }[] = [];
  for (const adj of adjacent) {
    const cell = state.map[adj];
    if (cell.terrain !== TerrainType.Land && cell.terrain !== TerrainType.City) continue;

    const contents = viewMap[adj].contents;
    if (contents === VM_ENEMY_CITY) {
      // Enemy city — high priority (but lower than unowned — capture empty first)
      landTargets.push({ loc: adj, priority: 2 });
    } else if (contents === VM_UNOWNED_CITY) {
      // Unowned city — highest priority (free capture)
      landTargets.push({ loc: adj, priority: 3 });
    } else if (contents === VM_LAND || contents === VM_UNEXPLORED) {
      // Land or unexplored — check distance to nearest own city.
      // Only skip unloading if an own city is very close (within 3 BFS steps).
      // On large continents, armies can be useful far from home cities.
      let nearbyOwnCity = false;
      const bfsVisited = new Set<Loc>([adj]);
      const bfsQueue: Loc[] = [adj];
      let bfsChecked = 0;
      while (bfsQueue.length > 0 && bfsChecked < 3) {
        const cur = bfsQueue.shift()!;
        bfsChecked++;
        const c = viewMap[cur].contents;
        if (c === VM_OWN_CITY) { nearbyOwnCity = true; break; }
        for (const a of getAdjacentLocs(cur)) {
          if (bfsVisited.has(a)) continue;
          const ac = viewMap[a].contents;
          if (ac !== VM_WATER) {
            bfsVisited.add(a);
            bfsQueue.push(a);
          }
        }
      }
      if (!nearbyOwnCity) {
        // Far enough from own cities — allow unloading (lower priority than cities)
        landTargets.push({ loc: adj, priority: 1 });
      } else {
        aiVLog(`    Transport #${unit.id}: skip unload at ${adj} (own city nearby)`);
      }
    }
    // Skip 'O' (own city) — never unload at home
  }

  if (landTargets.length === 0) {
    aiVLog(`    Transport #${unit.id}: tryUnload at ${loc} — no valid land targets (adj: ${adjacent.map(a => `${a}=${viewMap[a].contents}`).join(",")})`);
    return actions;
  }

  // Sort by priority (highest first)
  landTargets.sort((a, b) => b.priority - a.priority);
  const bestLand = landTargets[0].loc;
  const priNames = ["", "land", "enemy city", "unowned city"];

  aiVLog(`    Transport #${unit.id}: unloading ${unit.cargoIds.length} armies at ${bestLand} (${priNames[landTargets[0].priority]})`);

  for (const cargoId of [...unit.cargoIds]) {
    const cargo = findUnit(state, cargoId);
    if (cargo) {
      actions.push({ type: "disembark", unitId: cargoId });
      actions.push({ type: "move", unitId: cargoId, loc: bestLand });
      // Set unloaded armies to Aggressive so they attack enemies AND won't be
      // picked back up by transports (tryLoadArmies only loads None/Explore/WaitForTransport)
      actions.push({ type: "setBehavior", unitId: cargoId, behavior: UnitBehavior.Aggressive });
    }
  }

  return actions;
}

/**
 * Try to load adjacent armies onto the transport.
 * Returns embark actions for armies at the transport's location.
 */
export function tryLoadArmies(
  state: GameState,
  unit: UnitState,
  aiOwner: Owner,
  claimedUnitIds: Set<number>,
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const cap = objCapacity(unit);
  let loadCount = unit.cargoIds.length;

  // First: embark armies already at the transport's location
  for (const u of state.units) {
    if (loadCount >= cap) break;
    if (u.owner === aiOwner && u.type === UnitType.Army && u.loc === unit.loc
        && u.shipId === null
        && (u.func === UnitBehavior.None || u.func === UnitBehavior.Explore || u.func === UnitBehavior.WaitForTransport)) {
      // Cancel behavior on embark — army is now dedicated to transport mission
      if (u.func !== UnitBehavior.None) {
        actions.push({ type: "setBehavior", unitId: u.id, behavior: UnitBehavior.None });
      }
      actions.push({ type: "embark", unitId: u.id, shipId: unit.id });
      claimedUnitIds.add(u.id);
      loadCount++;
    }
  }

  // Second: move adjacent idle/exploring armies onto the transport (they auto-embark via moveUnit)
  const adjacent = getAdjacentLocs(unit.loc);
  for (const adj of adjacent) {
    if (loadCount >= cap) break;
    for (const u of state.units) {
      if (loadCount >= cap) break;
      if (u.owner === aiOwner && u.type === UnitType.Army && u.loc === adj && u.shipId === null
          && (u.func === UnitBehavior.None || u.func === UnitBehavior.Explore || u.func === UnitBehavior.WaitForTransport)
          && u.moved < objMoves(u) && !claimedUnitIds.has(u.id)) {
        aiVLog(`    Loading army #${u.id} from adjacent tile ${adj} onto transport #${unit.id}`);
        // Cancel behavior — army is now dedicated to transport mission
        if (u.func !== UnitBehavior.None) {
          actions.push({ type: "setBehavior", unitId: u.id, behavior: UnitBehavior.None });
        }
        actions.push({ type: "move", unitId: u.id, loc: unit.loc });
        claimedUnitIds.add(u.id);
        loadCount++;
      }
    }
  }

  return actions;
}

/**
 * Count armies within a few tiles of a location that could be loaded (not already claimed).
 */
export function countNearbyArmies(
  state: GameState,
  loc: Loc,
  aiOwner: Owner,
  claimedUnitIds: Set<number>,
): number {
  let count = 0;
  // Check tiles within BFS distance 3 (armies approaching within a few turns)
  const visited = new Set<Loc>([loc]);
  let frontier = getAdjacentLocs(loc);
  for (let depth = 0; depth < 3; depth++) {
    const nextFrontier: Loc[] = [];
    for (const adj of frontier) {
      if (visited.has(adj)) continue;
      visited.add(adj);
      const cell = state.map[adj];
      if (cell.terrain === TerrainType.Land || cell.terrain === TerrainType.City) {
        for (const u of state.units) {
          if (u.owner === aiOwner && u.type === UnitType.Army && u.loc === adj
              && u.shipId === null && !claimedUnitIds.has(u.id)
              && (u.func === UnitBehavior.None || u.func === UnitBehavior.Explore || u.func === UnitBehavior.WaitForTransport)) {
            count++;
          }
        }
        nextFrontier.push(...getAdjacentLocs(adj));
      }
    }
    frontier = nextFrontier;
  }
  return count;
}

/**
 * Create a view map marked with continent values for transport unloading targets.
 * Continents with more cities get higher marks (0-9).
 */
export function createUnloadViewMap(
  viewMap: ViewMapCell[],
  state: GameState,
  aiOwner: Owner,
): ViewMapCell[] {
  const tempMap = viewMap.map(cell => ({ ...cell }));

  // Find coastal cells and mark them based on continent value
  const evaluated = new Set<Loc>();

  for (let loc = 0; loc < MAP_SIZE; loc++) {
    if (!isOnBoard(loc)) continue;
    const contents = viewMap[loc].contents;
    // Look for land cells that haven't been evaluated
    if (!isTraversableLand(contents)) continue;
    if (evaluated.has(loc)) continue;

    const continent = mapContinent(viewMap, loc, VM_WATER);

    // Count targets directly from viewMap characters — NOT scanContinent
    // (scanContinent hardcodes O=P1, X=P2, which is wrong for P2's viewMap
    //  where O=own city and X=enemy city regardless of player)
    let targetCities = 0;
    let shorelineCities = 0; // enemy/unowned cities adjacent to water (reachable by transport)
    let hasOwnCity = false;
    let unexplored = 0;
    let hasWaitingArmies = false;
    for (const cLoc of continent) {
      evaluated.add(cLoc);
      const c = viewMap[cLoc].contents;
      if (c === VM_ENEMY_CITY || c === VM_UNOWNED_CITY) {
        targetCities++;
        // Check if this city is on the shoreline (adjacent to water = transport-accessible)
        for (const adj of getAdjacentLocs(cLoc)) {
          if (viewMap[adj].contents === VM_WATER) {
            shorelineCities++;
            break;
          }
        }
      } else if (c === VM_OWN_CITY) hasOwnCity = true;
      else if (c === VM_UNEXPLORED) unexplored++;
    }

    // Check if this continent has WaitForTransport armies (don't unload where we're loading!)
    for (const u of state.units) {
      if (u.owner === aiOwner && u.type === UnitType.Army
          && u.func === UnitBehavior.WaitForTransport && u.shipId === null) {
        if (continent.has(u.loc)) {
          hasWaitingArmies = true;
          break;
        }
      }
    }

    const isRiverMap = state.config.mapType === "river";
    const isIsland = continent.size <= 20; // small landmass in the river

    // Calculate continent value (0-9) based on cities AND unexplored territory
    // Completely unknown areas are high-priority targets — discovering new continents is critical
    let value = Math.min(targetCities, 6); // cities: up to 6

    // River map bonuses:
    // - Shoreline enemy/unowned cities are highest priority — transports can unload right next to them
    //   (e.g. cities at tributary endpoints, cities on river islands)
    // - Small islands with cities are strategic chokepoints worth seizing early
    if (isRiverMap) {
      if (shorelineCities > 0) value += 2;  // shoreline cities are prime transport targets
      if (isIsland && targetCities > 0) value += 2; // island cities = strategic river control
    }

    const unexploredRatio = continent.size > 0 ? unexplored / continent.size : 0;
    if (unexploredRatio > 0.7) value += 4;       // mostly unknown — very high priority
    else if (unexploredRatio > 0.3) value += 2;  // partially explored
    else if (unexplored > 0) value += 1;          // some unexplored tiles
    value = Math.min(value, 9);

    // Skip our own continent when it has no targets and is fully explored (don't sail home)
    if (value === 0 && hasOwnCity && unexplored === 0) {
      aiLog(`      unloadMap: skip own continent (${continent.size} tiles, own=${hasOwnCity})`);
      continue;
    }
    // Skip continents where we have armies waiting for transport — this is a loading continent,
    // never unload here even if there are target cities (armies are already there to capture them)
    if (hasWaitingArmies) {
      aiLog(`      unloadMap: skip loading continent (${continent.size} tiles, waitingArmies=${hasWaitingArmies}, targets=${targetCities})`);
      continue;
    }
    const effectiveValue = value > 0 ? value : (unexplored > 0 && !hasOwnCity ? 1 : 0);
    if (effectiveValue === 0) continue;

    aiLog(`      unloadMap: continent ${continent.size} tiles, value=${effectiveValue}, targets=${targetCities}, shoreline=${shorelineCities}, unexplored=${unexplored}, own=${hasOwnCity}, waiting=${hasWaitingArmies}${isIsland ? ", ISLAND" : ""}`);
    // Mark coastal water cells adjacent to this continent
    for (const cLoc of continent) {
      const adjacent = getAdjacentLocs(cLoc);
      for (const adj of adjacent) {
        if (viewMap[adj].contents === VM_WATER || viewMap[adj].contents === VM_UNEXPLORED) {
          const currentMark = tempMap[adj].contents;
          const newMark = String(effectiveValue);
          // Keep the higher value
          if (currentMark < "0" || currentMark > "9" || newMark > currentMark) {
            tempMap[adj] = { ...tempMap[adj], contents: newMark };
          }
        }
      }
    }
  }

  // Boost water tiles near visible target cities (not just on the shoreline).
  // Cities 1-3 tiles inland should attract transports to the nearest coast section.
  // Unowned cities get highest value (9) — free capture; enemy cities get (8).
  for (let loc = 0; loc < MAP_SIZE; loc++) {
    if (!isOnBoard(loc)) continue;
    const c = viewMap[loc].contents;
    if (c !== VM_UNOWNED_CITY && c !== VM_ENEMY_CITY) continue;
    const boostValue = c === VM_UNOWNED_CITY ? "9" : "8";
    // BFS outward on land from city, up to 3 tiles
    const bfsQueue: { loc: Loc; depth: number }[] = [{ loc, depth: 0 }];
    const bfsVisited = new Set<Loc>([loc]);
    while (bfsQueue.length > 0) {
      const { loc: cur, depth } = bfsQueue.shift()!;
      // Mark adjacent water tiles with boosted value
      for (const adj of getAdjacentLocs(cur)) {
        if (viewMap[adj].contents === VM_WATER || viewMap[adj].contents === VM_UNEXPLORED) {
          const currentMark = tempMap[adj].contents;
          if (currentMark < "0" || currentMark > "9" || boostValue > currentMark) {
            tempMap[adj] = { ...tempMap[adj], contents: boostValue };
          }
        }
      }
      if (depth < 3) {
        for (const adj of getAdjacentLocs(cur)) {
          if (!bfsVisited.has(adj) && isTraversableLand(viewMap[adj].contents)) {
            bfsVisited.add(adj);
            bfsQueue.push({ loc: adj, depth: depth + 1 });
          }
        }
      }
    }
  }

  // Also mark water tiles adjacent to unexplored tiles as low-priority targets (value "0").
  // This gives transports a destination when they can't see any foreign continents yet —
  // they'll navigate toward unexplored coastline to discover new land.
  for (let loc = 0; loc < MAP_SIZE; loc++) {
    if (!isOnBoard(loc)) continue;
    if (viewMap[loc].contents !== VM_UNEXPLORED) continue; // only unexplored tiles
    // Check if this unexplored tile is adjacent to explored water
    const adjacent = getAdjacentLocs(loc);
    for (const adj of adjacent) {
      if (viewMap[adj].contents === VM_WATER || viewMap[adj].contents === VM_UNEXPLORED) {
        const currentMark = tempMap[adj].contents;
        // Only mark if not already a higher-value target
        if (currentMark < "0" || currentMark > "9") {
          tempMap[adj] = { ...tempMap[adj], contents: "0" };
        }
      }
    }
  }

  return tempMap;
}

/**
 * Create a view map with water tiles adjacent to own cities marked as 'H' (home port).
 * Used for transport return-to-port navigation since waterMoveInfo can't reach land-based city tiles.
 */
export function createPortViewMap(
  viewMap: ViewMapCell[],
  state: GameState,
  aiOwner: Owner,
): ViewMapCell[] {
  const tempMap = viewMap.map(cell => ({ ...cell }));
  for (const city of state.cities) {
    if (city.owner !== aiOwner) continue;
    for (const adj of getAdjacentLocs(city.loc)) {
      if (viewMap[adj].contents === VM_WATER) {
        tempMap[adj] = { ...tempMap[adj], contents: VM_HOME_PORT };
      }
    }
  }
  return tempMap;
}

/**
 * Claim water tiles near a transport's target for multi-transport coordination.
 * BFS from loc through water, claiming all '$'/'%' markers within ~5 tiles.
 */
export function claimPickupZone(
  loadMap: ViewMapCell[],
  loc: Loc,
  claimedPickupLocs: Set<Loc>,
): void {
  const visited = new Set<Loc>([loc]);
  let frontier = [loc];
  for (let depth = 0; depth < 5; depth++) {
    const next: Loc[] = [];
    for (const cur of frontier) {
      for (const adj of getAdjacentLocs(cur)) {
        if (visited.has(adj)) continue;
        visited.add(adj);
        const c = loadMap[adj].contents;
        if (isPickupMarker(c)) {
          claimedPickupLocs.add(adj);
          next.push(adj);
        } else if (c === VM_WATER) {
          next.push(adj);
        }
      }
    }
    frontier = next;
  }
}

/**
 * Create a view map with waiting armies marked as '$' for transport loading.
 * Marks ALL water tiles adjacent to own coastal armies so the transport can path to them.
 */
export function createTTLoadViewMap(
  viewMap: ViewMapCell[],
  state: GameState,
  aiOwner: Owner,
  excludeLocs?: Set<Loc>,
  claimedUnitIds?: Set<number>,
): ViewMapCell[] {
  const tempMap = viewMap.map(cell => ({ ...cell }));

  // Count loadable armies adjacent to each water tile for cluster weighting
  const waterArmyCounts = new Map<Loc, number>();

  for (const u of state.units) {
    if (u.owner !== aiOwner || u.type !== UnitType.Army || u.shipId !== null) continue;
    // Mark idle, exploring, and waiting-for-transport armies as pickup targets
    if (u.func !== UnitBehavior.None && u.func !== UnitBehavior.Explore && u.func !== UnitBehavior.WaitForTransport) continue;
    // Skip armies already claimed by other transports this turn
    if (claimedUnitIds && claimedUnitIds.has(u.id)) continue;

    // Mark ALL adjacent water cells (not just one) so BFS has consistent targets
    const adjacent = getAdjacentLocs(u.loc);
    for (const adj of adjacent) {
      if (viewMap[adj].contents === VM_WATER) {
        if (excludeLocs && excludeLocs.has(adj)) continue;
        const count = (waterArmyCounts.get(adj) || 0) + 1;
        waterArmyCounts.set(adj, count);
      }
    }
  }

  // Mark water tiles with army-weighted pickup markers
  // '$' = 1 army, '%' = 2+ armies (clusters get higher BFS priority)
  for (const [loc, count] of waterArmyCounts) {
    tempMap[loc] = { ...tempMap[loc], contents: count >= 2 ? VM_PICKUP_CLUSTER : VM_PICKUP_SINGLE };
  }

  return tempMap;
}
