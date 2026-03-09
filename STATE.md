# Empire Reborn — Project State

## Current Phase
**Phase 3: Core Game Logic Engine** — Complete

## Status
- Phase 0 (Project Scaffolding) complete
- Phase 1 (Shared Game Types & Constants) complete
- Phase 2 (Map Generation) complete
- Phase 3 (Core Game Logic Engine) complete
- Monorepo operational, all packages type-check, 156 tests passing

## Latest commit
`818b93a` — session 004: Phase 3 core game logic engine

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

## In Progress
_Nothing currently in progress_

## Next Steps
1. **Phase 4: AI System** — AI production strategy, army/transport/fighter/ship movement, turn orchestrator
2. **Phase 5: Node.js Server** — WebSocket game manager, game lifecycle, state broadcast

## Blockers
_None_

## Notes
- Server runs on port 3001 (port 3000 used by another application)
- Shared package consumed as raw TS via workspace `exports` field — no build step needed
- 156 unit tests covering all Phase 0–3 functionality
- GameState now includes `rngState` field for deterministic combat/satellite random rolls
