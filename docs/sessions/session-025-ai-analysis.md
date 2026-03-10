# Session 025: Deep AI Analysis & Fix Plan

## Test Data

Two x.log captures analyzed:
- **Log A** (pre-fix): Small island map, P1 stuck with 1 city, 2 armies, 1 transport for 60+ turns
- **Log B** (post-fix attempt): Larger map, both players 5-8 cities, 120+ turns observed

---

## Problem Inventory

### P1: Transport Load/Unload Cycle (Critical)

**Observed**: P1 Transport #68 loads 6 armies from tile 18018, moves to 18218, unloads all 6 back at 18018 (same tile!). Armies walk back. Transport picks them up again. Infinite cycle every 2 turns.

**Root cause chain**:
1. Transport at 18017 (water) calls `tryLoadArmies` — loads 6 armies from adjacent 18018 (land)
2. `projectedCargo=6` (full) → enters `loadedThisTurn && isFull` path → navigates toward unload target via `createUnloadViewMap`
3. `createUnloadViewMap` scans continents and marks coastal water with value 0-9. But the armies' HOME continent may have value > 0 if there are unowned/enemy cities on it (e.g., an unowned city within the same continent)
4. Transport navigates to 18218, the marked unload target
5. Next turn: `!loadedThisTurn && isFull` → enters UNLOAD MODE
6. `tryUnloadArmies` finds tile 18018 as valid ('+' not near own city → priority 1)
7. Armies unloaded at 18018, set to Aggressive → find nothing → become idle → Explore → WaitForTransport → transport picks them up again

**Why `tryUnloadArmies` dumps on home continent**:
- The check only looks at whether adjacent land is near own *cities* (tile-level adjacency check)
- If armies are more than 1 tile from own cities, that land passes the filter
- **Missing check**: Is this land on a continent with own WaitForTransport armies? (That's the loading point, not a delivery target)

**Why `createUnloadViewMap` marks home continent**:
- Line 1196: skips WaitForTransport continents only when `targetCities === 0`
- If the home continent has ANY unowned/enemy city, `targetCities > 0`, and the continent gets marked for unloading
- Transport then navigates to its own continent's coast and dumps armies in circles

### P2: Transport Oscillation — 2-Tile Bounce (Critical)

**Observed**: Transport #32 alternates between 16619↔16621 every turn. Transport #85 does the same. Never loads.

**Root cause**:
1. Transport starts at 16621, `tryLoadArmies` finds no armies adjacent → navigates via `createTTLoadViewMap`
2. BFS finds nearest '$' (water tile adjacent to loadable army) at 16820, pathfinding says move to 16619
3. Transport moves to 16619 (step 0), then step 1 tries again from 16619 → moves to... but `prevLoc=16621` only blocks going back to 16621
4. From 16619, the path toward 16820 leads to 16619→16820 direction. Step 1 navigates toward 16820 but actually arrives at a different adjacent tile
5. **Next turn**: starts at 16619, step 0 moves toward 16820 → ends up at 16621 again. `prevLoc` was set to 16619, so 16621 is not blocked
6. The transport bounces between these two tiles because:
   - The target army is behind land the transport can't cross
   - Or the army is also moving (processed after transport in `computeAITurn`)
   - `prevLoc` only remembers ONE previous position, not the full history

**Why the army is unreachable**:
- `createTTLoadViewMap` marks water tiles adjacent to loadable armies as '$'
- But the nearest '$' tile might be accessible by BFS over water, yet the actual army on land is not adjacent to the transport's path
- Transport arrives at a '$' water tile but the army has moved by the time `tryLoadArmies` runs next turn

### P3: Partial Cargo Immediate Delivery (Major)

**Observed**: P2 Transport #60 loads 1/6 armies, immediately enters delivery mode and sails across the map to dump 1 army. Happens repeatedly.

**Root cause**:
1. Transport loads 1 army from adjacent tile
2. `countNearbyArmies` returns 0 (no more armies within BFS distance 1)
3. Falls through to navigate-toward-armies block
4. `createTTLoadViewMap` finds no '$' targets (no idle/explore/WaitForTransport armies near water)
5. `projectedCargo > 0` → enters delivery mode immediately
6. Transport sails for 10-15 turns to deliver 1 army, then sails back. Massive waste.

**Design flaw**: The threshold for entering delivery mode is `projectedCargo > 0` with no minimum. A transport with 1/6 cargo should NOT immediately deliver — it should stay near the loading zone and wait for more armies to arrive.

### P4: No Fighters Ever Built (Major)

**Observed**: Neither player builds a single fighter across 120+ turns. All production is armies + transports.

**Root cause** — the production decision cascade prevents fighters from ever being selected:

1. **1-city phase** (turns 0-10): `aiCityCount <= 1` → always builds army, early return at line 467
2. **2+ cities**: Production priorities checked in order:
   - **Guard 1** (line 393): "Only transport producer" — if city builds transport, check waiting armies. Cities locked into transport early never escape because armies stay WaitForTransport
   - **Guard 2** (line 412): "Army surplus" — if waiting > capacity, keep building transport. With armies accumulating as WaitForTransport, this fires constantly
   - **Priority 1** (line 427): Defense — if enemy armies on continent, switch to army
   - **Priority 2** (line 470): Ensure transport — if no transport being built, switch a city to transport
   - **Priority 2b** (line 478): Army surplus — if waiting >> capacity, switch MORE cities to transport
   - **Priority 3** (line 495): Ratio rebalance — ONLY reached if no guards/priorities triggered

3. The ratio table has fighters at 10% (RATIO_1: `[60, 10, 10, 0, 0, 20, 0, 0, 0]`), but:
   - With 5 cities: 3 build army, 2 build transport = army 60%, transport 40%
   - `overproduced(transport)` returns true (40% vs target 20%), BUT the army surplus guard (Priority 2b) blocks switching away
   - Fighter is never reached by `needMore()` because we never get to Priority 3

**Design gap**: There's no priority level for "ensure at least 1 fighter exists." The ratio table is advisory but gets completely overridden by transport guards.

### P5: Transport Overproduction (Major)

**Observed**: P2 has 4 of 8 cities building transports simultaneously (turns 116+). Only 3 cities produce anything useful.

**Root cause**:
1. Army surplus (Priority 2b, line 478) triggers for EVERY coastal city that isn't already building transport
2. The threshold `waitingArmies > transportCapacity + 6` fires easily when 30+ armies wait
3. No cap on how many cities can switch to transport simultaneously
4. Once locked in, Guard 2 (line 412) keeps them locked: `waitingArmies > actualCapacity` with 30+ waiting always passes
5. Result: exponential transport production while army production collapses

### P6: Aggressive Armies Become Idle and Get Re-Loaded (Moderate)

**Observed**: Armies unloaded with Aggressive behavior find no targets, become idle (func=None), get re-assigned Explore by `assignIdleBehaviors`, then WaitForTransport when explore finds nothing. Transport picks them up again.

**Root cause**: `assignIdleBehaviors` (line 1381) sets idle armies to Explore. When explore finds nothing on a fully-explored island, `exploreUnit` sets them to WaitForTransport (line 1209). This creates a feedback loop where unloaded armies cycle back to transport-eligible state.

### P7: countNearbyArmies Only Checks BFS Depth 0 (Minor)

**Observed**: `countNearbyArmies` uses `for (let depth = 0; depth < 1; depth++)` which only checks immediately adjacent tiles. Armies 2-3 tiles away are not counted, leading to premature "no nearby armies" decisions.

---

## Strategic Analysis: What SHOULD Happen

### Ideal early game (turns 0-30):
1. **Turn 0-5**: Build first army (5 turns)
2. **Turn 5-10**: Army explores, captures nearby city. Second army building.
3. **Turn 10-15**: With 2 cities, one switches to **fighter** (10 turns). Fighter can explore 8 tiles/turn vs army's 1 — covers 8x more territory.
4. **Turn 15-20**: Fighter explores, revealing map. Army captures cities. Third army building.
5. **Turn 20-25**: Fighter has explored most of home continent. AI knows where enemies are. First transport started if armies need island escape.
6. **Turn 25-30**: Fighter has visited 2-3 cities for refueling (base hopping), explored most of reachable area. Transport nearly done.

### Ideal mid game (turns 30-80):
1. Multiple armies exploring/capturing
2. 1-2 fighters providing vision coverage
3. 1 transport shuttling armies to new continents
4. Transport FILLS UP (4-6/6) before delivering
5. Transport delivers to enemy/unowned continent, NOT home island
6. Unloaded armies attack nearby cities

### What actually happens:
1. Only armies built for 100+ turns — no aerial vision
2. Armies explore slowly (1 tile/turn) and get stuck on islands
3. 30+ armies pile up as WaitForTransport
4. Transports oscillate, load/unload at same spot, or deliver 1 army at a time
5. AI never establishes a beachhead on enemy territory

---

## Fix Plan

### Phase A: Production Intelligence (Session 026)

#### A1: Ensure Early Fighter Production
**Where**: `decideProduction()`, after Priority 1 (defense) and before Priority 2 (transport)

**Logic**:
```
if (aiCityCount >= 2) {
  const existingFighters = state.units.filter(u => u.owner === aiOwner && u.type === UnitType.Fighter).length;
  const buildingFighters = prodCounts[UnitType.Fighter];
  if (existingFighters === 0 && buildingFighters === 0) {
    // Find a city that's NOT the only transport producer and NOT defending
    if (city.production !== UnitType.Transport || prodCounts[UnitType.Transport] > 1) {
      if (progress < 0.25) {
        return UnitType.Fighter;
      }
    }
  }
}
```

**Rationale**: Fighter costs 10 turns (2x army). But fighter speed=8 means it explores 8x faster than an army. One fighter per player is essential for map awareness. The original VMS-Empire also prioritized fighters early.

#### A2: Cap Transport Production
**Where**: Priority 2b (army surplus), line 478

**Logic**:
```
const maxTransportCities = Math.max(1, Math.floor(aiCityCount / 4));
if (prodCounts[UnitType.Transport] >= maxTransportCities) {
  // Don't add more transport production even if army surplus exists
  skip
}
```

**Rationale**: With 8 cities, max 2 should build transports. Transports take 30 turns — overcommitting starves army production. Transport capacity = 6 armies × 2 transports = 12 per cycle. That's sufficient throughput.

#### A3: Relax "Only Transport Producer" Guard
**Where**: Guard at line 393

**Current**: Prevents switching if `prodCounts[Transport] <= 1` AND (waiting > 0 OR no existing transport)
**Fix**: Also check if existing transports are functional (not stuck oscillating). If a transport hasn't delivered in N turns, it's dysfunctional and shouldn't block the guard.

*Alternative simpler fix*: Allow switching away from transport production if we already have 2+ transports, even if armies are waiting. The transports exist and will eventually load. More transports won't help if the core transport logic is broken.

#### A4: Fighter-First Ratio for Early Game
**Where**: `getRatioTable()`

**Logic**: When `aiCityCount === 2`, use a special ratio that favors fighter:
```
const RATIO_EARLY = [50, 20, 0, 0, 0, 15, 0, 0, 0]; // 2-3 cities: more fighters
```

This makes the ratio system naturally want fighters before it gets overwhelmed by transport guards.

### Phase B: Transport Movement Overhaul (Session 027)

#### B1: Don't Unload on Home/Loading Continent
**Where**: `shouldUnload()` and `tryUnloadArmies()`

**Logic**: Before returning true from `shouldUnload` or accepting a land target in `tryUnloadArmies`, check if the adjacent land tile is on a continent that has own WaitForTransport armies OR own cities (unless the continent also has enemy cities that make it a legitimate target).

```
// In shouldUnload, after finding adjacent land:
const continent = mapContinent(viewMap, adjLandTile, ".");
const hasWaitingArmies = state.units.some(u =>
  u.owner === aiOwner && u.type === UnitType.Army
  && u.func === UnitBehavior.WaitForTransport
  && continent.has(u.loc));
if (hasWaitingArmies) return false; // this is the loading continent!
```

**Also**: `createUnloadViewMap` already has a `hasWaitingArmies` check (line 1196) but it only skips when `targetCities === 0`. Should ALSO skip when `hasOwnCity && targetCities === 0` or when the continent's target cities have already been reached by existing aggressive armies.

#### B2: Fix Transport Oscillation with Position History
**Where**: `aiTransportMove()`, replace `prevLoc` with a Set

**Logic**:
```
const recentLocs = new Set<Loc>([unit.loc]); // track ALL positions this turn
// Every move: add to recentLocs, check against recentLocs instead of prevLoc
if (target !== null && !recentLocs.has(target)) { ... }
```

This prevents any revisiting within a turn — not just 2-tile bounce but also 3+ tile cycles.

**Cross-turn oscillation**: Track transport's location at start of turn. If it's the same as last turn's start, the transport is stuck. After 3 consecutive turns of no progress, switch to pure explore mode (ttExploreMoveInfo) to break out.

#### B3: Minimum Cargo for Delivery
**Where**: Navigate-toward-armies block, line 886

**Logic**:
```
} else if (projectedCargo > 0) {
  // Only enter delivery mode if we have meaningful cargo (>= 50% capacity)
  // OR if there are truly no loadable armies anywhere
  const minDeliverCargo = Math.ceil(capacity / 2); // 3 for standard transport
  const anyLoadableArmies = state.units.some(u =>
    u.owner === aiOwner && u.type === UnitType.Army && u.shipId === null
    && (u.func === UnitBehavior.None || u.func === UnitBehavior.Explore || u.func === UnitBehavior.WaitForTransport)
  );
  if (projectedCargo >= minDeliverCargo || !anyLoadableArmies) {
    deliveringMode = true;
    // navigate toward enemy territory
  } else {
    // Stay in loading mode — wait near pickup zone
    break;
  }
}
```

**Rationale**: Delivering 1/6 army across 10+ tiles of ocean is a waste of 20+ turns. Better to wait near the loading zone for more armies, or explore to find new armies.

#### B4: Prevent Re-Loading of Just-Unloaded Armies
**Where**: `tryLoadArmies()`

**Logic**: Add a `recentlyUnloaded` Set (or use Aggressive behavior) to prevent picking up armies that were just dumped. Currently armies get set to Aggressive on unload (line 1042), which should exclude them from loading. But they eventually cycle through Aggressive → idle → Explore → WaitForTransport.

**Better approach**: After unloading, the transport should sail away from the unload continent before re-entering loading mode. The `justUnloaded` flag already does this partially, but only for 1 step. Need to ensure the transport sails multiple tiles away.

#### B5: countNearbyArmies Increase Range
**Where**: `countNearbyArmies()`, line 1116

**Change**: `depth < 1` → `depth < 3` (check 3-tile radius instead of just adjacent)

This gives the transport awareness of armies approaching within 3 tiles, making it more patient about waiting for loading.

### Phase C: Army-Transport Coordination (Session 028)

#### C1: Armies Near Transport Should Not Wander
**Where**: `aiArmyMove()` and `assignIdleBehaviors()`

When an army has `func === None` and there's a non-full transport within 3 tiles, the army should move toward the transport rather than exploring or fighting distant targets. Currently `aiArmyMove` compares fight vs load distance, but idle armies processed by `assignIdleBehaviors` get set to Explore and then wander off.

**Fix**: Before assigning Explore in `assignIdleBehaviors`, check if a transport is nearby. If so, set WaitForTransport instead of Explore.

#### C2: Transport Should Navigate to Waiting Army Clusters
**Where**: `createTTLoadViewMap()`

Currently marks ALL loadable armies. Should prioritize clusters of WaitForTransport armies (more armies in one area = better loading efficiency). Could weight '$' markers by number of armies at that coastal segment.

#### C3: Coordinate Loading/Unloading Between Multiple Transports
**Where**: `aiTransportMove()`, `claimedUnitIds`

Currently `claimedUnitIds` prevents two transports from claiming the same army within a turn. But across turns, two transports can compete for the same army cluster, leading to one loading while the other oscillates nearby with nothing to load.

**Fix**: When a transport is heading toward a cluster, other transports should navigate to different clusters or wait. Could use a "claimed locations" set shared across transports.

### Phase D: Testing & Validation (Session 029)

#### D1: Add AI Integration Test for Transport Delivery
Test that a transport with 6 cargo navigates to an enemy continent and unloads there, NOT at home continent.

#### D2: Add AI Integration Test for Fighter Production
Test that with 2+ cities, at least 1 fighter is produced within 15 turns.

#### D3: Add AI Integration Test for Transport Production Cap
Test that with 8 cities, no more than 2 build transports simultaneously.

#### D4: Add Oscillation Detection Test
Test that a transport doesn't visit the same tile twice within a turn.

#### D5: Manual Playtest Validation
Run auto-play mode for 200 turns and verify:
- At least 1 fighter exists by turn 20
- Transport delivers armies to enemy territory (not home)
- No transport oscillates for more than 3 consecutive turns
- Army surplus doesn't exceed 2× transport capacity

---

## Priority Order

1. **A1 (early fighter)** — highest impact/effort ratio, simple to implement
2. **B1 (don't unload home)** — fixes the worst transport bug
3. **B2 (oscillation fix)** — fixes 2nd worst transport bug
4. **A2 (cap transport production)** — prevents resource waste
5. **B3 (min cargo for delivery)** — prevents 1-army delivery waste
6. **C1 (army-transport coordination)** — reduces WaitForTransport buildup
7. **B5 (countNearbyArmies range)** — small fix, big patience improvement
8. **A3/A4/B4/C2/C3** — refinements, lower priority

---

## Unit Statistics Reference

| Unit | Build Time | Speed | Capacity | Range |
|------|-----------|-------|----------|-------|
| Army | 5 | 1 | 0 | ∞ |
| Fighter | 10 | 8 | 0 | 32 |
| Patrol | 15 | 4 | 0 | ∞ |
| Destroyer | 20 | 2 | 0 | ∞ |
| Submarine | 20 | 2 | 0 | ∞ |
| Transport | 30 | 2 | 6 | ∞ |
| Carrier | 30 | 2 | 8 | ∞ |
| Battleship | 40 | 2 | 0 | ∞ |
| Satellite | 50 | 10 | 0 | ∞ |

Fighter explores at 8 tiles/turn with range 32 (4 turns from base). One fighter can cover ~200 tiles in 4 turns vs army's ~4 tiles. This is 50x more exploration per turn invested.

## Production Ratio Tables

| Cities | Army | Fighter | Patrol | Destr | Sub | Transport | Carrier | BB | Sat |
|--------|------|---------|--------|-------|-----|-----------|---------|-----|-----|
| ≤10 | 60 | 10 | 10 | 0 | 0 | 20 | 0 | 0 | 0 |
| 11-20 | 90 | 15 | 10 | 10 | 10 | 40 | 0 | 0 | 0 |
| 21-30 | 120 | 20 | 20 | 10 | 10 | 60 | 10 | 10 | 0 |
| >30 | 150 | 30 | 30 | 20 | 20 | 70 | 10 | 10 | 0 |

With ≤10 cities: fighter should be 10% of production. With 5 cities, that's ~0.5 cities producing fighters. But the ratio system never gets a chance because transport guards block it.
