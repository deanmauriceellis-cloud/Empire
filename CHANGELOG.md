# Empire Reborn — Changelog

## v0.32.0 — Session 043 (2026-03-10)

### Economy — Phase 3: Economy Foundation (PLAN-UNIFIED)
- **Resource system** — Ore, Oil, Textile stockpiles per player; starting resources 150/100/150
- **Unit resource costs** — all 9 unit types have [ore, oil, textile] costs (Army 5/0/5 through Battleship 40/25/0)
- **Production gating** — resources consumed when production starts (work 0→1); city stalls with event if insufficient
- **Map deposits** — ore veins, oil wells, textile farms placed during mapgen (~1 per 3-4 cities); fair distribution near each player, contested middle; height-based type assignment
- **Resource income** — completed deposit buildings generate +3/turn of their resource type
- **Deposit graphics** — procedural tile icons (mountain/derrick/plant) with gentle pulse animation
- **HUD resource display** — Ore/Oil/Txt counts in top bar with color-coded labels
- **Minimap deposits** — colored dots (brown=ore, dark=oil, green=textile)
- **City panel costs** — resource cost shown on production buttons
- **Unit info costs** — resource cost in city section of info panel
- **31 new economy tests** — costs, affordability, gating, stalls, income, deposit placement, serialization
- Known: visual issues reported, needs debugging

## v0.31.0 — Session 042 (2026-03-10)

### UI — Phase 2: Unit Info Panel & Vision (PLAN-UNIFIED)
- **Unit info panel** — rich right-sidebar panel with unit icon, segmented HP bar, movement/terrain/strength stats, behavior label, GoTo destination + ETA, embarked ship info, cargo manifest
- **City info panel** — production display with progress bar, turns remaining, owner label
- **Vision range overlay** — translucent blue diamond ring on adjacent tiles when unit selected, pulsing animation
- **GoTo path overlay** — animated dashed orange line from unit to destination with crawling dash effect
- **GoTo target marker** — pulsing orange diamond on destination tile

## v0.30.0 — Session 041 (2026-03-10)

### Graphics — Phase 1: Graphics Foundation (PLAN-UNIFIED)
- **Multi-depth ocean** — deep ocean (dark navy), coastal (teal), shore (light blue) textures based on adjacent land count; vibrant blue palette
- **Shore foam overlay** — translucent foam ring on coastal water tiles, pulsing alpha + scale breathing animation
- **Three-frequency wave animation** — rolling waves with vertical tile bob (±1.2px), strong alpha oscillation (±15%), organic multi-speed sine blend
- **Detailed unit sprites** — all 9 unit types redrawn: Army (shield/helmet), Fighter (swept-wing jet), Patrol (boat + radar), Destroyer (warship + turret), Submarine (hull + conning tower), Transport (cargo deck), Carrier (flight deck + island), Battleship (dual turrets), Satellite (solar panels + dish)
- **Enhanced selection glow** — double-ring design with multi-frequency pulse (4+7 Hz) and scale breathing
- **Segmented health bars** — individual HP segments with dividers and border outline
- **Richer particle effects** — explosions: 42 particles in 3 color layers + lingering smoke; death: 14 + 6 debris; capture: 16-ring + sparkle burst; smoke particles float upward and expand

## v0.29.0 — Session 040 (2026-03-10)

### Design — Unified Expansion Plan
- **PLAN-A.md** — Graphics overhaul: ocean waves/shore foam, detailed procedural unit sprites, GlowFilter selection, unit info panel, vision overlays, enhanced particles
- **PLAN-B.md** — Economic expansion analysis: resource system (ore/oil/textile), construction units, deposits, city upgrades, tech trees, AI economic strategy, balance math
- **PLAN-UNIFIED.md** — Merged 10-phase executable plan (11-18 sessions estimated)
- **6 new unit types designed**: Construction (E), Artillery (R), Special Forces (X), Missile Cruiser (M), AWACS (W), Engineer Boat (G)
- **10 structures designed**: Bunker, Anti-Air Battery, Coastal Battery, Radar Station, Artillery Fort, Minefield, SAM Site, Bridge, Sea Mine, Offshore Platform
- **6 city upgrades designed**: University, Hospital, Tech Lab, Military Academy, Shipyard, Airfield (3 levels each, max 4 per city)
- **4 tech tracks designed**: Science, Health, Electronics, War Research (5 levels each, linear scaling)
- **Bombard mechanic**: ranged combat (2-3 tiles), no return damage, cannot capture cities
- **River defensive warfare**: bridges, fortifications, minefields transform River War maps into strategic chess
- **Key decisions**: construction units destroyed (not captured), buildings captured, linear tech (not exponential), auto-AI with manual override, 150/100/150 starting resources

## v0.28.0 — Session 039 (2026-03-10)

### Added
- **River War map type** — new terrain preset: two equal landmasses separated by a wide river (20-40 tiles), navigable tributaries extending 80-95% to map edges creating natural choke points, small islands with neutral cities in the river, balanced city distribution
- **River-smart transport AI** — transports on river maps prioritize shoreline enemy/unowned cities (+2 priority) and island continent cities (+2 priority); empty transports return to own shoreline first for army pickup
- **9 new river map tests** — dimensions, river presence, land balance, city distribution, tributaries, multi-seed/multi-size

### Fixed
- **Click debug logging** — `[Click]` log now fires on every click (was: only when units present at tile, making empty-tile clicks silent)
- **Unused AI helpers cleaned up** — removed `isInTributary()`, `directionTowardRiver()`, and unused `MAP_WIDTH/MAP_HEIGHT` imports from ai-transport.ts

## v0.27.0 — Session 038 (2026-03-10)

### Added
- **War Stats panel** — "War Stats" button in top-left HUD opens modal dialog tracking all battles: unit types, casualties (e.g. "Transport + 3 Army (4 lost)"), clickable locations, filter tabs (All/Combat/Cities), player summary stats

### Fixed
- **AI production lock** — army cities could never switch production via ratio rebalance (`minCommitWork` threshold of 5 was unreachable for buildTime=5 armies; reduced to `max(2, 25%)`)
- **Fighter/ship idle behavior** — fighters and combat ships now always explore instead of becoming sentries at cities
- **Naval production ratios** — Patrol boats, destroyers, and submarines introduced at 4 cities (was 11); battleships at 11 cities; heavier naval ratios across all tiers

## v0.26.0 — Session 037 (2026-03-10)

### Security (R5)
- **CORS restriction** — environment-based origin control; wildcard in dev, whitelist via `CORS_ORIGINS` in production
- **Request size limits** — 1MB JSON body, 256KB WebSocket max payload
- **Rate limiting** — 30 messages/sec per WebSocket connection
- **Action queue cap** — max 500 actions per player per turn
- **Diagnostic endpoint** — `/api/gamelog` restricted to dev mode only
- **Action validation** — bounds checking on coordinates, enum validation for behaviors/unit types, embark ship ownership check

### Added
- **Graceful shutdown** — SIGTERM/SIGINT saves all active games, closes WebSocket connections, closes database
- **Input manager dispose()** — named event handlers with cleanup method for safe teardown

### Fixed
- **Disconnect persistence** — game state persisted immediately on player disconnect (was: only after 5-minute timeout)
- **fogAlphaMap memory leak** — entries deleted when alpha reaches 0 (was: set to 0 and kept forever)
- **Duplicate mousemove listeners** — consolidated from 2 to 1 handler

### Performance (R6)
- **AI viewMap caching** — `createUnloadViewMap`, `createTTLoadViewMap`, `createPortViewMap` lazily computed once per transport instead of up to 4x per step loop

## v0.24.0 — Session 031 (2026-03-10)

### Fixed
- **Explore auto-capture removed** — exploring armies no longer auto-attack adjacent cities; they stop (func=None) so the player must manually order the attack. Prevents games from playing themselves
- **Aggressive city attack massing** — aggressive armies adjacent to enemy cities now wait for 2+ friendly armies within 2 tiles before attacking (unowned cities still attacked immediately). Prevents wasteful single-army suicide attacks
- **Resignation threshold relaxed** — AI surrenders at `< 1/5` enemy strength (was `< 1/3`), giving the AI more time to recover from disadvantages
- **Starting city balance** — continent pair selection now penalizes pairs where city counts differ by more than 2x, ensuring both players have similar access to neutral cities

### Added
- **Console event logging** — all game events (combat, capture, death, production) logged with `[TYPE] (col,row) description {data}` format
- **Turn summary logging** — `[TURN N] P1: X cities, Y units | P2: ...` printed each turn
- **Player action logging** — `[MOVE]` and `[ATTACK]` logged with unit type and coordinates
- **Performance timing** — `[PERF] Turn N: AI=Xms exec=Yms total=Zms` shows AI computation and execution time per turn
- **AI turn summary** — concise action breakdown (moves, attacks, prod, behav) + transport cargo stats
- **AI verbose log toggle** — "Verbose" button in debug panel; per-transport detail logs separated from summary-level AI logs
- `setAIVerboseLog()` / `aiVerboseLog` flag in shared AI module

### Changed
- **Camera lerp** — `LERP_FACTOR` 0.12 → 0.25 (camera pans ~2x faster, reducing move-to-move latency)
- **Unit move animation** — `UNIT_MOVE_LERP` 0.15 → 0.3 (unit slide ~2x faster)
- Transport-level debug logs moved from `aiLog` to `aiVLog` (only shown with Verbose toggle)

## v0.23.0 — Session 030 (2026-03-10)

### Fixed
- **Circular ferry** — transports loading then immediately unloading at same spot. `shouldUnload` now uses 40-tile BFS (was 20) for own-city detection, scans ALL adjacent land tiles
- **Single-army delivery** — transports delivering 1/6 cargo. `shouldUnload` now requires ≥50% cargo (`Math.ceil(capacity / 2)`) before triggering partial unload
- **Transport competition** — `createTTLoadViewMap` now accepts `claimedUnitIds` parameter to filter armies already claimed by other transports
- **Dump on unexplored islands** — `createUnloadViewMap` now skips value=0 continents entirely (was only skipping when no unexplored tiles)
- **Mini-ferry on large islands** — `tryUnloadArmies` BFS radius increased to 40 tiles, requires enemy targets on continent
- **Loadable army count** — `countNearbyArmies` only counts armies with None/Explore/WaitForTransport behavior; `anyLoadableArmies` excludes `claimedUnitIds`

### Added
- **Original AI reference documentation** — 4 comprehensive docs analyzing original VMS-Empire C source:
  - `docs/original-ai-transport.md` — binary state machine, load/unload maps, army coordination
  - `docs/original-ai-production.md` — ratio tables, 3-priority algorithm, lake detection
  - `docs/original-ai-movement.md` — unit decision trees, objective weight tables, cross-water cost
  - `docs/original-ai-pathfinding.md` — BFS engine, terrain variants, continent analysis
- **Divergence checklist** — `docs/original-vs-rewrite-divergence.md` — 25-item comparison across Transport, Army-Transport, Production, Movement, Fighter, Ships with status and recommended choices

## v0.22.0 — Session 027 (2026-03-10)

### Fixed
- **Aggressive→idle→WaitForTransport cycle** (B4) — armies on enemy continents (with enemy/unowned cities, no own cities) now stay Aggressive instead of requesting transport pickup. Prevents infinite load→unload→pickup loop
- **Idle armies near transports wandering off** (C1) — `assignIdleBehaviors()` now checks for non-full transports within 3 tiles via BFS; assigns WaitForTransport directly instead of Explore→WaitForTransport cycle
- **Transport production cap bypass** — "keeping Transport" surplus guard now checks `ceil(cities/4)` cap; cities over cap allowed to switch away even with army surplus
- **Cross-turn transport oscillation** — `prevLocs` field on UnitState tracks last 4 turn-end positions; included in `recentLocs` set to prevent multi-turn ping-pong. Cleared on load/unload (mission change)

### Added
- **Army cluster weighting for transports** (C2) — `createTTLoadViewMap()` counts loadable armies per water tile; clusters of 2+ get '%' marker (high priority) vs '$' (single army). `ttLoadMoveInfo()` weights '%' over '$'
- **Multi-transport coordination** (C3) — `claimedPickupLocs` Set shared across transports in `computeAITurn()`. `claimPickupZone()` BFS claims water tiles within 5 steps when a transport commits to a pickup area. `createTTLoadViewMap()` accepts `excludeLocs` to skip claimed tiles
- **`hasNearbyTransport()`** — BFS from land tile through terrain checking adjacent water for non-full transports within 3 hops
- **`claimPickupZone()`** — BFS through water claiming '$'/'%' markers within 5 steps of transport location
- `prevLocs?: Loc[]` on `UnitState` — optional persistent cross-turn position history for transports
- 8 new tests: 200-turn oscillation detection, transport production cap, B4 enemy continent, C1 near-transport, C2 cluster preference, transport cap guard

### Changed
- `packages/shared/src/game.ts` — `exploreUnit()` checks continent ownership before setting WaitForTransport; imports `mapContinent` from continent.ts
- `packages/shared/src/ai.ts` — `aiTransportMove()` accepts `claimedPickupLocs`, saves `prevLocs` at turn end; `moveAIUnit()` passes `claimedPickupLocs` through; `computeAITurn()` creates shared sets
- `packages/shared/src/types.ts` — `UnitState.prevLocs` added (optional, backwards-compatible)

## v0.20.0 — Session 020 (2026-03-09)

### Fixed
- **CRITICAL: scanContinent P2 viewMap inversion** — `scanContinent()` hardcoded `'O'`=Player1, `'X'`=Player2, but viewMaps use `'O'`=own and `'X'`=enemy regardless of player. P2's transports navigated back to their own continent (value=3) instead of toward enemies (value=0). Replaced with direct viewMap character counting in both `createUnloadViewMap()` and `decideProduction()`
- **Transport oscillation when full** — full transports bounced between two tiles because both move steps used stale `unit.loc`. Now tracks `currentLoc` across steps, using both moves per turn effectively
- **Exploring armies invisible to transports** — `createTTLoadViewMap()` and `tryLoadArmies()` only considered `func=None` armies. After `assignIdleBehaviors()` gave them Explore, transports couldn't find them. Now loads Explore armies too, canceling their behavior on embark
- **Armies wandering instead of staging** — `armyFightMoveInfo` included `'+'` (explored land) and `'O'` (own city) as objectives, so `fightTarget` was never null. Armies wandered aimlessly on explored continents instead of heading to transport-producing cities
- **Transport waiting for distant armies** — `countNearbyArmies()` BFS depth 3 found 49+ armies inland, causing transports to wait forever. Reduced to depth 1 (adjacent armies arriving next turn)
- **Army crossCost bias** — crossCost=30 made armies heavily prefer fighting even when transport was 4x closer. Changed to simple distance comparison

### Changed
- `packages/shared/src/ai.ts` — removed `scanContinent` usage (broken owner mapping), `currentLoc` tracking in `aiTransportMove`, army fight objectives `"*Xa "` (removed `+` and `O`), `tryLoadArmies` accepts Explore armies, `countNearbyArmies` BFS depth 1, full transport explore fallback + logging

## v0.18.0 — Session 018 (2026-03-09)

### Fixed
- **AI 1-city production flip-flop** — with only 1 city, AI alternated Army↔Transport every turn; 20% work penalty on each switch meant units never built. Fix: single-city AI always builds armies
- **Inland cities building ships** — `isCityOnLake()` returned false for inland cities (no water = not a lake), so AI scheduled ship production. Added `isCityCoastal()` check: only coastal non-lake cities can build ships
- **AI overriding unit behaviors** — `computeAITurn()` generated move actions for units already assigned Explore/Sentry/etc. Fix: skip units with `func !== UnitBehavior.None`
- **Army oscillation** — AI `aiArmyMove` found no objectives, used `moveAway` picking adjacent tiles causing back-and-forth bouncing. Fix: set Explore behavior instead

### Added
- **Smart idle behavior assignment** — `assignIdleBehaviors()` at end of AI turn: max 1 sentry per city, rest explore; skips embarked units and satellites
- **Default unit behaviors on production** — city `func[]` array defaults: armies/fighters/ships → Explore, transports → None (await orders), satellites → None (random diagonal)
- **`isCityCoastal()`** — checks if city has adjacent water tiles (distinct from `isCityOnLake`)
- New tests: multi-turn production accumulation, bridge visibility filter, single-city AI stability, coastal transport requirement

### Changed
- `packages/shared/src/ai.ts` — single-city guard, skip-behavior-units, explore-not-oscillate, `assignIdleBehaviors()`, `isCityCoastal()` in production
- `packages/shared/src/game.ts` — `tickCityProduction()` applies city's per-unit-type default behavior to new units
- `packages/shared/src/mapgen.ts` — city `func[]` defaults: Explore for combat units, None for transports/satellites

## v0.15.0 — Session 016 (2026-03-09)

### Fixed
- **Starting city distance** — players now start as far apart as possible on balanced continents (was random shore city picks)
- **Satellite bounce hardcoded values** — replaced `/ 100`, `>= 58`, `>= 98` with `locRow()`, `MAP_HEIGHT - 2`, `MAP_WIDTH - 2`
- **Fighter disappearing during explore** — fighters no longer auto-attack adjacent enemies in Explore/Cautious mode (1 HP = instant death risk); only Aggressive behavior attacks
- **Fighter fuel exhaustion** — old `+2` margin was too tight; now uses `+speed` (8 tiles) for safe return buffer
- **Fighter stuck after fuel runs out** — fighters with range=0 are now killed (like satellites) instead of becoming permanently stranded
- **Fighter fuel return pathfinding** — replaced fragile BFS view-map search with direct coordinate-based flight toward nearest city; BFS as fallback

### Added
- **Configurable map dimensions** — `configureMapDimensions(w, h)` reconfigures all derived constants (MAP_SIZE, NUM_CITY, DIR_OFFSET, sectors)
- **Map size presets** — Small (60x40), Standard (100x60), Large (150x90), Huge (200x120) with auto-scaled city counts
- **Terrain presets** — Continents, Pangaea, Archipelago, Islands (different waterRatio + smoothPasses)
- **Game setup screen** — new UI between menu and game start with 2x2 grid selectors for map size and terrain
- **Camera reconfiguration** — `camera.reconfigure(w, h)` recomputes world bounds for different map sizes
- `fighterFuelCheck()` — centralized fuel management helper used by all 4 behavior modes

### Changed
- `packages/shared/src/constants.ts` — MAP_WIDTH/HEIGHT/SIZE, NUM_CITY, DIR_OFFSET, sector constants now mutable (`let`); added `configureMapDimensions()`, `MapSizePreset`, `TerrainPreset`, preset arrays
- `packages/shared/src/game.ts` — satellite bounce uses dynamic constants; `fighterFuelCheck()` replaces 4 duplicated fuel blocks; explore skips combat for fighters
- `packages/shared/src/mapgen.ts` — `selectStartingCities` picks max-distance shore city pair
- `packages/shared/src/singleplayer.ts` — calls `configureMapDimensions` before map gen; `numCities` auto-scales
- `packages/server/src/GameManager.ts` — calls `configureMapDimensions` on create and resume; `numCities` auto-scales
- `packages/client/src/core/camera.ts` — added `reconfigure()` method
- `packages/client/src/main.ts` — routes through game setup screen; passes config overrides; reconfigures camera
- `packages/client/src/ui/menuScreens.ts` — added `showGameSetup()` with map/terrain selection UI
- `packages/client/src/ui/styles.ts` — added game setup CSS (option grid, selected state)
- `packages/client/src/net/multiplayer.ts` — `createGame()` accepts options; calls `configureMapDimensions` on state_update

## v0.14.0 — Session 015 (2026-03-09)

### Fixed
- **Unit ID 0 falsy bug** — `if (selectedUnitId)` → `if (selectedUnitId !== null)` in 10 places in `main.ts`; first unit created (ID 0) was unselectable/uncontrollable
- **Action panel buttons unresponsive** — `click` → `pointerdown` event in `actionPanel.ts`; innerHTML re-render every frame destroyed DOM between mousedown/mouseup
- **Fighter explore not moving** — no behavior processing existed; added `processUnitBehaviors()` call in `executeTurn`
- **Fighter refused to explore after returning to city** — no refueling mechanism; added end-of-turn refuel at own cities/carriers
- **Armies not capturing cities during auto-movement** — `moveUnit()` doesn't handle captures; added `behaviorMove()` helper with combat/capture logic

### Added
- **Unit behavior system** — `processUnitBehaviors()` in `executeTurn` processes all behavior types each turn
  - **Explore**: greedy max-tile-reveal for fighters; BFS for ground/sea; armies also target unowned/enemy cities
  - **Sentry**: wakes when enemy spotted in adjacent tiles
  - **GoTo**: right-click waypoint navigation with BFS pathfinding (all unit types)
  - **Aggressive**: seek and attack enemies/cities via weighted BFS, explore when none visible
  - **Cautious**: explore but flee from adjacent enemies
- `behaviorMove()` — centralized smart-move helper handles combat and city capture for all behaviors
- `countNewTilesRevealed()` — scores tiles by unseen count within scan radius (greedy explore)
- `targetLoc` field on `UnitState` + `setTarget` player action type for GoTo navigation
- `setTarget()` method on `ActionCollector` for client-side waypoint setting
- Action panel: Aggressive (A) and Cautious (D) buttons, current behavior mode display
- Right-click with unit selected sets navigation waypoint
- Fighter fuel management: refuel at cities/carriers each turn, return-to-base when fuel low

### Changed
- `packages/shared/src/constants.ts` — added `GoTo`, `Aggressive`, `Cautious` to `UnitBehavior` enum
- `packages/shared/src/types.ts` — added `targetLoc: Loc | null` to `UnitState`, `setTarget` to `PlayerAction`
- `packages/shared/src/game.ts` — +645 lines: behavior processing, fighter refueling, explore/goto/aggressive/cautious logic
- `packages/client/src/main.ts` — unit ID 0 fix (×10), keyboard shortcuts A/D, right-click waypoint
- `packages/client/src/ui/actionPanel.ts` — pointerdown fix, new buttons, behavior mode display
- `packages/client/src/game/actionCollector.ts` — added `setTarget()` method

## v0.13.0 — Session 014 (2026-03-09)

### Added
- **Phase 12.3: E2E Tests** — Playwright browser automation tests
  - `playwright.config.ts` — config with 3 projects (singleplayer, multiplayer, perf), webServer auto-launch
  - `e2e/helpers.ts` — shared test utilities (goToMainMenu, startSinglePlayer, endTurn, trackErrors)
  - `e2e/singleplayer.spec.ts` — 9 tests: main menu, HUD, game start, turn advancement, keyboard shortcuts, action panel after unit production, 5-turn and 10-turn stability
  - `e2e/multiplayer.spec.ts` — 5 tests: lobby navigation, create game, cancel, back button, two-player join (skipped)
  - `e2e/perf.spec.ts` — 4 benchmarks: menu load (~1s), game start (~500ms), end turn (~200ms), 10-turn stress (~2s)
- `@playwright/test` dev dependency (root package.json)
- `test:e2e` and `test:e2e:ui` scripts in root package.json

### Changed
- `packages/client/vite.config.ts` — dev server port 5173 → 5174 (port conflict with another local app)
- `packages/client/src/main.ts` — dev mode WebSocket/API URL updated for port 5174
- `.gitignore` — added test-results/, playwright-report/, blob-report/
- `STATE.md` — archived detailed completed phases to `docs/archive/STATE-completed-phases.md`

### Notes
- Two-player E2E join test skipped: lobby `GET /api/games` doesn't show games from other WebSocket sessions immediately
- All tests run via `pnpm test:e2e` — Playwright auto-starts Vite (5174) + server (3001)
- 283 total tests: 237 shared + 28 server + 18 E2E (17 pass + 1 skip)

## v0.12.0 — Session 013 (2026-03-09)

### Added
- **Phase 12.1: Unit Test Coverage** — shared package 84.2% → 93.6% statement coverage
  - `game.test.ts`: +34 tests covering satellite movement/bouncing, processAction (all action types),
    fighter auto-embark logic, city capture with ship transfer, defender-wins combat, cargo overflow,
    Player 2 elimination/resignation, executeTurn satellite movement + P2 resignation
  - `ai.test.ts`: +10 tests covering embarked army skip, transport embark, AI elimination resign,
    zero-moves-left units, transport unloading near land, ship repair/navigation, fight-vs-load decision,
    satellite routing (default case)
- **Phase 12.2: Integration Tests** — `integration.test.ts`
  - AI vs AI full-game simulation (100 turns, seed 42)
  - AI vs AI with different seed (50 turns, seed 9999)
  - Save/load round-trip (JSON serialize → deserialize → continue playing)
  - Deterministic replay (same seed → identical actions + outcomes for 20 turns)

### Changed
- `packages/shared/package.json` — added `@vitest/coverage-v8` dev dependency for coverage reporting
- Total tests: 212 → 265 (237 shared + 28 server)

## v0.11.0 — Session 012 (2026-03-09)

### Added
- **Phase 11: Deployment** — production build, Docker containerization
  - `Dockerfile` — single-container production image:
    - `node:22-slim` base with pnpm via corepack
    - Dependency layer caching (copies package.json files first, then source)
    - Builds client with Vite, runs server with tsx
    - SQLite data volume at `/app/data` for persistence
    - Exposes port 3001
  - `.dockerignore` — excludes node_modules, .git, docs, dist dirs, data/

### Changed
- `packages/server/src/index.ts` — enabled production static file serving:
  - Added `path` and `fileURLToPath` imports for `__dirname` resolution
  - `express.static()` serves client build from `packages/client/dist`
  - SPA fallback route (`/{*splat}`) for client-side routing (Express v5 syntax)
- `package.json` (root) — added `start` script (runs server), expanded `test` to include server tests

> Earlier sessions archived in `docs/archive/CHANGELOG-sessions-000-003.md`, `docs/archive/CHANGELOG-sessions-004-007.md`, and `docs/archive/CHANGELOG-sessions-008-011.md`
