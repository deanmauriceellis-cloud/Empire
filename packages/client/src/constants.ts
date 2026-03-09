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
export const LERP_FACTOR = 0.12;

// ─── Animation ──────────────────────────────────────────────────────────────

export const UNIT_MOVE_LERP = 0.15;
export const UNIT_DEATH_FADE_MS = 300;

// ─── Fog Alpha ──────────────────────────────────────────────────────────────

export const FOG_UNSEEN_ALPHA = 1.0;
export const FOG_STALE_ALPHA = 0.45;
