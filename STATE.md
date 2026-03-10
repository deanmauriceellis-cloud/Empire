# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: Playtesting & Bug Fixes** — AI transport + island escape fixes

## Status
- All 12 phases complete + gameplay polish + debug tools + AI overhaul
- 283 unit/integration tests passing (255 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)
- Phases A-D complete + playtest fixes + map gen fixes + transport fixes

## Latest commit
`1ef5f3a` — session 029: fix AI transport coordination, island escape, and oscillation

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
- [x] Fix transport coordination: claim pathfinding objective zone, not transport position
- [x] Fix transport oscillation: store all visited positions in prevLocs (not just final)
- [x] Fix island escape: switch to Army after first transport produced (was building 2nd transport)
- [x] Fix island escape: transport explores for remaining armies instead of delivering half-empty
- [x] Cap production switch penalty at 3 turns (Transport: -3 instead of -6)
- [x] Simplify "only transport producer" guard: allow switch once any transport exists
- [x] 4 new tests: transport cluster coordination, oscillation, island production, penalty cap

## Known Issues
_None known_

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
- 301 total tests: 255 shared + 28 server + 18 E2E (17 pass + 1 skip)
- Map constants are now mutable `let` — call `configureMapDimensions()` before map generation
- Lake vs ocean threshold: 5% of map size (300 tiles on standard 100x60 map)
- Full analysis document: `docs/sessions/session-025-ai-analysis.md`
