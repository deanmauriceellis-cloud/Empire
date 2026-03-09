# Empire Reborn — Changelog

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
