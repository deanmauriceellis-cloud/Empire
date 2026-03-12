# Empire Reborn — Project State

## Current Phase
**PLAN-KINGDOM Phase 17 in progress** — Balance, Tuning & Launch

## Status
- All 12 original phases complete + gameplay polish + debug tools + AI overhaul + refactoring
- Phases 1-16 complete, Phase 17 in progress
- 827 tests passing (729 shared + 98 server)
- 18 E2E tests (17 passing, 1 skipped)
- **PLAN-KINGDOM.md** is the definitive plan (17 phases: gameplay → kingdom MMO → monetization)

## Latest commit
session 065: fix AI economy — construction production, VM_XXXX cleanup, deposit tile tint

## Known Issues
- Fighter stacking at base cities (pre-existing)
- Structure sprites not yet rendered on tilemap (visual polish deferred)
- Economy review tabs not yet updated for structures
- Crown city relocate action not yet implemented (UI button deferred)
- World mode: monthly reset/season rewards not yet implemented
- Spawn protection enforcement not yet in executeTurn (needs world context in game engine)

## Completed (session 065) — Phase 17: AI Economy Fix, VM Cleanup & Deposit Tint
- [x] Fix construction production flip-flop: ratio rebalance no longer kills Construction builds
- [x] Fix mapgen Set.length → Set.size bug (River War continent size check)
- [x] VM_XXXX cleanup: replace raw viewmap chars in ai-economy, ai-helpers, game, continent
- [x] Deposit tile background tint: warm sandy brown (0xc8a870) for resource tiles
- [x] 729 shared tests passing, client builds clean

## Completed (session 064) — Phase 17: River Map Balance, Transport AI & Visibility
- [x] River War starting cities: continent >= 20 tiles required (no island spawns)
- [x] Transport unload map: city proximity boost (unowned=9, enemy=8, BFS 3 tiles)
- [x] Transport production: require 3 armies before first transport (1-2 city players)
- [x] Fix transport flip-flop: lock sole producer, allow over-cap switching
- [x] Domination victory: 3:1→5:1 ratio, minimum 150 turns before triggering
- [x] Enemy units visible on discovered tiles (last-known-position fog of war)
- [x] Deposits render above fog overlay (zIndex 11, above fog at 10)
- [x] 827 tests passing (729 shared + 98 server), client builds clean

## Completed (session 063) — Phase 17: Ship Combat, Transport AI & Feature Parity
- [x] Ship bombardment ranges: Destroyer(4), Submarine(2), Battleship(5)
- [x] Ships cannot capture cities — only attack units inside (land/amphibious units capture)
- [x] Transport AI: unowned cities highest priority for drops (free capture first)
- [x] Ship bombard AI: Destroyer/Submarine/Battleship try melee first, then bombard
- [x] AI construction gate lowered: 4→3 cities, cap formula cities/4→cities/3
- [x] Server action validation: bombard, buildOnDeposit, buildCityUpgrade, buildStructure
- [x] Multiplayer/World feature parity: deposits, buildings, resources, techResearch, kingdoms sent to clients
- [x] VisibleGameState protocol extended; server filters by fog-of-war; client consumes real data
- [x] 827 tests passing (729 shared + 98 server), client builds clean

## Completed (session 062) — Phase 17: Balance, Tuning & Launch (continued)
- [x] Fix singleplayer numPlayers: 6 → 2 (1 human + 1 AI)
- [x] Economy Review: toggle button in HUD top bar, no longer blocks Enter
- [x] Debug defaults: Auto-Play and Diag Log default to ON
- [x] Camera: no auto-focus when Auto-Play enabled (watch specific areas)
- [x] 827 tests passing (729 shared + 98 server), client builds clean
- [ ] 17E: Launch checklist items remaining

## Completed (session 061) — Phase 17: Balance, Tuning & Launch
- [x] 17A-D: Comprehensive balance & stress test suite (23 tests)
- [x] New file: packages/shared/src/__tests__/balance.test.ts (~390 lines)
- [x] 827 tests passing (729 shared + 98 server), client builds clean

## Completed (session 060) — Phase 16: Movement Trails & Spectacle
- [x] 16A: Movement trails — fighter contrails (white fading smoke), ship wakes (V-shaped water spray), army dust puffs (brown particles), no trail for Special Forces
- [x] 16A: Trail throttling via TRAIL_EMIT_INTERVAL (60ms), unit type categorization (AIR_UNITS, SHIP_UNITS, LAND_UNITS sets)
- [x] 16B: Directional facing — sprites flip horizontally based on movement direction (facingX tracking per unit)
- [x] 16C: Bombard projectile arc emitter (parabolic 6-step path + impact explosion)
- [x] 16C: Naval combat effect (water spray + foam + explosion overlay)
- [x] 16C: Crown capture golden starburst (24 gold particles + captor color ring + upward sparkles)
- [x] 16C: Shield activation/deactivation effect (expanding blue rings)
- [x] 16D: CrownGlowRenderer — golden pulsing halo on crown cities (3-layer glow, breathing scale)
- [x] 16D: Crown capture event handling in main.ts (dramatic 1.0 intensity shake)
- [x] New file: client/src/renderer/crownGlow.ts (~75 lines)
- [x] Modified: particles.ts (+7 new emitters, ~150 lines), units.ts (trails+facing, ~50 lines)
- [x] Constants: TRAIL_EMIT_INTERVAL, CONTRAIL_LIFE/SIZE, WAKE_LIFE/SPREAD, DUST_LIFE/SIZE, CROWN_GLOW_*
- [x] All 804 tests passing (706 shared + 98 server), client builds clean

## Completed (session 059) — Phase 15: Monetization System
- [x] 15A: Store Infrastructure — Stripe integration (lazy import, checkout sessions, webhooks), purchase ledger, entitlement system
- [x] 15A: Database schema — purchases table, entitlements table (upsert, expiry filtering, equip tracking)
- [x] 15B: Store catalog — 12 items: 10 cosmetics (5 skins, 3 banners, 2 crowns, 2 particles, 2 map themes), VIP monthly ($4.99), season pass ($9.99)
- [x] 15C: Store UI — 4-tab panel (Cosmetics, VIP, Season Pass, Inventory), accessible from main menu
- [x] 15C: Client store integration — StoreClient WebSocket handler, late-binding setActions() pattern
- [x] 15D: VIP production bonus — 10% faster builds via getEffectiveBuildTime(), GameState.vipPlayers optional field
- [x] 15D: VIP shield bonus — +2 hours max shield (10hr vs 8hr) in WorldServer disconnect handler
- [x] 15D: Cosmetic equip/unequip — per-category slot system, auto-unequip same category
- [x] 15E: Balance protection — hard no-pay-to-win rules enforced, VIP capped at 10% build speed
- [x] Server: REST endpoints (items, entitlements, webhook, dev-grant), WS store message routing
- [x] Server: StoreService class, dev-mode granting without Stripe
- [x] New files: shared/store.ts, server/store.ts, client/storeClient.ts, client/storePanel.ts
- [x] 48 new tests (19 shared store + 4 VIP bonus + 25 server store), 804 total (706 shared + 98 server)
- [ ] Deferred: Cosmetic preview system (see items before buying)
- [ ] Deferred: Priority spawn placement for VIP
- [ ] Deferred: Extended action history for VIP (50 turns vs 10)
- [ ] Deferred: Seasonal leaderboard access for season pass
- [ ] Deferred: Client-side cosmetic rendering (sprite/particle overrides)

## Completed (session 058) — Phase 14: Delta Sync & Scaling
- [x] 14A: Change Tracking — TurnDelta types, PreTurnSnapshot, snapshotPreTurn(), computeDelta()
- [x] 14A: Tracks unit moves/creation/destruction/HP, city captures/production, building changes, resource/tech deltas
- [x] 14B: Per-Player Filtering — filterDeltaWithState() filters deltas by player visibility (viewMap)
- [x] 14B: Own units/resources/tech always included; enemy units only if currently visible
- [x] 14C: Lazy Visibility — viewMap snapshots only computed for connected players, not AI/offline
- [x] 14C: computeViewMapDelta() computes cell-level viewMap changes between ticks
- [x] 14D: State Compression — gzip compression for messages > 50KB (full state on join/reconnect)
- [x] 14D: Client DecompressionStream for transparent gzip decompression of binary WebSocket messages
- [x] 14E: Connection Management — WebSocket heartbeat (30s ping/pong), auto-disconnect on timeout
- [x] 14E: Recent delta ring buffer (last 10 ticks) stored per world for reconnection
- [x] 14F: Client delta application — applyDeltaToVisibleState() patches cached VisibleGameState
- [x] 14F: WorldServer sends tick_delta instead of tick_result + world_state per tick
- [x] 14F: Full world_state only sent on join/reconnect (not after every tick)
- [x] New file: shared/src/delta.ts (~400 lines) — delta types, snapshot, compute, filter, apply
- [x] Protocol: tick_delta message type with FilteredDelta payload
- [x] Client: worldClient handles tick_delta, connection.ts handles binary gzip messages
- [x] 37 new tests (32 shared delta + 5 server delta), 756 total (683 shared + 73 server)
- [ ] Deferred: Binary protocol (MessagePack/protobuf) for further compression
- [ ] Deferred: Backpressure detection (skip deltas, send full state for slow clients)
- [ ] Deferred: Performance benchmarking at 100+ player scale

## Completed (session 057) — Phase 13: Accounts & Persistence
- [x] 13A: Authentication — bcrypt hashing, JWT access/refresh tokens, validation
- [x] 13B: Player Database — users table (case-insensitive unique), kingdoms table, index
- [x] 13C: REST Endpoints — register, login, refresh, profile (Bearer auth)
- [x] 13D: WebSocket Auth — authenticate message, token verification, auth_kingdoms
- [x] 13E: Protected Routes — join_world/reconnect_world require JWT; classic mode unchanged
- [x] 13F: Kingdom DB Records — created on join, validated on reconnect, status tracking
- [x] 13G: Client Auth — AuthClient, localStorage persistence, auto-authenticate, token refresh
- [x] 13H: Login UI — login/register screens, main menu status, world browser reconnect buttons
- [x] 13I: Protocol — authenticate, authenticated, auth_error, auth_kingdoms, AuthKingdomInfo
- [x] 18 new tests, 719 total (651 shared + 68 server)
- [ ] Deferred: OAuth providers (Google, Discord, GitHub)
- [ ] Deferred: Email verification, password reset
- [ ] Deferred: Admin tools (kick/ban, force-save)
- [ ] Deferred: World persistence improvements (zlib, periodic backups)
- [ ] Deferred: Abandoned kingdom dissolution (30d timeout)

## Completed (session 056) — Phase 12: Dynamic Map & Player Join
- [x] 12A: placeKingdomTile() — on-demand kingdom generation with terrain, cities, deposits, player, crown city, vision
- [x] 12B: findAvailableKingdom() auto-expands when no AI kingdoms at preferred ring
- [x] 12C: Pre-allocated grid (maxRadius → 11x11), expandWorldToRing() deterministic expansion, populatedRadius tracking
- [x] 12D: AI strength gradient — origin(5 armies+tech+resources), ring1(3+modest), ring2+(1+standard)
- [x] 12E: getWorldRingInfo(), RingInfo type, WorldSummary.rings, ring descriptions
- [x] 12F: SPAWN_PROTECTION_TICKS=100, isBlockedBySpawnProtection(), TickInfo.spawnProtectionTicks
- [x] 12G: Cross-kingdom seamless movement (already works, protection functions available)
- [x] 30 new tests, 701 total (651 shared + 50 server)
- [ ] Deferred: Spawn protection enforcement in executeTurn (needs world context)
- [ ] Deferred: World browser ring selection UI, spawn shield visual

## Completed (session 055) — Phase 11 Remaining: Shield, Reconnection, Client UI
- [x] 11E: Shield mechanic — ShieldState, SHIELD_MAX/INITIAL/CHARGE constants, isShielded()
- [x] 11E: Combat immunity — attack/bombard/auto-attack/mines blocked for shielded players
- [x] 11E: Shield lifecycle — charge accumulates from online time, activates on disconnect, deactivates on reconnect
- [x] 11E: Shield expiry — grace timer uses charge duration, player reverts to AI when expired
- [x] 11F: Reconnection — reconnect_world message, player validation, restore human control
- [x] 11G: World client UI — worldClient.ts, world browser menu, tick countdown, shield indicator
- [x] 11G: HUD extensions — tick timer, actions queued badge, shield remaining, season countdown
- [x] Protocol: reconnect_world, list_worlds, reconnect_failed, per-player TickInfo (shield/actions)
- [x] 24 new tests (14 shield + 10 server), 671 total (621 shared + 50 server)
- [ ] Deferred: Season rewards / leaderboard (later phase)
- [ ] Deferred: JWT authentication for reconnection (Phase 13)

## Completed (session 054) — Phase 11 Core: Kingdom World Server

## Completed (session 053) — Phase 10: Crown City & Kingdom System
- [x] 10A: Crown City assignment from starting cities, reassignment on capture
- [x] 10B: Crown Bonuses — +50% production, +3 defense, +2 heal, 4-tile vision, 25% capture chance
- [x] 10C: Crown Capture → tributaries (30% income), rebellion (military > overlord), cascade freeing
- [x] 10E: KingdomState interface (crownCityId, tributeTarget, tributaries, tributeRate) on GameState
- [x] 10F: Crown City UI — info panel label/bonuses, minimap gold diamonds, economy review Kingdom tab
- [x] New file: kingdom.ts — crown management, tributary system, tribute income, rebellion
- [x] Game engine: crown defense/garrison in combat, production bonus, heal bonus, vision, tribute in turn flow
- [x] 33 new tests, 605 total (577 shared + 28 server)
- [ ] Deferred: Territory system (100x100 kingdom tiles — Phase 11+ with world server)
- [ ] Deferred: Crown relocate action, crown sprite on tilemap

## Completed (session 052) — Phase 9: N-Player Foundation
- [x] 9A: PlayerId type (0=Unowned, 1+=players), Owner enum @deprecated
- [x] 9B: executeTurn(state, Map<number, PlayerAction[]>) — N-player turn execution
- [x] 9C: pickNDistantCities for N-player mapgen, placeDeposits dynamic zones
- [x] 9D: AI multi-enemy awareness (isEnemy closure, getStrongestEnemy for surrender)
- [x] 9E: Per-player viewMaps/resources/techResearch keyed by number
- [x] 9F: 16-color palette, N-player minimap/warStats/unitInfo, playerOwner params
- [x] 9G: GameManager N-player lobby/reconnection, AI for all AI players
- [x] 9H: Singleplayer N-player support, client defaults to 6 players
- [x] New file: player.ts — PLAYER_COLORS, helpers, initAllPlayerData
- [x] 9 test files updated, 572 total (544 shared + 28 server)
- [x] PLAN-KINGDOM.md rewritten: kingdom tiles, tributaries, monthly reset, 100 players

## Completed (session 051) — Phase 8: AI Economy & Strategy
- [x] 8A: Starvation-aware production switching, canAffordProduction() safety margin
- [x] 8B: aiConstructionMove() with deposit/upgrade/defensive priority chain, findConstructionTarget() BFS
- [x] 8C: pickDefensiveStructure() — frontier detection, chokepoint detection, mine/bunker/AA/coastal placement
- [x] 8D: getUpgradePriority() — dynamic tech priority shifting (War when losing, Elec when outnavied)
- [x] 8E: aiArtilleryMove(), aiMissileCruiserMove(), aiEngineerBoatMove() — bombard targeting, retreat, bridge/mine building
- [x] 8F: shouldSurrenderEconomic() — resource/tech hopelessness checks
- [x] Production integration: ratio tables updated, needMore() tech-gates, Construction production rules
- [x] AI orchestrator: all 15 unit types dispatched, idle behaviors updated
- [x] 34 new tests, 544 total shared passing

## Completed (session 050) — Phase 7B: Defensive & Naval Structures
- [x] 10 new BuildingType enums: Bunker(9), AntiAir(10), CoastalBattery(11), RadarStation(12), ArtilleryFort(13), Minefield(14), SAMSite(15), Bridge(16), SeaMine(17), OffshorePlatform(18)
- [x] Extended BuildingAttributes: maxHp, strength, attackRange, invisible, singleUse, visionRadius, targetAir/Sea/Land
- [x] STRUCTURE_TECH_REQUIREMENTS: tech gating for all 10 structures
- [x] startBuildStructure(): Construction builds defensive on land, EngineerBoat builds naval on water
- [x] destroyBuilding(): removes structure, clears deposit/city/constructor references
- [x] bombardStructure(): deal damage via bombard action, destroy at HP 0
- [x] triggerMine()/checkMineTrigger(): mines trigger on enemy unit entry, single-use consumed
- [x] autoAttackStructures(): Bunker(adjacent), AntiAir/Coastal(2 tiles), ArtFort/SAM(3 tiles)
- [x] scanStructureVision(): Radar Station 5-tile persistent vision each turn
- [x] collectPlatformIncome(): Offshore Platform +1 oil/turn
- [x] Bridge traversal: land units cross water tiles with completed bridges via goodLoc()
- [x] Bombard action targets structures when no unit present at location
- [x] BuildingState.hp field added to all buildings (0 for non-structures)
- [x] canBuildStructure() tech gating in tech.ts
- [x] Client: action panel build buttons for Construction (defensive) and EngineerBoat (naval)
- [x] Client: actionCollector.buildStructure(), main.ts build-structure-N handler
- [x] 73 new tests, 510 total shared passing

## Completed (session 049) — Phase 7A: New Units & Bombard
- [x] 5 new UnitType enums: Artillery(10), SpecialForces(11), AWACS(12), MissileCruiser(13), EngineerBoat(14)
- [x] UnitAttributes: attackRange, visionRadius, invisible fields added
- [x] Bombard mechanic: bombardUnit(), canBombard(), chebyshevDist(), processAction bombard
- [x] Artillery: ranged-only (cannot melee), bombard range 2
- [x] Special Forces: invisible on enemy viewMap, revealed when adjacent
- [x] AWACS: 5-tile vision radius, fuel range 48, refuels like fighters
- [x] Missile Cruiser: bombard range 3, War4+Elec3 unlock
- [x] Engineer Boat: placeholder for bridge/mine building (Phase 7B)
- [x] Tech gating: UNIT_TECH_REQUIREMENTS filled, city panel shows locked units
- [x] Client: 5 new procedural sprites, bombardTarget action, bombard/stealth/vision in UI panels
- [x] AI: safely skips new units, ratio tables extended to 15
- [x] 42 new tests, 465 total passing

## Completed (sessions 037-048) — Summarized
> Details in CHANGELOG archive files and PLAN-KINGDOM.md
- Sessions 047-048: Tech System (thresholds, vision/HP/strength/heal/range/speed bonuses, HUD, economy review tech tab) + Kingdom MMO Master Plan (PLAN-KINGDOM.md)
- Sessions 043-046: Economy Foundation → Economy Fixes → Construction & Buildings → Economy Review Screen
- Sessions 040-042: Design (PLAN-A/B/UNIFIED) → Graphics Foundation → Unit Info Panel & Vision
- Sessions 037-039: Security & Performance (CORS, rate limiting, graceful shutdown) → War Stats & AI Fixes → River War

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

## Next Steps (PLAN-KINGDOM phases)
1. ~~**Phase 1-6**: Graphics, UI, Economy, Construction, Review, Tech~~ ✓ (sessions 041-047)
2. ~~**Phase 7A**: New Units & Bombard~~ ✓ (session 049) | ~~**Phase 7B**: Defensive Structures~~ ✓ (session 050)
3. ~~**Phase 8**: AI Economy & Strategy~~ ✓ (session 051)
4. ~~**Phase 9**: N-Player Foundation~~ ✓ (session 052)
5. ~~**Phase 10**: Crown City & Kingdom System~~ ✓ (session 053)
6. ~~**Phase 11**: Kingdom World Server~~ ✓ (sessions 054-055)
7. ~~**Phase 12**: Dynamic Map & Player Join~~ ✓ (session 056)
8. ~~**Phase 13**: Accounts & Persistence~~ ✓ (session 057)
9. ~~**Phase 14**: Delta Sync & Scaling~~ ✓ (session 058)
10. ~~**Phase 15**: Monetization System~~ ✓ (session 059)
11. ~~**Phase 16**: Movement Trails & Spectacle~~ ✓ (session 060)
12. **Phase 17**: Balance, Tuning & Launch — performance, AI, launch prep (1-2 sessions, NEXT)

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
