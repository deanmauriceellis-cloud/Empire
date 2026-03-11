# Empire Reborn — Kingdom MMO Master Plan
## From 2-Player Tactical Game to Persistent Multiplayer Kingdom Warfare

---

## Vision

A persistent shared-world strategy game where every player builds a kingdom on a single global map. Players choose their isolation level — farm peacefully on a distant island or spawn in the thick of combat. Each kingdom has a **Crown City** (capital) that is sacred. Lose your crown, lose your kingdom. The ocean buffer around each kingdom is your moat — crossable, but it takes real effort.

Tick-based turns (1 per minute or slower) let players act when they can. When offline, AI defends your kingdom. Monetization through cosmetics, time boosts, and season passes — not pay-to-win.

---

## Current State (Sessions 001-050)

**Complete:**
- Phases 1-7 of PLAN-UNIFIED (Graphics, Unit Info, Economy, Construction, Buildings, Tech, Bombard & Defenses)
- 15 unit types, 19 building types, AI, fog of war, save/load, multiplayer lobby, isometric renderer
- 538 tests (510 shared + 28 server), 18 E2E tests
- Resource economy (ore/oil/textile), deposits, construction units, tech trees (4 tracks, 5 levels)
- Bombard mechanic, 7 defensive structures, 3 naval structures, mine triggers, bridge traversal

**Remaining from PLAN-UNIFIED:**
- Phase 8: AI Economy & Strategy (critical for offline defense)
- Phase 9: Movement Trails & Atmosphere (polish — defer to pre-launch)
- Phase 10: Balance & Testing (polish — defer to pre-launch)

---

## Phase Map

```
GAMEPLAY FOUNDATION (finish PLAN-UNIFIED core)
├── Phase 7:  Bombard & Defenses          ← 1-2 sessions
├── Phase 8:  AI Economy & Strategy       ← 2-3 sessions

KINGDOM CORE
├── Phase 9:  N-Player Foundation         ← 1-2 sessions
├── Phase 10: Crown City & Kingdoms       ← 1-2 sessions
├── Phase 11: Tick-Based Server           ← 1 session

PERSISTENT WORLD
├── Phase 12: Dynamic Map & Spawning      ← 1-2 sessions
├── Phase 13: Accounts & Persistence      ← 1-2 sessions
├── Phase 14: Delta Sync & Scaling        ← 1-2 sessions

MONETIZATION & POLISH
├── Phase 15: Monetization System         ← 2-3 sessions
├── Phase 16: Movement Trails & Spectacle ← 1 session
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

## Phase 9: N-Player Foundation (1-2 sessions)

**Goal**: Remove the 2-player ceiling. Support 2-50+ players in a single game.

### 9A: Dynamic Owner System
- Replace `Owner` enum with numeric IDs: `type PlayerId = number` (0 = Unowned, 1+ = players)
- `GameState.players: PlayerInfo[]` — array of active players with metadata:
  ```typescript
  interface PlayerInfo {
    id: PlayerId           // 1, 2, 3, ...
    name: string           // display name
    color: number          // player color (hex)
    status: 'active' | 'defeated' | 'resigned' | 'offline'
    joinedTurn: number     // when they entered the game
    lastActiveTurn: number // for offline detection
  }
  ```
- All `Record<Owner, T>` becomes `Map<PlayerId, T>` or indexed arrays
- `Owner.Player1`/`Owner.Player2` references replaced with dynamic player ID lookups

### 9B: Turn Execution Refactor
- `executeTurn()` signature: `(state, actions: Map<PlayerId, PlayerAction[]>) → TurnResult`
- Process all players' actions in order (by player ID or randomized per turn for fairness)
- `checkEndGame()`: configurable win conditions:
  - **Elimination**: last player standing
  - **Domination**: control X% of cities
  - **Crown capture**: lose your capital, you're out (Phase 10)

### 9C: N-Player Mapgen
- `selectStartingCities()` returns `PlayerId → cityIndex` mapping for N players
- Continent assignment: spread players across available continents
- Distance maximization: players start as far apart as possible
- Fair resource distribution: each starting area has similar deposit access

### 9D: AI Multi-Player Awareness
- `computeAITurn()` identifies all enemies (everyone else)
- Threat assessment: prioritize nearest/strongest enemy
- Surrender: compare own strength vs combined enemies, or vs strongest enemy
- Alliance potential (future): for now, everyone is hostile

### 9E: Vision & Fog of War
- `viewMaps` keyed by PlayerId for all players
- `scan()` unchanged per-player (already owner-agnostic)
- `getVisibleState()` filters per requesting player

### 9F: Client Updates
- Player color palette: 16+ distinct colors for N players
- Minimap shows all player colors
- HUD identifies current player vs all enemies
- Unit info shows owner name and color

**Migration**: Existing 2-player games load with Player1=1, Player2=2. No save compatibility break.

**Tests**: 3-player and 4-player game creation, turn execution, combat between non-adjacent player IDs, elimination with 3+ players, AI with multiple enemies.

---

## Phase 10: Crown City & Kingdom Model (1-2 sessions)

**Goal**: Every player has a capital city. Kingdoms have identity, territory, and a win/loss condition tied to their crown.

### 10A: Crown City
- One city per player is the **Crown City** (capital)
- Initially: player's starting city
- Can be relocated (expensive action, long cooldown — 50 turns)
- Crown city visual: larger sprite, golden glow, crown icon, unique particle effects

### 10B: Crown Bonuses
- Crown city gets inherent bonuses (no building required):
  - +3 defense to all units within 3-tile radius
  - +2 HP/turn healing to all units in the city
  - +50% production speed
  - Permanent 4-tile vision reveal radius (like radar)
- These bonuses represent the kingdom's concentrated power at its heart

### 10C: Crown Capture Mechanic
- When an enemy army captures your Crown City:
  - **Option A — Elimination**: player is eliminated, all remaining cities become unowned, units disbanded
  - **Option B — Vassalage**: player becomes vassal of captor (pays 30% resource income as tribute). Can rebel by recapturing crown or building sufficient military.
  - Start with Option A (simpler). Add vassalage later.
- Crown cities are harder to capture: garrison bonus (+5 effective strength for defenders)

### 10D: Territory System
- Each player has **territory**: all tiles within 4 tiles of any owned city
- Territory provides:
  - Vision (always visible, even without units)
  - Building rights (can place structures only on own territory)
  - Border display (subtle colored border on minimap and world map)
- Territory expands as you capture more cities
- Contested territory: overlapping zones create disputed borders

### 10E: Kingdom Identity
- `KingdomState` added to GameState per player:
  ```typescript
  interface KingdomState {
    crownCityId: number       // which city is the capital
    territory: Set<number>    // tile indices in territory
    tributeTarget?: PlayerId  // if vassal, who they pay
    tributeRate: number       // 0.0 to 0.3
    color: number             // kingdom color
    banner: number            // cosmetic banner type (future monetization)
  }
  ```
- Kingdom name (player-chosen or auto-generated)

### 10F: Crown City UI
- Crown icon on minimap and world map
- "Crown City" label in city panel
- "Relocate Capital" button (if cooldown met)
- Warning alert when Crown City is under attack
- Special capture animation (crown shattering)

**Tests**: Crown assignment, crown bonuses, crown capture elimination, territory calculation, territory vision, crown relocation cooldown.

---

## Phase 11: Tick-Based Server (1 session)

**Goal**: Server executes turns on a timer. Players act asynchronously. AI fills in for absent players.

### 11A: Tick Engine
- New server mode: `WorldServer` (alongside existing `GameManager` for classic mode)
- Configurable tick interval: 60s (fast), 300s (standard), 900s (slow), 3600s (epic)
- Tick cycle:
  ```
  1. Tick timer fires
  2. Collect all pending actions from connected players
  3. For disconnected/idle players: run computeAITurn()
  4. Execute turn with all action sets
  5. Broadcast results to connected players
  6. Save state
  7. Reset action buffers
  8. Schedule next tick
  ```

### 11B: Action Buffering
- Players submit actions anytime between ticks
- Actions queue server-side per player: `pendingActions: Map<PlayerId, PlayerAction[]>`
- Actions validated on receipt (not just at execution)
- Client shows "Actions queued: 5" indicator and countdown to next tick
- Player can cancel/modify pending actions before tick

### 11C: Offline AI Takeover
- Player marked offline after 2 missed ticks (no WebSocket connection)
- AI computes actions for offline players each tick
- When player reconnects, AI stops, player resumes control
- **Shield mechanic**:
  - First 2 hours after disconnect: kingdom is immune to attack (shield bubble)
  - Shield visible to other players (translucent dome over territory)
  - After shield expires: AI defends normally
  - Shield recharges: 1 hour of online play → 1 hour of shield stored (max 8 hours)

### 11D: Tick Synchronization
- Client displays:
  - Countdown timer to next tick ("Next turn in: 0:43")
  - "Your actions submitted" confirmation
  - Turn result replay after tick (animated like current turn execution)
- Server broadcasts tick results as `TurnResult` (existing type)
- Late-joining client receives full visible state on connect

### 11E: Classic Mode Preserved
- Existing `GameManager` untouched — classic 2-player mode still works
- Menu offers: "Classic Game" (2-player, manual turns) vs "Kingdom World" (persistent, ticked)
- Both modes share all game logic — only the turn trigger differs

**Tests**: Tick timing accuracy, action buffering/cancellation, AI takeover on disconnect, shield activation/expiration, reconnection state sync.

---

## Phase 12: Dynamic Map & Spawning (1-2 sessions)

**Goal**: Players join an existing world. Their kingdom island generates and attaches to the map. Isolation level determines placement.

### 12A: Island Generation
- When a player joins a world, generate their starting island:
  - 20x20 to 40x40 land area (based on map size preset)
  - 3-5 cities on island (1 Crown City + 2-4 neutrals)
  - 2-3 deposits (1 of each type)
  - Varied terrain (not just flat land)
- Island is self-contained: enough resources and cities to build up before venturing out

### 12B: Isolation Levels
Players choose on join:

| Level | Ocean Buffer | Description | Playstyle |
|-------|-------------|-------------|-----------|
| **Extreme** | 80-100 tiles | Remote island, nearly unreachable | Pure builder/farmer. Leisurely tech up. |
| **Far** | 50-70 tiles | Distant but findable | Defensive player. Time to prepare. |
| **Near** | 30-40 tiles | Moderate distance | Balanced risk. Engage when ready. |
| **Center** | 10-20 tiles | Near the action | Aggressive. Immediate neighbors. |

- Buffer is ocean tiles between player's island edge and nearest other island
- Extreme isolation means transports need 40-50 turns to cross — massive expedition

### 12C: World Map Expansion
- World starts as ocean (or small seed continent)
- Each new player's island placed at optimal position:
  - Respect requested isolation level
  - Maximize distance from existing players (at requested tier)
  - "Center" players placed near map center cluster
  - "Extreme" players placed at map edges
- Map dimensions grow as needed (expand grid when new island needs space)
- Existing players' maps are never modified

### 12D: Map Stitching
- New island seamlessly integrates into existing world grid:
  ```
  Before: 200x200 world, new "Far" player joins
  After:  200x260 world (expanded south), new island at south edge with 60-tile ocean gap
  ```
- All existing tile indices remain valid (expand in +x or +y direction only)
- Connected clients receive map expansion notification + new tile data (delta update)
- Minimap scales to show full world

### 12E: World Browser
- Before joining, player can see:
  - World overview (minimap-style, fog of war hides other kingdoms)
  - Player count and average isolation level
  - World age (how many ticks have elapsed)
  - Available spawn zones highlighted per isolation level
- Player picks a zone, server generates island there

### 12F: Spawn Protection
- New player's island is shielded for first 100 ticks (configurable)
- Shield prevents all foreign unit entry
- Shield countdown visible on world map
- Gives new players time to build economy, tech up, build defenses
- After shield drops, the ocean buffer is their only protection

**Tests**: Island generation quality (cities, deposits, terrain), isolation distance verification, map expansion without breaking existing tiles, spawn protection enforcement.

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
| Players per world | 50+ | 2 |
| Map size | 500x500+ | 200x120 max |
| Tick computation | <5s for 50 players | <100ms for 2 |
| State broadcast | <1s for 50 clients | <10ms for 2 |
| Memory per world | <500MB | <50MB |

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
- 4-player test games: no 2v1 snowball advantage
- Spawn protection: 100 ticks is enough to establish viable defense
- Isolation parity: "extreme" players aren't permanently safe (eventually reachable)
- Economy scaling: more cities = more income but also more defense needed

### 17C: AI Competence
- AI vs AI 4-player simulations: all sides build economy, tech up, use new units
- AI offline defense: holds territory against equal-strength attacker for 50+ ticks
- AI doesn't waste units (no suicide attacks, no unescorted construction units)
- AI adapts to multiple threats (doesn't tunnel-vision on one enemy)

### 17D: Performance Testing
- 20-player world simulation: tick completes in <5s
- 50-player world simulation: tick completes in <10s
- Large map (500x500): rendering stays above 30fps
- Memory: <500MB for 50-player world

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
| 9: N-Player Foundation | 1-2 | 2-50+ players in one game, dynamic ownership |
| 10: Crown City & Kingdoms | 1-2 | Capitals, territory, kingdom identity, win condition |
| 11: Tick-Based Server | 1 | Timer-driven turns, offline AI, shield mechanic |
| **PERSISTENT WORLD** | | |
| 12: Dynamic Map & Spawning | 1-2 | Island generation, isolation levels, expandable map |
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
├── kingdom.ts           # Crown city, territory, kingdom state (~300 lines)
├── world.ts             # Tick engine, world config, player management (~400 lines)
├── player.ts            # PlayerId system, player info, status tracking (~200 lines)

packages/server/src/
├── WorldServer.ts       # Tick-based persistent world server (~500 lines)
├── auth.ts              # Registration, login, JWT, middleware (~300 lines)
├── store.ts             # Stripe integration, purchases, entitlements (~400 lines)
├── admin.ts             # Admin API endpoints (~200 lines)

packages/client/src/
├── ui/
│   ├── worldBrowser.ts  # World selection, isolation picker (~300 lines)
│   ├── loginScreen.ts   # Auth UI (~200 lines)
│   ├── store.ts         # In-game store (~300 lines)
│   └── kingdomPanel.ts  # Kingdom info, territory, crown status (~200 lines)
├── net/
│   └── worldClient.ts   # Tick-based WebSocket client, delta handling (~300 lines)
```

### Files Modified (Kingdom Phases)
```
packages/shared/src/
├── constants.ts    # PlayerId type, remove Owner enum dependency
├── types.ts        # PlayerInfo, KingdomState, TurnDelta, dynamic player structures
├── game.ts         # N-player executeTurn, territory calculation
├── mapgen.ts       # Island generation, map expansion, N-player placement
├── ai.ts           # Multi-enemy threat assessment

packages/server/src/
├── database.ts     # Users, kingdoms, worlds tables
├── GameManager.ts  # Classic mode preserved, routing to WorldServer
├── index.ts        # Auth middleware, new routes

packages/client/src/
├── main.ts         # Login flow, world selection, tick countdown
├── ui/hud.ts       # Tick timer, shield indicator, territory info
├── ui/minimap.ts   # N-player colors, territory borders, crown icons
├── renderer/       # Shield dome, crown glow, territory borders
```

### Migration Strategy
- Phase 9 is the breaking change (Owner enum → PlayerId)
- All phases before 9 are backward-compatible
- Classic 2-player mode preserved indefinitely (separate code path after Phase 11)
- Database migrations run automatically on server start
- Existing saves work in classic mode; new saves required for kingdom mode
