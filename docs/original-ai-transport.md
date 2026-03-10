# Original Empire AI — Transport System

Source: `compmove.c` lines 563-845, `data.c` lines 105-145

## State Machine

The original transport has TWO states:
- **Loading** (`func=0`): Seek and load armies
- **Unloading** (`func=1`): Navigate to enemy shore, disembark

Switches to unloading **only when FULL**. Switches to loading **only when EMPTY**. No partial delivery.

```c
// transport_move() in compmove.c
if (obj->count == 0)          obj->func = 0;  // empty → loading
if (obj->count == capacity)   obj->func = 1;  // full → unloading
```

## Loading Phase (func=0)

### 1. Create Load Map (make_tt_load_map)
```c
// Find all AI armies that need loading (func=1 means "needs transport")
for each AI army with func==1:
  mark adjacent water tiles with '$'
```

### 2. BFS to Find Armies
```c
new_loc = vmap_find_wlobj(path_map, amap, obj->loc, &tt_load);
// tt_load: objectives="$", weights={1}
// water-to-land BFS that can path through water to reach '$' markers
```

### 3. Fallback: Explore
```c
if (new_loc == obj->loc) {  // no armies found
  unmark_explore_locs(amap);  // prevent re-exploring
  new_loc = vmap_find_wobj(path_map, amap, obj->loc, &tt_explore);
  // tt_explore: objectives=" ", weights={1}  (seek unexplored water)
}
```

### 4. Move
```c
move_objective(obj, path_map, new_loc, "a ");
// "a " = attack list: enemy armies and unexplored territory
// Transport can attack adjacent enemy armies while pathfinding
```

## Unloading Phase (func=1)

### 1. Create Unload Map (make_unload_map)

This is the **strategic target selection** algorithm:

```c
make_unload_map(xmap, vmap):
  // Step 1: Mark all own continents (flood fill from each own city)
  for each own city:
    vmap_mark_up_cont(owncont_map, xmap, city.loc, MAP_SEA)

  // Step 2: For each enemy/unowned city visible:
  for each cell where vmap[i] == 'O' or '*':
    // Map the continent this city is on
    vmap_cont(tcont_map, xmap, i, MAP_SEA)
    counts = vmap_cont_scan(tcont_map, xmap)

    total = unowned + enemy + own cities on this continent
    if (total > 9) total = 0  // cap at '9'

    // VALUE ASSIGNMENT RULES:
    if (enemy > 0 && own > 0):
      value = total   // CONTESTED — both sides present
    else if (unowned > enemy && own == 0):
      value = total   // EXPANSION — unclaimed territory
    else if (enemy == 1 && own == 0):
      value = 2       // SINGLE TARGET — lone enemy city
    else:
      value = 0       // LOW PRIORITY

    xmap[i].contents = '0' + value  // mark THE CITY CELL (not water)
```

**Critical**: The original marks CITY CELLS with digits, not coastal water. The BFS then paths from water toward these marked land cells via `vmap_find_wlobj` (water-to-land search).

### 2. BFS to Find Target
```c
new_loc = vmap_find_wlobj(path_map, amap, obj->loc, &tt_unload);
// tt_unload: objectives="9876543210 "
// weights: {1,1,1,1,1,1, 11,21,41,101, 61}
//           9 8 7 6 5 4   3  2  1   0  unexplored
```

Weight interpretation (lower = more attractive):
| Continent Cities | Weight | Priority |
|-----------------|--------|----------|
| 4-9 | 1 | Highest — big targets |
| 3 | 11 | High |
| 2 | 21 | Medium |
| 1 | 41 | Low |
| 0 | 101 | Very low |
| Unexplored | 61 | Moderate |

### 3. Move
```c
move_objective(obj, path_map, new_loc, " ");
```

## Army-Transport Coordination

### Armies Actively Seek Transports
The original has armies FIND transports, not just wait:
```c
// army_move() — Step 5
make_army_load_map(obj, amap, comp_map);
// Marks: '$' = loading transports, 'x' = transport-building cities
new_loc = vmap_find_lwobj(path_map, amap, obj->loc, &army_load, cross_cost);
```

### Cross-Water Cost Comparison
Armies compare walking vs transport boarding:
```c
// Cost to walk to land objective:
switch (objective_type):
  enemy army/city: cross_cost = 60   // expensive — walk if possible
  unowned city:    cross_cost = 30
  unexplored:      cross_cost = 14   // cheap — likely board transport
cross_cost = path_cost * 2 - cross_cost
// If cross_cost > 0 → transport is cheaper → seek transport
// If cross_cost <= 0 → walking is cheaper → walk
```

### Armies Stay On Loading Transports
```c
// army_move() — if army is on a transport
if (obj->ship->func == 0) {  // transport is loading
  load_army(obj);  // re-board (don't jump off)
  return;          // CRITICAL: do not move independently
}
```
This prevents the load→jump off→reload cycle.

### Load Distribution (find_best_tt)
```c
// Prefers the MOST FULL non-full transport
if (p->count >= best->count) best = p;
```
Distributes armies across transports. Partially-loaded transports fill up before empty ones start loading.

## Empty Transport Behavior

Empty transports that find no armies:
1. Mark already-explored water to prevent re-exploring
2. BFS for unexplored water tiles
3. Move toward nearest unexplored water

This keeps empty transports usefully scouting rather than sitting idle.

## What the Original Does NOT Have

1. **No shouldUnload()** — no partial unloading decision
2. **No partial delivery** — transports only unload when full
3. **No claimedPickupLocs** — no multi-transport coordination
4. **No claimedUnitIds** — no cross-transport army claiming
5. **No WaitForTransport behavior** — armies just have func=1 "needs loading"
6. **No prevLocs oscillation detection** — simpler state machine doesn't need it
7. **No countNearbyArmies** — transport doesn't "wait" for nearby armies

## Bugs Our Rewrite Introduced (Lessons Learned)

| Issue | Original Behavior | Rewrite Bug | Fix Applied |
|-------|-------------------|-------------|-------------|
| Circular ferry | Only unloads when FULL, at enemy cities | shouldUnload triggers at <50% cargo near random land | Added 50% cargo threshold, 40-tile BFS for own cities |
| Dump on home island | Unload map only marks enemy/unowned cities | createUnloadViewMap marked value=0 continents with unexplored tiles | Skip value=0 continents entirely |
| Single-army delivery | Only delivers when FULL | Partial delivery at any cargo level | shouldUnload requires ≥50% cargo |
| Transport competition | Armies prefer most-full transport | createTTLoadViewMap showed all armies to all transports | Filter by claimedUnitIds |
| Oscillation | Binary state: loading XOR unloading | Per-step state re-evaluation | Added recentLocs + prevLocs tracking |
| Mini-ferry | Only unloads at enemy cities | shouldUnload BFS radius (20) too small | Increased to 40-tile radius |
