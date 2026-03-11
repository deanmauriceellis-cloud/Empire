# Empire Reborn — Project State

## Current Phase
**PLAN-UNIFIED Phase 6 complete** — Tech System

## Status
- All 12 original phases complete + gameplay polish + debug tools + AI overhaul + refactoring
- Phases 1-6 of expansion plan complete (Graphics, Unit Info, Economy, Construction & Buildings, Economy Review, Tech System)
- 423 tests passing (395 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)
- **PLAN-UNIFIED.md** is the definitive plan for all future implementation

## Latest commit
session 047: Phase 6 Tech System

## Known Issues
- Fighter stacking at base cities (pre-existing)
- Armies adjacent to capturable neutral cities not always attacking (pre-existing)

## Completed (session 047) — Tech System
- [x] Tech thresholds [10, 30, 60, 100, 150] for levels 1-5
- [x] Vision bonuses: Science 2 (+1 all), Electronics 1 (+1 ships)
- [x] HP bonuses: Health 2 (Army +1), Health 3 (land +1), Health 5 (all +1)
- [x] Strength bonuses: War 1-5 progressive (combat integration)
- [x] Healing bonuses: Health 1 (2 HP/turn city), Health 4 (ships heal at sea)
- [x] Range bonuses: Electronics 3 (+2 fighter), Electronics 4 (+100 satellite)
- [x] Speed bonus: Science 4 (+1 construction)
- [x] Unit unlock gating infrastructure (canProduceUnit)
- [x] HUD: tech levels display (S:Lv2 format)
- [x] Economy Review: enhanced tech tab with progress bars, bonuses, previews
- [x] Unit info panel: effective stats with green (+N) indicators
- [x] 57 new tests, 423 total passing

## Completed (session 046) — Economy Review Screen
- [x] Economy Review dialog: modal triggered by Enter, 6 tabs (Events/Resources/Cities/Tech/Construction/Buildings)
- [x] Resources tab: stockpile + city income + deposit income + total per-turn
- [x] Cities tab: production status, progress bars, retool/stall, upgrade list
- [x] Tech tab: research points, income/turn, contributing buildings
- [x] Construction tab: active builds with progress, idle/assigned constructors
- [x] Buildings tab: completed buildings with type, level, output
- [x] "Confirm & Execute Turn →" button, Escape/Enter also confirm
- [x] HUD resource income: +N per-turn income next to stockpile in green
- [x] Diagnostic enhancements: economy/deposits/buildings/tech state + stall/retool warnings
- [x] Number keys 1-6 switch tabs, capture-phase keyboard isolation

## Completed (session 045) — Construction & Buildings
- [x] UnitType.Construction: land, speed 1, str 0, hp 1, buildTime 10, cost [10,0,5]
- [x] BuildingType enum: Mine, OilWell, TextileFarm, University, Hospital, TechLab, MilitaryAcademy, Shipyard, Airfield
- [x] BuildingState: id, loc, type, owner, level (1-3), work, buildTime, complete, constructorId
- [x] Build on deposit: construction at deposit → mine/well/farm → consumes constructor
- [x] Build city upgrade: construction at own city → choose from 6 types → max 4 slots → consumes constructor
- [x] Building upgrades: Lv1→Lv2→Lv3 with increasing costs/times
- [x] Tech research: University→Science, Hospital→Health, TechLab→Electronics, Academy→War; level=points/turn
- [x] tickBuildingConstruction() in turn flow, collectTechResearch() per turn
- [x] Construction unit sprite (hard hat + wrench)
- [x] Action panel: context build buttons for construction units
- [x] City panel: upgrade slot display (4 slots, filled/empty, status)
- [x] Unit info panel: building progress for construction units
- [x] HUD: tech research display (S/H/E/W)
- [x] 43 new tests, 366 total passing

## Completed (session 044) — Economy Debugging
- [x] Passive city income: CITY_INCOME [2,1,2] per owned city per turn
- [x] Retool stall bug fix: negative work ticks without affordability check
- [x] Verified: 0 stalls across multiple test games (was 1808 stalls)

## Completed (session 043) — Economy Foundation
- [x] ResourceType, DepositType enums, UNIT_COSTS table
- [x] DepositState, depositId on MapCell, resources/deposits on GameState
- [x] placeDeposits() in mapgen: fair, balanced, height-based, deterministic
- [x] Resources consumed on production start, city stalls if insufficient
- [x] collectResourceIncome() — +3/turn from completed deposit buildings
- [x] Deposit textures (mountain/derrick/plant), HUD resource display
- [x] Minimap deposit dots, cost display in city panel and unit info panel
- [x] 31 new economy tests

## Completed (session 042) — Unit Info Panel & Vision
- [x] Right-sidebar unit info panel: icon, HP bar, stats, behavior, GoTo ETA, cargo manifest
- [x] City info in panel: production, progress bar, turns remaining
- [x] Vision range overlay: blue diamond ring on adjacent tiles
- [x] GoTo path overlay: animated dashed orange line with target marker

## Completed (session 041) — Graphics Foundation
- [x] Multi-depth ocean: deep/coastal/shore textures by adjacent land count
- [x] Shore foam overlay with pulsing alpha and scale breathing
- [x] Three-frequency wave animation with vertical tile bob and alpha oscillation
- [x] All 9 unit types redrawn with detailed procedural sprites
- [x] Enhanced selection glow: double-ring, multi-frequency pulse, scale breathing
- [x] Segmented health bars with per-HP dividers
- [x] Richer particle effects: 3-layer explosions, lingering smoke, debris

## Completed (session 040) — Design Only
- [x] PLAN-A.md — Graphics overhaul plan (ocean, unit sprites, info panel, vision overlays, GPU effects)
- [x] PLAN-B.md — Economic expansion analysis (resources, construction, tech trees, AI strategy, balance)
- [x] PLAN-UNIFIED.md — Merged 10-phase executable plan with complete unit/structure/tech catalogs
- [x] Design decisions finalized: construction destroyed, buildings captured, linear tech, auto-AI, manual override
- [x] 6 new unit types designed: Construction, Artillery, Special Forces, Missile Cruiser, AWACS, Engineer Boat
- [x] 10 defensive/naval structures designed: Bunker, Anti-Air, Coastal Battery, Radar, Artillery Fort, Minefield, SAM, Bridge, Sea Mine, Offshore Platform
- [x] 6 city upgrades designed: University, Hospital, Tech Lab, Military Academy, Shipyard, Airfield (3 levels each)
- [x] 4 tech tracks designed: Science, Health, Electronics, War Research (5 levels each)
- [x] Bombard mechanic designed: ranged combat for artillery/cruiser/defenses
- [x] River defensive warfare dynamics designed

## Completed (session 039)

## Completed (session 038)
- [x] War Stats dialog panel — battle tracking with unit types, casualties, clickable locations, filters
- [x] Fix critical AI production bug — army cities could never switch (minCommitWork max(5,...)→max(2,...))
- [x] Naval ratio rebalance — Patrol/Destroyer/Sub from 4 cities, Battleship from 11
- [x] Fighter/ship idle fix — always explore, never sentry
- [x] All 283 tests passing (255 shared + 28 server), client builds clean

## Completed (session 037)
- [x] Phase R5: CORS — environment-based origin restriction (wildcard in dev, whitelist in production)
- [x] Phase R5: Request size limits — 1MB JSON body, 256KB WebSocket max payload
- [x] Phase R5: Diagnostic logging endpoint restricted to dev mode only
- [x] Phase R5: WebSocket rate limiting — 30 msgs/sec per connection
- [x] Phase R5: Action queue size limit — max 500 actions per player per turn
- [x] Phase R5: Graceful shutdown — SIGTERM/SIGINT save all games, close DB, drain connections
- [x] Phase R5: Persist game immediately on player disconnect (not just after timeout)
- [x] Phase R5: Enhanced action validation — bounds checking, enum validation, embark ship ownership
- [x] Phase R5: Explicit OPTIONS preflight response (204)
- [x] Phase R6: Fix fogAlphaMap memory leak — delete entries when alpha reaches 0 (was: set to 0 and keep forever)
- [x] Phase R6: Input manager dispose() — named handlers with removeEventListener cleanup method
- [x] Phase R6: Consolidate duplicate mousemove listeners into single handler
- [x] Phase R6: Lazy viewMap caching in aiTransportMove — createUnloadViewMap, createTTLoadViewMap, createPortViewMap computed once per transport instead of up to 4×
- [x] All 283 tests passing (255 shared + 28 server), client builds clean

## Completed (session 036)
- [x] Phase R1a: Create `shared/src/viewmap-chars.ts` — VM_WATER, VM_LAND, VM_UNEXPLORED, VM_OWN_CITY, VM_ENEMY_CITY, VM_UNOWNED_CITY, VM_HOME_PORT, VM_PICKUP_SINGLE, VM_PICKUP_CLUSTER constants + isEnemyUnit(), isCity(), isTargetCity(), isTraversableLand(), isPickupMarker() helpers
- [x] Phase R1a: Replace 35+ magic character literals across ai.ts, game.ts, pathfinding.ts, continent.ts with named constants
- [x] Phase R1a: Simplified BFS traversal check in tryUnloadArmies (6-condition OR → `!= VM_WATER`)
- [x] Phase R1a: Simplified land cell filter in createUnloadViewMap (4-condition → `isTraversableLand()`)
- [x] Phase R1d: Extract CSS custom properties in styles.ts — 30 design tokens (colors, font) replacing 80+ hardcoded values
- [x] Phase R2: Split AI module (2027→5 files): ai-helpers.ts (316), ai-production.ts (395), ai-transport.ts (731), ai-movement.ts (309), ai.ts orchestrator (278)
- [x] All 283 tests passing (255 shared + 28 server), client builds clean

## Completed (session 035)
- [x] WaitForTransport armies BFS toward nearest non-full transport (not just any coast)
- [x] Transport patience: wait up to 6 turns for armies at coastline, resets on each load
- [x] Empty stuck transports escape deadlock by moving to any adjacent water tile
- [x] Unload targeting: unexplored continents get high priority (+4 if >70% unknown)
- [x] Ships explore unknown waters 3x more aggressively (weight 21→7)
- [x] prevLocs size increased 8→12 for patience window

## Completed (session 034)
- [x] Fix transport unloading: removed "loading continent" block that prevented unloading on home continent, reduced own-city proximity check from 10 to 3 tiles
- [x] Fix transport shouldUnload: simplified to only block adjacent to own city (was: 10-tile BFS for cities + loading armies)
- [x] Fix empty transports stuck: return-to-pickup-zone → return-to-port fallback chain; created createPortViewMap for water navigation to own cities
- [x] Fix partial cargo deadlock: transports deliver any cargo immediately when no more armies available (was: circle 20+ turns waiting for 50% fill)
- [x] Fix transport unload navigation: mark water adjacent to unexplored tiles as low-priority unload targets
- [x] Fix production flip-flop: commitment threshold max(5, 25% buildTime) before ratio rebalance can switch; retool penalty blocks switches; transport over-cap forces immediate switch
- [x] Fix fighter overproduction: hard cap of 2 fighters (3 at 10+ cities) replaces broken idle-detection; ratio rebalance suppresses fighter at cap
- [x] Fix fighter stuck at cities: base-hopping fallback flies toward farthest own city when BFS finds no objectives
- [x] Fix map fairness: pickDistantCities ensures starting continent has ≥2 cities (at least 1 neutral)
- [x] Add ship combat diagnostics: aiVLog calls in aiShipMove for repair, attack, movement, idle states

## Completed (session 033)
- [x] Fix fighter production oscillation: ratio rebalance no longer undoes early fighter priority (was infinite army↔fighter loop, zero fighters ever built)
- [x] Fix fighter refuel-and-leave: fighters now stop at own cities when fuel < max to await end-of-turn refueling (was: return to base, explore away, miss refuel, die)
- [x] Fix grounded fighters: when explore finds no objectives AND BFS/pathfinding fails, fighters fly toward furthest own city to reposition (base-hopping)
- [x] Fix 1-city fighter production: single-city players now build 1 fighter for recon once a transport exists (was: permanently forced to build only armies)

## Completed (session 032)
- [x] Fix production flip-flopping: ratio rebalance threshold 50%→40%, same-type switch guard, progress guard on first transport
- [x] Fix fighter production: first fighter switch up to 60% progress (was 25%), second fighter priority at 3+ cities
- [x] Fix transport circling: tryUnloadArmies BFS 40→10 tiles, shouldUnload BFS 40→10 tiles
- [x] Fix transport stuck with partial cargo: deliver after 3 turns stuck at same location
- [x] Fix transport unload targets: unexplored continents as fallback targets, allow unload on unexplored land
- [x] Diagnostic logging system: POST /api/gamelog endpoint, per-turn state snapshots to game-debug.log
- [x] Diagnostic includes: player summary, city production, unit behaviors, transport/fighter detail, armies near capturable cities, AI decision log, ASCII map
- [x] Consolidate debug panel: removed AI Log/Verbose toggles, single "Diag Log" toggle captures everything
- [x] AI log capture buffer: aiLog/aiVLog write to buffer when diagnostic enabled, included in diagnostic output
- [x] Auto-truncate log on new game (turn 1 clears old log)
- [x] CORS middleware for dev mode (client 5174 → server 3001)

## Completed
- [x] Phase 0: Project scaffolding (pnpm monorepo, shared/client/server)
- [x] Phase 1: Shared game types & constants
- [x] Phase 2: Map generation
- [x] Phase 3: Core game logic engine
- [x] Phase 4: AI system
- [x] Phase 5: Node.js server (WebSocket, game lifecycle, state broadcast, single-player)
- [x] Phase 6: Persistence (SQLite, save/load API)
- [x] Phase 7: Client rendering (PixiJS isometric, camera, tilemap, units, particles)
- [x] Phase 8: Client game UI (HUD, minimap, action panel, city panel, event log, menus)
- [x] Phase 9: Client-server integration (WebSocket, lobby, dual-mode)
- [x] Phase 10: Polish & audio (procedural audio, animated water, fog, idle bob, screen shake)
- [x] Phase 11: Deployment (production build, Docker, static serving)
- [x] Phase 12.1: Unit test coverage — 93.6% statements
- [x] Phase 12.2: Integration tests — AI vs AI, save/load, determinism
- [x] Phase 12.3: E2E tests — Playwright (singleplayer, multiplayer lobby, perf benchmarks)

## Refactoring Plan (from session 035 code review)

### Phase R1: Extract Constants & Helpers (Low Risk, High Impact)
- [x] Create `shared/src/viewmap-chars.ts` — constants + helpers for viewMap characters; applied across ai.ts, game.ts, pathfinding.ts, continent.ts
- [ ] Create `shared/src/bfs.ts` — generic BFS with configurable terrain filter (DEFERRED: BFS implementations are too varied for clean generalization)
- [ ] Create `shared/src/adjacency.ts` — adjacent scanning helpers (DEFERRED: patterns are context-dependent)
- [x] Extract CSS variables in `client/src/ui/styles.ts` — 30 design tokens replacing 80+ hardcoded values

### Phase R2: Split AI Module (Medium Risk, High Impact) ✓
- [x] Extract `shared/src/ai-helpers.ts` (316 lines) — logging, MoveInfo factories, attack/movement helpers, lake detection, ratio tables
- [x] Extract `shared/src/ai-production.ts` (395 lines) — `decideProduction()`, `aiProduction()`, ratio helpers
- [x] Extract `shared/src/ai-transport.ts` (731 lines) — `aiTransportMove()`, load/unload helpers, viewMap creators
- [x] Extract `shared/src/ai-movement.ts` (309 lines) — `aiArmyMove()`, `aiFighterMove()`, `aiShipMove()`, coast/moveAway helpers
- [x] Slim `shared/src/ai.ts` (278 lines) — `computeAITurn()`, `assignIdleBehaviors()`, re-exports

### Phase R3: Split Game Engine (Medium Risk, Medium Impact) — DEFERRED
- [ ] Extract behaviors.ts — circular dependency with game.ts (behaviors→game for moveUnit/attackCity, game→behaviors for processUnitBehaviors)
- [ ] Extract combat.ts — same circular dep issue (combat uses moveUnit/killUnit, processAction uses attackCity/attackUnit)
- [ ] Extract vision.ts — feasible but low impact (~80 lines)
- _Recommendation_: resolve with a game-utils.ts shared layer if pursued later

### Phase R4: Split Client Main Loop (High Risk, High Impact) — DO LAST
- [ ] Extract `client/src/game-loop.ts` (~100 lines) — rAF orchestrator, delta time, phase state machine
- [ ] Extract `client/src/input-handler.ts` (~200 lines) — click-to-move, right-click, keyboard, selection
- [ ] Extract `client/src/render-orchestrator.ts` (~150 lines) — per-frame render calls, camera updates
- [ ] Extract `client/src/game-state-manager.ts` (~200 lines) — RenderableState, mode, selection, UI state
- [ ] Slim `client/src/main.ts` to ~100 lines — thin entry point wiring modules

### Phase R5: Server Hardening & Cleanup (Low Risk, Medium Impact)
- [ ] Split `GameManager` into `GameRouter`, `GameService`, `VisibilityFilter`
- [x] Security: restrict CORS, add request size limits, protect `/api/gamelog`, add rate limiting
- [x] Add graceful shutdown — save all games on SIGTERM/SIGINT
- [x] Fix disconnect timer memory leak, persist game immediately on disconnect
- [x] Add server-side action validation (move legality, not just ownership)

### Phase R6: Performance & Polish (Low Risk, Low Impact)
- [ ] Cache AI pre-computations — unit counts, nearest cities, coastal flags once per turn
- [x] Fix client memory leaks — input cleanup, fog alpha map trim, sprite pool bounds
- [x] Optimize viewMap cloning — reuse temp maps across transport steps
- [ ] Cache viewport bounds — memoize `getVisibleTileBounds()` per frame

### Execution Order
R1 and R5 can run in parallel (no dependencies). R2 and R3 depend on R1. R6 depends on R2/R3. R4 is last (depends on stable shared API).

## Next Steps (PLAN-UNIFIED phases)
1. ~~**Phase 1**: Graphics Foundation~~ ✓ (session 041)
2. ~~**Phase 2**: Unit Info & Vision~~ ✓ (session 042)
3. ~~**Phase 3**: Economy Foundation~~ ✓ (sessions 043-044)
4. ~~**Phase 4**: Construction & Buildings~~ ✓ (session 045)
5. ~~**Phase 5**: Economy Review Screen~~ ✓ (session 046)
6. ~~**Phase 6**: Tech System~~ ✓ (session 047)
7. **Phase 7**: Bombard & Defenses — ranged combat, fortifications, bridges, mines (1-2 sessions)
8. **Phase 8**: AI Economy & Strategy — AI construction, deposit claiming, defense placement (2-3 sessions)
9. **Phase 9**: Movement Trails & Atmosphere — contrails, wakes, combat spectacle (1 session)
10. **Phase 10**: Balance & Testing — tuning, integration, AI competence (1-2 sessions)

## Blockers
_None_

## Notes
- Server runs on port 3001 (port 3000 used by another application)
- Client dev server on port 5174 (port 5173 used by another application)
- Playwright E2E tests run via `pnpm test:e2e` (auto-starts Vite + server)
- Two-player E2E join test skipped: lobby doesn't auto-refresh game list
- 301 total tests: 255 shared + 28 server + 18 E2E (17 pass + 1 skip)
- Map constants are now mutable `let` — call `configureMapDimensions()` before map generation
- Original AI reference docs in `docs/original-ai-*.md`
- Debug panel: Diag Log = comprehensive file logging (game-debug.log)
- Diagnostic log auto-clears on new game start
