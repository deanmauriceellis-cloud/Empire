# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: AI Transport/Army Overhaul** — Transport loading, unloading, army coordination

## Status
- All 12 phases complete + gameplay polish + debug tools + AI transport overhaul
- 268 unit/integration tests passing (240 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)

## Latest commit
`97173a5` — session 019: AI transport/army overhaul — loading, unloading, and coordination

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
- [x] Fixed transport oscillation — tryLoadArmies moves adjacent armies onto transport
- [x] Fixed action conflicts — claimedUnitIds prevents army/transport move conflicts
- [x] Fixed home-island dump — tryUnloadArmies only unloads at enemy/unowned territory
- [x] Fixed reload loop — transport sails away after unloading, armies get Explore
- [x] Fixed double-loading — projectedCargo tracks cargo across steps
- [x] Transport waits to fill — countNearbyArmies BFS checks nearby armies
- [x] Partially loaded transports navigate toward enemy territory
- [x] Transports excluded from assignIdleBehaviors (stay func=None)
- [x] Idle armies move toward coast for pickup (findNearestCoast BFS)
- [x] Cargo labels on transport sprites, debug logging toggle
- [x] City panel/HUD display fixes (negative percentage, cargo display)

## Known Issues (in testing)
- Transport AI still being refined — unload/explore behavior needs further testing
- P2 transport can get stuck exploring with no targets

## Next Steps
1. **Continue transport AI testing** — verify unload→explore→return cycle works
2. **Hosting** — deploy to server (any host running Node/Docker)
3. **Art assets** — replace geometric placeholders with real sprites
4. **Lobby polling** — refresh game list automatically for multiplayer

## Blockers
_None_

## Notes
- Server runs on port 3001 (port 3000 used by another application)
- Client dev server on port 5174 (port 5173 used by another application)
- Playwright E2E tests run via `pnpm test:e2e` (auto-starts Vite + server)
- Two-player E2E join test skipped: lobby doesn't auto-refresh game list
- 286 total tests: 240 shared + 28 server + 18 E2E (17 pass + 1 skip)
- Map constants are now mutable `let` — call `configureMapDimensions()` before map generation
