# PLAN-A: Graphics Overhaul — Quick Wins

## Overview
Reimagine Empire Reborn's visuals using PixiJS v8's advanced capabilities (filters, blend modes, detailed procedural graphics). Focus on stunning quick wins without requiring art assets.

**Current state**: Basic sprites + Graphics shapes, no filters/shaders/blend modes used.
**Target**: Visually stunning, detailed, immersive — still fully procedural.

---

## 1. Ocean Overhaul — Waves & Shores

### 1a. Animated Water Tiles
- Replace flat blue diamonds with multi-layer procedural water
- Darker deep ocean, lighter shallows near land
- Animated wave lines that ripple across tiles (sine-based, position-offset phase)
- Multiple overlapping wave frequencies for organic feel

### 1b. Shore Foam
- White/cyan animated edge where water meets land
- Tiny breaking waves using animated alpha sprites
- Foam intensity based on adjacency count (more land neighbors = more surf)

### 1c. Water Color Gradient
- Deep ocean (no adjacent land) = dark navy
- Coastal (1-3 land neighbors) = teal/cyan
- Creates natural depth perception without shaders

---

## 2. Unit Graphics Revolution

### 2a. Detailed Procedural Sprites
Still no art files needed — all Graphics-generated:
- **Army**: Shield/helmet silhouette with detail lines
- **Fighter**: Swept-wing aircraft with tail fin, rotating prop effect
- **Patrol Boat**: Small hull with radar mast
- **Destroyer**: Sleek hull with gun turret and wake
- **Submarine**: Streamlined hull with conning tower, periscope detail
- **Transport**: Wide hull with deck cargo markings, hold lines
- **Carrier**: Flight deck with runway markings, island superstructure
- **Battleship**: Heavy hull with multiple turrets, armor plating lines
- **Satellite**: Solar panel wings + dish antenna, orbital rotation

### 2b. Directional Facing
- Units face their movement/target direction
- Rotation based on last move vector or GoTo target

### 2c. Movement Trails
- Fighters: contrail lines (fading white trail)
- Ships: wake spray (V-shaped water disturbance behind)
- Army: dust particles on land

### 2d. Player Color with Detail
- Base shape in player color + accent stripes/markings
- Not just flat color fill — layered detail gives depth

---

## 3. Unit Info Panel (Right Side)

### 3a. Panel Design
Click a unit → slide-in panel on right side with:
- Unit type icon (large) + name + owner
- HP bar (color-coded)
- Current behavior/mission label
- Destination coordinates (if GoTo set)
- Movement range remaining this turn
- Fuel remaining (fighters)
- Cargo manifest (transports/carriers — list embarked units)

### 3b. Map Overlays (triggered by selection)
- Vision range: soft glow boundary showing sight radius
- Path overlay: draw the route line for GoTo waypoints
- Explore frontier: directional indicator for exploring units

### 3c. Inline Commands
- All unit commands accessible from panel (not just action bar)
- Current behavior highlighted
- Click to change behavior, set waypoint, etc.

---

## 4. Vision & Awareness Visualization

### 4a. Vision Range Overlay
- When unit selected, show sight radius as translucent highlight ring
- Different color from move/attack highlights (soft white/yellow)

### 4b. Destination Path Drawing
- Draw dotted/dashed line from unit to GoTo target
- Line follows approximate route on map

### 4c. Explore Frontier
- Show which direction an exploring unit is heading
- Arrow or highlight on the frontier edge

---

## 5. Atmosphere & Polish

### 5a. GPU-Accelerated Selection
- GlowFilter on selected units (replaces hand-drawn Graphics circle)
- Configurable color, intensity, blur radius

### 5b. Blend Mode Effects
- Additive blending for explosions and energy effects
- Screen blend for light/glow overlays

### 5c. Enhanced Particles
- More particles per effect (GPU can handle it)
- Longer trails, smoke lingering after explosions
- Sparks on combat, foam spray on naval combat

---

## Implementation Order
1. Water overhaul (1a, 1b, 1c) — transforms entire map look
2. Unit graphics (2a, 2d) — makes units recognizable and detailed
3. Unit info panel (3a, 3c) — gameplay UX improvement
4. Selection & trails (2b, 2c, 5a) — polish and immersion
5. Vision overlays (4a, 4b) — strategic clarity
6. Particles & effects (5b, 5c) — combat spectacle

## Technical Notes
- PixiJS v8.6.0, WebGPU with WebGL2 fallback
- All textures procedurally generated (Graphics → generateTexture)
- Filters available: BlurFilter, GlowFilter, DisplacementFilter, ColorMatrixFilter, NoiseFilter
- Blend modes: ADD, MULTIPLY, SCREEN available on all sprites
- Current bottleneck: Graphics redrawn each frame (health bars, glow) — filters offload to GPU
