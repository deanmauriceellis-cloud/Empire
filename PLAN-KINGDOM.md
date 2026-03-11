# Empire Reborn — Kingdom MMO Master Plan
## From 2-Player Tactical Game to Persistent Multiplayer Kingdom Warfare

---

## Vision

A persistent shared-world strategy game where every player owns a **100x100 kingdom tile** on a single contiguous map. The world radiates outward from a central AI kingdom — choose to spawn nearby for aggressive play or far out for a safe buildup. Each kingdom has a **Crown City** (capital). Lose your crown and become a **tributary** — paying tribute to your conqueror until you rebel or are freed.

The world is populated with AI kingdoms that play the full game: economy, tech, military, diplomacy. When human players disconnect, AI takes over seamlessly. Target: **100 players** (human + AI) on a single world map. Battles cross kingdom boundaries freely — the ocean channels between tiles are crossable borders, not walls.

Tick-based turns (1 per minute or slower) let players act when they can. **Worlds reset monthly** — each world is a fresh 30-day season. Everyone starts over, stats and cosmetics carry forward, the game stays fresh and accessible. Monetization through cosmetics, time boosts, and season passes — not pay-to-win.

---

## Current State (Sessions 001-052)

**Complete:**
- Phases 1-8 of PLAN-UNIFIED (Graphics, UI, Economy, Construction, Buildings, Tech, Bombard & Defenses, AI Economy)
- **Phase 9: N-Player Foundation** (session 052) — 2-player assumption fully removed
- 15 unit types, 19 building types, full AI economy & strategy, fog of war, save/load, multiplayer lobby, isometric renderer
- 572 tests (544 shared + 28 server), 18 E2E tests
- Resource economy (ore/oil/textile), deposits, construction units, tech trees (4 tracks, 5 levels)
- Bombard mechanic, 7 defensive structures, 3 naval structures, mine triggers, bridge traversal
- AI: construction management, defensive placement, tech strategy, bombard usage, economic surrender
- N-player: PlayerId system, dynamic player registry, N-player mapgen, AI multi-enemy awareness, 16-color palette

**Remaining from PLAN-UNIFIED:**
- Phase 9: Movement Trails & Atmosphere (polish — defer to pre-launch)
- Phase 10: Balance & Testing (polish — defer to pre-launch)

**Key Design Decisions (Session 052):**
- Two-player assumption abandoned completely — all code is N-player native
- Players join kingdoms dynamically; destroyed kingdoms are a future concern
- AI players are full kingdom participants with all functionality preserved
- When users disconnect, AI takes over seamlessly — "not our problem"
- Lots of AI players (near and far) for testing from the start

---

## Phase Map

```
GAMEPLAY FOUNDATION (finish PLAN-UNIFIED core)
├── Phase 7:  Bombard & Defenses          ✅ DONE (session 049-050)
├── Phase 8:  AI Economy & Strategy       ✅ DONE (session 051)

KINGDOM CORE
├── Phase 9:  N-Player Foundation         ✅ DONE (session 052)
├── Phase 10: Crown City & Kingdom Map    ✅ DONE (session 053)
├── Phase 11: Kingdom World Server        ✅ DONE (sessions 054-055)

PERSISTENT WORLD
├── Phase 12: Dynamic Map & Player Join   ✅ DONE (session 056)
├── Phase 13: Accounts & Persistence      ✅ DONE (session 057)
├── Phase 14: Delta Sync & Scaling        ✅ DONE (session 058)

MONETIZATION & POLISH
├── Phase 15: Monetization System         ✅ DONE (session 059)
├── Phase 16: Movement Trails & Spectacle ✅ DONE (session 060)
├── Phase 17: Balance, Tuning & Launch    ← 1-2 sessions

TOTAL: 13-22 sessions from current state
```

---

## Phase 7: Bombard & Defensive Structures (1-2 sessions)
*Unchanged from PLAN-UNIFIED Phase 7 — see PLAN-UNIFIED.md for full detail*

**Goal**: Ranged combat and static defenses transform warfare from "more armies wins" to combined-arms strategy.

### 7A: New Units
| Unit | Char | Terrain | Speed | Str | HP | Build | Cost | Range | Unlock | Notes |
|------|------|---------|-------|-----|----|-------|------|-------|--------|-------|
| Artillery | R | Land | 1 | 3 | 2 | 20 | 25/10/0 | 2 bombard | War 2 | Cannot melee. Ranged only. |
| Special Forces | X | Land | 2 | 2 | 1 | 15 | 15/5/10 | ∞ | War 3 | Invisible until adjacent. Fast army. |
| AWACS | W | Any | 6 | 0 | 1 | 20 | 20/15/0 | 48 fuel | Elec 2 | 5-tile vision reveal. No attack. |
| Missile Cruiser | M | Sea | 2 | 4 | 6 | 40 | 35/30/0 | 3 bombard | War 4+Elec 3 | Ultimate naval fire support. |
| Engineer Boat | G | Sea | 2 | 0 | 1 | 15 | 15/5/5 | ∞ | Sci 2 | Builds bridges & sea mines on water. |

### 7B: Bombard Mechanic
- New action: `{ type: "bombard"; unitId: number; targetLoc: Loc }`
- Range check: `1 < chebyshevDist(source, target) <= attackRange`
- Deals damage, no return damage (ranged advantage)
- Costs 1 move point per shot
- Cannot capture cities (only melee armies capture)

### 7C: Defensive Structures (Built by Construction on Land)
| Structure | Unlock | Build | Cost | HP | Str | Range | Effect |
|-----------|--------|-------|------|----|-----|-------|--------|
| Bunker | — | 4 | 15/0/5 | 5 | 2 | Adjacent | Armies inside get +2 defense. Auto-attacks adjacent. |
| Anti-Air Battery | Sci 3 | 6 | 40/30/0 | 5 | 3 | 2 | Attacks fighters/AWACS within 2 tiles. |
| Coastal Battery | Sci 4 | 8 | 50/40/0 | 8 | 4 | 2 | Attacks ships within 2 tiles. Shore denial. |
| Radar Station | Elec 2 | 6 | 30/20/0 | 3 | 0 | — | 5-tile permanent reveal. Detects subs within 3. |
| Artillery Fort | War 3 | 10 | 60/30/0 | 10 | 5 | 3 | Long-range land bombardment. |
| Minefield | War 1 | 3 | 10/5/0 | — | 2 | — | Invisible. Damages first enemy to enter. Single-use. |
| SAM Site | Elec 4 | 8 | 50/40/10 | 6 | 5 | 3 | Anti-air, 3-tile range. |

### 7D: Naval Structures (Built by Engineer Boat on Water)
| Structure | Unlock | Build | Cost | HP | Str | Effect |
|-----------|--------|-------|------|----|-----|--------|
| Bridge | Sci 2 | 6 | 30/10/10 | 5 | 0 | Armies cross water. Destroyable chokepoint. |
| Sea Mine | War 1 | 2 | 10/5/0 | — | 3 | Invisible. Str 3 on first ship. Single-use. |
| Offshore Platform | Sci 3 | 8 | 40/20/0 | 4 | 0 | +1 oil/turn. Must be adjacent to oil deposit. |

### 7E: Special Behaviors
- **Artillery**: auto-bombard nearest enemy in range; else GoTo/Explore
- **Special Forces**: invisible on enemy viewMap (terrain char, not unit); revealed when adjacent
- **AWACS**: 5-tile vision reveal radius; explore behavior; never attacks
- **Missile Cruiser**: auto-bombard priority targets in range; else move like ship
- **Engineer Boat**: GoTo + build queue on water tiles
- **Structures**: auto-bombard each turn during behavior phase (StaticDefense behavior)
- **Minefields/Sea Mines**: trigger on enemy entry, consume self
- **Bridges**: land movement across water tile; army on destroyed bridge dies

### 7F: Graphics
- Projectile arc animation (source → target)
- Impact explosion at target tile
- Range circle overlay on bombard-capable unit selection
- Procedural sprites for all structures and new units
- Invisibility rendering: Special Forces/mines not shown on enemy client

**Tests**: Bombard range/damage, mine trigger/consume, bridge traversal, structure auto-attack, invisibility viewMap, tech unlock gating for all new units.

**Why this matters for kingdoms**: Bunkers, coastal batteries, minefields, and artillery forts are literally how players defend their kingdom borders. Without this phase, kingdom warfare is just "swim armies across ocean."

---

## Phase 8: AI Economy & Strategy (2-3 sessions)
*Unchanged from PLAN-UNIFIED Phase 8 — see PLAN-UNIFIED.md for full detail*

**Goal**: AI plays the full economic and defensive game competently. Critical for offline kingdom defense.

### 8A: AI Resource Awareness
- Track income vs expenses vs stockpile per resource
- Don't start unaffordable production; switch to affordable units when starved
- Value deposits as exploration/attack targets

### 8B: AI Construction Management
- Build construction units: 1 per 4-5 cities (ratio table)
- Direct to nearest unclaimed deposit (GoTo)
- City upgrade priority: Academy → University → TechLab → Hospital → Shipyard → Airfield
- Task chain: claim deposit → upgrade city → repeat

### 8C: AI Defensive Building
- Bunkers at frontier cities (enemy on same continent)
- Coastal batteries at shore cities near enemy navy
- Minefields at chokepoints (bridge approaches, narrow passages)
- Anti-air at cities harassed by fighters

### 8D: AI Tech Strategy
- Default priority: Science → War → Electronics → Health
- Shift War priority when losing militarily
- Shift Electronics when losing navally
- Target specific unlocks (rush Artillery vs fortified enemy)

### 8E: AI Bombard Usage
- Artillery/Cruiser target structures first, then units
- Position artillery 2 tiles behind front line
- Use Special Forces for scouting
- Build bridges on river maps

### 8F: AI Surrender Update
- Factor economic hopelessness (0 deposits, 0 income, depleted stockpile)
- Factor tech disadvantage into surrender calculation

**Tests**: AI construction decisions, deposit targeting, upgrade ordering, resource management, bombard targeting, defensive placement.

**Why this matters for kingdoms**: When players go offline, AI takes over. A stupid AI means logging in to find your kingdom razed. AI must defend competently — build defenses, maintain economy, produce military units, and use bombard effectively.

---

## Phase 9: N-Player Foundation ✅ DONE (Session 052)

**Goal**: Remove the 2-player ceiling. Support 2-50+ players in a single game.

### 9A: Dynamic Owner System ✅
- `type PlayerId = number` (0 = Unowned, 1+ = players) in constants.ts
- `Owner` enum kept but marked `@deprecated` for backward compatibility
- `GameState.players: PlayerInfo[]` — dynamic player registry:
  ```typescript
  interface PlayerInfo {
    id: PlayerId
    name: string
    color: number
    isAI: boolean
    status: 'active' | 'defeated' | 'resigned'
  }
  ```
- Per-player data: `viewMaps`, `resources`, `techResearch` keyed by `number`
- New `player.ts`: PLAYER_COLORS (16-color palette), getPlayerIds, getEnemyIds, isEnemy, createPlayerInfo, initPlayerData, initAllPlayerData, countCitiesByPlayer, getStrongestEnemy

### 9B: Turn Execution Refactor ✅
- `executeTurn(state, allActions: Map<number, PlayerAction[]>)` — iterates all players
- `checkEndGame()`: per-player elimination (0 cities + 0 armies = defeated), simultaneous elimination handling, 2-player 3:1 resignation preserved for backward compat

### 9C: N-Player Mapgen ✅
- `startingCities: number[]` (was `[number, number]`)
- `pickNDistantCities()`: greedy distance maximization for N players
- `placeDeposits()` accepts dynamic player count, creates per-player zones

### 9D: AI Multi-Player Awareness ✅
- Enemy detection: `isEnemy(owner) => owner !== aiOwner && owner !== 0` (replaces flip pattern)
- `shouldSurrenderEconomic()`: compares against strongest enemy's tech total
- All `enemyOwner` variables in ai-economy.ts replaced with `isEnemy()` closures

### 9E: Vision & Fog of War ✅
- `viewMaps` keyed by PlayerId for all players
- `initAllPlayerData()` initializes per-player maps/resources/tech

### 9F: Client Updates ✅
- 16-color palette: placeholders.ts generates N-player unit/city textures
- Minimap: dynamic player colors via getPlayerColor
- Unit info: generic "Player N" labels
- War stats: N-player Map<number, stats> summary
- actionCollector/bridge/actionPanel: accept playerOwner parameter
- main.ts: module-level playerOwner variable replaces hardcoded Owner refs

### 9G: Server Updates ✅
- GameManager: `Map<number, WebSocket|null>` for N players
- Lobby: join finds unconnected slots from state.players
- Reconnection: only for in-progress games
- Turn execution: AI computed for all AI players

### 9H: Singleplayer ✅
- Creates N PlayerInfo entries (player 1 = human, rest = AI)
- submitTurn computes AI for all AI players, builds Map<number, PlayerAction[]>
- Default: 6 players (1 human + 5 AI) for rich gameplay

**Tests**: All 572 tests passing (544 shared + 28 server). Integration tests updated with players array, Map-based executeTurn, starting city assignment.

---

## Phase 10: Crown City & Kingdom Map Model (1-2 sessions)

**Goal**: Every player owns a 100x100 kingdom tile region on a shared world map. Crown city = capital. Tributaries = vassal kingdoms paying tribute. Battles cross kingdom boundaries freely.

### World Map Architecture

The world is a single contiguous map composed of **kingdom tiles** — 100x100 tile regions arranged in a grid. The center kingdom tile is the **Origin Kingdom** (AI-controlled), and player/AI kingdoms radiate outward in concentric rings.

```
World map layout (each cell = one 100x100 kingdom tile):
┌─────┬─────┬─────┬─────┬─────┐
│ Far │ Far │ Far │ Far │ Far │
├─────┼─────┼─────┼─────┼─────┤
│ Far │Near │Near │Near │ Far │
├─────┼─────┼─────┼─────┼─────┤
│ Far │Near │ CTR │Near │ Far │
├─────┼─────┼─────┼─────┼─────┤
│ Far │Near │Near │Near │ Far │
├─────┼─────┼─────┼─────┼─────┤
│ Far │ Far │ Far │ Far │ Far │
└─────┴─────┴─────┴─────┴─────┘
CTR = Origin Kingdom (AI), Near = ring 1, Far = ring 2+
```

- **100 players target** — world grows as players join
- Each kingdom tile generates its own terrain, cities (5-8), deposits (3-4), with internal variety
- Kingdom boundaries are **permeable** — units cross freely, battles happen anywhere
- Ocean channels between kingdom tiles (10-20 tiles wide) create natural borders but are crossable
- The world map is a single flat array, not separate per-kingdom maps — seamless gameplay

### 10A: Crown City
- One city per player is the **Crown City** (capital)
- Initially: player's starting city (center of their kingdom tile)
- Can be relocated (expensive action, long cooldown — 50 turns)
- Crown city visual: larger sprite, golden glow, crown icon, unique particle effects

### 10B: Crown Bonuses
- Crown city gets inherent bonuses (no building required):
  - +3 defense to all units within 3-tile radius
  - +2 HP/turn healing to all units in the city
  - +50% production speed
  - Permanent 4-tile vision reveal radius (like radar)
- These bonuses represent the kingdom's concentrated power at its heart

### 10C: Crown Capture & Tributaries
- When an enemy army captures your Crown City:
  - **Vassalage**: defeated kingdom becomes **tributary** of captor
  - Tributary pays 30% resource income as tribute to overlord each turn
  - Tributary keeps their cities, units, and economy — but weakened
  - Tributary can **rebel**: recapture own crown city OR build military > overlord's → auto-revolt
  - Overlord can **release** tributaries voluntarily
  - If overlord's crown is captured, all their tributaries are freed
- Crown cities are harder to capture: garrison bonus (+5 effective strength for defenders)
- A tributary's tributaries cascade — if A vassalizes B who vassalizes C, C pays B who pays A
- **Full elimination**: only happens when a kingdom loses ALL cities (crown + every other city)

### 10D: Territory System
- Each player's **territory** = their kingdom tile region (100x100) + tiles within 4 of any owned city outside their tile
- Territory provides:
  - Vision (always visible, even without units)
  - Building rights (can place structures only on own territory)
  - Border display (subtle colored border on minimap and world map)
- Territory expands beyond kingdom tile as you capture cities in other kingdoms
- Contested territory: overlapping zones create disputed borders

### 10E: Kingdom Identity
- `KingdomState` added to GameState per player:
  ```typescript
  interface KingdomState {
    crownCityId: number          // which city is the capital
    kingdomTile: { row: number; col: number } // position in kingdom grid
    territory: Set<number>       // tile indices in territory
    tributeTarget?: PlayerId     // if vassal, who they pay to
    tributaries: PlayerId[]      // kingdoms paying tribute to this one
    tributeRate: number          // 0.3 (30% of income)
    color: number                // kingdom color
    banner: number               // cosmetic banner type (future monetization)
    distanceFromCenter: number   // ring number (0=center, 1=near, 2+=far)
  }
  ```
- Kingdom name (player-chosen or auto-generated)

### 10F: Crown City UI
- Crown icon on minimap and world map
- "Crown City" label in city panel
- "Relocate Capital" button (if cooldown met)
- Warning alert when Crown City is under attack
- Tribute panel: income/expenses from tributary relationships
- Rebel/Release buttons for tributary management
- Special capture animation (crown shattering)

**Tests**: Crown assignment, crown bonuses, crown capture → vassalage, tribute income flow, rebellion trigger, cascade tribute, territory calculation, cross-kingdom combat.

---

## Phase 11: Kingdom World Server (1-2 sessions) ✅ COMPLETE (sessions 054-055)

**Goal**: Server manages the kingdom world — tick-based turns, AI kingdoms everywhere, player join/disconnect with AI takeover.

### 11A: World Initialization
- World starts with the **Origin Kingdom** (AI) at center tile (0,0)
- Populate ring 1 (8 tiles) and ring 2 (16 tiles) with AI kingdoms on creation
- Total initial world: ~25 AI kingdoms on a 500x500 map (5x5 kingdom grid)
- Each AI kingdom has its own generated terrain, cities, deposits, starting army
- AI kingdoms play the full game: economy, tech, production, military, diplomacy

### 11B: Tick Engine
- `WorldServer` (alongside existing `GameManager` for classic mode)
- Configurable tick interval: 60s (fast), 300s (standard), 900s (slow), 3600s (epic)
- Tick cycle:
  ```
  1. Tick timer fires
  2. Collect all pending actions from connected players
  3. For disconnected/AI players: run computeAITurn()
  4. Execute turn with all action sets
  5. Process tribute income transfers
  6. Broadcast results to connected players
  7. Save state
  8. Reset action buffers
  9. Schedule next tick
  ```

### 11C: Action Buffering
- Players submit actions anytime between ticks
- Actions queue server-side per player: `pendingActions: Map<PlayerId, PlayerAction[]>`
- Actions validated on receipt (not just at execution)
- Client shows "Actions queued: 5" indicator and countdown to next tick
- Player can cancel/modify pending actions before tick

### 11D: Offline AI Takeover
- Player marked offline after 2 missed ticks (no WebSocket connection)
- AI computes actions for offline players each tick
- When player reconnects, AI stops, player resumes control
- **Shield mechanic**:
  - First 2 hours after disconnect: kingdom is immune to attack (shield bubble)
  - Shield visible to other players (translucent dome over territory)
  - After shield expires: AI defends normally
  - Shield recharges: 1 hour of online play → 1 hour of shield stored (max 8 hours)

### 11E: Tick Synchronization
- Client displays:
  - Countdown timer to next tick ("Next turn in: 0:43")
  - "Your actions submitted" confirmation
  - Turn result replay after tick (animated like current turn execution)
- Server broadcasts tick results as `TurnResult` (existing type)
- Late-joining client receives full visible state on connect

### 11F: Monthly World Reset (Seasons)
- Each world has a **30-day lifespan** — worlds self-destruct at end of season
- Season cycle:
  ```
  Day 0:  World created, AI kingdoms populate, players can join
  Day 1-28: Normal gameplay, players join/leave, kingdoms fight
  Day 28: "Final Days" warning — 48 hours until reset
  Day 30: World closes, final standings calculated, rewards distributed
  Day 30+: New world created, everyone can join fresh
  ```
- End-of-season rewards:
  - Leaderboard rankings (most cities, strongest military, longest-surviving kingdom)
  - Cosmetic badges based on achievement (survivor, conqueror, economist)
  - Season stats summary (total battles, cities captured, tribute collected)
- Player data that persists across seasons: account, cosmetics, badges, stats history
- Player data that resets: kingdom, territory, units, cities, tech, resources
- Multiple worlds can run concurrently (different tick speeds, different ages)
- Players can join a mid-season world (they start fresh, others are established — challenge mode)

### 11G: Classic Mode Preserved
- Existing `GameManager` untouched — classic N-player mode still works
- Menu offers: "Classic Game" (manual turns) vs "Kingdom World" (persistent, ticked)
- Both modes share all game logic — only the turn trigger differs

**Tests**: Tick timing accuracy, action buffering/cancellation, AI takeover on disconnect, shield activation/expiration, reconnection state sync, tribute processing per tick.

---

## Phase 12: Dynamic Map & Player Join (1-2 sessions)

**Goal**: Players join an existing world. Server generates their kingdom tile and places it on the world map. Players choose distance from center.

### 12A: Kingdom Tile Generation
- When a player joins, server generates a 100x100 kingdom tile:
  - Varied terrain (land/water mix, not uniform)
  - 5-8 cities (1 Crown City at center + 4-7 neutrals)
  - 3-4 deposits (balanced ore/oil/textile)
  - Internal water features (rivers, lakes) for strategic variety
  - Coastal edges that mesh with ocean channels between kingdoms
- Each kingdom tile is self-contained: enough to build economy before expanding

### 12B: Distance Selection
Players choose how far from center they want to be:

| Ring | Distance | Grid Positions | Description | Playstyle |
|------|----------|---------------|-------------|-----------|
| **Center** | Ring 0 | 1 tile (origin) | AI-only origin kingdom | World anchor |
| **Inner** | Ring 1 | 8 tiles | Adjacent to origin | Aggressive. Immediate conflict. |
| **Middle** | Ring 2 | 16 tiles | One kingdom gap from center | Balanced. Time to prepare. |
| **Outer** | Ring 3+ | 24+ tiles per ring | Far from center | Defensive. Build up safely. |

- Ocean channels (10-20 tiles wide) between kingdom tiles = natural borders
- Inner ring: ~10 ocean tiles between kingdoms (fast transport crossing)
- Outer rings: ~15-20 ocean tiles (longer crossing, more safe buildup time)
- Player picks a ring, server assigns best available tile in that ring

### 12C: World Map Expansion
- World starts as 5x5 grid (25 kingdom tiles, mostly AI) = 500x500 tiles
- When players request outer rings beyond current grid, world expands:
  ```
  Before: 5x5 grid (500x500), player requests ring 3
  After:  7x7 grid (700x700), new kingdom placed in expanded ring
  ```
- Map grows by adding rows/columns to the grid (expand in +x/+y only)
- All existing tile indices remain valid (tiles only added, never moved)
- Connected clients receive map expansion notification + new tile data
- Minimap scales to show full world

### 12D: AI Kingdom Population
- World pre-populates with AI kingdoms:
  - Origin (ring 0): 1 AI kingdom — the "ancient empire" at world center
  - Ring 1: 8 AI kingdoms (always present, provides conflict for inner-ring players)
  - Ring 2: 8-16 AI kingdoms (partially filled, leaves room for human players)
  - Ring 3+: generated on demand as humans join outer rings
- AI kingdoms near center are stronger (more starting units, higher tech)
- AI kingdoms at outer rings are weaker (fresh start, like the human player)
- This creates a natural difficulty gradient: center = hard, edges = easy

### 12E: World Browser
- Before joining, player can see:
  - World overview (minimap showing kingdom grid, fog of war hides interiors)
  - Ring labels with descriptions ("Inner: 3/8 slots, aggressive gameplay")
  - Available slots per ring highlighted
  - World age (ticks elapsed), player count
  - AI kingdom count and approximate strength indicator per ring
- Player picks a ring → server assigns tile, generates terrain, places kingdom

### 12F: Spawn Protection
- New player's kingdom tile is shielded for first 100 ticks (configurable)
- Shield prevents all foreign unit entry into their kingdom tile
- Shield countdown visible on world map
- Gives new players time to build economy, tech up, build defenses
- After shield drops, ocean channels are their natural border defense
- AI kingdoms do NOT get spawn protection (they're always "ready")

### 12G: Cross-Kingdom Mechanics
- Units move freely across kingdom tile boundaries (seamless map)
- No gameplay distinction between "own kingdom tile" and "foreign tile" for movement
- Territory = owned cities + radius, NOT kingdom tile boundaries
- Building rights: on own territory only (not entire kingdom tile)
- Combat: happens anywhere on the map, no restrictions
- Vision: normal fog of war rules, kingdom tile boundaries are invisible

**Tests**: Kingdom tile generation quality (cities, deposits, terrain), ring placement, world expansion without breaking tiles, AI kingdom strength gradient, spawn protection, cross-kingdom unit movement, tribute flow after crown capture.

---

## Phase 13: Accounts & Persistence (1-2 sessions)

**Goal**: Players have accounts. Kingdoms persist between sessions. World state survives server restarts.

### 13A: Authentication
- User registration: username + password (bcrypt hashed)
- Login endpoint: returns JWT token
- WebSocket auth: token sent on connect, validated server-side
- Session management: token refresh, expiry
- Future: OAuth providers (Google, Discord, GitHub)

### 13B: Player Database
- SQLite tables (extending existing database.ts):
  ```sql
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  CREATE TABLE kingdoms (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    world_id INTEGER REFERENCES worlds(id),
    player_id INTEGER,           -- PlayerId in GameState
    kingdom_name TEXT,
    isolation_level TEXT,
    status TEXT DEFAULT 'active', -- active, defeated, vassal, abandoned
    joined_at DATETIME,
    last_active DATETIME
  );

  CREATE TABLE worlds (
    id INTEGER PRIMARY KEY,
    name TEXT,
    config TEXT,                  -- JSON: tick interval, max players, etc.
    state BLOB,                  -- serialized GameState
    tick_count INTEGER DEFAULT 0,
    created_at DATETIME,
    last_tick DATETIME
  );
  ```

### 13C: World Persistence
- World state saved after every tick (SQLite transaction)
- WAL mode for concurrent read/write
- Periodic full backups (every 100 ticks)
- Server crash recovery: load latest state, resume ticking
- State compression for large maps (zlib on JSON)

### 13D: Player Reconnection
- On login, check for existing kingdom in active world
- If found: reconnect to world, receive current visible state
- If not: show world browser, join/create options
- Kingdom persists even when player is offline (AI defends)

### 13E: Kingdom Lifecycle
```
Join World → Generate Island → Spawn Protection (100 ticks)
    → Active Play ↔ Offline (AI + Shield)
    → Defeated (Crown captured) → Spectator / Rejoin as new kingdom
    → Abandoned (30+ days offline, no shield) → Kingdom dissolves, cities become neutral
```

### 13F: Admin Tools
- Server admin endpoints (protected):
  - View all worlds, player counts, world age
  - Kick/ban players
  - Force-save world state
  - Adjust tick interval
  - Create/destroy worlds

**Tests**: Registration/login flow, JWT validation, kingdom creation/persistence, reconnection state accuracy, world save/load, abandoned kingdom cleanup.

---

## Phase 14: Delta Sync & Scaling (1-2 sessions)

**Goal**: Efficient state delivery for many players on large maps. Only send what changed and what you can see.

### 14A: Change Tracking
- Track per-tick deltas:
  ```typescript
  interface TurnDelta {
    tick: number
    unitMoves: { unitId: number, from: Loc, to: Loc }[]
    unitCreated: UnitState[]
    unitDestroyed: number[]                    // unit IDs
    combatResults: CombatEvent[]
    buildingChanges: BuildingDelta[]
    cityCaptures: { cityId: number, oldOwner: PlayerId, newOwner: PlayerId }[]
    fogRevealed: { player: PlayerId, tiles: number[] }[]
    resourceChanges: { player: PlayerId, resources: number[] }[]
  }
  ```
- On tick, compute delta alongside full state update
- Store last 10 deltas for reconnecting clients

### 14B: Per-Player Filtering
- Each player receives only deltas visible to them:
  - Own unit movements: always
  - Enemy movements: only if in their vision
  - Combat: only if either combatant visible
  - Fog reveals: only their own
  - Resource changes: only their own
- Filter function: `filterDelta(delta: TurnDelta, playerId: PlayerId, viewMap: ViewMapCell[]) → TurnDelta`

### 14C: Lazy Visibility
- Only compute full viewMap for connected players
- Offline players: skip visibility computation (AI doesn't need rendered viewMap)
- On reconnect: compute fresh viewMap from scratch (one-time cost)
- Cache viewMap per player, invalidate on unit move/death

### 14D: State Compression
- Full state for reconnection: gzip JSON (typically 60-80% compression)
- Delta messages: already small, send as JSON
- Binary protocol (future): MessagePack or protobuf for further compression

### 14E: Connection Management
- WebSocket heartbeat (30s ping/pong)
- Graceful reconnection: client auto-reconnects, receives missed deltas
- Connection pooling: batch broadcasts per tick (single serialize, filtered per player)
- Backpressure: if client can't keep up, skip intermediate deltas, send latest full state

### 14F: Performance Targets
| Metric | Target | Current |
|--------|--------|---------|
| Players per world | 100+ (human + AI) | 6 (singleplayer) |
| Map size | 700x700+ (7x7 kingdom grid) | 200x120 max |
| Tick computation | <10s for 100 players | <100ms for 2 |
| State broadcast | <2s for 100 clients | <10ms for 2 |
| Memory per world | <1GB | <50MB |
| Kingdom tiles | 49+ (7x7 grid) | N/A |

**Tests**: Delta accuracy (no missed changes), filtered delta correctness, reconnection with missed ticks, compression ratio, broadcast timing under load.

---

## Phase 15: Monetization System (2-3 sessions)

**Goal**: Sustainable revenue without pay-to-win. Cosmetics, convenience, and season passes.

### 15A: Store Infrastructure
- Payment integration: Stripe (card payments)
- Purchase types:
  ```typescript
  enum PurchaseType {
    Cosmetic,      // skins, banners, effects
    Subscription,  // monthly VIP
    SeasonPass,    // seasonal content
    OneTime,       // specific items
  }
  ```
- Purchase ledger in database:
  ```sql
  CREATE TABLE purchases (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    type TEXT,
    item_id TEXT,
    amount_cents INTEGER,
    currency TEXT DEFAULT 'USD',
    stripe_id TEXT,
    purchased_at DATETIME
  );

  CREATE TABLE entitlements (
    user_id INTEGER REFERENCES users(id),
    item_id TEXT,
    expires_at DATETIME,       -- null for permanent
    PRIMARY KEY (user_id, item_id)
  );
  ```

### 15B: What We Sell

**Cosmetics (permanent, no gameplay impact):**
| Item | Price | Description |
|------|-------|-------------|
| Unit Skin Pack | $2.99 | Alternate procedural sprites for all unit types |
| Kingdom Banner | $0.99 | Custom banner displayed on Crown City and minimap |
| Crown Style | $1.99 | Different crown icon/glow for your capital |
| Particle Theme | $1.99 | Custom explosion/combat particle colors |
| Map Theme | $2.99 | Alternate terrain color palette (winter, desert, volcanic) |

**VIP Subscription ($4.99/month):**
- 10% faster build times (units and buildings)
- +2 shield hours (10 max instead of 8)
- Priority spawn placement (pick exact location, not just zone)
- VIP badge next to name
- Extended action history (50 turns instead of 10)
- **NOT included**: stat boosts, extra resources, tech advantages

**Season Pass ($9.99/season, ~3 months):**
- Exclusive map theme for the season
- Seasonal leaderboard access
- Unique unit skin (changes each season)
- Seasonal crown style
- Season-end stats summary and badges

### 15C: Store UI
- In-game store panel (accessible from menu)
- Preview system: see cosmetics before buying
- Inventory: view owned items, equip/unequip
- Purchase confirmation with Stripe checkout
- Receipt/entitlement delivery on purchase success

### 15D: Entitlement Application
- Cosmetics: client checks entitlements on login, applies sprite/particle overrides
- VIP bonuses: server checks subscription status on tick
  - Build time reduction: multiply buildTime by 0.9 for VIP players
  - Shield hours: check entitlement when computing shield duration
- Season pass: server checks entitlement for leaderboard, seasonal content

### 15E: Balance Protection
- **Hard rules** (never violate):
  - No purchasable stat boosts (strength, HP, vision)
  - No purchasable resources or tech points
  - No purchasable extra units or cities
  - No purchasable map vision or intel
  - VIP build speed capped at 10% (one tier less than a Shipyard level 1)
- **Design principle**: a free player with skill beats a paying player with money

**Tests**: Purchase flow (mock Stripe), entitlement granting/expiry, VIP bonus application, build time modification accuracy, no stat contamination from cosmetics.

---

## Phase 16: Movement Trails & Spectacle (1 session)
*Adapted from PLAN-UNIFIED Phase 9*

**Goal**: Visual polish that makes the game feel alive.

### 16A: Movement Trails
- Fighters: white contrail (fading line segments)
- Ships: V-shaped wake (expanding ripple)
- Army: dust puff particles on land movement
- Special Forces: no trail (invisible movement)

### 16B: Directional Facing
- Units face movement direction
- Ships align to heading
- Fighters bank on turns

### 16C: Combat Spectacle
- Bombard: animated projectile arc from source to target
- Explosion: 30+ particles with lingering smoke
- Naval combat: water spray + debris
- Crown capture: crown-shatter animation + dramatic effects
- Shield activation/deactivation visual effects

### 16D: Kingdom Atmosphere
- Crown City glow (golden halo, visible from distance)
- Territory borders: subtle colored line at territory edge
- Shield dome: translucent bubble over protected territory
- Building activity: animated details on active buildings

**Tests**: Visual-only — all existing tests pass.

---

## Phase 17: Balance, Tuning & Launch Prep (1-2 sessions)
*Adapted from PLAN-UNIFIED Phase 10*

**Goal**: Everything works together. The game is fun and fair.

### 17A: Balance Tuning
- Isolation levels: verify extreme is truly safe, center is truly dangerous
- Ocean crossing: verify transport logistics are proportional to buffer size
- Crown defense: verify crown bonus is strong but not impregnable
- Tech pacing: verify Level 5 reachable at ~100+ turns
- Resource flow: verify deposits matter, starting resources run out ~turn 40-50
- New units: Artillery/Special Forces/Missile Cruiser balanced but not OP

### 17B: Multi-Player Balance
- 25-kingdom AI world runs stably: kingdoms expand, fight, tribute, rebel
- Inner ring is genuinely dangerous — center AI kingdom is formidable
- Outer ring gives enough breathing room to tech up before contact
- Tribute system creates shifting alliances — not permanent domination
- Cross-kingdom battles feel natural (no artificial boundary effects)
- Economy scaling: more cities = more income but also more defense needed

### 17C: AI Competence
- AI vs AI 25-kingdom simulations: all sides build economy, tech up, use new units
- AI offline defense: holds territory against equal-strength attacker for 50+ ticks
- AI doesn't waste units (no suicide attacks, no unescorted construction units)
- AI adapts to multiple threats (doesn't tunnel-vision on one enemy)
- AI manages tributaries: demands tribute, responds to rebellion
- Center AI kingdom is strongest — acts as world "boss" challenge

### 17D: Performance Testing
- 25-kingdom AI world: tick completes in <5s
- 100-kingdom world (with 50 human players): tick completes in <10s
- Large map (700x700): rendering stays above 30fps
- Memory: <1GB for 100-kingdom world

### 17E: Launch Checklist
- [ ] All tests pass (unit, integration, E2E)
- [ ] 4-player game plays to completion without crashes
- [ ] Offline/reconnect cycle works reliably
- [ ] Payment flow works end-to-end (Stripe test mode)
- [ ] Server handles 50 concurrent WebSocket connections
- [ ] State persists through server restart
- [ ] Admin tools functional
- [ ] Client loads in <3s on standard connection

**Tests**: Full suite update, stress tests, multi-player E2E, payment integration tests.

---

## Phase Summary

| Phase | Sessions | What You Get |
|-------|----------|-------------|
| **GAMEPLAY FOUNDATION** | | |
| 7: Bombard & Defenses | 1-2 | Ranged combat, fortifications, bridges, mines, 5 new units |
| 8: AI Economy & Strategy | 2-3 | AI builds economy, places defenses, uses bombard |
| **KINGDOM CORE** | | |
| 9: N-Player Foundation | ✅ | N-player engine, PlayerId, AI multi-enemy, 16-color palette |
| 10: Crown City & Kingdom Map | 1-2 | 100x100 kingdom tiles, crown capture, tributaries |
| 11: Kingdom World Server | 1-2 | Tick engine, AI kingdoms, offline takeover, monthly reset |
| **PERSISTENT WORLD** | | |
| 12: Dynamic Map & Player Join | 1-2 | Ring-based placement, world expansion, AI population |
| 13: Accounts & Persistence | 1-2 | Auth, player profiles, kingdom persistence |
| 14: Delta Sync & Scaling | 1-2 | Efficient updates for 50+ players |
| **MONETIZATION & POLISH** | | |
| 15: Monetization System | 2-3 | Stripe, cosmetics, VIP, season pass |
| 16: Movement Trails & Spectacle | 1 | Visual polish, combat effects, kingdom atmosphere |
| 17: Balance, Tuning & Launch | 1-2 | Performance, AI, multi-player balance |
| **TOTAL** | **13-22** | **Persistent kingdom MMO with monetization** |

---

## Architecture Notes

### New Files (Kingdom Phases)
```
packages/shared/src/
├── kingdom.ts           # Crown city, territory, tribute, kingdom state (~400 lines)
├── world.ts             # Tick engine, world config, kingdom grid management (~500 lines)
├── player.ts            # PlayerId system, player info, status tracking (~200 lines) ✅ EXISTS
├── kingdom-mapgen.ts    # Kingdom tile generation (100x100 regions) (~300 lines)

packages/server/src/
├── WorldServer.ts       # Tick-based persistent world server (~600 lines)
├── auth.ts              # Registration, login, JWT, middleware (~300 lines)
├── store.ts             # Stripe integration, purchases, entitlements (~400 lines)
├── admin.ts             # Admin API endpoints (~200 lines)

packages/client/src/
├── ui/
│   ├── worldBrowser.ts  # World grid view, ring picker, slot selection (~300 lines)
│   ├── loginScreen.ts   # Auth UI (~200 lines)
│   ├── store.ts         # In-game store (~300 lines)
│   ├── kingdomPanel.ts  # Kingdom info, tribute panel, crown status (~300 lines)
│   └── tributePanel.ts  # Tribute income/expenses, rebel/release buttons (~150 lines)
├── net/
│   └── worldClient.ts   # Tick-based WebSocket client, delta handling (~300 lines)
```

### Files Modified (Kingdom Phases)
```
packages/shared/src/
├── constants.ts    # PlayerId type ✅ DONE, kingdom tile constants
├── types.ts        # PlayerInfo ✅ DONE, KingdomState, TurnDelta additions
├── game.ts         # N-player executeTurn ✅ DONE, tribute processing, territory calc
├── mapgen.ts       # N-player placement ✅ DONE, kingdom tile integration
├── ai.ts           # Multi-enemy ✅ DONE, tribute/rebellion AI decisions

packages/server/src/
├── database.ts     # Users, kingdoms, worlds tables
├── GameManager.ts  # N-player ✅ DONE, routing to WorldServer
├── index.ts        # Auth middleware, new routes

packages/client/src/
├── main.ts         # N-player ✅ DONE, login flow, world selection, tick countdown
├── ui/hud.ts       # Tick timer, shield indicator, tribute info
├── ui/minimap.ts   # N-player colors ✅ DONE, kingdom tile borders, crown icons
├── renderer/       # Shield dome, crown glow, kingdom borders
```

### Migration Strategy
- Phase 9 breaking change complete (Owner enum → PlayerId, session 052)
- Owner enum preserved as @deprecated — existing code compiles but should migrate
- Classic 2-player mode preserved via N-player engine (N=2)
- All game logic is now N-player native — no separate 2-player code path
- AI players are full participants: same economy, strategy, production as human players
- Player disconnect → AI takeover is the default, no special handling needed
- Database migrations run automatically on server start
- Existing saves need players[] array added on load (future migration)
