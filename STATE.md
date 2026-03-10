# Empire Reborn — Project State

## Current Phase
**Post-Phase 12: AI Fix Plan (Phases A+B complete)** — Production intelligence and transport movement overhaul

## Status
- All 12 phases complete + gameplay polish + debug tools + AI overhaul
- 272 unit/integration tests passing (244 shared + 28 server)
- 18 E2E tests (17 passing, 1 skipped)
- Phase A (production) and Phase B (transport movement) fixes implemented and validated

## Latest commit
`bd29a02` — session 026: production intelligence + transport movement overhaul

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
- [x] A1: Early fighter production — switch one army producer to fighter when 2+ cities, 0 fighters
- [x] A2: Transport production cap — max ceil(cities/4) cities building transports
- [x] A3: Relaxed transport guard — allow switch from transport with 2+ transports existing
- [x] A4: Early-game ratio table — RATIO_EARLY for 2-3 cities (20% fighter weight)
- [x] B1: Don't unload on loading continent — shouldUnload, tryUnload, createUnloadViewMap all check for WaitForTransport armies
- [x] B2: Position history — recentLocs Set replaces prevLoc (prevents multi-tile oscillation)
- [x] B3: Minimum cargo for delivery — 50% capacity threshold before delivering
- [x] B5: countNearbyArmies expanded to 3-tile BFS radius
- [x] 4 new production tests added
- [x] 100-turn AI vs AI validation: fighters by turn 33-36, transport cap working, no home-continent unloading

## Known Issues (remaining from session-025 analysis)
1. ~~**Transport load/unload cycle**~~ (Fixed: B1 — loading continent detection)
2. ~~**Transport 2-tile oscillation**~~ (Fixed: B2 — recentLocs Set)
3. ~~**1-army delivery**~~ (Fixed: B3 — min cargo threshold)
4. ~~**Zero fighters built**~~ (Fixed: A1+A4 — early fighter priority + ratio table)
5. ~~**Transport overproduction**~~ (Fixed: A2 — production cap)
6. **Aggressive→idle→WaitForTransport cycle** (Moderate): Unloaded armies cycle back to transport-eligible state. Partially mitigated by B1.
7. ~~**countNearbyArmies too narrow**~~ (Fixed: B5 — 3-tile BFS)

## Next Steps
1. **Phase C: Army-Transport Coordination** (from session-025 plan)
   - C1: Armies near transport → WaitForTransport not Explore
   - C2: Transport navigates to army clusters (weighted '$' markers)
   - C3: Multi-transport coordination (claimed locations)
   - B4: Prevent re-loading just-unloaded armies
2. **Phase D: Testing & Validation**
   - Integration tests for transport delivery to enemy continent
   - Oscillation detection test
   - 200-turn auto-play validation
3. Playtesting, hosting, art assets

## Blockers
_None_

## Notes
- Server runs on port 3001 (port 3000 used by another application)
- Client dev server on port 5174 (port 5173 used by another application)
- Playwright E2E tests run via `pnpm test:e2e` (auto-starts Vite + server)
- Two-player E2E join test skipped: lobby doesn't auto-refresh game list
- 290 total tests: 244 shared + 28 server + 18 E2E (17 pass + 1 skip)
- Map constants are now mutable `let` — call `configureMapDimensions()` before map generation
- Lake vs ocean threshold: 5% of map size (300 tiles on standard 100x60 map)
- Full analysis document: `docs/sessions/session-025-ai-analysis.md`
