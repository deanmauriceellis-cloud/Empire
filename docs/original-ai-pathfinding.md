# Original Empire AI — Pathfinding System

Source: `map.c`, `empire.h`

## Core Architecture

Weighted breadth-first search (BFS) using **perimeter lists** — the frontier expands outward from the starting location. Objectives are evaluated AS the BFS expands (not after), allowing early termination.

## Data Structures

### path_map_t (per-cell pathfinding state)
```c
typedef struct {
  int cost;      // total cost to reach this cell
  int inc_cost;  // incremental cost of last step
  char terrain;  // T_LAND=2, T_WATER=4, T_AIR=6(both), T_UNKNOWN=0, T_PATH=1
} path_map_t;
```

### move_info_t (objective specification)
```c
typedef struct {
  char city_owner;   // 'X' (comp) or 'O' (user) — whose cities to consider
  char *objectives;  // string of viewmap characters to seek
  int weights[11];   // cost multiplier for each objective (lower = more attractive)
} move_info_t;
```

### perimeter_t (BFS frontier)
```c
typedef struct {
  int len;              // number of cells on perimeter
  loc_t list[MAP_SIZE]; // cell locations
} perimeter_t;
```

## Pathfinding Variants

### vmap_find_lobj — Land-only search
```
Used by: armies seeking land objectives
Start on land, expand through land only
```

### vmap_find_wobj — Water-only search
```
Used by: ships, empty transports exploring
Start on water, expand through water only
```

### vmap_find_aobj — Air search (land + water)
```
Used by: fighters
Start on land or water, expand through both
```

### vmap_find_wlobj — Water-to-land search
```
Used by: loaded transports seeking unload points
Start on water, can expand to adjacent land cells
Alternates: water expansion → land+water expansion → water expansion
Models: transport moves on water, armies walk on land after unloading
```

### vmap_find_lwobj — Land-to-water search
```
Used by: armies seeking transports to board
Start on land, can expand to adjacent water cells
Alternates: land expansion → land+water expansion → water expansion
Models: army walks on land, then boards transport on water
Takes beat_cost parameter — only returns if better than existing option
```

## BFS Expansion Algorithm

```
expand_perimeter(path_map, vmap, move_info, frontier, terrain_type, cost, ...):
  for each cell on frontier:
    for each of 8 adjacent cells:
      if not yet visited (cost == INFINITY):
        1. Determine terrain type (land, water, unknown)
        2. If terrain matches allowed type:
           → Add to appropriate new frontier (land_frontier or water_frontier)
           → Set cost = current_cost + increment
        3. Check if cell is an OBJECTIVE:
           → Look up cell's viewmap char in move_info.objectives
           → If found: obj_cost = weight + current_cost
           → If obj_cost < best_cost: update best_cost, best_loc
        4. If terrain unknown (unexplored):
           → Set cost to INFINITY/2 (reachable but expensive)

  TERMINATION: when frontier is empty OR best_cost <= current_cost
  (no further expansion can find a better objective)
```

## Objective Cost Formula

```
objective_cost(vmap, move_info, loc, base_cost):
  1. Find cell's viewmap char in objectives string
  2. weight = move_info.weights[index]
  3. If weight >= 0: return weight + base_cost
  4. Special case W_TT_BUILD (-1):
     → Calculate transport build wait time
     → wait = (build_time - work) * 2  (doubled for land crossing)
     → return max(wait, base_cost + 2)
```

The `* 2` factor for transport building accounts for the army needing to walk to the coast AND the transport needing to sail to the army.

## Path Following (move_objective)

After BFS finds a target, the path is followed:

```
move_objective(obj, path_map, destination, adj_list):
  1. Mark path from destination back to current position
  2. Find adjacent cell on the marked path
  3. Move object one step
  4. If object has remaining moves AND hasn't reached destination:
     → Check for adjacent attacks (opportunistic combat)
     → If no attacks: recursively call move_objective for remaining moves
     → Reuses same path_map (optimization — avoids re-BFS)
```

### Path Marking
```
vmap_mark_path(path_map, vmap, destination):
  Starting from destination, trace back via lowest-cost adjacent cells
  Mark each cell with T_PATH terrain
  Result: a trail from destination to start position
```

## Continent Analysis

### vmap_cont — Flood fill from location
```
BFS from loc, expanding through all non-water cells (for land continent)
or all non-land cells (for water body)
Marks connected component in cont_map array
Also marks adjacent unexplored tiles
```

### vmap_cont_scan — Count contents of continent
```
Scans cont_map and counts:
  - unexplored tiles
  - user cities, user armies, user ships
  - comp cities, comp armies, comp ships
  - unowned cities
  - total size
Returns scan_counts_t struct with all tallies
```

### vmap_mark_up_cont — Extend continent marking
```
Same as vmap_cont but can mark ADDITIONAL cells onto existing cont_map
Used to mark multiple own-city continents into single map
```

## Key Design Principles

1. **Early termination**: BFS stops when `best_cost <= current_cost` — no cell at the current distance can beat the best found objective
2. **Weighted objectives**: Different targets have different costs. Low weight = high priority. BFS naturally finds the cheapest objective considering both distance AND weight.
3. **Terrain discrimination**: Different unit types expand through different terrain. Armies only on land, ships only on water, fighters on both.
4. **Multi-step paths**: `move_objective` reuses the path_map for remaining moves within a turn — avoids redundant BFS calls
5. **Land-water transitions**: Special BFS variants handle armies crossing to water (boarding transports) and transports reaching land (unloading)

## Comparison with Our Rewrite

Our `findMoveToward()` and `findMoveTowardWithObjective()` in `pathfinding.ts` implement the same weighted BFS. Key differences:
- We use JavaScript Map/Set instead of arrays
- We don't have the land-to-water / water-to-land variants (armies don't actively seek transports via pathfinding)
- We mark water cells instead of city cells in the unload map
- Our perimeter expansion is similar but uses array-based queues
