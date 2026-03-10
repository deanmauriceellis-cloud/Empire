# Original Empire AI — Production System

Source: `compmove.c` lines 79-248, `data.c` lines 110-115

## Production Ratio Tables

Selected based on total AI-owned city count:

```
Unit      ratio1(≤10) ratio2(≤20) ratio3(≤30) ratio4(>30)
Army         60          90         120         150
Fighter       0          10          20          30
Patrol       10          10          20          30
Submarine     0          10          10          20
Destroyer     0          10          10          20
Transport    20          40          60          70
Carrier       0           0          10          10
Battleship    0           0          10          10
Satellite     0           0           0           0
```

Key insight: **Armies always dominate** (60-150 ratio). Transports are second priority (20-70). Fighters only appear after 10+ cities.

## Production Decision Algorithm (comp_prod)

Three-priority system, evaluated in order:

### Priority 1: Continental Defense
```
1. Map the continent this city is on
2. Count: enemy cities, enemy armies, own army-producing cities, unowned cities, unexplored tiles
3. interest = (unexplored > 0 || enemy_cities > 0 || enemy_armies > 0 || unowned_cities > 0)
4. need_count = enemy_cities - own_army_producers + interest + (enemy_cities > 0 ? 1 : 0)
5. If need_count > 0 → produce ARMY, return
```

### Priority 2: First Transport
```
1. Count cities producing each unit type
2. If ONLY 1 army producer exists and this is it → keep producing armies, return
3. If no transport being built AND city is coastal non-lake → produce TRANSPORT, return
4. Special case: if only army producer is on a lake, swap it to this city
```

### Priority 3: Ratio Rebalancing
```
1. If producing armies AND continent has threats → keep, return
2. If overproduced(current_type, city_counts):
   a. Only switch if progress < threshold
   b. Find most-needed type via ratio table
   c. Switch production
```

### Overproduction Check
```c
overproduced(city, counts) {
  for each unit_type i != current_production:
    if (counts[current] - 1) * ratio[i] > (counts[i] + 1) * ratio[current]:
      return true  // switching to i would improve balance
  return false
}
```

### Lake Detection
A city is on a **lake** if its water body has NO connection to:
- Enemy cities
- Unowned cities
- Unexplored territory

Lake cities never build ships (except fighters/satellites). This prevents wasting turns on ships that can't reach the open ocean.

## Production Switch Penalty
When switching production, `work` resets with a penalty:
```
new_work = -(current_work / 5)  // capped at 3 turns max in our rewrite
```

## Key Differences from Our Rewrite
1. Original has NO explicit "island escape" logic — it relies on the "first transport" priority naturally kicking in
2. Original doesn't track WaitForTransport — armies just have func=1 (needs loading)
3. Ratio tables are simpler — no per-phase fighter/transport thresholds
4. Original counts ALL cities for ratio, not just coastal ones
