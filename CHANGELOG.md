# Empire Reborn — Changelog

## v0.50.0 — Session 061 (2026-03-11)

### Phase 17: Balance, Tuning & Launch (in progress)
- **Balance test suite** — 23 comprehensive tests covering all Phase 17 plan items
- **Resource flow** — Validates starting resources are spent, deposits are utilized
- **Tech pacing** — Confirms linear thresholds (prevents snowball), verifies research mechanics with buildings
- **Advanced units** — Tests AI can produce tech-gated units (Artillery, Special Forces, etc.)
- **Multi-player balance** — 6-player games stable 100+ turns, competitive (no instant domination), economy scales
- **Crown & tributary** — Crown bonuses initialized correctly, tribute income transfers verified via direct call
- **AI competence** — Expansion to 3+ cities, army maintenance, multi-threat adaptation across 6 players
- **Performance** — 2-player avg <200ms/turn, 6-player avg <500ms/turn, no single turn >2000ms
- **Stress tests** — 200-turn 2-player (2 seeds), 100-turn 6-player (2 seeds) — no crashes
- **Game integrity** — Winner validation, asset ownership, unit count bounds (<500), 4-player determinism
- **Balance insight** — Tribute rounds to 0 with single-city vassals (30% of [2,1,2] floors to [0,0,0]); needs 4+ cities to matter
- **New file**: `packages/shared/src/__tests__/balance.test.ts` (~390 lines)
- **827 tests passing** (729 shared + 98 server), client builds clean

## v0.49.0 — Session 060 (2026-03-11)

### Phase 16: Movement Trails & Spectacle
- **Movement trails** — Fighter/AWACS white contrails, ship V-shaped wakes, army dust puffs; Special Forces leave no trail (invisible movement)
- **Trail throttling** — `TRAIL_EMIT_INTERVAL` (60ms) prevents particle spam; unit type sets for clean categorization
- **Directional facing** — Unit sprites flip horizontally based on movement direction, tracked per-unit via `facingX` field
- **Bombard projectile arc** — Parabolic 6-step particle path from source to target with impact explosion
- **Naval combat effect** — Blue-white water spray + foam + standard explosion overlay
- **Crown capture effect** — 24-particle golden starburst + captor color ring + upward sparkles + 1.0 intensity screen shake
- **Shield effect** — Expanding translucent blue rings for activation/deactivation
- **Crown City glow** — `CrownGlowRenderer` draws pulsing golden halo (3-layer: outer, inner, core) with breathing scale animation
- **Crown event handling** — `emitParticleForEvent()` detects crown capture events, triggers dramatic shatter + shake
- **New file**: `client/src/renderer/crownGlow.ts` (~75 lines) — persistent crown city glow overlay
- **New constants**: `TRAIL_EMIT_INTERVAL`, `CONTRAIL_LIFE/SIZE`, `WAKE_LIFE/SPREAD`, `DUST_LIFE/SIZE`, `CROWN_GLOW_RADIUS/PULSE_SPEED/ALPHA`
- **7 new particle emitters**: `emitContrail`, `emitWake`, `emitDustPuff`, `emitBombardArc`, `emitNavalCombat`, `emitCrownCapture`, `emitShieldEffect`
- **804 tests passing** (706 shared + 98 server), client builds clean

## v0.48.0 — Session 059 (2026-03-11)

### Phase 15: Monetization System
- **Store catalog** — 12 items: 10 cosmetics (unit skins, banners, crown styles, particle themes, map themes), VIP monthly ($4.99), season pass ($9.99)
- **Stripe integration** — lazy import, checkout sessions, webhook handling (checkout.session.completed, subscription.deleted)
- **Entitlement system** — permanent cosmetics, 30-day VIP subscription, 90-day season pass; expiry-aware queries
- **VIP production bonus** — 10% faster builds via `getEffectiveBuildTime()`, applied in `tickCityProduction()` using optional `GameState.vipPlayers` field (no game engine coupling)
- **VIP shield bonus** — +2 hours max shield (10hr vs 8hr) for VIP players in WorldServer disconnect handler
- **Cosmetic equip/unequip** — per-category slot system (unit_skin, banner, crown_style, particle_theme, map_theme); equipping auto-unequips same category
- **Store UI** — 4-tab panel (Cosmetics, VIP, Season Pass, Inventory) accessible from main menu
- **Client store integration** — `StoreClient` WebSocket handler, late-binding `setActions()` pattern for UI wiring
- **Server REST endpoints** — `GET /api/store/items`, `GET /api/store/entitlements`, `POST /api/store/webhook`, `POST /api/store/dev-grant` (dev mode)
- **WebSocket store messages** — request items/entitlements, purchase, equip/unequip; auth-required routing
- **Dev-mode granting** — full store flow testable without Stripe via `grantItemDev()`
- **Database schema** — `purchases` and `entitlements` tables with indexes; upsert on re-grant, expiry filtering
- **Balance protection** — hard no-pay-to-win rules enforced; VIP capped at 10% build speed
- **New files**: `shared/src/store.ts` (~175 lines), `server/src/store.ts` (~200 lines), `client/src/net/storeClient.ts` (~100 lines), `client/src/ui/storePanel.ts` (~300 lines)
- **48 new tests** (19 shared store + 4 VIP bonus + 25 server store), **804 total** (706 shared + 98 server)

## v0.47.0 — Session 058 (2026-03-11)

### Phase 14: Delta Sync & Scaling
- **Delta tracking**: `TurnDelta` types with unit moves/creation/destruction/HP, city captures/production, building changes, resource/tech deltas
- **Snapshot-diff approach**: `snapshotPreTurn()` captures mutable state before `executeTurn`, `computeDelta()` diffs after — game engine untouched
- **Per-player filtering**: `filterDeltaWithState()` filters deltas by viewMap visibility — own data always included, enemy only if visible
- **ViewMap deltas**: `computeViewMapDelta()` sends only changed cells instead of full map (99%+ reduction for large maps)
- **Gzip compression**: Messages > 50KB automatically gzip-compressed; client transparently decompresses via `DecompressionStream`
- **WebSocket heartbeat**: 30s ping/pong cycle, auto-disconnect on timeout for dead connections
- **Delta ring buffer**: Last 10 deltas stored per world for reconnection support
- **Protocol change**: `tick_delta` replaces `tick_result` + `world_state` per tick; full state only on join/reconnect
- **Client delta application**: `applyDeltaToVisibleState()` patches cached `VisibleGameState` in-place
- **New file**: `shared/src/delta.ts` (~400 lines) — delta types, snapshot, compute, filter, apply
- **37 new tests** (32 shared delta + 5 server delta sync), **756 total** (683 shared + 73 server)

## v0.46.0 — Session 057 (2026-03-11)

### Phase 13: Accounts & Persistence
- **Authentication**: bcrypt password hashing, JWT access (7d) + refresh (30d) tokens with strict separation
- **User database**: `users` table with case-insensitive unique usernames, `kingdoms` table linking users to worlds
- **REST API**: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/me` endpoints
- **WebSocket auth**: `authenticate` message validates JWT, sends `auth_kingdoms` with active kingdom list
- **Protected routes**: `join_world` and `reconnect_world` require authentication; classic mode unchanged
- **Kingdom records**: DB records created on world join, validated on reconnect, status tracked
- **Client auth**: `AuthClient` with localStorage persistence, auto-authenticate on WS connect, token refresh
- **Login UI**: Login/Register screens with form validation, error display, Enter key support
- **Main menu**: Shows logged-in username + logout button; Kingdom World requires login
- **World browser**: "Your Kingdoms" section with reconnect buttons for existing kingdoms
- **Protocol**: `authenticate`, `authenticated`, `auth_error`, `auth_kingdoms` message types; `AuthKingdomInfo`
- **Tests**: 18 new auth tests; 719 total (651 shared + 68 server)

## v0.45.0 — Session 056 (2026-03-11)

### Phase 12: Dynamic Map & Player Join
- **Pre-allocated grid**: Map sized by `maxRadius` (default 5 → 11x11 = 121 kingdoms) but only `initialRadius` rings populated; rest is ocean ready for expansion
- **Dynamic expansion**: `expandWorldToRing()` generates new AI kingdoms deterministically using seeded RNG; no index remapping needed
- **AI strength gradient**: Origin AI (ring 0) gets 5 armies + tech bonuses + stockpile; inner ring gets 3 armies + modest tech; outer rings match human start
- **Spawn protection**: `SPAWN_PROTECTION_TICKS=100` shields new human players from foreign attacks for 100 ticks; `isBlockedBySpawnProtection()` for enforcement
- **World browser info**: `getWorldRingInfo()` returns per-ring slot counts and descriptions; `WorldSummary.rings` for UI display
- **Auto-expansion**: `findAvailableKingdom()` triggers world expansion when no AI kingdoms available at preferred ring
- **New helpers**: `placeKingdomTile()`, `ringSlotCount()`, `getKingdomTileAtLoc()`, `isSpawnProtected()`
- **WorldState**: new fields `populatedRadius`, `expansionSeed`, `maxRadius` on config
- **Tests**: 30 new tests (60 in world-map.test.ts); 701 total (651 shared + 50 server)

## v0.44.0 — Session 055 (2026-03-11)

### Phase 11 Complete: Shield, Reconnection, World Client UI
- **Shield mechanic**: `ShieldState` (chargeMs, activatedAt, isActive), `SHIELD_MAX_MS` (8hr), `SHIELD_INITIAL_MS` (2hr), `SHIELD_CHARGE_RATIO` (1.0)
- **Shield combat immunity**: `isShielded()` blocks attack (units+cities), bombard, auto-attack structures, mine triggers for shielded players
- **Shield lifecycle**: Charge accumulates from online time, activates on disconnect, deactivates on reconnect preserving remaining charge, AI takeover on expiry
- **Reconnection**: `reconnect_world` message with player validation (world/player exists, not defeated), restores human control, deactivates shield
- **Protocol**: `reconnect_world`, `list_worlds`, `reconnect_failed` messages; per-player `TickInfo` (shieldRemainingMs, actionsQueued)
- **New file `worldClient.ts`** (~250 lines): Complete world mode WebSocket client with action helpers and renderable state builder
- **World browser**: Main menu "Kingdom World" button, world list with join buttons, tick speed setup screen
- **HUD extensions**: Tick countdown timer (⏱ M:SS), actions queued badge, shield indicator, season remaining display
- **Main game loop**: Full world mode integration — startWorldGame, buildWorldUIState, handleWorldClickAction, frame-based tick countdown
- **Tests**: 14 shield unit tests (shared) + 10 server tests (shield lifecycle, reconnection, list_worlds, tick info); 671 total (621 shared + 50 server)

## v0.43.0 — Session 054 (2026-03-11)

### Phase 11 Core: Kingdom World Server
- **New file `world-map.ts`** (~340 lines): World map generator — composes kingdom tiles into NxN grid with ocean channels
- **New file `WorldServer.ts`** (~370 lines): Tick-based world server with action buffering, AI takeover, player join/leave
- **World map**: `WorldConfig` (tileSize, channelWidth, initialRadius, tickInterval, seasonLength), `generateWorldMap()` creates full world from kingdom tiles
- **Kingdom claiming**: `findAvailableKingdom()` / `claimKingdom()` — human players take over AI kingdoms at preferred ring distance
- **Tick engine**: Configurable interval (1min–1hr), collects pending actions, AI computes for disconnected/AI players, broadcasts results
- **Action buffering**: Players queue actions between ticks (max 500), cancel support, confirmation messages
- **AI takeover**: Disconnected humans get AI control after 5min grace period
- **Season timer**: 30-day world lifespan with season end detection
- **Protocol**: 5 new client messages (create/join/action/cancel/leave world), 7 new server messages (world state/tick results/queue confirmations)
- **TickInfo**: `nextTickMs`, `tickIntervalMs`, `seasonRemainingS` sent with every world state update
- **Server integration**: WorldServer runs alongside GameManager on same WebSocket, message routing by type prefix
- **REST**: `/api/worlds` endpoint for world listing
- **GameManager**: `handleMessage`/`handleDisconnect` made public for central routing in index.ts
- **Tests**: 30 world-map + 12 WorldServer = 42 new tests; 647 total (607 shared + 40 server)

## v0.42.0 — Session 053 (2026-03-11)

### Phase 10: Crown City & Kingdom System
- **New file `kingdom.ts`** (~400 lines): Crown city management, tributary vassalage, rebellion, tribute income
- **KingdomState**: `crownCityId`, `tributeTarget`, `tributaries[]`, `tributeRate` per player in `GameState.kingdoms`
- **Crown bonuses**: +50% production speed, +3 defense, +2 heal/turn, 4-tile permanent vision, 25% capture chance (vs 50%)
- **Tributary system**: Crown capture → vassalage (30% income tribute), overlord fall → cascade free tributaries
- **Rebellion**: Vassals with more total units than overlord auto-revolt each turn
- **Tribute income**: Collected after normal resource income, deducted from vassal, added to overlord
- **Game engine**: Crown defense in combat, garrison penalty on attackers, production bonus, heal bonus, vision scan
- **Client**: Crown city icon (♕) + bonuses in unit info panel, gold diamond on minimap, new "Kingdom" tab in economy review
- **33 new tests**, 605 total (577 shared + 28 server)

## v0.41.0 — Session 052 (2026-03-11)

### Phase 9: N-Player Foundation
- **PlayerId system**: `type PlayerId = number` (0=Unowned, 1+=players); `Owner` enum kept as `@deprecated`
- **PlayerInfo**: `{ id, name, color, isAI, status }` — dynamic player registry in `GameState.players`
- **New file `player.ts`**: 16-color palette, `getPlayerIds()`, `getEnemyIds()`, `isEnemy()`, `createPlayerInfo()`, `initPlayerData()`, `initAllPlayerData()`, `countCitiesByPlayer()`, `getStrongestEnemy()`
- **N-player turn execution**: `executeTurn(state, Map<number, PlayerAction[]>)` — processes all players dynamically
- **N-player end game**: `checkEndGame()` iterates all players, per-player elimination (0 cities + 0 armies), simultaneous elimination handling, 2-player 3:1 resignation preserved
- **N-player mapgen**: `startingCities: number[]`, `pickNDistantCities()` greedy distance maximization, `placeDeposits()` dynamic per-player zones
- **AI multi-enemy**: `isEnemy(owner)` closure replaces flip pattern; `shouldSurrenderEconomic()` compares against `getStrongestEnemy()`
- **Server N-player**: `GameManager` uses `Map<number, WebSocket|null>`, lobby join finds unconnected slots, AI computed for all AI players
- **Singleplayer N-player**: creates N `PlayerInfo` entries, computes AI for all AI players per turn
- **Client N-player**: 16-color unit/city textures, dynamic minimap colors, N-player war stats, `playerOwner` params throughout
- **Client default**: 6 players (1 human + 5 AI) for rich N-player gameplay
- **PLAN-KINGDOM.md rewrite**: 100x100 kingdom tiles, center AI kingdom, ring-based player placement, tributary/vassal system, monthly world reset (30-day seasons), 100 player target, cross-kingdom battles
- 9 test files updated, 572 total tests (544 shared + 28 server)

## v0.40.0 — Session 051 (2026-03-11)

### Phase 8: AI Economy & Strategy
- **8A Resource Awareness**: starvation-aware production — switches to cheapest affordable unit when resources depleted; `canAffordProduction()` safety margin check
- **8B Construction Management**: `aiConstructionMove()` priority chain (deposit → city upgrade → defensive structure → navigate); `findConstructionTarget()` BFS; `needsConstruction()` demand check; `pickCityUpgrade()` dynamic priority (Academy→University→TechLab→Hospital→Shipyard→Airfield)
- **8C Defensive Building**: `pickDefensiveStructure()` — frontier detection (8-tile enemy radius), chokepoint detection (≤3 adjacent land), minefields at chokepoints, bunkers at frontiers, anti-air/coastal by threat type
- **8D Tech Strategy**: `getUpgradePriority()` — shifts War when losing militarily, Electronics when losing navally
- **8E Bombard Usage**: `aiArtilleryMove()` bombard + retreat-from-melee; `aiMissileCruiserMove()` bombard then ship AI; `aiEngineerBoatMove()` bridge/sea mine building; `findBombardTarget()` structures > units priority
- **8F Surrender Update**: `shouldSurrenderEconomic()` — no deposits + low stockpile + enemy 3x cities, or massive tech disadvantage
- **Production integration**: ratio tables include Artillery/SpecForces/AWACS/MissileCruiser at mid-late game tiers; `needMore()` tech-gates via `canProduceUnit()`; Construction production 1 per 4 cities (max 3)
- **AI orchestrator**: `moveAIUnit()` dispatches all 15 unit types; idle behaviors skip Construction/always explore Artillery+SpecForces
- 34 new tests (ai-economy.test.ts), 544 total (516 shared + 28 server)

## v0.39.0 — Session 050 (2026-03-11)

### Phase 7B: Defensive & Naval Structures
- **7 defensive structures** (built by Construction on land): Bunker, Anti-Air Battery, Coastal Battery, Radar Station, Artillery Fort, Minefield, SAM Site
- **3 naval structures** (built by Engineer Boat on water): Bridge, Sea Mine, Offshore Platform
- **Auto-attack**: Bunker (adjacent land), Anti-Air (2-tile air), Coastal Battery (2-tile sea), Artillery Fort (3-tile land), SAM Site (3-tile air) — fires each turn during behavior phase
- **Mine mechanics**: Minefield/Sea Mine invisible, single-use, trigger on enemy entry dealing strength damage, consumed after trigger
- **Bridge traversal**: land units cross water tiles via completed bridges (goodLoc check)
- **Radar Station**: 5-tile persistent vision radius scanned each turn
- **Offshore Platform**: +1 oil/turn income
- **Structure destruction**: structures have HP, can be bombarded/attacked, destroyed when HP reaches 0
- **Tech gating**: Bunker (none), Minefield/SeaMine (War 1), Radar/Bridge (Elec 2/Sci 2), AntiAir/Platform (Sci 3), CoastalBattery (Sci 4), ArtilleryFort (War 3), SAM (Elec 4)
- **BuildingState.hp**: new field for all buildings (0 for non-structures)
- **Client UI**: action panel shows structure build buttons for Construction and Engineer Boat
- **processAction**: handles buildStructure, bombard now targets structures when no unit present
- 73 new tests (structures.test.ts), 538 total (510 shared + 28 server)

## v0.38.0 — Session 049 (2026-03-11)

### Phase 7A: New Units & Bombard Mechanic
- **5 new unit types**: Artillery (R), Special Forces (X), AWACS (W), Missile Cruiser (M), Engineer Boat (G)
- **Bombard mechanic**: ranged damage without return fire, Chebyshev distance check, 1 move cost per shot
- **Artillery**: land, speed 1, str 3, hp 2, bombard range 2 tiles, cannot melee (War 2 unlock)
- **Special Forces**: land, speed 2, str 2, hp 1, invisible on enemy viewMap unless adjacent (War 3 unlock)
- **AWACS**: air, speed 6, str 0, hp 1, fuel range 48, 5-tile vision reveal radius (Electronics 2 unlock)
- **Missile Cruiser**: sea, speed 2, str 4, hp 6, bombard range 3 tiles (War 4 + Electronics 3 unlock)
- **Engineer Boat**: sea, speed 2, str 0, hp 1, future bridge/mine builder (Science 2 unlock)
- **Tech gating**: city panel shows locked units as disabled when player lacks required tech
- **Unit info panel**: shows bombard range, stealth status, vision radius for new units
- **Action panel**: bombard info for ranged units, wait-for-transport for special forces
- **Client**: procedural sprites for all 5 new unit types, bombardTarget action collector method
- **AI**: safely skips new units (Phase 8 adds AI construction/economy), ratio tables extended
- 42 new tests (bombard.test.ts), 465 total (437 shared + 28 server)

> Sessions 012-048 archived in `docs/archive/CHANGELOG-sessions-012-048.md`
> Earlier sessions archived in `docs/archive/CHANGELOG-sessions-000-003.md`, `docs/archive/CHANGELOG-sessions-004-007.md`, and `docs/archive/CHANGELOG-sessions-008-011.md`
