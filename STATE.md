# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: Gameplay & Debug** — Explore fixes, debug tools, UI polish

## Status
- All 12 phases complete + gameplay polish + debug tools
- 265 unit/integration tests passing (237 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)

## Latest commit
`8971098` — session 017: Explore fixes, debug panel, UI improvements

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
- [x] Army explore: prioritize visible cities (weight 1) over exploration (weight 8)
- [x] Army explore: auto-capture adjacent unowned/enemy cities
- [x] Army explore: auto-sentry when stuck on island with nothing to explore
- [x] Army explore: never permanently cancel explore mode (retry next turn)
- [x] Fixed AI single-city production flip-flop (Army↔Transport loop preventing builds)
- [x] Debug panel: Reveal Map toggle (full vision for player)
- [x] Debug panel: AI Omniscient toggle (AI sees everything)
- [x] Debug panel: Auto-Play toggle (AI controls player units, Enter to advance)
- [x] Action buttons highlight green when active behavior matches selected unit
- [x] Click-to-cycle: re-clicking tile with unit+city cycles selection between them
- [x] Top bar shows unit counts by type (A:5 F:2 T:1)

## Next Steps
1. **Hosting** — deploy to server (any host running Node/Docker)
2. **Art assets** — replace geometric placeholders with real sprites
3. **Lobby polling** — refresh game list automatically for multiplayer

## Blockers
_None_

## Notes
- Server runs on port 3001 (port 3000 used by another application)
- Client dev server on port 5174 (port 5173 used by another application)
- Playwright E2E tests run via `pnpm test:e2e` (auto-starts Vite + server)
- Two-player E2E join test skipped: lobby doesn't auto-refresh game list
- 283 total tests: 237 shared + 28 server + 18 E2E (17 pass + 1 skip)
- Map constants are now mutable `let` — call `configureMapDimensions()` before map generation
