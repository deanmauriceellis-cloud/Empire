# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: Lake/Ocean Detection & Transport Intelligence** — Reliable water body classification, transport delivery logic

## Status
- All 12 phases complete + gameplay polish + debug tools + AI transport overhaul
- 268 unit/integration tests passing (240 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)

## Latest commit
`2228fbe` — session 022: fix lake vs ocean detection, transport oscillation, and island escape

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
- [x] Map gen: `isOceanShore()` — starting cities require ocean access (>= 5% map size water body), not just any adjacent water
- [x] Map gen: `floodWaterSize()` BFS helper — measures connected water body size with early exit
- [x] AI: `isCityOnLake()` upgraded — uses actual terrain BFS instead of unreliable viewMap (unexplored cells caused false negatives)
- [x] AI: island escape — single-city with all armies WaitForTransport now builds transport
- [x] AI: army surplus detection — switches coastal cities to transport when wait:transport count exceeds capacity + 6
- [x] AI: transport oscillation fix — partially-loaded transports switch to delivery when tryLoadArmies fails

## Known Issues (in testing)
- Needs continued playtesting with new lake detection + transport fixes

## Next Steps
1. **Continue playtesting** — verify lake detection and transport delivery in real games
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
