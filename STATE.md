# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: AI Transport Intelligence** — Transport oscillation fixes, stale-cargo bug, verbose AI logging

## Status
- All 12 phases complete + gameplay polish + debug tools + AI overhaul
- 268 unit/integration tests passing (240 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)

## Latest commit
`4a96b6d` — session 024: fix transport AI oscillation, stale-cargo unloading, and add verbose logging

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
- [x] Anti-oscillation — track prevLoc to prevent transports bouncing between two tiles each turn
- [x] Fix "unloading 0 armies" — loadedThisTurn flag skips unload when unit.cargoIds is stale from batched loads
- [x] Fix cargo dumping at own coast — remove premature tryUnloadArmies in deliveringMode, navigate to enemy territory first
- [x] Remove shouldUnload 1/3 capacity gate — any cargo triggers unload when adjacent to enemy territory
- [x] Fix A:undefined in behavior log — add goto/aggressive/cautious to BEHAVIOR_NAMES array
- [x] Verbose AI transport logging — per-step state dumps, unload target details, continent evaluation, navigation decisions

## Known Issues (in testing)
- Transport production may still over-build when existing transports are dysfunctional
- Transports don't wait long enough to fill up before delivering (leave with 1-2/6 cargo)
- Need to verify anti-oscillation works across multi-turn delivery paths

## Next Steps
1. **Continue playtesting** — verify fighter exploration and transport improvements
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
- Lake vs ocean threshold: 5% of map size (300 tiles on standard 100x60 map)
