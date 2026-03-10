# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: AI Transport/Army Fixes** — ViewMap bug, army staging, transport throughput

## Status
- All 12 phases complete + gameplay polish + debug tools + AI transport overhaul
- 268 unit/integration tests passing (240 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)

## Latest commit
`005aef8` — session 020: fix AI transport navigation, army staging, and P2 viewMap bugs

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
- [x] Fixed scanContinent P2 viewMap inversion — O/X hardcoded as P1/P2 but viewMaps use own/enemy
- [x] Fixed transport oscillation — P2 transports navigated home instead of toward enemies
- [x] Fixed production decisions using wrong enemy counts for P2
- [x] Track currentLoc across transport move steps — transports now use both moves per turn
- [x] Exploring armies visible to transport loading (createTTLoadViewMap + tryLoadArmies)
- [x] Idle armies pathfind toward transport-producing cities (removed '+' and 'O' from fight objectives)
- [x] Reduced crossCost bias — armies readily head to transports when closer
- [x] Reduced countNearbyArmies BFS depth 3→1 — transports don't wait for distant armies
- [x] Added logging for full transport navigation decisions

## Known Issues (in testing)
- User reports a map issue (details TBD)
- Army surplus still large when transport capacity is limited (production ratio tuning)

## Next Steps
1. **Investigate map issue** — user-reported
2. **Production ratio tuning** — build more transports when army surplus is large
3. **Hosting** — deploy to server (any host running Node/Docker)
4. **Art assets** — replace geometric placeholders with real sprites
5. **Lobby polling** — refresh game list automatically for multiplayer

## Blockers
_None_

## Notes
- Server runs on port 3001 (port 3000 used by another application)
- Client dev server on port 5174 (port 5173 used by another application)
- Playwright E2E tests run via `pnpm test:e2e` (auto-starts Vite + server)
- Two-player E2E join test skipped: lobby doesn't auto-refresh game list
- 286 total tests: 240 shared + 28 server + 18 E2E (17 pass + 1 skip)
- Map constants are now mutable `let` — call `configureMapDimensions()` before map generation
