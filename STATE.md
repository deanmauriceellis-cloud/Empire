# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: UI Polish & AI Intelligence** — Click-drag panning, fighter base-hopping, transport delivery fixes

## Status
- All 12 phases complete + gameplay polish + debug tools + AI overhaul
- 268 unit/integration tests passing (240 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)

## Latest commit
`5fe5047` — session 023: click-drag panning, early fighters with base-hopping, AI transport fixes

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
- [x] Click-drag map panning — replaced edge-scroll (caused UI hover scrolling) with click-and-drag (4px threshold, grab cursor)
- [x] Early fighter production — RATIO_1 (≤10 cities) now includes fighters at 10%
- [x] Fighter base-to-base exploration — own cities as low-weight pathfinding objectives, fuel margin uses +speed buffer
- [x] Production oscillation fix — transport surplus guard uses actual unit capacity (not inflated in-production counts)
- [x] Transport delivery mode — deliveringMode flag prevents step 0 deliver / step 1 reload oscillation
- [x] Same-island delivery fix — createUnloadViewMap skips continents with WaitForTransport armies
- [x] Transport reload loop fix — unloaded armies set to Aggressive (not Explore), preventing re-pickup

## Known Issues (in testing)
- Needs continued playtesting with fighter base-hopping and transport delivery fixes
- Some transports may still bounce between two delivery tiles (pathfinding gives alternate results)

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
