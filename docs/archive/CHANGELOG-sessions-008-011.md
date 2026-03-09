# Empire Reborn — Changelog (Sessions 008–011, archived)

## v0.10.0 — Session 011 (2026-03-09)

### Added
- **Phase 10: Polish & Audio** — procedural sound system, visual polish, performance optimization
  - `packages/client/src/audio/AudioManager.ts` — Web Audio API sound manager:
    - Procedural oscillator-based synthesis (no external dependencies, no sound files)
    - Per-category gain nodes: master, SFX, music — independently controllable
    - Audio context auto-resume on first user gesture (browser autoplay policy)
    - Sound effects: move (unit-type-specific), combat, explosion, death, capture, production, turn start/end, game start, game over (victory/defeat variants)
    - Ambient system: low drone pad (55Hz sine) with LFO frequency modulation
  - `packages/client/src/renderer/screenShake.ts` — camera shake effect:
    - Triggered on combat, capture, death events with configurable intensity
    - Random X/Y jitter with exponential decay (8/s decay rate)

### Changed
- `packages/client/src/renderer/tilemap.ts` — animated water + smooth fog
- `packages/client/src/renderer/units.ts` — idle animations + shadows
- `packages/client/src/ui/minimap.ts` — performance: terrain caching
- `packages/client/src/constants.ts` — new visual polish constants
- `packages/client/src/main.ts` — full audio + screen shake integration

## v0.9.0 — Session 010 (2026-03-09)

### Added
- **Phase 9: Client-Server Integration** — WebSocket multiplayer, lobby, dual-mode client
  - `packages/shared/src/protocol.ts` — protocol types (canonical source)
  - `packages/client/src/net/connection.ts` — WebSocket client with auto-reconnect
  - `packages/client/src/net/multiplayer.ts` — multiplayer game adapter

### Changed
- `packages/client/src/main.ts` — dual-mode (single-player + multiplayer)
- `packages/client/src/ui/menuScreens.ts` — lobby, waiting, game over screens
- `packages/client/src/ui/styles.ts` — lobby/multiplayer CSS
- `packages/client/src/ui/turnFlow.ts` — owner-aware unit cycling

## v0.8.0 — Session 009 (2026-03-09)

### Added
- **Phase 8: Client Game UI** — complete game interaction layer
  - UIManager, styles, hud, minimap, actionPanel, cityPanel, eventLog, turnFlow, menuScreens
  - actionCollector, moveCalc, highlights renderer

### Changed
- `packages/client/src/main.ts` — click-to-move interaction model
- `packages/client/src/core/input.ts` — click/right-click/keypress queues
- `packages/client/src/core/camera.ts` — WASD + arrow keys

## v0.7.0 — Session 008 (2026-03-09)

### Added
- **Phase 7: Client Rendering** — complete isometric rendering engine
  - constants, types, iso/coords, core/app, core/camera, core/input
  - assets/placeholders, renderer/tilemap, renderer/units, renderer/particles
  - game/bridge (SinglePlayerGame → RenderableState adapter)

### Changed
- `packages/client/src/main.ts` — rewritten as full game client
