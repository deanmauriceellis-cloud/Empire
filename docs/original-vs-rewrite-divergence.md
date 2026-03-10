# Original Empire vs Rewrite — Divergence Checklist

Status key: `MATCH` = same as original, `DIVERGE` = different, `ADDED` = new in rewrite, `MISSING` = not yet implemented

---

## Transport System

| # | Feature | Original | Rewrite | Status | Choice |
|---|---------|----------|---------|--------|--------|
| T1 | State machine | Binary: loading(0) / unloading(1) | Multi-state: loading / delivering / unloading / exploring | DIVERGE | **Consider simplifying to binary.** Our multi-state adds shouldUnload, partial delivery, deliveringMode — all sources of bugs. Original's simplicity is elegant. |
| T2 | Unload trigger | Only when FULL | When full OR shouldUnload (partial + near enemy) | DIVERGE | **Keep both but with 50% cargo min (done).** Partial delivery is useful when no more armies exist, but needs the threshold. |
| T3 | Unload map targets | Marks CITY CELLS with digits | Marks COASTAL WATER cells with digits | DIVERGE | **Our approach works but is indirect.** Original paths water→land toward city cells. We path water→water toward marked coastal water. Both find the same destinations. Keep ours. |
| T4 | Unload map values | Contested=total, Expansion=total, SingleEnemy=2, Other=0 | targetCities count, skip own-city/loading continents, skip value=0 | DIVERGE | **We skip more aggressively.** Original marks value=0 targets; we skip them. Original marks contested continents (both sides have cities); we do too. Reasonable divergence. |
| T5 | Load map | Marks army locations with func==1 | Marks water adjacent to loadable armies ($/%) | DIVERGE | **Our approach is different but equivalent.** Original marks army tiles for water-to-land BFS. We mark water tiles for water-only BFS. Same result. |
| T6 | Empty transport fallback | Explore unexplored water | Explore unexplored water | MATCH | — |
| T7 | Multi-transport coordination | None | claimedPickupLocs + claimedUnitIds | ADDED | **Keep.** Improvement over original. Prevents transport competition. |
| T8 | Oscillation detection | Not needed (binary state) | prevLocs + recentLocs tracking | ADDED | **Keep but consider simplifying to binary state (T1).** If we go binary, this becomes unnecessary. |

## Army-Transport Coordination

| # | Feature | Original | Rewrite | Status | Choice |
|---|---------|----------|---------|--------|--------|
| A1 | Armies seek transports | Yes — army_load BFS paths to '$' (transports) and 'x' (tt-cities) | No — armies explore until WaitForTransport, then move to coast | DIVERGE | **CONSIDER ADDING.** Original armies actively path toward transports. Ours passively wait at coast. This causes the "transport chasing armies that are exploring" problem. |
| A2 | Cross-water cost comparison | Armies compare walk cost vs transport cost | Not implemented | MISSING | **CONSIDER ADDING.** Would let armies intelligently decide: walk to objective vs board transport. Would reduce unnecessary WaitForTransport. |
| A3 | Armies on loading transport | Stay put (don't move independently) | Transported armies are cargo (no independent movement) | MATCH | — (both prevent jumping off) |
| A4 | Load distribution | Prefer MOST FULL non-full transport | No preference (first-come) | MISSING | **CONSIDER ADDING.** Would fill transports faster. Easy to implement in tryLoadArmies. |
| A5 | WaitForTransport behavior | func=1 "needs loading" — simple flag | Full behavior with coast-seeking BFS | ADDED | **Keep.** More sophisticated than original but works well. |

## Production

| # | Feature | Original | Rewrite | Status | Choice |
|---|---------|----------|---------|--------|--------|
| P1 | Ratio tables | 4 tables (ratio1-4) based on city count | Same concept with EARLY/R1-R4 | MATCH | — |
| P2 | Continental defense | Priority 1: defend own continent from enemies | Priority 1: defense | MATCH | — |
| P3 | First transport | Priority 2: first coastal non-lake city builds transport | Priority 2: same | MATCH | — |
| P4 | Lake detection | Water body with no enemy/unowned/unexplored = lake | Same | MATCH | — |
| P5 | Island escape | Not explicit — relies on first-transport priority | Explicit detection: all armies WaitForTransport + no transport | ADDED | **Keep.** Handles edge case original doesn't address well. |
| P6 | Transport cap | Implicit via ratio tables | Explicit: max ceil(cities/4) transport producers | DIVERGE | **Keep ours.** More controllable than ratio-only. |
| P7 | Overproduction | Ratio comparison formula | Same concept | MATCH | — |
| P8 | Switch penalty | work resets to -(work/5) | Capped at 3 turns: min(floor(work/5), 3) | DIVERGE | **Keep ours.** Cap prevents crippling delays. |

## Movement & Pathfinding

| # | Feature | Original | Rewrite | Status | Choice |
|---|---------|----------|---------|--------|--------|
| M1 | BFS engine | Perimeter-list BFS with weighted objectives | Same concept in findMoveToward | MATCH | — |
| M2 | Water-to-land BFS | vmap_find_wlobj for transports reaching land | Not implemented (we use separate load/unload maps) | MISSING | **Low priority.** Our approach works differently but achieves same result. |
| M3 | Land-to-water BFS | vmap_find_lwobj for armies reaching transports | Not implemented | MISSING | **Would help with A1.** If armies actively seek transports, they need this BFS variant. |
| M4 | Path reuse | move_objective reuses path_map for remaining moves | We recompute loadMap/unloadMap each step | DIVERGE | **Keep ours.** Simpler, and recomputing handles state changes mid-turn better. |
| M5 | Move order | Sat→TT→CV→BB→PT→SS→DD→Army→Fighter | Same | MATCH | — |

## Fighter

| # | Feature | Original | Rewrite | Status | Choice |
|---|---------|----------|---------|--------|--------|
| F1 | Fuel system | range decreases per move, return when range ≤ dist + 2 | Same concept with speed buffer | MATCH | — |
| F2 | Attack priorities | T,C first (weight 1), ships/army (5), explore (9) | Similar weighting | MATCH | — |
| F3 | Explore mode | Fighters don't auto-attack in explore | Same | MATCH | — |

## Ships

| # | Feature | Original | Rewrite | Status | Choice |
|---|---------|----------|---------|--------|--------|
| S1 | Repair behavior | Damaged → navigate to own city port | Same | MATCH | — |
| S2 | Attack priorities | T,C (weight 1), combat ships (3), explore (21) | Similar | MATCH | — |

---

## Priority Recommendations

### High Priority (would fix remaining bugs)
1. **A1: Armies actively seek transports** — Would eliminate "transport chasing exploring armies" problem. Armies should path toward loading transports instead of passively waiting at coast.
2. **T1: Consider binary transport state** — Simplifying to load/unload only (no partial delivery) would eliminate shouldUnload bugs entirely. Trade-off: full transports required before delivery.

### Medium Priority (would improve efficiency)
3. **A2: Cross-water cost comparison** — Armies would intelligently decide walk vs transport.
4. **A4: Load distribution** — Fill partially-loaded transports first.

### Low Priority (working fine as-is)
5. M2/M3: Water-to-land BFS variants — Our maps work differently but achieve same result.
6. M4: Path reuse — Performance optimization, not a correctness issue.

---

## Decision Log

Record decisions here as they're made:

| Date | Item | Decision | Rationale |
|------|------|----------|-----------|
| | | | |
