# Empire Reborn — Changelog

## v0.13.0 — Session 014 (2026-03-09)

### Added
- **Phase 12.3: E2E Tests** — Playwright browser automation tests
  - `playwright.config.ts` — config with 3 projects (singleplayer, multiplayer, perf), webServer auto-launch
  - `e2e/helpers.ts` — shared test utilities (goToMainMenu, startSinglePlayer, endTurn, trackErrors)
  - `e2e/singleplayer.spec.ts` — 9 tests: main menu, HUD, game start, turn advancement, keyboard shortcuts, action panel after unit production, 5-turn and 10-turn stability
  - `e2e/multiplayer.spec.ts` — 5 tests: lobby navigation, create game, cancel, back button, two-player join (skipped)
  - `e2e/perf.spec.ts` — 4 benchmarks: menu load (~1s), game start (~500ms), end turn (~200ms), 10-turn stress (~2s)
- `@playwright/test` dev dependency (root package.json)
- `test:e2e` and `test:e2e:ui` scripts in root package.json

### Changed
- `packages/client/vite.config.ts` — dev server port 5173 → 5174 (port conflict with another local app)
- `packages/client/src/main.ts` — dev mode WebSocket/API URL updated for port 5174
- `.gitignore` — added test-results/, playwright-report/, blob-report/
- `STATE.md` — archived detailed completed phases to `docs/archive/STATE-completed-phases.md`

### Notes
- Two-player E2E join test skipped: lobby `GET /api/games` doesn't show games from other WebSocket sessions immediately
- All tests run via `pnpm test:e2e` — Playwright auto-starts Vite (5174) + server (3001)
- 283 total tests: 237 shared + 28 server + 18 E2E (17 pass + 1 skip)

## v0.12.0 — Session 013 (2026-03-09)

### Added
- **Phase 12.1: Unit Test Coverage** — shared package 84.2% → 93.6% statement coverage
  - `game.test.ts`: +34 tests covering satellite movement/bouncing, processAction (all action types),
    fighter auto-embark logic, city capture with ship transfer, defender-wins combat, cargo overflow,
    Player 2 elimination/resignation, executeTurn satellite movement + P2 resignation
  - `ai.test.ts`: +10 tests covering embarked army skip, transport embark, AI elimination resign,
    zero-moves-left units, transport unloading near land, ship repair/navigation, fight-vs-load decision,
    satellite routing (default case)
- **Phase 12.2: Integration Tests** — `integration.test.ts`
  - AI vs AI full-game simulation (100 turns, seed 42)
  - AI vs AI with different seed (50 turns, seed 9999)
  - Save/load round-trip (JSON serialize → deserialize → continue playing)
  - Deterministic replay (same seed → identical actions + outcomes for 20 turns)

### Changed
- `packages/shared/package.json` — added `@vitest/coverage-v8` dev dependency for coverage reporting
- Total tests: 212 → 265 (237 shared + 28 server)

## v0.11.0 — Session 012 (2026-03-09)

### Added
- **Phase 11: Deployment** — production build, Docker containerization
  - `Dockerfile` — single-container production image:
    - `node:22-slim` base with pnpm via corepack
    - Dependency layer caching (copies package.json files first, then source)
    - Builds client with Vite, runs server with tsx
    - SQLite data volume at `/app/data` for persistence
    - Exposes port 3001
  - `.dockerignore` — excludes node_modules, .git, docs, dist dirs, data/

### Changed
- `packages/server/src/index.ts` — enabled production static file serving:
  - Added `path` and `fileURLToPath` imports for `__dirname` resolution
  - `express.static()` serves client build from `packages/client/dist`
  - SPA fallback route (`/{*splat}`) for client-side routing (Express v5 syntax)
- `package.json` (root) — added `start` script (runs server), expanded `test` to include server tests

## v0.10.0 — Session 011 (2026-03-09)

### Added
- **Phase 10: Polish & Audio** — procedural sound system, visual polish, performance optimization
  - `packages/client/src/audio/AudioManager.ts` — Web Audio API sound manager:
    - Procedural oscillator-based synthesis (no external dependencies, no sound files)
    - Per-category gain nodes: master, SFX, music — independently controllable
    - Audio context auto-resume on first user gesture (browser autoplay policy)
    - Sound effects: move (unit-type-specific), combat, explosion, death, capture, production, turn start/end, game start, game over (victory/defeat variants)
    - Ambient system: low drone pad (55Hz sine) with LFO frequency modulation
  - `packages/client/src/renderer/screenShake.ts` — camera shake effect:
    - Triggered on combat, capture, death events with configurable intensity
    - Random X/Y jitter with exponential decay (8/s decay rate)

### Changed
- `packages/client/src/renderer/tilemap.ts` — animated water + smooth fog:
  - Sea tiles oscillate alpha using per-tile sine wave with position-based phase offsets
  - Fog overlay lerps alpha toward target (3.0/s) instead of hard switching
  - Added `dt` parameter to `update()` for time-based animations
  - Fog alpha tracking via `Map<loc, alpha>` for smooth reveal transitions
- `packages/client/src/renderer/units.ts` — idle animations + shadows:
  - Units bob vertically when idle (2Hz sine, 1.5px amplitude, random phase per unit)
  - Ground-level ellipse shadow beneath each unit (stays grounded during bob)
  - Shadow alpha: 0.25, subtle depth grounding effect
- `packages/client/src/ui/minimap.ts` — performance: terrain caching:
  - Terrain ImageData cached and reused across frames
  - Only redraws when turn changes or tile hash changes
  - Units + viewport rectangle still drawn every frame
  - ~60% reduction in minimap CPU per frame
- `packages/client/src/constants.ts` — new visual polish constants:
  - FOG_LERP_SPEED, WATER_ANIM_SPEED/AMPLITUDE, UNIT_IDLE_BOB_SPEED/AMOUNT
  - UNIT_SHADOW_ALPHA, SCREEN_SHAKE_INTENSITY/DECAY
- `packages/client/src/main.ts` — full audio + screen shake integration:
  - Sound effects wired to: movement, combat, events, turn flow, menus, production
  - Screen shake applied to worldContainer after camera transform
  - Ambient audio starts on game start, stops on game over / back to menu
  - Audio context resumed on first canvas click/keydown

## v0.9.0 — Session 010 (2026-03-09)

### Added
- **Phase 9: Client-Server Integration** — WebSocket multiplayer, lobby, dual-mode client
  - `packages/shared/src/protocol.ts` — moved protocol types to shared package (single source of truth for client & server): GamePhase, ClientMessage, ClientAction, ServerMessage, VisibleGameState, VisibleCity
  - `packages/client/src/net/connection.ts` — WebSocket client connection manager:
    - Auto-reconnect with exponential backoff (500ms → 15s)
    - Typed send/receive (ClientMessage, ServerMessage)
    - Connection state tracking (disconnected, connecting, connected)
    - `getWebSocketUrl()` helper with dev-mode auto-detect
  - `packages/client/src/net/multiplayer.ts` — multiplayer game adapter:
    - Receives VisibleGameState from server, converts to RenderableState for renderer
    - Action dispatch: moveUnit, attackTarget, setProduction, setBehavior, endTurn, resign
    - Server message handler routing (game_created, game_joined, state_update, turn_result, game_over, etc.)
    - `fetchLobbyGames()` REST API helper for lobby game list
    - `viewCharToTerrain()` view cell contents → TerrainType conversion

### Changed
- `packages/client/src/main.ts` — complete rewrite for dual-mode (single-player + multiplayer):
  - GameMode enum: "none" | "singleplayer" | "multiplayer"
  - All input handlers (click, keyboard, panel actions) route through mode-appropriate code path
  - Single-player uses ActionCollector (local state, immediate application)
  - Multiplayer sends actions to server via WebSocket, waits for state_update
  - Dev mode auto-detects port 5173 and connects WebSocket to port 3001
- `packages/client/src/ui/menuScreens.ts` — expanded menu system:
  - Main menu: "Single Player" and "Multiplayer" buttons
  - Multiplayer lobby: connection status, open games list with join buttons, active games with rejoin
  - Waiting screen: game ID display for sharing, cancel button, animated spinner
  - Game over: added "Main Menu" secondary button
  - `updateConnectionStatus()` for live connection indicator
- `packages/client/src/ui/styles.ts` — added lobby/multiplayer CSS:
  - Connection status indicators (green/yellow/red)
  - Lobby game list (game ID, player count, join buttons)
  - Secondary button style, waiting spinner animation
  - h2 heading style for lobby/sub-screens
- `packages/client/src/ui/turnFlow.ts` — owner-aware unit cycling:
  - Added `setOwner(owner)` method (defaults to Player1)
  - `findUnitsNeedingOrders` now uses dynamic owner instead of hardcoded Player1
- `packages/server/src/protocol.ts` — replaced with re-export from `@empire/shared`
- `packages/server/src/GameManager.ts` — imports protocol types from `@empire/shared`
- `packages/shared/src/index.ts` — exports protocol module

## v0.8.0 — Session 009 (2026-03-09)

### Added
- **Phase 8: Client Game UI** — complete game interaction layer
  - `packages/client/src/ui/UIManager.ts` — HTML overlay manager, assembles all UI panels
  - `packages/client/src/ui/styles.ts` — CSS-in-JS injection (dark theme, monospace, semi-transparent panels, pointer-events passthrough)
  - `packages/client/src/ui/hud.ts` — top bar (turn/cities/units count) + bottom bar (selected unit HP/moves/behavior or city production progress)
  - `packages/client/src/ui/minimap.ts` — 2px/tile `<canvas>` minimap: color-coded terrain/cities/units, viewport rectangle overlay, click-to-navigate
  - `packages/client/src/ui/actionPanel.ts` — context-sensitive action buttons with keyboard shortcuts (Skip, Sentry, Explore, Wait for Transport, Disembark, Next Unit, End Turn)
  - `packages/client/src/ui/cityPanel.ts` — modal production chooser: 3×3 grid of 9 unit types (stats shown), progress bar, 20% switch penalty warning on hover
  - `packages/client/src/ui/eventLog.ts` — scrollable event log (combat/capture/production/death/discovery), click event to pan camera, 30-event max
  - `packages/client/src/ui/turnFlow.ts` — auto-cycles units needing orders (func=None, has moves, not embarked), camera focus, skip/done tracking
  - `packages/client/src/ui/menuScreens.ts` — main menu (New Game button), game over screen (Victory/Defeat + turn/city/unit stats)
  - `packages/client/src/game/actionCollector.ts` — accumulates PlayerActions, applies immediately to GameState via `processAction` + vision `scan`, batches for end-of-turn `submitTurn`
  - `packages/client/src/game/moveCalc.ts` — computes valid adjacent move/attack targets for selected unit, returns TileHighlight array
  - `packages/client/src/renderer/highlights.ts` — sprite-pooled tile highlight renderer with pulse animation (green=move, red=attack), hover overlay

### Changed
- `packages/client/src/main.ts` — complete rewrite: click-to-move interaction model, menu flow (main menu → game → game over → new game), turn management loop, action dispatch to collector, highlight computation, particle emission tracking
- `packages/client/src/core/input.ts` — added click event queue (`consumeClicks`), right-click queue (`consumeRightClicks`), one-shot keypress queue (`consumeKeyPresses`); kept existing polling for camera
- `packages/client/src/core/camera.ts` — WASD + arrow keys for camera panning (no conflict with click-to-move)
- `packages/client/src/types.ts` — added `UIState`, `TileHighlight` interfaces; added `selectedCityId` to `SelectionState`; added `moveHighlight`/`attackHighlight` to `AssetBundle`
- `packages/client/src/constants.ts` — added `MOVE_HIGHLIGHT` (0x44cc88) and `ATTACK_HIGHLIGHT` (0xff4444) colors
- `packages/client/src/assets/placeholders.ts` — added green move highlight and red attack highlight diamond textures

## v0.7.0 — Session 008 (2026-03-09)

### Added
- **Phase 7: Client Rendering** — complete isometric rendering engine
  - `packages/client/src/constants.ts` — tile dimensions (64×32), color palette, camera/animation params
  - `packages/client/src/types.ts` — `RenderableState`, `RenderableTile`, `SelectionState`, `AssetBundle` interfaces
  - `packages/client/src/iso/coords.ts` — isometric coordinate system:
    - `cartToIso`/`isoToCart` transforms, `screenToTile` (screen → tile with camera), `getVisibleTileBounds` (frustum culling bounds)
  - `packages/client/src/core/app.ts` — PixiJS v8 bootstrap:
    - WebGPU preference with WebGL2 fallback, responsive canvas
    - Scene graph: worldContainer (camera-transformed), effectsContainer, uiContainer (screen-space)
  - `packages/client/src/core/camera.ts` — camera system:
    - WASD/arrow/edge-scroll panning, scroll wheel zoom (0.5×–3×), lerp smoothing, world bounds clamping
    - `centerOnTile`/`panToTile` helpers
  - `packages/client/src/core/input.ts` — input manager:
    - Keyboard/mouse/wheel polling, blur-safe key tracking, context menu prevention
  - `packages/client/src/assets/placeholders.ts` — placeholder texture generator:
    - Terrain: isometric diamond tiles (land, sea, city×3 owners)
    - Units: 9 geometric shapes × 2 player colors (circle, triangle, diamond, hexagons, rectangles, star)
    - Fog, selection glow, hover highlight textures
    - All generated via `Graphics` → `renderer.generateTexture()`
  - `packages/client/src/renderer/tilemap.ts` — tilemap renderer:
    - Sprite pool with frustum culling (only renders visible tiles)
    - Fog of war overlay layer (unseen = opaque black, stale = semi-transparent)
  - `packages/client/src/renderer/units.ts` — unit renderer:
    - Isometric positioning with lerp movement animation
    - Player color-coded sprites, health bars (green→yellow→red), pulsing selection glow
    - Death fade-out animation, depth sorting by Y coordinate
  - `packages/client/src/renderer/particles.ts` — particle effects system:
    - Pooled Graphics particles with physics (gravity, velocity, alpha fade)
    - Emitters: explosion (orange/red burst), death (owner-colored), capture (ring burst), water ripple (expanding rings)
  - `packages/client/src/game/bridge.ts` — game state adapter:
    - `buildRenderableState(game)` — converts `SinglePlayerGame` to `RenderableState`
    - Combines ground truth terrain + player view map, filters visible units/cities
    - Designed for later swap to multiplayer `VisibleGameState`

### Changed
- `packages/client/src/main.ts` — rewritten as full game client:
  - Initializes all rendering systems, creates single-player game
  - Game loop: input → camera update → tilemap render → unit render → particles → HUD
  - Centers camera on player's starting city, displays turn/tile info HUD

> Earlier sessions archived in `docs/archive/CHANGELOG-sessions-000-003.md` and `docs/archive/CHANGELOG-sessions-004-007.md`
