# Empire Reborn — Changelog

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

## v0.2.0 — Session 003 (2026-03-09)

### Added
- **Phase 2: Map Generation** — complete map generator ported from C source
  - `mapgen.ts` — seedable PRNG (mulberry32), height map with 9-point smoothing, histogram-based waterline, terrain assignment, edge marking, adaptive city placement, BFS continent detection, continent scoring, balanced starting city selection, integrated `generateMap(config)` orchestrator
  - 27 new tests covering RNG determinism, height map smoothing, water ratio, edge marking, city placement constraints, continent detection, starting city selection, and full integration
  - Export added to `index.ts`

## v0.1.0 — Session 002 (2026-03-09)

### Added
- **Phase 0: Project Scaffolding** — full monorepo setup
  - Root: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`
  - `packages/shared/` — TypeScript + vitest, no build step, consumed via workspace `exports`
  - `packages/client/` — Vite + PixiJS v8, renders colored rectangle with version label
  - `packages/server/` — Node.js + Express + ws on port 3001, `/health` endpoint, `/ws` WebSocket
- **Phase 1: Shared Game Types & Constants** — all game logic types ported from C source
  - `constants.ts` — Direction, Owner, UnitType, UnitBehavior, TerrainType, TerrainFlag enums; MAP_WIDTH/HEIGHT/SIZE, NUM_CITY, DIR_OFFSET, MOVE_ORDER, sector constants
  - `units.ts` — UnitAttributes interface + all 9 unit types with exact stats from data.c; attack target lists; canTraverse helper
  - `types.ts` — Loc, Position, MapCell, ViewMapCell, CityState, UnitState, GameConfig, GameState, PlayerAction, TurnResult, ScanCounts
  - `utils.ts` — locRow, locCol, rowColLoc, dist (Chebyshev), isOnBoard, getAdjacentLocs, moveInDirection, locSector, sectorCenter
  - 49 unit tests across 4 test files (constants, units, utils, index)

## v0.0.2 — Session 001 (2026-03-09)

### Changed
- **Simplified architecture** — rewrote `PLAN.md` with leaner tech stack:
  - Removed Colyseus → plain WebSocket (`ws`) + Express
  - Removed Redis → in-memory `Map` for active game state
  - Removed PostgreSQL → SQLite (`better-sqlite3`)
  - Removed Better Auth → deferred (add OAuth later if needed)
  - Removed Turborepo → plain pnpm workspaces
  - Removed tsup → shared package consumed as raw TypeScript
  - Removed 3-service deploy → single Dockerfile (Node serves client + WebSocket + API)
- Total steps: 48 (was 55)

## v0.0.1 — Session 000 (2026-03-09)

### Added
- Cloned original VMS-Empire source from github.com/slacy/empire
- Created `PLAN.md` — 12-phase, 55-step implementation plan
- Created `STATE.md` — project state tracking
- Created `CHANGELOG.md` — this file
- Created session protocol with archive-first optimization policy
- Set up `docs/sessions/` and `docs/archive/` directory structure
