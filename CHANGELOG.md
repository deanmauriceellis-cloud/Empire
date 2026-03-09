# Empire Reborn — Changelog

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

## v0.6.0 — Session 007 (2026-03-09)

### Added
- **Phase 6: Persistence** — SQLite database for game save/load
  - `packages/server/src/database.ts` — GameDatabase class:
    - SQLite via `better-sqlite3`, WAL journal mode
    - `games` table: id, phase, turn, state (JSON), created_at, updated_at
    - `saveGame()` — UPSERT (insert or update on conflict)
    - `loadGame()` — deserialize JSON back to GameState
    - `listGames()` — summary list sorted by updated_at DESC
    - `deleteGame()` — remove saved game
    - Auto-creates `data/` directory on startup
  - GameManager persistence integration:
    - Autosave after each turn execution
    - Save on game over (resignation/elimination)
    - Save on disconnect timeout (before removing from memory)
    - `resumeGame(id)` — reload saved game into memory for reconnection
    - `getSavedGames()` / `deleteSavedGame(id)` — public API for REST
  - REST API endpoints:
    - `GET /api/games` — returns `{ active, saved }` (both in-memory and database)
    - `POST /api/games/:id/resume` — reload game from DB, rejoin via WebSocket
    - `DELETE /api/games/:id` — remove saved game from DB
  - 13 new tests:
    - 7 database tests (round-trip, view maps, update, list, delete, empty DB)
    - 6 GameManager persistence tests (autosave, game over save, resume, list, delete)

### Changed
- `packages/server/src/index.ts` — wired GameDatabase, added resume/delete endpoints, `GET /api/games` now returns active + saved
- `packages/server/src/GameManager.ts` — constructor accepts optional GameDatabase, autosave hooks
- `packages/server/package.json` — added `better-sqlite3` dependency + `@types/better-sqlite3`
- `package.json` — added `pnpm.onlyBuiltDependencies` for `better-sqlite3`

## v0.5.0 — Session 006 (2026-03-09)

### Added
- **Phase 5: Node.js Server** — complete WebSocket game manager and single-player mode
  - `packages/server/src/protocol.ts` — WebSocket message protocol:
    - `ClientMessage` union: create_game, join_game, action, end_turn, resign
    - `ServerMessage` union: welcome, game_created, game_joined, game_started, state_update, turn_result, game_over, player_disconnected/reconnected, error
    - `VisibleGameState` — fog-of-war filtered state per player
    - `VisibleCity` — hides enemy production/work details
  - `packages/server/src/GameManager.ts` — core game manager:
    - **Game tracking**: `Map<gameId, ActiveGame>` in-memory store
    - **Message routing**: handles all client message types with validation
    - **Action validation**: ownership checks before applying any action
    - **Turn execution**: both players must end turn, then `executeTurn()` runs
    - **Visible state**: per-player fog-of-war filtering (cities, units, events)
    - **Game lifecycle**: lobby → playing → game_over phases
    - **Reconnection**: 5-minute timeout, holds game state for disconnected players
    - **Cleanup**: lobby games removed when empty, active games after both disconnect
    - **REST API**: `getActiveGames()` for `/api/games` endpoint
  - `packages/shared/src/singleplayer.ts` — client-side single-player:
    - `createSinglePlayerGame(config?)` — creates game with AI opponent
    - `submitTurn(actions)` — runs player + AI actions via `executeTurn()`
    - No server required — same shared game logic interface
  - 15 server tests (GameManager.test.ts): connection, create/join, turn execution, action validation, resign, visible state hiding, disconnect/reconnect
  - 5 shared tests (singleplayer.test.ts): creation, turns, production, multi-turn, game over

### Changed
- `packages/server/src/index.ts` — wired GameManager, added `/api/games` endpoint, `express.json()` middleware
- `packages/shared/src/index.ts` — added export for `singleplayer.js`
- `packages/server/package.json` — added vitest devDependency and test script

## v0.4.0 — Session 005 (2026-03-09)

### Added
- **Phase 4: AI System** — complete AI player ported from C source (`compmove.c`)
  - `ai.ts` — full AI decision engine:
    - **Production strategy**: 4 ratio tables (≤10/≤20/≤30/>30 cities), hierarchical priorities (continent defense → transport production → ratio balancing), lake city detection, `overproduced()`/`needMore()` rebalancing
    - **Army movement**: `aiArmyMove` — adjacent attack priority via `attackListToViewChars()` conversion, land objective pathfinding, cross-cost transport boarding evaluation, `moveAway()` for stuck units
    - **Transport movement**: `aiTransportMove` — two-state loading/unloading system, continent value weighting (0-9), `createUnloadViewMap()` coastal targeting, `createTTLoadViewMap()` army seeking, `tryUnloadArmies()`/`tryLoadArmies()` cargo management
    - **Fighter movement**: `aiFighterMove` — attack → fuel check (range ≤ nearest city + 2) → return-to-base → explore, `findNearestCityDist()` helper
    - **Ship movement**: `aiShipMove` — damage-aware port repair (stay stationary), adjacent attack, patrol/explore; shared logic for all 5 ship types
    - **Turn orchestrator**: `computeAITurn(state, aiOwner)` → `PlayerAction[]` — vision refresh, production decisions, MOVE_ORDER movement, surrender check (< 1/3 enemy strength)
  - 23 new tests in `ai.test.ts` covering production, army, transport, fighter, ship, orchestrator, and 20-turn simulation

### Changed
- `index.ts` — added export for `ai.js`

## v0.3.0 — Session 004 (2026-03-09)

### Added
- **Phase 3: Core Game Logic Engine** — complete game engine ported from C source
  - `game.ts` — full game engine with all core mechanics:
    - **Unit management**: `createUnit`, `killUnit` (recursive cargo cascade), `embarkUnit`, `disembarkUnit`, `objMoves` (damage-scaled speed), `objCapacity` (damage-scaled capacity), unit lookup helpers
    - **Seedable RNG**: `gameRandom`, `gameRandomInt` — deterministic mulberry32 for combat/satellite rolls, `rngState` added to `GameState`
    - **Vision system**: `initViewMap`, `updateViewCell`, `scan` (9-cell), `scanSatellite` (2x range), owner-relative display (O/X/*; uppercase/lowercase units)
    - **Movement**: `moveUnit` (moved/range tracking, auto-embark/disembark, cargo follows ship), `goodLoc` (terrain/transport/city validation), `moveSatellite` (diagonal movement with edge bouncing)
    - **Combat**: `attackCity` (50% capture, attacker always dies, city transfer, ship capture), `attackUnit` (alternating 50/50 rounds, strength-based damage, cargo overflow handling)
    - **Production**: `tickCityProduction` (work accumulation, unit spawning), `setProduction` (20% switch penalty), `repairShips` (+1 hit/turn for stationary ships in own port)
    - **Turn execution**: `executeTurn` (process both players' actions, satellite movement, production ticks, ship repair, endgame check), `processAction` (8 action types), `checkEndGame` (elimination + 3:1 resignation)
  - `pathfinding.ts` — BFS perimeter-list pathfinding engine:
    - `createPathMap`, `findObjective` (weighted BFS), `markPath` (backtrack marking), `findDirection` (corner-first diagonal preference)
    - `landMoveInfo`, `waterMoveInfo`, `airMoveInfo` factory helpers
    - `viewCellToTerrain` terrain flag conversion
  - `continent.ts` — view-map continent analysis:
    - `mapContinent` (BFS flood-fill with terrain boundaries, unexplored inclusion)
    - `scanContinent` (census: cities by owner, units by owner/type, unexplored, size)
    - `isLake` (enclosed water with no strategic value)
    - `findExploreLocs` (cells adjacent to unexplored territory)
  - 80 new tests across 3 test files (game, pathfinding, continent)

### Changed
- `types.ts` — added `rngState: number` to `GameState` for deterministic randomness
- `index.ts` — added exports for `game.js`, `pathfinding.js`, `continent.js`

> Earlier sessions (000–003) archived in `docs/archive/CHANGELOG-sessions-000-003.md`
