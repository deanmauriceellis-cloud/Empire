# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: Playtesting & Bug Fixes** — AI improvements + diagnostic tooling

## Status
- All 12 phases complete + gameplay polish + debug tools + AI overhaul
- 283 unit/integration tests passing (255 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)
- Phases A-D complete + playtest fixes + map gen fixes + transport fixes + balance fixes

## Latest commit
`64d7ebb` — session 033: AI fighter & production fixes from diagnostic analysis

## Completed (session 033)
- [x] Fix fighter production oscillation: ratio rebalance no longer undoes early fighter priority (was infinite army↔fighter loop, zero fighters ever built)
- [x] Fix fighter refuel-and-leave: fighters now stop at own cities when fuel < max to await end-of-turn refueling (was: return to base, explore away, miss refuel, die)
- [x] Fix grounded fighters: when explore finds no objectives AND BFS/pathfinding fails, fighters fly toward furthest own city to reposition (base-hopping)
- [x] Fix 1-city fighter production: single-city players now build 1 fighter for recon once a transport exists (was: permanently forced to build only armies)

## Completed (session 032)
- [x] Fix production flip-flopping: ratio rebalance threshold 50%→40%, same-type switch guard, progress guard on first transport
- [x] Fix fighter production: first fighter switch up to 60% progress (was 25%), second fighter priority at 3+ cities
- [x] Fix transport circling: tryUnloadArmies BFS 40→10 tiles, shouldUnload BFS 40→10 tiles
- [x] Fix transport stuck with partial cargo: deliver after 3 turns stuck at same location
- [x] Fix transport unload targets: unexplored continents as fallback targets, allow unload on unexplored land
- [x] Diagnostic logging system: POST /api/gamelog endpoint, per-turn state snapshots to game-debug.log
- [x] Diagnostic includes: player summary, city production, unit behaviors, transport/fighter detail, armies near capturable cities, AI decision log, ASCII map
- [x] Consolidate debug panel: removed AI Log/Verbose toggles, single "Diag Log" toggle captures everything
- [x] AI log capture buffer: aiLog/aiVLog write to buffer when diagnostic enabled, included in diagnostic output
- [x] Auto-truncate log on new game (turn 1 clears old log)
- [x] CORS middleware for dev mode (client 5174 → server 3001)

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

## Next Steps
1. Continue playtesting — verify fighter fixes, transport coordination improvements
2. Fix remaining AI issues (transport unloading threshold, multi-island expansion)
3. Hosting / deployment
4. Art assets (replace placeholder textures)

## Blockers
_None_

## Notes
- Server runs on port 3001 (port 3000 used by another application)
- Client dev server on port 5174 (port 5173 used by another application)
- Playwright E2E tests run via `pnpm test:e2e` (auto-starts Vite + server)
- Two-player E2E join test skipped: lobby doesn't auto-refresh game list
- 301 total tests: 255 shared + 28 server + 18 E2E (17 pass + 1 skip)
- Map constants are now mutable `let` — call `configureMapDimensions()` before map generation
- Original AI reference docs in `docs/original-ai-*.md`
- Debug panel: Diag Log = comprehensive file logging (game-debug.log)
- Diagnostic log auto-clears on new game start
