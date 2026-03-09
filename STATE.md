# Empire Reborn — Project State

## Current Phase
**Phase 6: Persistence** — Complete

## Status
- Phase 0 (Project Scaffolding) complete
- Phase 1 (Shared Game Types & Constants) complete
- Phase 2 (Map Generation) complete
- Phase 3 (Core Game Logic Engine) complete
- Phase 4 (AI System) complete
- Phase 5 (Node.js Server) complete
- Phase 6 (Persistence) complete
- Monorepo operational, all packages type-check, 212 tests passing (184 shared + 28 server)

## Latest commit
`7a7a1bf` — session 006: Phase 5 Node.js server

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

## In Progress
_Nothing currently in progress_

## Next Steps
1. **Phase 7: Client Rendering** — PixiJS bootstrap, isometric coords, camera, tilemap

## Blockers
_None_

## Notes
- Server runs on port 3001 (port 3000 used by another application)
- Shared package consumed as raw TS via workspace `exports` field — no build step needed
- 212 tests total: 184 shared + 28 server (21 GameManager + 7 database)
- GameState now includes `rngState` field for deterministic combat/satellite random rolls
- Server package now has vitest configured for testing
- SQLite database stored at `data/empire.db` (WAL mode), `data/` directory auto-created
- Games autosaved after each turn and on game over; persisted on disconnect timeout
