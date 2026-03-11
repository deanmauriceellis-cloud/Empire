# Empire Reborn — Unified Expansion Plan
## Graphics Overhaul + Economy + Defensive Warfare + Tech Tree

### Design Decisions (Confirmed)
- Construction units: **destroyed** when killed (precious, not capturable)
- Buildings: **captured** when enemy takes the tile (your factory = my factory)
- Captured cities: **revert to captor's tech level** (no inherited bonuses)
- Turn end: **manual** (Enter → Economy Review Screen)
- Opponent economy: **invisible** (fog of war only; debug toggle for dev)
- Unit management: **Auto-AI for both sides** with manual override (click to direct)
- Building upgrades: construction unit can revisit owned buildings to upgrade (Lv1→Lv2→Lv3)

---

## The Full Unit & Structure Catalog

### Existing Units (Rebalanced)
| Unit | Char | Terrain | Speed | Str | HP | Build | Ore | Oil | Txt | Range | Cap | Notes |
|------|------|---------|-------|-----|----|-------|-----|-----|-----|-------|-----|-------|
| Army | A | Land | 1 | 1 | 1 | 5 | 5 | 0 | 5 | ∞ | 0 | Bread & butter |
| Fighter | F | Any | 8 | 1 | 1 | 10 | 15 | 10 | 0 | 32 | 0 | Fast recon/strike |
| Patrol | P | Sea | 4 | 1 | 1 | 15 | 10 | 5 | 0 | ∞ | 0 | Fast scout ship |
| Destroyer | D | Sea | 2 | 1 | 3 | 25 | 20 | 10 | 0 | ∞ | 0 | Anti-sub, escort |
| Submarine | S | Sea | 2 | 3 | 2 | 25 | 25 | 15 | 0 | ∞ | 0 | Stealth attacker |
| Transport | T | Sea | 2 | 1 | 1 | 25 | 15 | 10 | 5 | ∞ | 6 | Army ferry |
| Carrier | C | Sea | 2 | 1 | 8 | 35 | 30 | 20 | 5 | ∞ | 8 | Mobile airfield |
| Battleship | B | Sea | 2 | 2 | 10 | 45 | 40 | 25 | 0 | ∞ | 0 | Heavy hitter |
| Satellite | Z | Any | 10 | 0 | 1 | 50 | 20 | 5 | 10 | 500 | 0 | Intel orbit |

### New Units
| Unit | Char | Terrain | Speed | Str | HP | Build | Ore | Oil | Txt | Range | Cap | Unlock | Notes |
|------|------|---------|-------|-----|----|-------|-----|-----|-----|-------|-----|--------|-------|
| Construction | E | Land | 1 | 0 | 1 | 10 | 10 | 0 | 5 | ∞ | 0 | — | Builds everything. Destroyed on kill. Consumed on build completion. |
| Artillery | R | Land | 1 | 3 | 2 | 20 | 25 | 10 | 0 | ∞ | 0 | War 2 | **Bombards 2 tiles away.** Cannot melee. Devastating vs buildings/armies. |
| Special Forces | X | Land | 2 | 2 | 1 | 15 | 15 | 5 | 10 | ∞ | 0 | War 3 | **Invisible** until adjacent. Speed 2 = faster army. High textile (uniforms/gear). |
| Missile Cruiser | M | Sea | 2 | 4 | 6 | 40 | 35 | 30 | 0 | ∞ | 0 | War 4, Elec 3 | **Bombards 3 tiles** (land or sea). Ultimate naval fire support. |
| AWACS | W | Any | 6 | 0 | 1 | 20 | 20 | 15 | 0 | 48 | 0 | Elec 2 | **Reveals 5-tile radius** (vs normal 2). No attack. Recon plane. |
| Engineer Boat | G | Sea | 2 | 0 | 1 | 15 | 15 | 5 | 5 | ∞ | 0 | Sci 2 | **Builds Bridges & Sea Mines.** Naval construction unit. |

### Defensive Structures (Built by Construction Unit on Land)
| Structure | Unlock | Build Time | Ore | Oil | Txt | HP | Str | Attack Range | Effect |
|-----------|--------|------------|-----|-----|-----|----|----|-------------|--------|
| Bunker | — | 4 | 15 | 0 | 5 | 5 | 2 | Adjacent | Fortified position. Armies inside get +2 defense. Auto-attacks adjacent enemies. |
| Anti-Air Battery | Sci 3 | 6 | 40 | 30 | 0 | 5 | 3 | 2 tiles | Attacks fighters/AWACS within 2 tiles. Denies airspace. |
| Coastal Battery | Sci 4 | 8 | 50 | 40 | 0 | 8 | 4 | 2 tiles | Attacks ships within 2 tiles. River/shore denial. |
| Radar Station | Elec 2 | 6 | 30 | 20 | 0 | 3 | 0 | — | Reveals 5-tile radius permanently. Detects subs within 3 tiles. |
| Artillery Fort | War 3 | 10 | 60 | 30 | 0 | 10 | 5 | 3 tiles | Long-range land bombardment. Dominates chokepoints. |
| Minefield | War 1 | 3 | 10 | 5 | 0 | — | 2 | — | Invisible. Damages (str 2 attack) any enemy unit that enters tile. Single-use, consumed on trigger. |
| SAM Site | Elec 4 | 8 | 50 | 40 | 10 | 6 | 5 | 3 tiles | Anti-air, 3-tile range. Shuts down large airspace. |

### Naval Structures (Built by Engineer Boat on Water)
| Structure | Unlock | Build Time | Ore | Oil | Txt | HP | Str | Effect |
|-----------|--------|------------|-----|-----|-----|----|----|--------|
| Bridge | Sci 2 | 6 | 30 | 10 | 10 | 5 | 0 | Allows armies to cross 1 water tile. Destroyable. Changes river dynamics completely. |
| Sea Mine | War 1 | 2 | 10 | 5 | 0 | — | 3 | Invisible. Str 3 attack on first ship to enter. Single-use. |
| Offshore Platform | Sci 3 | 8 | 40 | 20 | 0 | 4 | 0 | Oil deposit on water. Produces +1 oil/turn. Must be adjacent to existing oil deposit. |

### City Upgrades (Built by Construction Unit at Owned City)
| Upgrade | Unlock | Build Time | Ore | Oil | Txt | Output | Upgradeable |
|---------|--------|------------|-----|-----|-----|--------|-------------|
| University | — | 8 | 30 | 0 | 20 | +1 science/turn | Lv2: +2/turn (cost: 60 ore, 40 txt, 6 turns). Lv3: +3/turn (cost: 120 ore, 80 txt, 8 turns) |
| Hospital | Sci 1 | 8 | 20 | 0 | 30 | +1 health/turn | Lv2: +2/turn, units built here start +1 HP. Lv3: +3/turn, heals 2 HP/turn in this city |
| Tech Lab | Sci 1 | 10 | 40 | 20 | 0 | +1 electronics/turn | Lv2: +2/turn. Lv3: +3/turn, city gets local radar (3-tile reveal) |
| Military Academy | Sci 3 | 10 | 30 | 30 | 0 | +1 war research/turn | Lv2: +2/turn, units from this city +1 str. Lv3: +3/turn, units +2 str |
| Shipyard | Sci 2 | 8 | 40 | 20 | 10 | Ship build time -20% | Lv2: -30%, repair +1 HP/turn. Lv3: -40%, can build Missile Cruiser here |
| Airfield | Sci 2 | 8 | 30 | 20 | 10 | Fighter range +8 from this city | Lv2: range +16, can refuel AWACS. Lv3: range +24, can build AWACS here |

Max **4 upgrade slots** per city. Choose wisely — a military city (Academy + Shipyard + Airfield + Hospital) vs an economic city (University + Tech Lab + Hospital + Shipyard).

---

## Tech Trees (Full)

### Science Track
| Level | Cumulative | Effect |
|-------|-----------|--------|
| 1 | 10 | Unlock Hospital & Tech Lab city upgrades |
| 2 | 30 | +1 vision range all units. Unlock Engineer Boat, Bridge, Shipyard, Airfield |
| 3 | 60 | Unlock Military Academy, Anti-Air Battery, Offshore Platform |
| 4 | 100 | Unlock Coastal Battery. Construction unit +1 speed |
| 5 | 150 | All buildings +3 HP. Unlock second Construction unit queue slot |

### Health Track
| Level | Cumulative | Effect |
|-------|-----------|--------|
| 1 | 10 | Units heal 2 HP/turn in own cities (was 1) |
| 2 | 30 | Army max HP: 1 → 2 |
| 3 | 60 | All land units +1 max HP |
| 4 | 100 | Ships heal 1 HP/turn at sea (slow self-repair) |
| 5 | 150 | All units +1 max HP |

### Electronics Track
| Level | Cumulative | Effect |
|-------|-----------|--------|
| 1 | 10 | +1 vision range for ships |
| 2 | 30 | Unlock AWACS. Submarines visible when adjacent to own units |
| 3 | 60 | Unlock Missile Cruiser (also needs War 4). +2 fighter range |
| 4 | 100 | Unlock SAM Site. Satellite range +100 |
| 5 | 150 | Intel: see all enemy units on explored tiles |

### War Research Track
| Level | Cumulative | Effect |
|-------|-----------|--------|
| 1 | 10 | Army strength 1→2. Unlock Minefield, Sea Mine |
| 2 | 30 | All ship strength +1. Unlock Artillery |
| 3 | 60 | Fighter strength 1→2. Unlock Special Forces, Artillery Fort |
| 4 | 100 | All units +1 strength. Unlock Missile Cruiser (also needs Elec 3) |
| 5 | 150 | All units +1 strength (cumulative with Lv4) |

---

## Resource System

### Starting Resources
| Resource | Amount | Notes |
|----------|--------|-------|
| Ore | 150 | Enough for ~30 armies or early economy investment |
| Oil | 100 | Slightly scarcer — rewards oil deposit claims |
| Textile | 150 | Armies + construction units |
| Science | 0 | Must be earned from Universities |
| Health | 0 | Must be earned from Hospitals |
| Electronics | 0 | Must be earned from Tech Labs |
| War Research | 0 | Must be earned from Military Academies |

### Map Deposits
- **~1 deposit per 3-4 cities** (70-city map → ~20 deposits, ~7 each type)
- **Fair placement**: equal types near each player's start
- **Contested deposits**: neutral zone deposits create strategic objectives
- Each deposit visible through fog once discovered (like cities)
- Deposits on minimap with distinct color dots (brown=ore, black=oil, green=textile)

### Resource Flow
```
Deposits (map)          City Upgrades
    │                       │
    ▼                       ▼
Mine/Well/Farm ──►  Ore/Oil/Textile (stockpile)
                        │
                        ▼
              Unit Production (consumes on start)
              Building Construction (consumes on start)
                        │
                        ▼
              University/Hospital/TechLab/Academy
                        │
                        ▼
              Science/Health/Electronics/WarResearch (accumulates)
                        │
                        ▼
              Tech Levels (thresholds: 10, 30, 60, 100, 150)
                        │
                        ▼
              Unit Unlocks + Global Bonuses + Building Unlocks
```

---

## River & Terrain Dynamics

### How Rivers Change the Game
Rivers in "River War" maps become **strategic gold** with defensive structures:

```
  PLAYER 1 TERRITORY          RIVER           PLAYER 2 TERRITORY
  ┌──────────────────┐  ~~~~~~~~~~~~~~~  ┌──────────────────────┐
  │                  │  ~             ~  │                      │
  │  [City] ←Academy │  ~  [Bridge]   ~  │  [City] ←University  │
  │    ↑             │  ~     ↑       ~  │                      │
  │  [Bunker]        │  ~ [CoastBat]  ~  │  [Artillery Fort]    │
  │  [Minefield]     │  ~             ~  │     ↑                │
  │  [Anti-Air]      │  ~ [Sea Mine]  ~  │  [Radar Station]     │
  │                  │  ~             ~  │                      │
  └──────────────────┘  ~~~~~~~~~~~~~~~  └──────────────────────┘
```

- **Bridges** let armies cross but are destroyable chokepoints
- **Coastal Batteries** deny naval passage through the river
- **Minefields** on river banks punish amphibious landings
- **Artillery Forts** bombard across the river (3-tile range)
- **Sea Mines** block transport/ship approaches
- **Anti-Air** denies fighter recon over your side

A well-fortified river becomes nearly impassable by brute force. Attacker needs:
- Artillery to destroy defensive structures from range
- Special Forces to slip through minefields (invisible, can avoid)
- AWACS for intel on defense positions
- Missile Cruiser for naval fire support
- OR: flank around — build a bridge upstream where defenses are thin

**This transforms the game**: instead of "more armies wins," victory requires combined arms, tech investment, and strategic planning. Economy funds the defenses; tech unlocks the tools to break them.

### River-Specific Balance
- Bridge build time: 6 turns (long enough that defender can respond)
- Coastal Battery range 2 = covers river width perfectly
- Artillery Fort range 3 = can fire across river AND hit bridge builders
- Minefields invisible = attacker needs Radar Station or AWACS to spot them
- Sea Mines invisible = sub needs Electronics 2 to detect

---

## Bombard Mechanic (New)

Units/structures with range > 1 use a **bombard** action instead of melee:

```typescript
| { type: "bombard"; unitId: number; targetLoc: Loc }  // or buildingId for structures
```

**Rules:**
- Bombard targets any tile within range (1 < dist <= attackRange)
- Bombard **cannot** capture cities (only armies can)
- Bombard deals damage but attacker takes no damage (ranged advantage)
- Bombard costs 1 move point per shot
- Structures bombard automatically during behavior phase (like sentry auto-attack but ranged)
- Bombard can target buildings to destroy them

**Units that bombard:**
| Unit/Structure | Range | Targets |
|---------------|-------|---------|
| Artillery | 2 | Land units, buildings, cities (damage garrison) |
| Missile Cruiser | 3 | Land units, sea units, buildings, cities |
| Anti-Air Battery | 2 | Fighters, AWACS only |
| Coastal Battery | 2 | Ships only |
| Artillery Fort | 3 | Land units, buildings |
| SAM Site | 3 | Fighters, AWACS only |

---

## Turn Flow (Final)

```
┌─────────────────────────────────────────────────────────────┐
│ TURN N                                                      │
│                                                             │
│ PLANNING PHASE (human, no time limit):                      │
│                                                             │
│  1. Map visible. Player can:                                │
│     - Pan, zoom, inspect units/cities/buildings/deposits    │
│     - Click units → override behavior, set GoTo waypoint   │
│     - Click construction units → direct to deposit/city     │
│     - Right-click → context menu for unit commands          │
│                                                             │
│  2. Player presses ENTER                                    │
│     ┌─────────────────────────────────────────────────┐     │
│     │ ECONOMY REVIEW SCREEN                           │     │
│     │                                                  │     │
│     │ [Events] [Resources] [Cities] [Tech] [Units]    │     │
│     │                                                  │     │
│     │ EVENTS TAB:                                     │     │
│     │   Battles, captures, completions, alerts         │     │
│     │                                                  │     │
│     │ RESOURCES TAB:                                  │     │
│     │   Stockpile, income/turn, expense/turn, net     │     │
│     │                                                  │     │
│     │ CITIES TAB:                                     │     │
│     │   Each city: production, upgrades (4 slots),    │     │
│     │   change production, queue upgrade              │     │
│     │   ⚠ alerts for idle/stalled cities              │     │
│     │                                                  │     │
│     │ TECH TAB:                                       │     │
│     │   4 tracks with progress bars                   │     │
│     │   Next unlock preview                           │     │
│     │   Available unlocks highlighted                 │     │
│     │                                                  │     │
│     │ CONSTRUCTION TAB:                               │     │
│     │   All construction units + status               │     │
│     │   Idle ones: [Assign Task ▼] dropdown           │     │
│     │   Active ones: progress bar, turns remaining    │     │
│     │   Task queue per unit                           │     │
│     │                                                  │     │
│     │ BUILDINGS TAB:                                  │     │
│     │   All owned buildings, type, level, output      │     │
│     │   Upgrade available? [Upgrade ▲] button         │     │
│     │                                                  │     │
│     │           [Confirm & Execute Turn →]            │     │
│     └─────────────────────────────────────────────────┘     │
│                                                             │
│ EXECUTION PHASE (automatic, animated):                      │
│  3. Human player's units auto-move (behaviors)              │
│  4. AI computes strategic decisions (production, economy)   │
│  5. AI player's units auto-move (behaviors)                 │
│  6. Ranged units/structures bombard (both players)          │
│  7. Cities tick production (resource check)                 │
│  8. Buildings produce resources                             │
│  9. Construction progress ticks                             │
│  10. Tech levels recalculated, bonuses applied              │
│  11. Repair, refuel, satellite movement, resets             │
│  12. Combat/event animations play                           │
│                                                             │
│ → TURN N+1                                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Graphics Foundation (1-2 sessions)
**Goal**: Make the game visually stunning before adding mechanics.

#### 1A: Ocean Overhaul
- Multi-layer water tiles: deep ocean (dark navy), coastal (teal), shore foam
- Shore foam: animated white/cyan edge at land-water boundaries
- Water depth based on adjacent land count (0 neighbors = deep, 3+ = shallow)
- Animated wave lines rippling across tiles (multi-frequency sine)
- Water tile texture: procedural with accent wave lines and color variation

#### 1B: Unit Graphics Revolution
- Detailed procedural sprites for all 9 existing unit types:
  - Army: shield/helmet silhouette with detail
  - Fighter: swept wings, tail fin
  - Patrol: small hull with radar mast
  - Destroyer: sleek hull with turret
  - Submarine: streamlined hull with conning tower
  - Transport: wide hull with cargo deck markings
  - Carrier: flight deck with runway lines, island structure
  - Battleship: heavy hull with multiple turrets
  - Satellite: solar panel wings + dish
- Player color with accent stripes/markings (not flat fill)
- Health bar improvements (sharper, color-coded segments)

#### 1C: Selection & Polish
- GlowFilter on selected units (GPU-accelerated, replaces Graphics circle)
- Blend mode ADD for explosions and energy effects
- Enhanced particles: more per effect, longer trails, smoke lingering
- Unit shadows with subtle blur for depth

**Tests**: Visual-only changes, no game logic — existing tests must still pass.

---

### Phase 2: Unit Info Panel & Vision (1 session)
**Goal**: Rich unit inspection and strategic overlays.

#### 2A: Unit Info Panel (Right Side)
- Click unit → slide-in panel:
  - Large unit icon + name + owner color
  - HP bar (segmented, color-coded)
  - Current behavior/mission label
  - Destination + ETA (if GoTo)
  - Movement remaining, fuel (fighters), cargo manifest
  - Inline command buttons (all behaviors)
- Click city → panel shows production, progress, upgrade slots
- Click deposit → panel shows type, claimed/unclaimed, building progress

#### 2B: Map Overlays
- Vision range: soft translucent ring when unit selected
- GoTo path: dotted line overlay from unit to waypoint
- Attack range: for future bombard units, show red range circle

**Tests**: UI-only, no game logic changes.

---

### Phase 3: Economy Foundation (1-2 sessions)
**Goal**: Resource system, deposits on map, resource-gated production.

#### 3A: Data Model
- Add to `constants.ts`: ResourceType, DepositType, BuildingType enums
- Add to `types.ts`: DepositState, BuildingState, PlayerResources, construction queue
- Add to `units.ts`: Construction unit (UnitType=9), resource cost table for all units
- Add to `GameState`: deposits[], buildings[], resources per player, nextDepositId, nextBuildingId

#### 3B: Map Generation
- Place deposits during mapgen (ore=mountain, oil=dark pool, textile=fertile)
- Fair placement: equal types near each player's start
- Contested deposits in neutral middle ground
- Deposit density: ~1 per 3-4 cities

#### 3C: Resource Mechanics
- Resources consumed when production **starts** (not on completion)
- City stalls if can't afford current production ("INSUFFICIENT RESOURCES")
- Per-turn income from completed buildings
- Starting resources: 150 ore, 100 oil, 150 textile

#### 3D: Deposit & Building Graphics
- Deposit tile textures: mountain (ore/brown), pool (oil/dark), grassland (textile/lush)
- Building sprites on tiles: mine, well, farm (small structure overlays)
- Deposits visible on minimap (colored dots)

**Tests**: Resource math, deposit placement fairness, production gating, save/load with new state.

---

### Phase 4: Construction & Buildings (1-2 sessions)
**Goal**: Construction units build things, buildings produce resources.

#### 4A: Construction Unit
- Land-only, speed 1, 0 combat, 1 HP, non-combatant
- Destroyed when enemy moves onto it (not captured)
- Consumed on build completion
- Task queue: list of { targetLoc, buildingType } — auto-chains GoTo → Build → GoTo → Build
- New PlayerAction types: buildOnDeposit, upgradeCity, buildDefense, queueTask

#### 4B: Building Mechanics
- "Build on deposit" action: construction unit at deposit loc → starts N-turn build → consumed
- "Upgrade city" action: construction unit at own city → choose upgrade slot → starts build → consumed
- Building completion: deposit.buildingId set, building produces resources
- Building capture: when city/tile captured, building ownership transfers
- Building destruction: enemy can target buildings (bombard or move onto)

#### 4C: Building Upgrades
- Construction unit arrives at owned building → "Upgrade Lv1→Lv2" option
- Each level costs more, takes longer, produces more
- 3 levels max per building

#### 4D: Building Graphics
- City upgrade icons overlaid on city tile (small symbols per slot)
- Construction progress indicator (animated ring/bar on tile)
- Building level indicator (I, II, III pips)

**Tests**: Construction mechanics, building production, upgrade math, capture/destroy, queue behavior.

---

### Phase 5: Economy Review Screen (1 session)
**Goal**: The end-of-turn strategic dashboard.

#### 5A: Turn Summary Dialog
- Triggered by pressing Enter
- Tabbed interface: Events | Resources | Cities | Tech | Construction | Buildings
- Events: battle results, captures, completions, alerts
- Resources: stockpile + income + net per resource type
- Cities: production status, upgrade slots, change production inline
- Construction: unit list with status, idle assignment dropdown, task queue
- Buildings: all owned, type, level, output, upgrade button

#### 5B: Resource Bar (Top HUD)
- Persistent top bar showing ore/oil/textile stockpile + income
- Tech level indicators (Sci/Health/Elec/War with level numbers)
- Alerts icon (count of things needing attention)

#### 5C: City Panel Enhancement
- Existing city panel gains upgrade slot display (4 slots, filled/empty)
- Production chooser shows resource costs + "can afford?" indicator
- Queue display for construction units at this city

**Tests**: UI rendering tests, dialog state management.

---

### Phase 6: Tech System (1-2 sessions)
**Goal**: Tech levels unlock units, buildings, and global bonuses.

#### 6A: Tech Calculation
- Tech level = threshold check on accumulated derived resources
- Thresholds: 10, 30, 60, 100, 150 (levels 1-5)
- Applied globally per player each turn

#### 6B: Tech Bonuses
- Vision range bonuses (Science 2, Electronics 1)
- HP bonuses (Health 2, 3, 5)
- Strength bonuses (War 1, 2, 3, 4, 5)
- Healing bonuses (Health 1, 4)
- Range bonuses (Electronics 3, 4)
- Speed bonuses (Science 4 for construction units)

#### 6C: Unit Unlocks
- Artillery: War 2
- Special Forces: War 3
- AWACS: Electronics 2
- Engineer Boat: Science 2
- Missile Cruiser: War 4 + Electronics 3

#### 6D: Building Unlocks
- Bunker: always available
- Minefield, Sea Mine: War 1
- Radar Station: Electronics 2
- Anti-Air Battery: Science 3
- Bridge, Shipyard, Airfield, Offshore Platform: Science 2
- Coastal Battery: Science 4
- Artillery Fort: War 3
- SAM Site: Electronics 4

#### 6E: Tech Panel UI
- 4-track progress display with level markers
- Current level highlighted, next threshold shown
- Available unlocks listed per level
- "What's next" preview for each track

**Tests**: Tech threshold math, bonus application, unlock gating, unit stat modifications.

---

### Phase 7: Bombard & Defensive Structures (1-2 sessions)
**Goal**: Ranged combat and static defenses change warfare.

#### 7A: Bombard Mechanic
- New action type: `{ type: "bombard"; unitId/buildingId; targetLoc }`
- Range check: 1 < dist(source, target) <= attackRange
- Deals damage to target, no return damage (ranged advantage)
- Costs 1 move point per shot
- Cannot capture cities (only melee armies can capture)

#### 7B: Defensive Structures
- Implemented as special units with speed=0 + StaticDefense behavior
- Auto-bombard nearest enemy within range each turn
- Priority: highest-threat target first (transports > armies > ships)
- Can be targeted and destroyed by bombard or melee
- Bunker special: armies can "garrison" (embark into bunker, +2 defense)

#### 7C: Minefields & Sea Mines
- Invisible to enemy (not on their viewMap until triggered or radar-detected)
- Trigger on enemy unit entering tile: str N attack, mine consumed
- Detectable by Radar Station / AWACS / Electronics 2 (subs detect sea mines)

#### 7D: Bridges
- Built by Engineer Boat on water tiles adjacent to land on both sides
- Allows armies to cross (treated as land for movement purposes)
- Has HP, can be destroyed by bombard or ship attack
- When destroyed, any unit on the bridge falls into water (armies die, ships fine)
- Strategic chokepoint: build one bridge, fortify both ends

#### 7E: Special Unit Behaviors
- Artillery: auto-targets nearest enemy within 2 tiles; if none, follows GoTo/Explore
- Special Forces: invisible on viewMap (shown as terrain, not unit char); revealed when adjacent
- AWACS: follows Explore behavior but reveals 5-tile radius; never attacks
- Missile Cruiser: auto-bombards priority targets within 3 tiles; otherwise moves like ship
- Engineer Boat: GoTo + build queue, like land Construction unit but on water

#### 7F: Bombard Graphics
- Projectile animation: arc from source to target tile
- Impact effect: explosion particle burst at target
- Range circle overlay when selecting bombard-capable unit
- Structure sprites: detailed procedural graphics for each defense type

**Tests**: Bombard range/damage, mine trigger, bridge traversal, structure auto-attack, invisibility.

---

### Phase 8: AI Economy & Strategy (2-3 sessions)
**Goal**: AI plays the full economic game competently.

#### 8A: AI Resource Awareness
- Track income, expenses, stockpile per resource
- Don't start production that can't be afforded
- Switch to affordable unit types when resource-starved
- Value deposits as exploration/attack targets

#### 8B: AI Construction Management
- Build construction units: 1 per 4-5 cities (ratio table addition)
- Direct to nearest unclaimed deposit (GoTo behavior)
- City upgrade priority: Military Academy → University → Tech Lab → Hospital → Shipyard → Airfield
- Task queue: claim deposit → upgrade nearest city → repeat

#### 8C: AI Defensive Building
- Place bunkers at frontier cities (cities with enemy on same continent)
- Place coastal batteries at shore cities near enemy naval presence
- Place minefields at chokepoints (bridge approaches, narrow land passages)
- Place anti-air at cities being harassed by fighters

#### 8D: AI Tech Strategy
- Fixed priority: Science → War Research → Electronics → Health
- Adjust if losing militarily (boost War Research)
- Adjust if losing navally (boost Electronics for Missile Cruiser)
- Build towards specific unlocks (e.g., rush Artillery if enemy is fortified)

#### 8E: AI Bombard Usage
- Artillery/Missile Cruiser targets defensive structures first, then units
- AI positions artillery behind front lines (2 tiles back)
- AI uses Special Forces for scouting (replaces some fighter recon)
- AI builds bridges when facing river maps (huge strategic decision)

#### 8F: AI Surrender Update
- Consider economic hopelessness: 0 deposits, 0 income, low stockpile
- Factor tech disadvantage into surrender calculation

**Tests**: AI construction decisions, deposit targeting, upgrade ordering, resource management, bombard targeting.

---

### Phase 9: Movement Trails & Atmosphere (1 session)
**Goal**: Visual polish that makes the game feel alive.

#### 9A: Movement Trails
- Fighters: white contrail (fading line segments behind movement path)
- Ships: V-shaped wake (expanding triangular ripple behind)
- Army: dust puff particles on land movement
- Special Forces: no trail (invisible movement)

#### 9B: Directional Facing
- Units face movement direction (rotation based on last move vector)
- Ships align to heading, not just position
- Fighters bank slightly on turns

#### 9C: Ambient Effects
- Fog of war: smoother gradient edges (not hard tile boundaries)
- Terrain variation: slight random tint per land tile (breaks up monotony)
- City glow: owned cities emit subtle light (player color halo)
- Building activity: small animated details on active buildings (mine sparkle, farm sway, etc.)

#### 9D: Combat Spectacle
- Bombard: animated projectile arc from source to target
- Explosion: 30+ particles with smoke trail lingering 2-3 seconds
- Naval combat: water spray + debris particles
- City capture: flag-change animation + fireworks burst
- Structure destruction: collapse animation (scale down + alpha fade + debris)

**Tests**: Visual-only, no game logic — all existing tests pass.

---

### Phase 10: Balance & Integration Testing (1-2 sessions)
**Goal**: Everything works together, game is fun.

#### 10A: Balance Tuning
- Rush vs economy: verify neither strategy auto-wins
- River maps: verify fortified river is hard but not impossible to cross
- Tech pacing: verify Level 5 is reachable but takes real investment (~100+ turns)
- Resource scarcity: verify deposits matter, seed money runs out around turn 40-50
- New units: verify Artillery/Special Forces/Missile Cruiser are strong but not OP

#### 10B: AI Competence
- AI vs AI games: verify both sides build economy, tech up, use new units
- AI handles river maps: builds bridges, fortifies, uses artillery
- AI doesn't waste construction units (doesn't send them into enemy territory unescorted)

#### 10C: Integration Tests
- Save/load with full economy state
- Multiplayer sync with buildings, resources, tech
- Large map performance with deposits + buildings + new units

#### 10D: E2E Tests
- New Playwright tests for economy screen, construction, tech panel
- Verify turn flow with economy review screen

**Tests**: Full test suite update, new E2E scenarios, AI game simulations.

---

## Phase Summary

| Phase | Sessions | What You Get |
|-------|----------|-------------|
| 1: Graphics Foundation | 1-2 | Stunning ocean, detailed units, polished effects |
| 2: Unit Info & Vision | 1 | Rich inspection panel, strategic overlays |
| 3: Economy Foundation | 1-2 | Resources, deposits, production gating |
| 4: Construction & Buildings | 1-2 | Build mines/farms/upgrades, economy loop works |
| 5: Economy Review Screen | 1 | Strategic dashboard, full economy UX |
| 6: Tech System | 1-2 | Tech tree, global bonuses, unit/building unlocks |
| 7: Bombard & Defenses | 1-2 | Ranged combat, fortifications, bridges, mines |
| 8: AI Economy & Strategy | 2-3 | AI plays full economic/defensive game |
| 9: Movement Trails & Atmosphere | 1 | Visual polish, combat spectacle |
| 10: Balance & Testing | 1-2 | Tuning, integration, everything works |
| **TOTAL** | **11-18** | **Complete 4X transformation** |

---

## Architecture Notes

### New Files Created
```
packages/shared/src/
├── economy.ts          # Resource calculations, costs, tech bonuses, building data (~300 lines)
├── buildings.ts        # BuildingAttributes, upgrade paths, defense stats (~200 lines)
├── ai-economy.ts       # AI construction/economy decisions (~400 lines)
├── ai-combat.ts        # AI bombard targeting, defense placement (~300 lines)
└── __tests__/
    ├── economy.test.ts
    ├── buildings.test.ts
    ├── ai-economy.test.ts
    └── bombard.test.ts

packages/client/src/
├── ui/
│   ├── turnSummary.ts      # Economy review screen (~300 lines)
│   ├── techPanel.ts        # Tech tree display (~200 lines)
│   ├── resourceBar.ts      # Top bar resources (~100 lines)
│   ├── unitInfoPanel.ts    # Right-side unit detail panel (~250 lines)
│   └── constructionPanel.ts # Construction unit task queue UI (~150 lines)
└── renderer/
    └── trails.ts           # Movement trail effects (~150 lines)
```

### Files Modified
```
packages/shared/src/
├── constants.ts    # New enums (ResourceType, DepositType, BuildingType, new UnitTypes)
├── types.ts        # New interfaces (DepositState, BuildingState, PlayerResources, new actions)
├── units.ts        # Construction unit + new units, resource cost table
├── mapgen.ts       # Deposit placement
├── game.ts         # Resource ticking, bombard processing, construction progress, tech application
├── ai.ts           # Economic decision step in computeAITurn
├── ai-production.ts # Resource-aware production, construction unit ratio
├── ai-helpers.ts   # New ratio tables for economy phase

packages/client/src/
├── main.ts              # Turn flow: planning phase → economy screen → execution phase
├── constants.ts         # New colors for deposits, buildings, UI elements
├── assets/placeholders.ts # New unit/building/deposit textures
├── renderer/tilemap.ts  # Water overhaul, deposit rendering, building rendering
├── renderer/units.ts    # Detailed unit sprites, trails, directional facing
├── renderer/particles.ts # Enhanced effects, bombard projectiles
├── renderer/highlights.ts # Vision range, bombard range overlays
├── ui/UIManager.ts      # New panels integration
├── ui/hud.ts            # Resource bar, tech indicators
├── ui/actionPanel.ts    # Bombard button, construction commands
├── ui/cityPanel.ts      # Upgrade slots display
├── ui/minimap.ts        # Deposit/building markers
├── game/moveCalc.ts     # Bombard range highlights
├── game/actionCollector.ts # New action types
```

### Files Unchanged
```
shared/pathfinding.ts    # All navigation uses existing BFS/pathfinding
shared/continent.ts      # No changes
shared/ai-transport.ts   # Transport AI unchanged
client/core/app.ts       # PixiJS setup unchanged
client/core/camera.ts    # Camera unchanged
client/iso/coords.ts     # Coordinate math unchanged
client/net/              # Protocol auto-handles new action types
server/database.ts       # JSON serialization handles new state fields
```
