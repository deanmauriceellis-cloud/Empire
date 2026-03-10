# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: Playtesting & Bug Fixes** — E2E tests fixed + map gen hardened

## Status
- All 12 phases complete + gameplay polish + debug tools + AI overhaul
- 279 unit/integration tests passing (251 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)
- Phases A-D complete + playtest fixes + map gen fixes

## Latest commit
`a436d76` — session 028: fix E2E tests + ocean shore starting cities

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
- [x] Fix E2E tests for game setup screen (click through map size/terrain chooser)
- [x] Fix unit count HUD selector (.stat → .unit-count) for by-type format
- [x] Fix action panel test: handle city auto-Explore on new armies
- [x] Add window.__empire debug exposure for E2E introspection
- [x] Fix map gen: pickDistantCities fallback ensures ocean-shore starting cities
- [x] Fix AI: landlocked island → build fighters instead of stranded armies
- [x] New test: starting cities on ocean shore across 10 seeds

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
- 297 total tests: 251 shared + 28 server + 18 E2E (17 pass + 1 skip)
- Map constants are now mutable `let` — call `configureMapDimensions()` before map generation
- Lake vs ocean threshold: 5% of map size (300 tiles on standard 100x60 map)
- Full analysis document: `docs/sessions/session-025-ai-analysis.md`
