# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: Playtesting & Bug Fixes** — gameplay balance + observability

## Status
- All 12 phases complete + gameplay polish + debug tools + AI overhaul
- 283 unit/integration tests passing (255 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)
- Phases A-D complete + playtest fixes + map gen fixes + transport fixes + balance fixes

## Latest commit
`pending` — session 031: gameplay balance fixes + console logging

## Completed (session 031)
- [x] Fix explore auto-capture: armies stop at cities instead of auto-attacking (prevents self-playing games)
- [x] Fix aggressive city attacks: wait for 2+ friendly armies before attacking enemy cities
- [x] Fix resignation threshold: /3 → /5 (AI fights longer before surrendering)
- [x] Fix starting city balance: penalize continent pairs with >2x city count disparity
- [x] Add console event logging ([COMBAT], [CAPTURE], [DEATH], [PRODUCTION], [MOVE], [ATTACK])
- [x] Add turn summary logging ([TURN N] with city/unit counts)
- [x] Add AI turn perf timing ([PERF] AI=Xms exec=Yms)
- [x] Add AI turn summary (action counts + transport cargo)
- [x] Add verbose log toggle (separates per-transport detail from summary)
- [x] Fix camera/animation latency (LERP_FACTOR 0.12→0.25, UNIT_MOVE_LERP 0.15→0.3)

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
1. Playtesting — verify balance fixes work in practice
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
- Original AI reference docs in `docs/original-ai-*.md`
- Debug panel: AI Log = summary, Verbose = per-transport details
