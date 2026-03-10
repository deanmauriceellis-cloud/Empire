# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: AI Deep Analysis** — Comprehensive AI bug analysis and multi-session fix plan

## Status
- All 12 phases complete + gameplay polish + debug tools + AI overhaul
- 268 unit/integration tests passing (240 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)
- Preliminary fixes in ai.ts (shouldUnload, production guard, loading step, delivery mode) — need further work

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
- [x] Deep analysis of AI transport + production bugs from x.log playtests
- [x] Identified 7 bugs (2 critical, 3 major, 2 moderate) — see `docs/sessions/session-025-ai-analysis.md`
- [x] Preliminary fixes to ai.ts: shouldUnload (enemy cities only), production guard (check waiting armies), loading every step, delivery mode fall-through — partial, needs Phase B/C work
- [x] Created 4-phase fix plan (A: Production, B: Transport, C: Coordination, D: Testing)
- [x] All 268 tests still passing

## Known Issues (analyzed — see session-025-ai-analysis.md)
1. **Transport load/unload cycle** (Critical): Transport loads armies, sails to adjacent water, dumps them back at same tile. Home continent not excluded from unload targets.
2. **Transport 2-tile oscillation** (Critical): prevLoc only blocks 1 previous tile, not wider cycles. Armies also move, creating chase loops.
3. **1-army delivery** (Major): Transport delivers 1/6 cargo immediately. No minimum cargo threshold.
4. **Zero fighters built** (Major): Production guards form cascade that never reaches ratio table. No "ensure first fighter" priority.
5. **Transport overproduction** (Major): No cap on cities building transports. 4/8 cities locked into transports.
6. **Aggressive→idle→WaitForTransport cycle** (Moderate): Unloaded armies cycle back to transport-eligible state.
7. **countNearbyArmies too narrow** (Moderate): BFS depth 0 only checks adjacent tiles.

## Next Steps — Multi-Session Fix Plan
1. **Session 026 — Phase A: Production Intelligence**
   - A1: Early fighter production (2+ cities → ensure 1 fighter)
   - A2: Cap transport production (max cities/4)
   - A3: Relax "only transport producer" guard
   - A4: Fighter-first ratio for early game
2. **Session 027 — Phase B: Transport Movement Overhaul**
   - B1: Don't unload on home/loading continent
   - B2: Replace prevLoc with recentLocs Set
   - B3: Minimum 50% cargo before delivery
   - B4: Prevent re-loading just-unloaded armies
   - B5: Increase countNearbyArmies to 3-tile BFS
3. **Session 028 — Phase C: Army-Transport Coordination**
   - C1: Armies near transport → WaitForTransport not Explore
   - C2: Transport navigates to army clusters (weighted '$' markers)
   - C3: Multi-transport coordination (claimed locations)
4. **Session 029 — Phase D: Testing & Validation**
   - Integration tests for all fixes
   - 200-turn auto-play validation

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
- Full analysis document: `docs/sessions/session-025-ai-analysis.md`
