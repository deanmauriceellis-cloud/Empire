// Empire Reborn — Client Rendering Constants

// ─── Tile Dimensions (isometric diamond) ────────────────────────────────────

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const HALF_TILE_W = TILE_WIDTH / 2;
export const HALF_TILE_H = TILE_HEIGHT / 2;

// ─── Color Palette ──────────────────────────────────────────────────────────

export const COLORS = {
  // Terrain
  LAND: 0x4a7c59,
  LAND_STROKE: 0x3a6249,
  SEA: 0x1a3a5c,
  SEA_STROKE: 0x0f2a4a,
  SEA_LIGHT: 0x2a5a8c,

  // Ocean depth variants (vibrant)
  SEA_DEEP: 0x0f2850,
  SEA_DEEP_STROKE: 0x0a1c3a,
  SEA_DEEP_ACCENT: 0x1e4a80,
  SEA_COASTAL: 0x1a5580,
  SEA_COASTAL_STROKE: 0x124068,
  SEA_COASTAL_ACCENT: 0x3080b8,
  SEA_SHORE: 0x2e6e96,
  SEA_SHORE_STROKE: 0x1e5878,
  SEA_FOAM: 0xd4f0f8,
  SEA_FOAM_ACCENT: 0xeaf8fc,

  // Cities
  CITY_NEUTRAL: 0xaaaaaa,
  CITY_STROKE: 0x666666,

  // Players
  PLAYER1: 0x4488ff,
  PLAYER2: 0xff4444,

  // Fog of war
  FOG: 0x000000,

  // UI
  SELECTION: 0xffdd44,
  HOVER: 0xffffff,
  MOVE_HIGHLIGHT: 0x44cc88,
  ATTACK_HIGHLIGHT: 0xff4444,
  HEALTH_HIGH: 0x44cc44,
  HEALTH_MID: 0xcccc44,
  HEALTH_LOW: 0xcc4444,
  HEALTH_BG: 0x333333,

  // Background
  BG: 0x0a0a1e,
} as const;

// ─── Camera ─────────────────────────────────────────────────────────────────

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3.0;
export const ZOOM_SPEED = 0.1;
export const PAN_SPEED = 12;
export const EDGE_PAN_MARGIN = 32;
export const LERP_FACTOR = 0.25;

// ─── Animation ──────────────────────────────────────────────────────────────

export const UNIT_MOVE_LERP = 0.3;
export const UNIT_DEATH_FADE_MS = 300;

// ─── Fog Alpha ──────────────────────────────────────────────────────────────

export const FOG_UNSEEN_ALPHA = 1.0;
export const FOG_STALE_ALPHA = 0.45;
export const FOG_LERP_SPEED = 3.0; // alpha units per second for fog transitions

// ─── Visual Polish ──────────────────────────────────────────────────────────

export const WATER_ANIM_SPEED = 2.0;        // primary wave cycle speed
export const WATER_ANIM_SPEED2 = 1.3;      // secondary wave (slower, different axis)
export const WATER_ANIM_SPEED3 = 3.2;      // tertiary shimmer (fast, subtle)
export const WATER_ALPHA_RANGE = 0.15;     // alpha oscillation range (±15%)
export const WATER_BOB_AMOUNT = 1.2;       // pixels of vertical wave bob
export const FOAM_PULSE_SPEED = 1.8;       // foam alpha cycle speed
export const FOAM_SCALE_AMOUNT = 0.06;     // foam scale breathing range
export const UNIT_IDLE_BOB_SPEED = 2.0;    // bobbing frequency
export const UNIT_IDLE_BOB_AMOUNT = 1.5;   // pixels of vertical bob
export const UNIT_SHADOW_ALPHA = 0.25;     // shadow opacity
export const SCREEN_SHAKE_INTENSITY = 4;   // max pixels of shake
export const SCREEN_SHAKE_DECAY = 8;       // shake decay speed (per second)
