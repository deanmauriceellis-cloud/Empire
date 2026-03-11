# PLAN-B: Economic & Development Expansion — "Empire Builder"

## Vision
Transform Empire from a pure military conquest game into a 4X strategy game with resource economy, construction, technology research, and infrastructure development. Both players use AI for tactical unit management — humans make strategic decisions.

---

## Part 1: Critical Analysis — Multiple Angles

### Angle 1: The Gameplay Loop Transformation

**Current loop** (per turn):
```
Human: manually move each unit → set behaviors → end turn
AI: computeAITurn() moves all units automatically
```

**Proposed loop** (per turn):
```
Human: review events → review resources → make strategic decisions → end turn
AI (both sides): move all units automatically based on behaviors
```

This is a fundamentally different game. The human goes from **micromanager** to **commander-in-chief**. Your inputs become:
- Which cities build what (military vs. construction)
- Where to send construction units (which deposits, which upgrades)
- What tech path to prioritize
- Adjusting unit behaviors (set groups to Aggressive vs. Cautious vs. Explore)
- Redirecting units via GoTo waypoints for strategic positioning

**Honest take**: This is *better* than the current loop for late-game. Right now, managing 40+ units by clicking each one is tedious. The AI handles movement well. But early game (3-5 units), manual control feels more engaging. Recommendation: **let humans override** — AI manages by default, but clicking a unit still lets you manually move it. Best of both worlds.

### Angle 2: Balance — Economy vs. Military Rush

**The core tension**: Can a player who ignores economy and rushes armies beat a player who invests in deposits and tech?

**Current game**: Rush always wins because there's no resource constraint. More cities = more armies = snowball victory.

**With economy**: Resources gate production. If you spam armies, you burn through your seed stockpile in ~30 turns and your cities go idle. Meanwhile, the economic player has steady income and tech-buffed units.

**The natural balance mechanism is resource exhaustion:**

| Strategy | Turn 1-30 | Turn 30-60 | Turn 60+ |
|----------|-----------|------------|----------|
| **Pure Rush** | Fast army output from seed money | Cities idle (no resources), army stops | Lose — can't produce anything |
| **Pure Economy** | Vulnerable, few armies | Buildings online, steady production | Dominate with tech + resources |
| **Balanced** | Some armies, some construction | Resources online, armies resuming | Strong position, flexible |

This is healthy. The rush player can win if they conquer enough cities to steal the other player's deposits. The economy player wins if they survive the early aggression. Classic strategic trade-off.

**My recommendation on build times:**

| Unit | Current | Proposed | Rationale |
|------|---------|----------|-----------|
| Army | 5 | 5 | Keep cheap — it's the bread & butter |
| Fighter | 10 | 10 | Already expensive |
| Patrol | 15 | 15 | Fine |
| Destroyer | 20 | 25 | Slightly more expensive — strong unit |
| Submarine | 20 | 25 | Match destroyer |
| Transport | 30 | 25 | Slightly faster — economy needs mobility |
| Carrier | 30 | 35 | Capital ship |
| Battleship | 40 | 45 | Capital ship |
| Satellite | 50 | 50 | Fine |
| **Construction** | — | **10** | 2x army (as you specified) |

**Don't** increase army build time. The resource cost is the gating mechanism, not time. If armies cost resources AND take longer, double-penalty makes the game feel sluggish. Resource cost alone creates the tension you want.

### Angle 3: Resource Amounts & Rates

**The math that matters:**

Starting resources: 150 ore, 100 oil, 150 textile (reduced from your 1000 — see why below).

Army costs: 5 ore + 5 textile.
With 150 ore and 150 textile, you can fund **30 armies** from seed money.
At army build time of 5, with 2 cities, that's 1 army every 2.5 turns = 75 turns of production before seed runs out.

Mine produces 1 ore/turn. With 5 mines, you get 5 ore/turn = enough for 1 army/turn from ore alone.

**Why not 1000 starting resources**: 1000 ore = 200 armies funded. You'd never need a mine. Economy becomes irrelevant for ~500 turns. The whole system is pointless. **150 is scarce enough to feel pressure by turn 40-50, forcing deposit investment.**

**Alternative approach — "supply per turn" model:**
Instead of stockpiling, what if cities consumed resources per turn just to operate? Each city costs 1 ore + 1 textile per turn as maintenance. This creates ongoing drain even when not building. More cities = more upkeep = must invest in economy just to sustain.

**My recommendation**: Start with simple stockpile model (resources consumed on production start). Add maintenance later if balance needs it. Keep it simple first.

### Angle 4: AI Economic Strategy

This is the hardest part. Let me break it down honestly.

**What the AI already does well:**
- Production decisions based on ratio tables (army/ship/fighter ratios)
- Continent awareness (knows when to build transports)
- Threat assessment (switches to army production under attack)

**What the AI needs to learn:**
1. **"Should I build a construction unit?"** — Heuristic: if unclaimed deposits exist within known territory, and we have < 1 construction unit per 3 unclaimed deposits, build one.
2. **"Where should my construction unit go?"** — Nearest unclaimed deposit (already have GoTo behavior for pathfinding).
3. **"What should I upgrade in my city?"** — Fixed priority: Military Base (direct combat bonus) → University (unlocks) → Tech Company → Hospital.
4. **"Should I prioritize economy or military?"** — Early: 1 construction unit for every 4-5 cities. Mid: adjust based on resource income vs. burn rate. Late: pure military.

**Honest complexity estimate:**

| AI Task | Difficulty | Why |
|---------|-----------|-----|
| Build construction units | Easy | Add to ratio table, like transport logic |
| Send construction to deposits | Easy | GoTo behavior already works |
| Choose city upgrades | Easy | Fixed priority list |
| Balance economy vs. military | Medium | Need income/expense tracking, threshold heuristics |
| Respond to deposit raids | Medium | Detect when construction units threatened, escort with army |
| Long-term tech planning | Hard | Multi-turn lookahead, but can fake with fixed priority |
| Adapt strategy to opponent | Hard | Skip this — fixed strategy is fine for v1 |

**The key insight: AI doesn't need to be smart about economy — just consistent.** If the AI always builds 1 construction unit per 4 cities, always claims nearest deposit, always upgrades in fixed order — it will have a functioning economy. The human's advantage is making *better* strategic choices, not that the AI is clueless.

### Angle 5: The End-of-Turn Dialog

This is a UI/UX challenge, not a technical one. The dialog needs to be:
1. **Quick to scan** — player shouldn't spend 2 minutes reading every turn
2. **Actionable** — show things that need decisions, not just info dumps
3. **Dismissable** — experienced players can skip through quickly

**Proposed structure:**

```
┌─────────────────────────────────────────────────┐
│  TURN 47 SUMMARY                          [X]   │
│─────────────────────────────────────────────────│
│  EVENTS (3)                                      │
│  ⚔ Army destroyed enemy patrol at (45,23)       │
│  🏙 Captured city #12                            │
│  ⚒ Mine completed at (30,15) — +1 ore/turn     │
│─────────────────────────────────────────────────│
│  RESOURCES              Income    Stock          │
│  Ore                    +3/turn    87            │
│  Oil                    +1/turn    62            │
│  Textile                +2/turn   104            │
│  Science                +1/turn    18            │
│  War Research           +1/turn    12            │
│─────────────────────────────────────────────────│
│  ALERTS (needs attention)                        │
│  ⚠ City #5 idle — no resources for Destroyer    │
│  ⚠ Construction Unit #3 arrived at oil deposit  │
│  ⚠ Science Level 2 available! (+1 vision range) │
│─────────────────────────────────────────────────│
│  [View Cities]  [View Tech]  [Continue Turn →]  │
└─────────────────────────────────────────────────┘
```

**For AI turn planning**: The AI doesn't need a dialog — it processes everything in `computeAITurn()`. Add economic decisions as a new step between production and movement:
```
1. Scan vision
2. Production decisions (existing)
3. Economic decisions (NEW — construction unit orders, upgrade choices)
4. Move units
5. Assign idle behaviors
6. Surrender check
```

### Angle 6: What About Current Players?

The game currently works as a military conquest. Adding economy changes the identity. Two options:

**Option A — Economy Always On**: Every game has resources. Classic players forced to learn economy.

**Option B — Game Mode Toggle**: "Classic" mode (no economy, current rules) and "Empire Builder" mode (full economy). This is safest but doubles the balance work.

**My recommendation**: Option A with a **gentle ramp**. Economy exists but seed resources are generous enough that casual players can ignore deposits for the first 30-40 turns and still compete. Economy becomes critical for long games. Short games on small maps play like classic Empire.

### Angle 7: Map Implications

**Deposit placement must be fair:**
- Equal number of each deposit type in each player's starting region
- Deposits near starting cities (2-5 tiles away) so players see them early
- Neutral deposits in contested middle ground (fight over them!)
- Density: ~1 deposit per 4 cities (so 70 cities → ~18 deposits, 6 of each type)

**New terrain visual**: Deposits need distinct tile graphics — mountain (ore), dark pool (oil), fertile patch (textile). These should be visible through fog once discovered.

### Angle 8: What This Does to Game Length

**Current game length** (standard map):
- Small: ~30 min (fast, aggressive)
- Standard: ~1 hr
- Large: ~2 hr

**With economy**:
- Games will trend ~30% longer because early turns have less fighting
- But AI-managed units mean turns resolve faster (no manual clicking)
- Net effect: **similar real-time, more turns** — which is fine

### Angle 9: Static Defenses — Do They Work?

Anti-Air Installations and Coastal Batteries are essentially **buildings that auto-attack**. In the current codebase, combat happens when a unit moves adjacent. Static defenses would:
- Not move
- Auto-attack adjacent enemy units during the behavior phase
- Essentially be "permanent sentry with teeth"

**Implementation**: They're just UnitState entries with `speed: 0` and a special behavior. The behavior system already handles sentry → attack adjacent. We'd add a `StaticDefense` behavior that always attacks adjacent enemies and can never move.

**AI handling**: AI places them at strategic chokepoints (cities, shores). Heuristic: coastal city → build Coastal Battery. City near enemy → build Anti-Air.

This is clean and achievable.

---

## Part 2: Revised Design

### Resource System

#### Natural Resources (from deposits on map)
| Resource | Deposit Appearance | Building Over It | Output |
|----------|-------------------|-------------------|--------|
| Ore | Rocky mountain tile | Mine | 1/turn |
| Oil | Dark pool tile | Well | 1/turn |
| Textile | Lush green tile | Farm | 1/turn |

#### Derived Resources (from city upgrades)
| Resource | Building | Built At | Output | Purpose |
|----------|----------|----------|--------|---------|
| Science | University | Any owned city | 1/turn | Unlock tech levels |
| Health | Hospital | Any owned city | 1/turn | Healing, durability |
| Electronics | Tech Lab | Any owned city | 1/turn | Vision, intel |
| War Research | Military Academy | Any owned city | 1/turn | Combat bonuses |

### Starting Resources
| Resource | Amount | Can fund... |
|----------|--------|------------|
| Ore | 150 | ~30 armies or ~10 destroyers |
| Oil | 100 | ~10 fighters or ~4 destroyers |
| Textile | 150 | ~30 armies or ~10 transports |
| Science | 0 | Must be earned |
| Health | 0 | Must be earned |
| Electronics | 0 | Must be earned |
| War Research | 0 | Must be earned |

### Unit Production Costs
| Unit | Ore | Oil | Textile | Build Time | Notes |
|------|-----|-----|---------|------------|-------|
| Army | 5 | 0 | 5 | 5 | Cheap, always affordable early |
| Fighter | 15 | 10 | 0 | 10 | Oil-hungry, rewards oil deposits |
| Patrol | 10 | 5 | 0 | 15 | |
| Destroyer | 20 | 10 | 0 | 25 | |
| Submarine | 25 | 15 | 0 | 25 | |
| Transport | 15 | 10 | 5 | 25 | Slightly cheaper — economy needs shipping |
| Carrier | 30 | 20 | 5 | 35 | |
| Battleship | 40 | 25 | 0 | 45 | |
| Satellite | 20 | 5 | 10 | 50 | |
| **Construction** | **10** | **0** | **5** | **10** | Must stay affordable |

**Key rule**: Resources consumed when production **starts**. If you can't afford it, the city shows "INSUFFICIENT RESOURCES" and waits. No production happens until you can pay.

### Construction Unit
- Land-only, speed 1, 0 combat strength, 1 HP
- **Non-combatant**: Cannot attack. If enemy unit moves onto it, it's captured (switches owner, goes to enemy control) or destroyed.
- **Build action**: Move to deposit/city → "Build" command → spends N turns constructing → consumed on completion
- **Only manual unit for human players**: Humans must direct construction units. AI directs its own.

#### What Construction Units Build

**On deposits:**
| Building | Deposit | Build Time | Output |
|----------|---------|------------|--------|
| Mine | Ore | 5 turns | +1 ore/turn |
| Well | Oil | 5 turns | +1 oil/turn |
| Farm | Textile | 5 turns | +1 textile/turn |

**At owned cities (upgrade slots — max 4 per city):**
| Building | Build Time | Cost | Output |
|----------|------------|------|--------|
| University | 8 turns | 30 ore, 20 textile | +1 science/turn |
| Hospital | 8 turns | 20 ore, 30 textile | +1 health/turn |
| Tech Lab | 10 turns | 40 ore, 20 oil | +1 electronics/turn |
| Military Academy | 10 turns | 30 ore, 30 oil | +1 war research/turn |

**On any land tile (static defenses, require tech unlock):**
| Building | Unlock | Build Time | Cost | Effect |
|----------|--------|------------|------|--------|
| Anti-Air Battery | Science 4 | 6 turns | 40 ore, 30 oil | Attacks adj. fighters (str 3, 5 HP) |
| Coastal Battery | Science 5 | 8 turns | 50 ore, 40 oil | Attacks adj. ships (str 4, 8 HP) |
| Radar Station | Electronics 3 | 6 turns | 30 ore, 20 oil | Reveals 5-tile radius permanently |

### Tech Levels

**Scaling**: Level N costs `N × 10` cumulative points of the relevant resource.
- Level 1: 10 points accumulated
- Level 2: 30 total (20 more)
- Level 3: 60 total (30 more)
- Level 4: 100 total (40 more)
- Level 5: 150 total (50 more)

Linear cost, each level meaningful but not game-breaking.

#### Science Track
| Level | Cost | Effect |
|-------|------|--------|
| 1 | 10 | Unlock Hospital & Tech Lab city upgrades |
| 2 | 30 | +1 vision range for all units |
| 3 | 60 | Unlock Military Academy city upgrade |
| 4 | 100 | Unlock Anti-Air Battery |
| 5 | 150 | Unlock Coastal Battery & Radar Station |

#### Health Track
| Level | Cost | Effect |
|-------|------|--------|
| 1 | 10 | Units heal 2 HP/turn in own cities (was 1) |
| 2 | 30 | Army max HP: 1 → 2 |
| 3 | 60 | All land units +1 max HP |
| 4 | 100 | Construction units +1 speed |
| 5 | 150 | All units +1 max HP |

#### Electronics Track
| Level | Cost | Effect |
|-------|------|--------|
| 1 | 10 | +1 vision range for ships |
| 2 | 30 | Enemy submarines visible when adjacent |
| 3 | 60 | Unlock Radar Station; +2 fighter range |
| 4 | 100 | Satellite range +100 |
| 5 | 150 | See all enemy units on explored tiles (intel) |

#### War Research Track
| Level | Cost | Effect |
|-------|------|--------|
| 1 | 10 | Army strength: 1 → 2 |
| 2 | 30 | All ship strength +1 |
| 3 | 60 | Fighter strength: 1 → 2 |
| 4 | 100 | All units +1 strength |
| 5 | 150 | All units +1 strength (cumulative) |

### Turn Flow — Human Player

```
PLANNING PHASE (human reviews, no time limit):
  1. Turn Summary dialog auto-opens
     - Battle results, captures, productions completed
     - Resource dashboard (income, expenses, stockpile)
     - Alerts: idle cities, arrived construction units, tech unlocks
  2. Human can:
     - Click "View Cities" → change production, see upgrade slots
     - Click "View Tech" → see tech tree, upcoming unlocks
     - Click construction units on map → give Build/GoTo orders
     - Click any unit → change behavior, set GoTo waypoint
     - Click "Continue Turn →" to dismiss dialog
  3. Human can still explore the map, pan around, inspect units
     (AI hasn't moved anything yet)

EXECUTION PHASE (automatic, animated):
  4. AI processes human player's units (explore, sentry, aggressive, etc.)
  5. AI processes AI player's strategic decisions (production, construction)
  6. AI processes AI player's units
  7. Buildings produce resources
  8. Tech levels recalculated
  9. Turn events emitted (combat, capture, production, etc.)
  10. Next turn begins → return to step 1
```

**Key UX decision**: The "planning phase" is where all human decisions happen. The "execution phase" is a cinematic playback of both sides' units moving. This creates a satisfying rhythm: plan → watch → plan → watch.

### Turn Flow — AI Player

All handled in extended `computeAITurn()`:

```typescript
function computeAITurn(state, aiOwner):
  // Existing steps
  1. Refresh vision (scan)
  2. Production decisions (with resource checks)

  // NEW economic steps
  3. Construction unit production (ratio-based, like transport logic)
  4. Construction unit orders:
     a. Find unclaimed deposits in known territory → GoTo nearest
     b. Find cities needing upgrades → GoTo nearest owned city
     c. Priority: deposit claiming > Military Academy > University > others
  5. Resource-gated production:
     a. Check if city can afford current production
     b. If not, switch to something affordable
     c. If nothing affordable, city waits

  // Existing steps continue
  6. Move units (both players' units auto-move based on behaviors)
  7. Assign idle behaviors
  8. Surrender check (now also considers economic hopelessness)
```

---

## Part 3: Implementation Architecture

### Data Model Changes

```typescript
// NEW in constants.ts
enum ResourceType {
  Ore = 0, Oil = 1, Textile = 2,
  Science = 3, Health = 4, Electronics = 5, WarResearch = 6
}

enum DepositType { Ore = 0, Oil = 1, Textile = 2 }

enum BuildingType {
  Mine = 0, Well = 1, Farm = 2,              // On deposits
  University = 3, Hospital = 4,               // City upgrades
  TechLab = 5, MilitaryAcademy = 6,          // City upgrades
  AntiAir = 7, CoastalBattery = 8,           // Static defenses
  RadarStation = 9,                           // Intel building
}

// UnitType.Construction = 9
// UnitType.Satellite becomes 10
// (or: insert Construction at end, index 9, renumber nothing)

// NEW in types.ts
interface DepositState {
  id: number;
  type: DepositType;
  loc: Loc;
  buildingId: number | null;  // null if unclaimed
}

interface BuildingState {
  id: number;
  type: BuildingType;
  loc: Loc;
  owner: Owner;
  depositId: number | null;   // links back to deposit, or null for city/defense
  cityId: number | null;      // links to city for upgrades, null for deposits/defenses
  constructionProgress: number; // turns remaining, 0 = complete
  constructorId: number | null; // unit building this, null when complete
}

interface PlayerResources {
  stockpile: number[];    // indexed by ResourceType (7 values)
  income: number[];       // per-turn income (computed from buildings)
  techLevels: number[];   // indexed by derived resource type (4 values: Sci/Health/Elec/War)
}

// MODIFIED GameState
interface GameState {
  // ... existing fields ...
  deposits: DepositState[];
  buildings: BuildingState[];
  resources: Record<Owner, PlayerResources>;
  nextDepositId: number;
  nextBuildingId: number;
}

// NEW PlayerAction types
| { type: "buildOnDeposit"; unitId: number; depositId: number }
| { type: "upgradeCity"; unitId: number; cityId: number; buildingType: BuildingType }
| { type: "buildDefense"; unitId: number; loc: Loc; buildingType: BuildingType }
```

### Files That Change

| File | Change | Scope |
|------|--------|-------|
| `shared/constants.ts` | Add ResourceType, DepositType, BuildingType enums; Construction in UnitType | Small |
| `shared/types.ts` | Add DepositState, BuildingState, PlayerResources; extend GameState, PlayerAction | Medium |
| `shared/units.ts` | Add Construction unit attributes + resource cost table | Small |
| `shared/mapgen.ts` | Place deposits during map generation | Medium |
| `shared/game.ts` | Resource processing per turn, tech level calculation, production gating | Large |
| `shared/ai.ts` | Economic decision step in computeAITurn | Medium |
| `shared/ai-production.ts` | Resource checks, construction unit ratio | Medium |
| **NEW** `shared/ai-economy.ts` | Construction unit AI, deposit claiming, upgrade decisions | New (est. 300 lines) |
| **NEW** `shared/economy.ts` | Resource calculations, tech bonuses, cost tables | New (est. 200 lines) |
| `client/main.ts` | Turn summary dialog trigger, planning phase | Medium |
| `client/ui/UIManager.ts` | New panels (turn summary, tech tree, resource bar) | Large |
| **NEW** `client/ui/turnSummary.ts` | End-of-turn review dialog | New (est. 200 lines) |
| **NEW** `client/ui/techPanel.ts` | Tech tree display | New (est. 150 lines) |
| **NEW** `client/ui/resourceBar.ts` | Top bar resource display | New (est. 100 lines) |
| `client/assets/placeholders.ts` | Deposit + building textures | Medium |
| `client/renderer/tilemap.ts` | Render deposits and buildings | Medium |
| `server/GameManager.ts` | Validate new action types | Small |
| Tests | New test files for economy, deposits, AI economy | Large |

### Files That DON'T Change (Good News)
- `shared/pathfinding.ts` — Construction uses existing GoTo
- `shared/continent.ts` — No changes needed
- `shared/ai-transport.ts` — Transports don't carry construction units (land-only)
- `shared/ai-movement.ts` — Construction units use GoTo, not custom movement
- `client/renderer/units.ts` — Just needs new texture, same sprite system
- `client/renderer/particles.ts` — No changes
- `client/net/` — Protocol handles new action types automatically

---

## Part 4: Implementation Phases

### Phase E1: Data Foundation (1 session)
- Add enums and types (ResourceType, DepositType, BuildingType, etc.)
- Add PlayerResources to GameState
- Add DepositState, BuildingState arrays to GameState
- Add Construction unit to UNIT_ATTRIBUTES
- Add resource cost table for all units
- Add deposit placement to mapgen
- Resource gating on production (can't start if can't afford)
- Per-turn resource income calculation
- Update save/load serialization
- Tests for all new data structures
- **Playable after this**: game works, deposits visible but uncapturable, resources drain

### Phase E2: Construction & Buildings (1-2 sessions)
- Construction unit movement (land-only, non-combatant, capturable)
- "Build on deposit" action + multi-turn construction progress
- "Upgrade city" action + building completion
- Building destruction on capture
- Resource income from completed buildings
- Construction progress display on tiles
- Tests for construction mechanics
- **Playable after this**: human can build mines/farms, see resources grow

### Phase E3: Tech System (1 session)
- Tech level calculation from accumulated derived resources
- Apply tech bonuses (vision, strength, HP, range)
- Tech unlock gates for advanced buildings
- Static defense buildings (Anti-Air, Coastal Battery, Radar)
- Static defense auto-attack behavior
- Tech panel UI
- Tests for tech calculations and bonuses
- **Playable after this**: tech tree works, static defenses operational

### Phase E4: Turn Summary & Economy UI (1 session)
- Turn summary dialog (events, resources, alerts)
- Resource bar in top HUD
- City upgrade slot display in city panel
- Construction unit order UI
- Tech tree visualization
- Deposit icons on minimap
- **Playable after this**: full economy UX, human can manage everything

### Phase E5: AI Economy (2 sessions)
- AI construction unit production ratio
- AI construction unit pathfinding to deposits
- AI city upgrade decisions
- AI resource-aware production switching
- AI tech priority strategy
- AI static defense placement
- Balance tuning via playtesting
- Tests for AI economic decisions
- **Playable after this**: AI plays full economic game

### Phase E6: Balance & Polish (1 session)
- Playtest balance: rush vs. economy strategies
- Adjust resource amounts, costs, tech scaling
- AI difficulty tuning (resource bonuses for AI?)
- Edge cases: all deposits captured, resource starvation, etc.
- Performance testing with buildings + deposits on large maps
- **Done**: Full economic expansion complete

**Total: 7-9 sessions**

---

## Part 5: Risk Matrix

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| AI can't play economy competently | HIGH | Medium | Simple heuristics, fixed priorities, test heavily |
| Economy makes game too slow | HIGH | Low | Resource gating IS the pacing — tune amounts |
| Snowball: early economy lead is insurmountable | HIGH | Medium | Linear tech scaling, deposits in contested zones |
| Save/load breaks with new state | Medium | Low | Version field, defaults for missing data |
| Test coverage drops significantly | Medium | Medium | Add tests each phase, aim for >85% |
| Multiplayer desync with new state | Medium | Low | All logic in shared/, server validates |
| UI becomes overwhelming | Medium | Medium | Progressive disclosure — turn summary hides complexity |
| Balance is wrong on first attempt | HIGH | HIGH | Expect 2-3 tuning passes — this is normal for 4X games |

---

## Part 6: What I Would NOT Do

1. **Trade routes** — Too complex for v1. No player-to-player economy.
2. **Dynamic pricing** — Resources have fixed costs. No market simulation.
3. **Population/food system** — Cities don't grow or starve. Too much Civ.
4. **Diplomacy** — Stay 1v1. Alliances are a different game.
5. **Unit upgrades in-field** — Tech bonuses are global, not per-unit. Simpler.
6. **Worker units separate from construction** — One unit type does everything. Simpler.
7. **Resource trading with AI** — No negotiation. Pure competition.
8. **Maintenance costs per turn** — Skip for v1. Add later if rush is too strong.

---

## Part 7: Open Questions for You

1. **Should construction units be capturable or destroyed?** Capturing is more interesting (you steal their builder), but destroying is simpler. I'd suggest destroyed — keeps things clean.

2. **Can buildings be destroyed by enemy units?** I'd say yes — enemy army moves onto a mine, mine is destroyed. Creates raiding gameplay.

3. **Should the planning phase have a time limit in multiplayer?** In single-player, take all the time you want. Multiplayer might need a turn timer (60-120 seconds).

4. **Do captured cities keep their upgrades?** I'd say yes — makes cities more valuable targets. You capture a city with a Military Academy, you get the war research income.

5. **How visible should opponent's economy be?** Options:
   - (A) See nothing — pure fog of war
   - (B) See buildings you've scouted (they appear on your view map)
   - (C) See opponent's resource totals in a "spy report"

   I'd recommend (B) — you can scout their economy but need to explore to see it.

6. **Do you want the "both sides use AI" model from turn 1, or should there be a manual override?** I strongly recommend keeping click-to-move as an override. AI manages by default, but clicking a unit lets you manually direct it. Players who want to micromanage early game can, players who want pure strategy just use the turn summary dialog.
