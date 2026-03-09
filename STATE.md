# Empire Reborn — Project State

## Current Phase
**Phase 12: Testing Strategy** — In Progress (12.1 + 12.2 complete)

## Status
- Phases 0–11 complete
- Phase 12.1 (Unit test coverage) complete — 93.6% statement coverage on shared
- Phase 12.2 (Integration tests) complete — AI vs AI 100 turns, save/load, determinism
- Monorepo operational, all packages type-check, 265 tests passing (237 shared + 28 server)

## Latest commit
`d5f4745` — session 013: Phase 12.1 + 12.2 Testing

## Completed
- [x] Clone original VMS-Empire source (github.com/slacy/empire)
- [x] Analyze all original game mechanics (9 units, combat, AI, map gen, fog of war)
- [x] Research and select tech stack (PixiJS v8, Node.js + ws, SQLite, TypeScript)
- [x] Create 12-phase implementation plan (PLAN.md)
- [x] Establish session protocol with archive-first optimization
- [x] Architecture simplification — removed Colyseus, Redis, Better Auth, Turborepo, tsup
- [x] Phase 0: Initialize pnpm monorepo (shared/client/server packages)
- [x] Phase 0: Configure shared package (TypeScript + vitest)
- [x] Phase 0: Configure client package (Vite + PixiJS v8)
- [x] Phase 0: Configure server package (Node.js + Express + ws, port 3001)
- [x] Phase 1: Port core enums and constants (Direction, Owner, UnitType, UnitBehavior, TerrainType)
- [x] Phase 1: Port unit attribute data (all 9 units with exact stats from data.c)
- [x] Phase 1: Define core game state interfaces (GameState, UnitState, CityState, etc.)
- [x] Phase 1: Port utility functions (locRow, locCol, dist, isOnBoard, getAdjacentLocs, locSector)
- [x] Phase 2: Height map generation (seedable mulberry32 RNG, 9-point smoothing)
- [x] Phase 2: Terrain assignment (histogram waterline, edge marking)
- [x] Phase 2: City placement (adaptive min-distance, random land selection)
- [x] Phase 2: Starting city selection (BFS continent detection, scoring, balanced pairs)
- [x] Phase 2: Integrated map generator (generateMap orchestrating 2.1–2.4)
- [x] Phase 3: Unit management (createUnit, killUnit, embark/disembark, objMoves, objCapacity)
- [x] Phase 3: Fog of war / vision (scan, scanSatellite, updateViewCell, initViewMap)
- [x] Phase 3: Movement system (moveUnit, goodLoc, moveSatellite, auto-embark/disembark)
- [x] Phase 3: Combat system (attackCity 50% capture, attackUnit alternating rounds, cargo overflow)
- [x] Phase 3: City production (tickCityProduction, setProduction 20% penalty, repairShips)
- [x] Phase 3: Pathfinding engine (BFS perimeter-list, findObjective, markPath, findDirection)
- [x] Phase 3: Continent analysis on view maps (mapContinent, scanContinent, isLake, findExploreLocs)
- [x] Phase 3: Turn execution engine (executeTurn, processAction, checkEndGame, 3:1 resignation)
- [x] Phase 4: AI production strategy (4 ratio tables, continent defense, transport priority)
- [x] Phase 4: AI army movement (adjacent attack, land pathfinding, transport boarding)
- [x] Phase 4: AI transport movement (loading/unloading modes, continent value targeting)
- [x] Phase 4: AI fighter movement (attack, fuel management, return-to-base)
- [x] Phase 4: AI ship movement (damage-based repair, port seeking, patrol/explore)
- [x] Phase 4: AI turn orchestrator (computeAITurn, vision refresh, MOVE_ORDER, surrender)
- [x] Phase 5: WebSocket game manager (GameManager class, message protocol, action validation)
- [x] Phase 5: Game lifecycle (lobby → playing → game_over, reconnection with 5-min timeout)
- [x] Phase 5: State broadcast (per-player visible state, fog-of-war event filtering, enemy info hiding)
- [x] Phase 5: Single-player mode (client-side game loop with AI, no server needed)
- [x] Phase 6: SQLite schema (games table, WAL mode, UPSERT save, JSON state)
- [x] Phase 6: Game save/load API (autosave after turns, save on game over, resume endpoint, delete endpoint)
- [x] Phase 7: PixiJS bootstrap (WebGPU preference, scene graph: world/effects/UI containers)
- [x] Phase 7: Isometric coordinate system (cartToIso/isoToCart, screenToTile, getVisibleTileBounds)
- [x] Phase 7: Camera system (WASD/arrow/edge panning, scroll zoom 0.5x-3x, lerp smoothing, bounds clamping)
- [x] Phase 7: Asset pipeline (geometric placeholder textures for terrain, units, fog, selection)
- [x] Phase 7: Tilemap renderer (sprite pool with frustum culling, fog of war overlay)
- [x] Phase 7: Unit renderer (isometric positioning, player colors, health bars, selection glow, move lerp)
- [x] Phase 7: Particle effects (explosions, death, capture, water ripples)
- [x] Phase 7: Game bridge (SinglePlayerGame → RenderableState adapter)
- [x] Phase 8: HTML overlay UI system (CSS-in-JS injection, pointer-events passthrough)
- [x] Phase 8: HUD — top bar (turn, cities, units) + bottom bar (unit/city info)
- [x] Phase 8: Minimap — 2px/tile <canvas>, color-coded terrain/cities/units, viewport rect, click-to-navigate
- [x] Phase 8: Click-to-move input — select unit, green/red tile highlights for valid moves/attacks, click to execute
- [x] Phase 8: Highlight renderer (sprite pool, pulse animation, move=green, attack=red)
- [x] Phase 8: Action panel — context-sensitive buttons (skip, sentry, explore, wait, disembark) with hotkeys
- [x] Phase 8: City management panel — modal production chooser, progress bar, 20% penalty warning
- [x] Phase 8: Turn flow — auto-cycle units needing orders, camera focus, Next Unit / End Turn
- [x] Phase 8: Event log — scrollable combat/capture/production events, click-to-pan
- [x] Phase 8: Menu screens — main menu (New Game), game over (victory/defeat + stats)
- [x] Phase 8: Action collector — immediate action application with vision updates, batch end-of-turn
- [x] Phase 9: WebSocket client — auto-reconnect with exponential backoff, typed message protocol
- [x] Phase 9: State synchronization — server VisibleGameState → RenderableState adapter, turn flow integration
- [x] Phase 9: Action dispatch — multiplayer actions sent via WebSocket, server validates and applies
- [x] Phase 9: Lobby UI — main menu (Single Player / Multiplayer), create/join game, waiting screen, game list
- [x] Phase 9: Protocol types moved to shared package (single source of truth for client & server)
- [x] Phase 9: Turn flow owner-aware (supports Player 1 or Player 2 in multiplayer)
- [x] Phase 10: Sound system — procedural Web Audio API synthesis (no external dependencies)
- [x] Phase 10: Audio integration — move, combat, explosion, death, capture, production, turn, game over sounds
- [x] Phase 10: Ambient audio — low drone pad with LFO modulation during gameplay
- [x] Phase 10: Animated water — per-tile sine wave alpha oscillation with position-based phase offsets
- [x] Phase 10: Smooth fog transitions — fog alpha lerp instead of hard switches
- [x] Phase 10: Unit idle bobbing — sinusoidal vertical animation with random phase per unit
- [x] Phase 10: Unit shadows — ground-level ellipse shadows (stay grounded during bob)
- [x] Phase 10: Screen shake — combat/capture/death triggered camera jitter with decay
- [x] Phase 10: Minimap caching — terrain ImageData cached, only units+viewport redrawn per frame
- [x] Phase 11: Production static file serving (server serves client build)
- [x] Phase 11: SPA fallback route (Express v5 `/{*splat}` syntax)
- [x] Phase 11: Dockerfile — single-container build (node:22-slim + pnpm + Vite build)
- [x] Phase 11: .dockerignore for lean image builds
- [x] Phase 11: Root `start` script and expanded `test` script
- [x] Phase 12.1: Unit test coverage — shared 84.2% → 93.6% (game.ts 76% → 99%, ai.ts 70% → 80%)
- [x] Phase 12.2: Integration tests — AI vs AI 100 turns, save/load round-trip, deterministic replay

## In Progress
- Phase 12.3: E2E tests (Playwright critical paths, perf benchmarks)

## Completed (this session)
- [x] Phase 12.1: Unit test coverage — shared package 84.2% → 93.6% statements
- [x] Phase 12.2: Integration tests — AI vs AI (100 turns), save/load round-trip, determinism

## Next Steps
1. **Phase 12.3: E2E Tests** — Playwright for critical paths, perf benchmarks
2. **Hosting** — deploy to server (any host running Node/Docker)

## Blockers
_None_

## Notes
- Server runs on port 3001 (port 3000 used by another application)
- Shared package consumed as raw TS via workspace `exports` field — no build step needed
- 265 tests total: 237 shared + 28 server (21 GameManager + 7 database)
- Shared coverage: 93.6% statements, 88.4% branches, 95.7% functions
- GameState now includes `rngState` field for deterministic combat/satellite random rolls
- Server package now has vitest configured for testing
- SQLite database stored at `data/empire.db` (WAL mode), `data/` directory auto-created
- Games autosaved after each turn and on game over; persisted on disconnect timeout
- UI uses HTML/CSS overlay (pointer-events: none wrapper) for text-heavy panels, PixiJS for minimap highlights
- Click-to-move replaces WASD unit movement; WASD/arrows for camera panning; keyboard for orders only
- Protocol types (ClientMessage, ServerMessage, VisibleGameState) in shared package, re-exported by server
- Dev mode: client on port 5173 auto-connects to WebSocket server on port 3001
- Audio uses Web Audio API with procedural synthesis — no sound files or external libraries needed
- Audio context auto-resumed on first user click/keypress (browser autoplay policy)
- Volume categories: master, SFX, music — each independently controllable
