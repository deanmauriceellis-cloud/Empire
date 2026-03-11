# Empire Reborn — Changelog Archive (Sessions 012-048)

> Archived from CHANGELOG.md during session 059.

## v0.37.0 — Session 048 (2026-03-11)

### Kingdom MMO Master Plan
- **PLAN-KINGDOM.md** — 17-phase master plan for persistent kingdom MMO (replaces PLAN-UNIFIED as definitive plan)
- **Architecture analysis** — identified all 2-player hardcoded assumptions; confirmed game logic scales to N players
- **Kingdom concept** — Crown City capitals, territory system, isolation levels (Extreme/Far/Near/Center)
- **Persistent world design** — tick-based turns, offline AI defense, shield mechanic, dynamic map expansion
- **Monetization design** — cosmetics, VIP subscription ($5/mo), season pass ($10/season); hard no-pay-to-win rules
- **Phase roadmap** — Gameplay (7-8) → Kingdom Core (9-11) → Persistent World (12-14) → Monetization & Polish (15-17)
- No code changes — design/planning session only

## v0.36.0 — Session 047 (2026-03-11)

### Phase 6: Tech System
- **Tech thresholds** — levels 1-5 at [10, 30, 60, 100, 150] cumulative points per track
- **Vision bonuses** — Science 2 (+1 all units), Electronics 1 (+1 ships); scan() extended range
- **HP bonuses** — Health 2 (Army +1), Health 3 (land +1), Health 5 (all +1); applied at unit creation and repair
- **Strength bonuses** — War 1-5 progressive; combat uses getEffectiveStrength()
- **Healing bonuses** — Health 1 (2 HP/turn in city), Health 4 (ships heal 1 HP/turn at sea)
- **Range bonuses** — Electronics 3 (+2 fighter range), Electronics 4 (+100 satellite range)
- **Speed bonuses** — Science 4 (+1 construction unit speed)
- **Unit unlock gating** — canProduceUnit() infrastructure (all existing units always available; gates new Phase 7 units)
- **HUD tech display** — shows "S:Lv2" format with tooltip details instead of raw points
- **Economy Review Tech tab** — 4-track progress bars, level dots, points-to-next, "Next:" unlock preview, active bonuses section
- **Unit info panel** — effective stats with green (+N) tech bonus indicators
- **Bottom HUD bar** — tech-boosted HP/speed for selected units
- 57 new tests; 423 total (395 shared + 28 server)

## v0.35.0 — Session 046 (2026-03-11)

### Phase 5: Economy Review Screen
- **Economy Review dialog** — modal triggered by Enter before turn execution; 6 tabs: Events, Resources, Cities, Tech, Construction, Buildings
- **Events tab** — battle results, captures, productions, deaths with icons and map coordinates
- **Resources tab** — stockpile + city income breakdown + deposit income + total per-turn income per resource
- **Cities tab** — all owned cities with production status, progress bars, retool/stall indicators, upgrade list
- **Tech tab** — research points per track, income per turn from buildings, list of contributing sources
- **Construction tab** — active builds with progress, idle vs assigned construction units
- **Buildings tab** — all completed buildings with type, level, resource/tech output per turn
- **"Confirm & Execute Turn →"** button commits the turn; Escape/Enter also confirm
- **HUD resource income** — per-turn income (+N) shown next to each resource stockpile in green
- **Diagnostic enhancements** — economy state (resources, income breakdown, stall/retool warnings), deposits (location, type, status), buildings (progress, output, constructors), city upgrades per city
- Number keys 1-6 switch tabs; capture-phase keyboard isolation prevents input leaking

## v0.34.0 — Session 045 (2026-03-10)

### Phase 4: Construction & Buildings
- **Construction unit** (UnitType.Construction) — land, speed 1, 0 combat, 1 HP, buildTime 10, cost [10,0,5]
- **BuildingType enum** — 9 types: 3 deposit buildings (Mine, OilWell, TextileFarm), 6 city upgrades (University, Hospital, TechLab, MilitaryAcademy, Shipyard, Airfield)
- **BuildingState** — tracks id, loc, type, owner, level (1-3), work, buildTime, complete, constructorId
- Build on deposit, city upgrades, building upgrades Lv1→Lv2→Lv3
- Tech research accumulation, construction sprite, action panel, city panel, unit info panel
- 43 new tests, 366 total passing

## v0.33.0 — Session 044 (2026-03-10)

### Economy Fixes
- Passive city income +2/+1/+2, retool stall bug fix, 0 stalls verified

## v0.32.0 — Session 043 (2026-03-10)

### Economy Foundation
- Resource system (ore/oil/textile), unit costs, production gating, map deposits, income, deposit graphics, HUD, minimap, 31 tests

## v0.31.0 — Session 042 (2026-03-10)

### Unit Info Panel & Vision
- Unit info panel, city info, vision range overlay, GoTo path overlay

## v0.30.0 — Session 041 (2026-03-10)

### Graphics Foundation
- Multi-depth ocean, shore foam, wave animation, detailed unit sprites, selection glow, segmented health bars, particle effects

## v0.29.0 — Session 040 (2026-03-10)

### Design — Unified Expansion Plan
- PLAN-A.md, PLAN-B.md, PLAN-UNIFIED.md, 6 new unit types, 10 structures, 6 city upgrades, 4 tech tracks, bombard mechanic

## v0.28.0 — Session 039 (2026-03-10)

### River War
- River War map type, river-smart transport AI, 9 tests

## v0.27.0 — Session 038 (2026-03-10)

### War Stats & AI Fixes
- War Stats panel, AI production lock fix, fighter/ship idle fix, naval ratio rebalance

## v0.26.0 — Session 037 (2026-03-10)

### Security & Performance
- CORS, request size limits, rate limiting, action queue cap, graceful shutdown, disconnect persistence, fogAlphaMap leak fix, AI viewMap caching

## v0.24.0 — Session 031 (2026-03-10)

### Explore & Logging
- Explore auto-capture removed, aggressive massing, resignation relaxed, event logging, turn summary, AI verbose toggle

## v0.23.0 — Session 030 (2026-03-10)

### Transport Fixes
- Circular ferry fix, single-army delivery, transport competition, unload targeting, original AI reference docs

## v0.22.0 — Session 027 (2026-03-10)

### Transport Coordination
- B4/C1 fixes, army cluster weighting, multi-transport coordination, prevLocs tracking

## v0.20.0 — Session 020 (2026-03-09)

### Critical Transport Fixes
- scanContinent P2 inversion, transport oscillation, exploring armies invisible, army staging, army crossCost

## v0.18.0 — Session 018 (2026-03-09)

### AI Stability
- 1-city flip-flop, inland ships, behavior override, army oscillation, idle behaviors, default behaviors

## v0.15.0 — Session 016 (2026-03-09)

### Map Configuration
- Configurable dimensions, presets, game setup screen, fighter fixes, camera reconfiguration

## v0.14.0 — Session 015 (2026-03-09)

### Unit Behaviors
- Unit ID 0 fix, action panel fix, behavior system (Explore/Sentry/GoTo/Aggressive/Cautious), fighter fuel

## v0.13.0 — Session 014 (2026-03-09)

### E2E Tests
- Playwright tests (singleplayer, multiplayer, perf), 18 E2E tests

## v0.12.0 — Session 013 (2026-03-09)

### Unit Test Coverage
- 93.6% coverage, integration tests (AI vs AI, save/load, determinism)

## v0.11.0 — Session 012 (2026-03-09)

### Deployment
- Dockerfile, production static serving, SPA fallback
