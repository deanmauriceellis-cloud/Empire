# Empire Reborn — Completed Phase Details (Archived from STATE.md)

## Archived: Session 014 (2026-03-09)

### Phase 0: Project Scaffolding
- [x] Initialize pnpm monorepo (shared/client/server packages)
- [x] Configure shared package (TypeScript + vitest)
- [x] Configure client package (Vite + PixiJS v8)
- [x] Configure server package (Node.js + Express + ws, port 3001)

### Phase 1: Shared Game Types & Constants
- [x] Port core enums and constants (Direction, Owner, UnitType, UnitBehavior, TerrainType)
- [x] Port unit attribute data (all 9 units with exact stats from data.c)
- [x] Define core game state interfaces (GameState, UnitState, CityState, etc.)
- [x] Port utility functions (locRow, locCol, dist, isOnBoard, getAdjacentLocs, locSector)

### Phase 2: Map Generation
- [x] Height map generation (seedable mulberry32 RNG, 9-point smoothing)
- [x] Terrain assignment (histogram waterline, edge marking)
- [x] City placement (adaptive min-distance, random land selection)
- [x] Starting city selection (BFS continent detection, scoring, balanced pairs)
- [x] Integrated map generator (generateMap orchestrating 2.1–2.4)

### Phase 3: Core Game Logic Engine
- [x] Unit management (createUnit, killUnit, embark/disembark, objMoves, objCapacity)
- [x] Fog of war / vision (scan, scanSatellite, updateViewCell, initViewMap)
- [x] Movement system (moveUnit, goodLoc, moveSatellite, auto-embark/disembark)
- [x] Combat system (attackCity 50% capture, attackUnit alternating rounds, cargo overflow)
- [x] City production (tickCityProduction, setProduction 20% penalty, repairShips)
- [x] Pathfinding engine (BFS perimeter-list, findObjective, markPath, findDirection)
- [x] Continent analysis on view maps (mapContinent, scanContinent, isLake, findExploreLocs)
- [x] Turn execution engine (executeTurn, processAction, checkEndGame, 3:1 resignation)

### Phase 4: AI System
- [x] AI production strategy (4 ratio tables, continent defense, transport priority)
- [x] AI army movement (adjacent attack, land pathfinding, transport boarding)
- [x] AI transport movement (loading/unloading modes, continent value targeting)
- [x] AI fighter movement (attack, fuel management, return-to-base)
- [x] AI ship movement (damage-based repair, port seeking, patrol/explore)
- [x] AI turn orchestrator (computeAITurn, vision refresh, MOVE_ORDER, surrender)

### Phase 5: Node.js Server
- [x] WebSocket game manager (GameManager class, message protocol, action validation)
- [x] Game lifecycle (lobby → playing → game_over, reconnection with 5-min timeout)
- [x] State broadcast (per-player visible state, fog-of-war event filtering, enemy info hiding)
- [x] Single-player mode (client-side game loop with AI, no server needed)

### Phase 6: Persistence
- [x] SQLite schema (games table, WAL mode, UPSERT save, JSON state)
- [x] Game save/load API (autosave after turns, save on game over, resume endpoint, delete endpoint)

### Phase 7: Client Rendering
- [x] PixiJS bootstrap (WebGPU preference, scene graph: world/effects/UI containers)
- [x] Isometric coordinate system (cartToIso/isoToCart, screenToTile, getVisibleTileBounds)
- [x] Camera system (WASD/arrow/edge panning, scroll zoom 0.5x-3x, lerp smoothing, bounds clamping)
- [x] Asset pipeline (geometric placeholder textures for terrain, units, fog, selection)
- [x] Tilemap renderer (sprite pool with frustum culling, fog of war overlay)
- [x] Unit renderer (isometric positioning, player colors, health bars, selection glow, move lerp)
- [x] Particle effects (explosions, death, capture, water ripples)
- [x] Game bridge (SinglePlayerGame → RenderableState adapter)

### Phase 8: Client Game UI
- [x] HTML overlay UI system (CSS-in-JS injection, pointer-events passthrough)
- [x] HUD — top bar (turn, cities, units) + bottom bar (unit/city info)
- [x] Minimap — 2px/tile canvas, color-coded terrain/cities/units, viewport rect, click-to-navigate
- [x] Click-to-move input — select unit, green/red tile highlights for valid moves/attacks
- [x] Highlight renderer (sprite pool, pulse animation, move=green, attack=red)
- [x] Action panel — context-sensitive buttons (skip, sentry, explore, wait, disembark) with hotkeys
- [x] City management panel — modal production chooser, progress bar, 20% penalty warning
- [x] Turn flow — auto-cycle units needing orders, camera focus, Next Unit / End Turn
- [x] Event log — scrollable combat/capture/production events, click-to-pan
- [x] Menu screens — main menu (New Game), game over (victory/defeat + stats)
- [x] Action collector — immediate action application with vision updates, batch end-of-turn

### Phase 9: Client-Server Integration
- [x] WebSocket client — auto-reconnect with exponential backoff, typed message protocol
- [x] State synchronization — server VisibleGameState → RenderableState adapter, turn flow integration
- [x] Action dispatch — multiplayer actions sent via WebSocket, server validates and applies
- [x] Lobby UI — main menu (Single Player / Multiplayer), create/join game, waiting screen, game list
- [x] Protocol types moved to shared package (single source of truth for client & server)
- [x] Turn flow owner-aware (supports Player 1 or Player 2 in multiplayer)

### Phase 10: Polish & Audio
- [x] Sound system — procedural Web Audio API synthesis (no external dependencies)
- [x] Audio integration — move, combat, explosion, death, capture, production, turn, game over sounds
- [x] Ambient audio — low drone pad with LFO modulation during gameplay
- [x] Animated water — per-tile sine wave alpha oscillation with position-based phase offsets
- [x] Smooth fog transitions — fog alpha lerp instead of hard switches
- [x] Unit idle bobbing — sinusoidal vertical animation with random phase per unit
- [x] Unit shadows — ground-level ellipse shadows (stay grounded during bob)
- [x] Screen shake — combat/capture/death triggered camera jitter with decay
- [x] Minimap caching — terrain ImageData cached, only units+viewport redrawn per frame

### Phase 11: Deployment
- [x] Production static file serving (server serves client build)
- [x] SPA fallback route (Express v5 `/{*splat}` syntax)
- [x] Dockerfile — single-container build (node:22-slim + pnpm + Vite build)
- [x] .dockerignore for lean image builds
- [x] Root `start` script and expanded `test` script

### Phase 12: Testing Strategy
- [x] 12.1: Unit test coverage — shared 84.2% → 93.6% (game.ts 76% → 99%, ai.ts 70% → 80%)
- [x] 12.2: Integration tests — AI vs AI 100 turns, save/load round-trip, deterministic replay
- [x] 12.3: E2E tests — Playwright (singleplayer, multiplayer lobby, performance benchmarks)
