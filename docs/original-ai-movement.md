# Original Empire AI — Unit Movement System

Source: `compmove.c`, `data.c`, `map.c`, `object.c`

## Move Order
```
Satellite → Transport → Carrier → Battleship → Patrol → Submarine → Destroyer → Army → Fighter
```
Transports move BEFORE armies. This is critical: transports position themselves, then armies board.

## Objective Weight Tables (move_info_t)

Each table has: `{city_owner, objectives_string, weights[]}`

### Transport Loading
```
tt_load = { COMP, "$", {1} }
```
- `$` = water tiles adjacent to loadable armies (marked by make_tt_load_map)
- Weight 1 (equal priority for all armies)

### Transport Unloading
```
tt_unload = { COMP, "9876543210 ", {1,1,1,1,1,1,11,21,41,101,61} }
```
- Digits 9-0 = continent city count (higher = more attractive)
- `' '` = unexplored territory
- Weights: 9-4 cities → cost 1 (very attractive), 3 → 11, 2 → 21, 1 → 41, 0 → 101, unexplored → 61

### Transport Explore (empty, no armies)
```
tt_explore = { COMP, " ", {1} }
```
- Only seeks unexplored water

### Army Fight (land objectives)
```
army_fight = { COMP, "O*TA ", {1,1,1,1,11} }
```
- `O` = enemy city (weight 1, highest priority)
- `*` = unowned city (weight 1)
- `T` = own transport (weight 1 — armies seek transports!)
- `A` = enemy army (weight 1)
- `' '` = unexplored (weight 11 — low priority)

### Army Load (seek transport)
```
army_load = { COMP, "$x", {1, W_TT_BUILD} }
```
- `$` = loading transport location (weight 1)
- `x` = city building a transport (weight = wait time for transport completion)

### Fighter Fight
```
fighter_fight = { COMP, "TCFBSDPA ", {1,1,5,5,5,5,5,5,9} }
```
- Transport/Carrier (weight 1 — high priority targets)
- Other ships/fighters (weight 5)
- Army (weight 5)
- Unexplored (weight 9)

### Ship Fight
```
ship_fight = { COMP, "TCBSDP ", {1,1,3,3,3,3,21} }
```
- Transport/Carrier (weight 1)
- Combat ships (weight 3)
- Unexplored (weight 21)

### Ship Repair
```
ship_repair = { COMP, "X", {1} }
```
- Seek own cities only

## Army Movement Decision Tree

```
army_move(obj):
  1. At sea without transport?
     → find_best_tt() to board nearest transport
     → Mark as func=1 (needs loading)
     → RETURN

  2. Adjacent enemy to attack?
     → attack(obj, target)
     → If army ends up at sea → kill (drowned)
     → RETURN

  3. On a transport?
     a. Transport is LOADING (func=0)?
        → load_army(obj) — stay on transport
        → RETURN
     b. Transport is UNLOADING (func=1)?
        → Navigate toward unload objectives
        → RETURN

  4. Find land objective (BFS via army_fight weights)
     → Calculate cross_cost:
        enemy army/city = 60 (very expensive to cross water for)
        unowned city = 30
        unexplored = 14

  5. Compare land objective vs transport loading:
     IF land objective not found OR cross_cost > 0:
       → make_army_load_map() — mark transports with '$', tt-cities with 'x'
       → Find transport via army_load weights
       IF transport found AND cheaper than land objective:
         → board_ship() — move toward transport
         → RETURN

  6. Move toward land objective
     → move_objective(obj, path, target)
```

### Critical: Army Cross-Water Cost Comparison
The original game has armies **compare** the cost of walking to a land objective vs boarding a transport. This is NOT in our rewrite. The formula:
```
cross_cost = path_to_objective.cost * 2 - objective_value
```
- If `cross_cost > 0`: transport is cheaper → seek transport
- If `cross_cost <= 0`: walking is cheaper → walk to objective

## Transport Movement State Machine

```
transport_move(obj):
  1. If EMPTY:
     → Set func = 0 (loading)
     → Check for adjacent enemy transport to attack

  2. If FULL:
     → Set func = 1 (unloading)

  3. If LOADING (func=0):
     a. make_tt_load_map() — mark army pickup points with '$'
     b. BFS via tt_load weights to find '$' objectives
     c. If no armies found → explore (tt_explore)
     d. move_objective() toward target

  4. If UNLOADING (func=1):
     a. make_unload_map() — mark continents with city-count digits 0-9
     b. BFS via tt_unload weights (prefer high-digit continents)
     c. move_objective() toward target
```

### Key: Transport is BINARY
- Loading (func=0) or Unloading (func=1)
- Switches to unloading ONLY when full
- Switches to loading ONLY when empty
- **No partial delivery logic** — this is simpler than our rewrite

## Transport Load Map (make_tt_load_map)

```
make_tt_load_map(xmap, vmap):
  1. Copy viewmap
  2. Find all own armies with func=1 (needs loading)
  3. For each such army:
     → Mark adjacent water tiles with '$'
  4. Result: BFS can path to water near loadable armies
```

## Transport Unload Map (make_unload_map)

This is the STRATEGIC TARGET SELECTION algorithm:

```
make_unload_map(xmap, vmap):
  1. Copy viewmap, prune explored locations
  2. Mark own continents (flood fill from each own city)
  3. For each enemy/unowned city on the map:
     a. Map the continent it's on
     b. Count: total cities, enemy cities, own cities, unowned cities
     c. Assign value based on rules:
        - CONTESTED (both sides have cities): value = total_cities
        - EXPANSION (more unowned than enemy, we have none): value = total_cities
        - SINGLE ENEMY (1 enemy city, 0 own): value = 2
        - DEFAULT: value = 0
     d. Mark the city cell with digit character ('0'-'9')
  4. Result: BFS navigates toward highest-value continents
```

### Unload Value Rules (CRITICAL)
| Scenario | Value | Rationale |
|----------|-------|-----------|
| Both sides have cities on continent | total_cities | Contested — reinforce |
| Unowned > enemy, we have 0 | total_cities | Expansion opportunity |
| 1 enemy city, 0 own cities | 2 | Worth attacking |
| Everything else | 0 | Low priority |

**Note**: The original marks CITY CELLS with values, not water cells. Our rewrite marks coastal WATER cells instead.

## Fighter Movement

```
fighter_move(obj):
  1. Adjacent target? → attack, RETURN
  2. Fuel check: if range <= dist_to_nearest_city + 2
     → Navigate toward nearest own city
  3. Otherwise: BFS via fighter_fight weights
     → Attack ships/armies/explore
```

### Fighter Fuel
- Range decreases by 1 per move
- Max range: 32
- Buffer: return when `range <= city_dist + 2`
- Refuel: landing at own city resets range to max
- Range = 0 while not at city → fighter destroyed

## Ship Movement

```
ship_move(obj):
  1. Damaged? → if in port, stay. Otherwise, navigate to port (ship_repair)
  2. Adjacent target? → attack, RETURN
  3. BFS via ship_fight weights → seek enemies/explore
```

## Army Loading Coordination

### find_best_tt() — Transport Selection
```
For each transport at location:
  if not full:
    prefer the MOST FULL transport (p->count >= best->count)
```
This distributes armies across transports rather than piling all onto one.

### load_army() — Army Boarding
```
1. Check current tile for non-full transport
2. Check all 8 adjacent tiles for non-full transport
3. Pick MOST FULL non-full transport (via find_best_tt)
4. If transport is at same tile → mark army as moved
5. If transport is adjacent → move army to transport tile (auto-embark)
```

## Key Differences from Our Rewrite
1. **No shouldUnload()** — transport is binary: loading when not full, unloading when full
2. **No partial delivery** — only delivers when transport is FULL
3. **Armies actively seek transports** — army_fight includes 'T' (transport) as objective
4. **Cross-water cost comparison** — armies decide walk vs transport based on distance math
5. **Unload map marks CITY cells** — not coastal water cells
6. **No multi-transport coordination** — no claimedPickupLocs mechanism
7. **Transport stays loading until full** — no oscillation between load/unload states
