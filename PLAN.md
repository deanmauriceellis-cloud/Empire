# Empire Reborn: Implementation Plan

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Renderer | PixiJS v8 (WebGPU/WebGL2) |
| Client | TypeScript + Vite |
| Server | Node.js + Colyseus |
| Database | PostgreSQL (JSONB) + Redis |
| Auth | Better Auth |
| Frontend CDN | Cloudflare Pages |
| Server Hosting | Fly.io or Hetzner |
| Assets | Cloudflare R2 |
| Map Design | Tiled Editor |

---

## Phase 0: Project Scaffolding (Steps 0.1–0.5)

### Step 0.1: Initialize Monorepo
- pnpm workspace with Turborepo
- Three packages: `packages/shared`, `packages/client`, `packages/server`
- Root: `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- **Verify**: `pnpm install` and `pnpm -r build` succeed

### Step 0.2: Configure Shared Package
- TypeScript targeting ES2022, vitest for testing
- Build with tsup (ESM + CJS output)
- **Verify**: `pnpm --filter shared build` and `test` succeed

### Step 0.3: Configure Client Package
- Vite + TypeScript + PixiJS v8 + `@pixi/tilemap`
- Basic `index.html` + `src/main.ts` rendering a colored rectangle
- **Verify**: `pnpm --filter client dev` shows rectangle in browser

### Step 0.4: Configure Server Package
- Node.js + TypeScript (tsx) + Colyseus v0.15+
- Health check at `/health`, placeholder GameRoom
- **Verify**: `curl localhost:2567/health` returns 200

### Step 0.5: CI/CD Skeleton
- GitHub Actions: lint, typecheck, test on push
- ESLint + Prettier at root
- **Verify**: Push triggers CI, all pass

---

## Phase 1: Shared Game Types & Constants (Steps 1.1–1.4)

### Step 1.1: Port Core Enums and Constants
- `Direction` (8 directions), `Owner`, `UnitType` (9 types), `TerrainType`, `UnitBehavior` (12 behaviors)
- Map constants: WIDTH=100, HEIGHT=60, SIZE=6000, NUM_CITY=70
- `dir_offset` array from MAP_WIDTH
- **Verify**: Unit tests validate offsets and NUM_CITY

### Step 1.2: Port Unit Attribute Data
- `UnitAttributes` interface + `UNIT_ATTRIBUTES` record (all 9 units with exact stats from data.c)
- `MOVE_ORDER` array, attack target lists per unit type
- **Verify**: Tests confirm fighter range=32, transport capacity=6

### Step 1.3: Define Core Game State Interfaces
- `Position`, `MapCell`, `ViewMapCell`, `CityState`, `UnitState`, `GameConfig`, `GameState`
- **Verify**: TypeScript compiles, types importable from client and server

### Step 1.4: Port Utility Functions
- `locRow`, `locCol`, `rowColLoc`, `dist` (Chebyshev), `locSector`, `isOnBoard`, `getAdjacentLocs`
- **Verify**: Unit tests for coordinate math

---

## Phase 2: Map Generation (Steps 2.1–2.5)

### Step 2.1: Height Map Generation
- Seedable RNG, double-buffer smoothing (default 5 passes)
- **Verify**: Fixed seed produces deterministic output

### Step 2.2: Terrain Assignment
- Height-count waterline at configured ratio (default 70%)
- Edge cells marked off-board
- **Verify**: ~70% sea cells with waterRatio=70

### Step 2.3: City Placement
- Random land cell selection with minimum distance constraint
- Distance decrement fallback when candidates exhausted
- **Verify**: 70 cities placed, all on land, distance respected

### Step 2.4: Starting City Selection
- BFS flood-fill continent detection
- Continent scoring: (shore_cities*3 + inland_cities*2) * 1000 + area
- Difficulty-based pair selection
- **Verify**: Two distinct start cities on appropriate continents

### Step 2.5: Integrated Map Generator
- `generateMap(config, seed)` orchestrating 2.1–2.4
- **Verify**: Integration test with all invariants

---

## Phase 3: Core Game Logic Engine (Steps 3.1–3.8)

### Step 3.1: Unit Management
- `createUnit`, `killUnit` (recursive cargo kill), `objMoves`, `objCapacity`
- `embark`/`disembark` for transport/carrier loading
- **Verify**: Create, load, kill units with cargo cascading

### Step 3.2: Fog of War / Vision
- `scan` (8 adjacent + self), `scanSatellite` (radius 2)
- `getVisibleState` returns player's view
- **Verify**: Scan radius correct, enemy units visible when adjacent

### Step 3.3: Movement System
- `moveUnit` with moved/range tracking, auto-embark/disembark
- `goodLoc` terrain/transport/city validation
- `moveSatellite` with edge bouncing
- **Verify**: Terrain restrictions, auto-embark, satellite bounce

### Step 3.4: Combat System
- `attackCity`: 50% capture chance, attacker always dies
- `attackUnit`: alternating rounds, strength vs hits
- Cargo overflow on capacity loss
- **Verify**: Fixed-RNG combat outcomes, cargo overflow

### Step 3.5: City Production
- `tickCityProduction`: work++, spawn unit at buildTime
- `setProduction`: 20% penalty on switch `-(buildTime/5)`
- Ship repair: +1 hit/turn in port when stationary
- **Verify**: 5-turn army, production switch penalty, port repair

### Step 3.6: Pathfinding Engine
- Perimeter-list BFS with weighted objectives
- `findObjective`, `findDest`, `markPath`, `findDirection`
- Land/water/air/cross-terrain variants
- **Verify**: Army finds nearest city on small known map

### Step 3.7: Continent Analysis
- `mapContinent` BFS flood-fill, `scanContinent` census
- `isLake` detection, `pruneExploreLocs`
- **Verify**: Known continent scan counts, lake detection

### Step 3.8: Turn Execution Engine
- `executeTurn(state, actions)` → processes actions, ticks production, moves satellites
- `PlayerAction` union type, `TurnResult` with events and winner
- End-game: elimination or 3:1 resignation
- **Verify**: 5-turn simulation with scripted actions

---

## Phase 4: AI System (Steps 4.1–4.5)

### Step 4.1: AI Production Strategy
- 4 ratio tables (≤10, ≤20, ≤30, >30 cities)
- Continent defense priority, transport requirement
- **Verify**: AI produces armies when threatened, transports when needed

### Step 4.2: AI Army Movement
- Adjacent attack priority, land objective pathfinding
- Cross-cost evaluation for transport boarding
- **Verify**: Army attacks adjacent enemy, boards transport when beneficial

### Step 4.3: AI Transport Movement
- Loading mode (seek armies) / Unloading mode (seek enemy cities)
- Continent-value-weighted target selection
- **Verify**: Full transport heads to enemy, empty waits for armies

### Step 4.4: AI Fighter and Ship Movement
- Fighter: attack → fuel check → seek objectives
- Ship: damaged → port repair; healthy → attack → seek
- **Verify**: Low-fuel fighter returns, damaged ship repairs

### Step 4.5: AI Turn Orchestrator
- `computeAITurn(state, playerId)` → PlayerAction[]
- Scan → prune → produce → move (in MOVE_ORDER) → endgame check
- **Verify**: 20-turn simulation, AI produces and moves units

---

## Phase 5: Colyseus Server (Steps 5.1–5.5)

### Step 5.1: State Schema
- Colyseus Schema classes mirroring shared types
- `@filter` to send only player's own viewMap
- **Verify**: Serialize/deserialize round-trip

### Step 5.2: Game Room Lifecycle
- onCreate (map gen), onJoin (assign slot), onLeave (reconnect timer), onDispose (save)
- Lock after 2 players (or 1 for single-player)
- **Verify**: Two clients join, one disconnects/reconnects

### Step 5.3: Message Handlers
- `action`, `end_turn`, `set_production`, `resign` messages
- Server validates all actions against shared game rules
- **Verify**: Valid action applied, invalid action rejected

### Step 5.4: Game Phases
- LOBBY → SETUP → PLAYER_TURN ↔ AI_TURN → GAME_OVER
- **Verify**: Full flow through all phases

### Step 5.5: Reconnection and Persistence
- Disconnect: snapshot to Redis (TTL=1hr)
- Autosave to PostgreSQL every 10 turns
- Resume game from DB after restart
- **Verify**: Disconnect/reconnect preserves state

---

## Phase 6: Database & Auth (Steps 6.1–6.3)

### Step 6.1: PostgreSQL Schema
- Tables: `users`, `games` (JSONB state), `game_players`, `game_events`
- **Verify**: Migrations run, test data queryable

### Step 6.2: Better Auth Integration
- OAuth: Discord, Google + email/password
- JWT sessions, Colyseus middleware for auth validation
- **Verify**: OAuth flow → user created → room join with token

### Step 6.3: Game Save/Load API
- REST: `GET /api/games`, `POST /api/games`, `POST /api/games/:id/resume`, `GET /api/profile`
- **Verify**: Create → play → save → restore round-trip

---

## Phase 7: Client Rendering (Steps 7.1–7.7)

### Step 7.1: PixiJS Bootstrap
- WebGPU preference, WebGL2 fallback, responsive canvas
- Scene graph: worldContainer, uiContainer, effectsContainer
- **Verify**: Full-screen canvas renders and resizes

### Step 7.2: Isometric Coordinate System
- `cartToIso`/`isoToCart` transforms, 64x32 tile dimensions
- `screenToTile` with camera offset/zoom
- **Verify**: Round-trip coordinate accuracy

### Step 7.3: Camera System
- WASD/arrow/edge scroll panning, scroll wheel zoom (0.5x–3x)
- Lerp smoothing, map bounds clamping, `focusOnLocation`
- **Verify**: Smooth pan/zoom within bounds

### Step 7.4: Asset Pipeline
- Terrain tileset (16 auto-tile variants), unit sprites (9×2 players), UI, effects
- PixiJS Assets API with progress bar
- Start with colored geometric placeholders
- **Verify**: All placeholders load with progress bar

### Step 7.5: Tilemap Renderer
- `@pixi/tilemap` CompositeTilemap for 100×60 grid
- Viewport frustum culling, fog of war overlay layers
- **Verify**: 60fps full map, fog rendering correct

### Step 7.6: Unit Renderer
- Isometric positioning, player color coding, selection glow
- Smooth movement animation (200ms lerp), health bars
- Stack/cargo indicators
- **Verify**: Units render, select, animate, show health

### Step 7.7: Particle Effects
- Combat explosions, unit death, city capture, water ripples, satellite trails
- PixiJS ParticleContainer for performance
- **Verify**: Effects play and clean up properly

---

## Phase 8: Client Game UI (Steps 8.1–8.7)

### Step 8.1: HUD Layout
- Top bar (turn, player, score), bottom bar (unit info), right sidebar (minimap)
- **Verify**: HUD displays and resizes correctly

### Step 8.2: Minimap
- 1px/tile overview, color-coded terrain/cities, viewport rectangle
- Click to navigate
- **Verify**: Click-to-navigate works, viewport indicator accurate

### Step 8.3: Input System
- Keyboard (movement, behaviors), mouse (select, context menu), touch
- Tile hover highlight
- **Verify**: Full input coverage working

### Step 8.4: Unit Action Panel
- Available actions as buttons with keyboard shortcuts
- Invalid actions grayed out
- **Verify**: Correct actions per unit type

### Step 8.5: City Management Panel
- Production chooser (9 unit types), progress bar, penalty warning
- **Verify**: Production change with penalty display

### Step 8.6: Turn Flow UI
- Auto-cycle through units needing orders, camera focus
- "Next Unit" / "End Turn" buttons, event log
- **Verify**: Full turn flow from start to AI response

### Step 8.7: Game Menu Screens
- Main Menu, Lobby, Game Over, Settings
- Screen transitions with fades
- **Verify**: Navigate all screens, start/end game

---

## Phase 9: Client-Server Integration (Steps 9.1–9.5)

### Step 9.1: Colyseus Client Setup
- Connect, room discovery, join with auth, reconnection
- **Verify**: Client connects and receives state

### Step 9.2: State Synchronization
- Schema change listeners, efficient diffing, optimistic updates
- **Verify**: Two clients see each other's moves within 100ms

### Step 9.3: Action Dispatch
- Send actions, queue during lag, handle rejections
- **Verify**: Valid/invalid action feedback

### Step 9.4: Single-Player Mode
- Run shared logic locally, AI in web worker
- Same interface as network client
- **Verify**: Play without server, AI takes turns

### Step 9.5: Lobby and Matchmaking
- List/create/join games, quick match, private invite codes
- **Verify**: Two players find and join same game

---

## Phase 10: Polish & Audio (Steps 10.1–10.3)

### Step 10.1: Sound System
- Howler.js: UI, combat, ambient, music categories
- Volume controls, spatial audio
- **Verify**: Sounds play contextually

### Step 10.2: Visual Polish
- Animated water, day/night cycle, smooth fog transitions
- Unit idle animations, city activity, screen shake, weather
- **Verify**: Visual quality improvements visible

### Step 10.3: Performance Optimization
- LOD at far zoom, object pooling, texture atlases, lazy loading
- Target: 60fps on mid-range hardware
- **Verify**: Consistent 60fps, no memory growth

---

## Phase 11: Deployment (Steps 11.1–11.4)

### Step 11.1: Client → Cloudflare Pages
### Step 11.2: Server → Fly.io/Hetzner (Docker)
### Step 11.3: Assets → Cloudflare R2
### Step 11.4: Monitoring → Sentry + structured logging

---

## Phase 12: Testing Strategy (Ongoing)

### 12.1: Unit Tests — 90% coverage on shared package
### 12.2: Integration Tests — 2 AIs play 100 turns, save/load round-trip
### 12.3: E2E Tests — Playwright for critical paths, perf benchmarks
