# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: AI Fix Plan (Phases A+B+C+D complete + playtest fixes)** — All AI issues resolved

## Status
- All 12 phases complete + gameplay polish + debug tools + AI overhaul
- 278 unit/integration tests passing (250 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)
- Phases A-D complete + playtest log review fixes

## Latest commit
`9fc637c` — session 027: army-transport coordination + playtest log fixes

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

## Completed (this session)
- [x] C1: Idle armies near transport → WaitForTransport (skip explore→wait cycle)
- [x] C2: Transport load map weighted by army cluster density ('%' for 2+ armies)
- [x] C3: Multi-transport coordination — claimedPickupLocs prevents competing for same armies
- [x] B4: Enemy continent detection — armies on enemy continents stay Aggressive, not WaitForTransport
- [x] Transport cap bypass fix — "keeping Transport" surplus guard now respects max cap
- [x] Cross-turn oscillation fix — `prevLocs` on UnitState tracks last 4 turn-end positions
- [x] D1-D5: 200-turn auto-play, transport cap, B4 enemy continent, C1, C2, cap guard tests
- [x] Playtest log (x.log) review — identified and fixed 3 additional bugs from turn 301-304 data

## Known Issues
All 7 issues from session-025 analysis resolved. Playtest log issues also fixed:
1. ~~**Transport cap bypass**~~ (Fixed: surplus guard now checks `ownCityCount/4` cap)
2. ~~**Cross-turn oscillation**~~ (Fixed: `prevLocs` persistent history, cleared on load/unload)
3. ~~**1-army delivery bypass**~~ (Already handled by min-cargo threshold)
4. ~~**Negative work values**~~ (By design — 20% production switch penalty)
5. ~~**Load-then-unload-0**~~ (Already fixed by `loadedThisTurn` guard)

## Next Steps
1. Playtesting and gameplay tuning
2. Hosting / deployment
3. Art assets (replace placeholder textures)

## Blockers
_None_

## Notes
- Server runs on port 3001 (port 3000 used by another application)
- Client dev server on port 5174 (port 5173 used by another application)
- Playwright E2E tests run via `pnpm test:e2e` (auto-starts Vite + server)
- Two-player E2E join test skipped: lobby doesn't auto-refresh game list
- 296 total tests: 250 shared + 28 server + 18 E2E (17 pass + 1 skip)
- Map constants are now mutable `let` — call `configureMapDimensions()` before map generation
- Lake vs ocean threshold: 5% of map size (300 tiles on standard 100x60 map)
- Full analysis document: `docs/sessions/session-025-ai-analysis.md`
