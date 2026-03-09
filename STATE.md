# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: Gameplay Features** — Configurable maps & fighter fixes

## Status
- All 12 phases complete + gameplay polish
- 265 unit/integration tests passing (237 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)

## Latest commit
`9802120` — session 016: Configurable maps, fighter fixes

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
- [x] Max-distance starting city selection (was random shore city pick)
- [x] Configurable map dimensions — `configureMapDimensions(w, h)` with mutable constants
- [x] Map size presets: Small (60x40), Standard (100x60), Large (150x90), Huge (200x120)
- [x] Terrain presets: Continents, Pangaea, Archipelago, Islands
- [x] Game setup UI screen with map size + terrain selectors
- [x] Camera `reconfigure(w, h)` for different map sizes
- [x] Fixed satellite bounce hardcoded values
- [x] Fixed fighter auto-attack during explore (caused disappearing)
- [x] Fixed fighter fuel margin (+2 → +speed for safe return)
- [x] Fixed stranded fighters (range=0 now kills, like satellites)
- [x] Centralized `fighterFuelCheck()` helper (replaces 4 duplicated blocks)

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
