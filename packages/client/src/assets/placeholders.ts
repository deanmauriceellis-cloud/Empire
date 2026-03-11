// Empire Reborn — Placeholder Asset Generator
// Generates colored geometric textures for all game elements.

import { Graphics, type Renderer, type Texture } from "pixi.js";
import { UnitType, Owner } from "@empire/shared";
import { TILE_WIDTH, TILE_HEIGHT, HALF_TILE_W, HALF_TILE_H, COLORS } from "../constants.js";
import type { AssetBundle } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Draw an isometric diamond path (for tiles). */
function drawDiamond(g: Graphics, fill: number, stroke: number, alpha = 1): void {
  g.poly([
    HALF_TILE_W, 0,
    TILE_WIDTH, HALF_TILE_H,
    HALF_TILE_W, TILE_HEIGHT,
    0, HALF_TILE_H,
  ]);
  g.fill({ color: fill, alpha });
  g.stroke({ width: 1, color: stroke, alpha: alpha * 0.8 });
}

function ownerColor(owner: Owner): number {
  if (owner === Owner.Player1) return COLORS.PLAYER1;
  if (owner === Owner.Player2) return COLORS.PLAYER2;
  return COLORS.CITY_NEUTRAL;
}

// ─── Terrain Textures ───────────────────────────────────────────────────────

function makeLandTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  drawDiamond(g, COLORS.LAND, COLORS.LAND_STROKE);
  // Subtle terrain detail: small darker patches
  g.circle(HALF_TILE_W - 8, HALF_TILE_H - 2, 2);
  g.fill({ color: COLORS.LAND_STROKE, alpha: 0.3 });
  g.circle(HALF_TILE_W + 6, HALF_TILE_H + 3, 1.5);
  g.fill({ color: COLORS.LAND_STROKE, alpha: 0.25 });
  return renderer.generateTexture(g);
}

function makeSeaTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  drawDiamond(g, COLORS.SEA, COLORS.SEA_STROKE);
  // Wave accent lines
  g.moveTo(HALF_TILE_W - 10, HALF_TILE_H - 2);
  g.lineTo(HALF_TILE_W + 10, HALF_TILE_H - 2);
  g.stroke({ width: 1, color: COLORS.SEA_LIGHT, alpha: 0.3 });
  g.moveTo(HALF_TILE_W - 6, HALF_TILE_H + 4);
  g.lineTo(HALF_TILE_W + 6, HALF_TILE_H + 4);
  g.stroke({ width: 1, color: COLORS.SEA_LIGHT, alpha: 0.2 });
  return renderer.generateTexture(g);
}

function makeSeaDeepTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  drawDiamond(g, COLORS.SEA_DEEP, COLORS.SEA_DEEP_STROKE);
  // Subtle deep-water wave lines — slow, broad
  g.moveTo(HALF_TILE_W - 14, HALF_TILE_H - 3);
  g.lineTo(HALF_TILE_W + 14, HALF_TILE_H - 3);
  g.stroke({ width: 1, color: COLORS.SEA_DEEP_ACCENT, alpha: 0.2 });
  g.moveTo(HALF_TILE_W - 8, HALF_TILE_H + 3);
  g.lineTo(HALF_TILE_W + 8, HALF_TILE_H + 3);
  g.stroke({ width: 1, color: COLORS.SEA_DEEP_ACCENT, alpha: 0.15 });
  return renderer.generateTexture(g);
}

function makeSeaCoastalTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  drawDiamond(g, COLORS.SEA_COASTAL, COLORS.SEA_COASTAL_STROKE);
  // More visible wave accents — medium water
  g.moveTo(HALF_TILE_W - 12, HALF_TILE_H - 2);
  g.lineTo(HALF_TILE_W + 12, HALF_TILE_H - 2);
  g.stroke({ width: 1, color: COLORS.SEA_COASTAL_ACCENT, alpha: 0.35 });
  g.moveTo(HALF_TILE_W - 7, HALF_TILE_H + 4);
  g.lineTo(HALF_TILE_W + 7, HALF_TILE_H + 4);
  g.stroke({ width: 1, color: COLORS.SEA_COASTAL_ACCENT, alpha: 0.25 });
  // Small wave crests
  g.moveTo(HALF_TILE_W - 4, HALF_TILE_H - 6);
  g.lineTo(HALF_TILE_W + 4, HALF_TILE_H - 6);
  g.stroke({ width: 0.5, color: COLORS.SEA_COASTAL_ACCENT, alpha: 0.2 });
  return renderer.generateTexture(g);
}

function makeSeaShoreTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  drawDiamond(g, COLORS.SEA_SHORE, COLORS.SEA_SHORE_STROKE);
  // Choppy shallow water — more wave lines, closer together
  g.moveTo(HALF_TILE_W - 10, HALF_TILE_H - 4);
  g.lineTo(HALF_TILE_W + 10, HALF_TILE_H - 4);
  g.stroke({ width: 1, color: COLORS.SEA_COASTAL_ACCENT, alpha: 0.4 });
  g.moveTo(HALF_TILE_W - 8, HALF_TILE_H);
  g.lineTo(HALF_TILE_W + 8, HALF_TILE_H);
  g.stroke({ width: 1, color: COLORS.SEA_COASTAL_ACCENT, alpha: 0.35 });
  g.moveTo(HALF_TILE_W - 6, HALF_TILE_H + 4);
  g.lineTo(HALF_TILE_W + 6, HALF_TILE_H + 4);
  g.stroke({ width: 0.5, color: COLORS.SEA_COASTAL_ACCENT, alpha: 0.3 });
  return renderer.generateTexture(g);
}

function makeShoreFoamTexture(renderer: Renderer): Texture {
  // A translucent diamond overlay with foam-colored edge accents
  const g = new Graphics();
  // Foam ring around the tile edge — dotted white/cyan effect
  g.poly([
    HALF_TILE_W, 2,
    TILE_WIDTH - 3, HALF_TILE_H,
    HALF_TILE_W, TILE_HEIGHT - 2,
    3, HALF_TILE_H,
  ]);
  g.stroke({ width: 2, color: COLORS.SEA_FOAM, alpha: 0.5 });
  // Inner foam wisps
  g.moveTo(HALF_TILE_W - 10, HALF_TILE_H - 1);
  g.lineTo(HALF_TILE_W + 10, HALF_TILE_H - 1);
  g.stroke({ width: 1.5, color: COLORS.SEA_FOAM_ACCENT, alpha: 0.3 });
  g.moveTo(HALF_TILE_W - 5, HALF_TILE_H + 3);
  g.lineTo(HALF_TILE_W + 5, HALF_TILE_H + 3);
  g.stroke({ width: 1, color: COLORS.SEA_FOAM_ACCENT, alpha: 0.25 });
  return renderer.generateTexture(g);
}

function makeCityTexture(renderer: Renderer, color: number): Texture {
  const g = new Graphics();
  // Base diamond
  drawDiamond(g, COLORS.LAND, COLORS.LAND_STROKE);
  // City building (small rectangle on top)
  const bw = 12, bh = 14;
  g.rect(HALF_TILE_W - bw / 2, HALF_TILE_H - bh - 2, bw, bh);
  g.fill({ color });
  g.stroke({ width: 1, color: 0x000000, alpha: 0.5 });
  // Flag on top
  g.moveTo(HALF_TILE_W, HALF_TILE_H - bh - 2);
  g.lineTo(HALF_TILE_W, HALF_TILE_H - bh - 8);
  g.stroke({ width: 1, color: 0x000000 });
  g.rect(HALF_TILE_W, HALF_TILE_H - bh - 8, 5, 3);
  g.fill({ color });
  return renderer.generateTexture(g);
}

// ─── Fog Texture ────────────────────────────────────────────────────────────

function makeFogTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  drawDiamond(g, COLORS.FOG, 0x000000);
  return renderer.generateTexture(g);
}

// ─── Selection / Hover Textures ─────────────────────────────────────────────

function makeSelectionTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  g.poly([
    HALF_TILE_W, 1,
    TILE_WIDTH - 1, HALF_TILE_H,
    HALF_TILE_W, TILE_HEIGHT - 1,
    1, HALF_TILE_H,
  ]);
  g.stroke({ width: 2, color: COLORS.SELECTION, alpha: 0.9 });
  return renderer.generateTexture(g);
}

function makeHoverTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  g.poly([
    HALF_TILE_W, 1,
    TILE_WIDTH - 1, HALF_TILE_H,
    HALF_TILE_W, TILE_HEIGHT - 1,
    1, HALF_TILE_H,
  ]);
  g.stroke({ width: 1, color: COLORS.HOVER, alpha: 0.5 });
  return renderer.generateTexture(g);
}

function makeMoveHighlightTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  g.poly([
    HALF_TILE_W, 0,
    TILE_WIDTH, HALF_TILE_H,
    HALF_TILE_W, TILE_HEIGHT,
    0, HALF_TILE_H,
  ]);
  g.fill({ color: COLORS.MOVE_HIGHLIGHT, alpha: 0.25 });
  g.stroke({ width: 2, color: COLORS.MOVE_HIGHLIGHT, alpha: 0.6 });
  return renderer.generateTexture(g);
}

function makeAttackHighlightTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  g.poly([
    HALF_TILE_W, 0,
    TILE_WIDTH, HALF_TILE_H,
    HALF_TILE_W, TILE_HEIGHT,
    0, HALF_TILE_H,
  ]);
  g.fill({ color: COLORS.ATTACK_HIGHLIGHT, alpha: 0.25 });
  g.stroke({ width: 2, color: COLORS.ATTACK_HIGHLIGHT, alpha: 0.6 });
  return renderer.generateTexture(g);
}

// ─── Unit Textures ──────────────────────────────────────────────────────────

/** Darken a color by multiplying each channel. */
function darken(c: number, factor: number): number {
  const r = Math.floor(((c >> 16) & 0xff) * factor);
  const g = Math.floor(((c >> 8) & 0xff) * factor);
  const b = Math.floor((c & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

/** Lighten a color toward white. */
function lighten(c: number, factor: number): number {
  const r = Math.min(255, Math.floor(((c >> 16) & 0xff) + (255 - ((c >> 16) & 0xff)) * factor));
  const g = Math.min(255, Math.floor(((c >> 8) & 0xff) + (255 - ((c >> 8) & 0xff)) * factor));
  const b = Math.min(255, Math.floor((c & 0xff) + (255 - (c & 0xff)) * factor));
  return (r << 16) | (g << 8) | b;
}

function makeUnitTexture(renderer: Renderer, type: UnitType, owner: Owner): Texture {
  const g = new Graphics();
  const color = ownerColor(owner);
  const dark = darken(color, 0.6);
  const accent = lighten(color, 0.4);
  const cx = 16, cy = 16; // center of 32x32 area

  switch (type) {
    case UnitType.Army: {
      // Shield/helmet silhouette with detail
      // Shield body
      g.roundRect(cx - 6, cy - 7, 12, 11, 2);
      g.fill({ color });
      g.stroke({ width: 1.5, color: dark, alpha: 0.8 });
      // Helmet dome on top
      g.ellipse(cx, cy - 7, 5, 3);
      g.fill({ color: dark });
      // Shield emblem — horizontal stripe
      g.moveTo(cx - 4, cy - 2);
      g.lineTo(cx + 4, cy - 2);
      g.stroke({ width: 2, color: accent, alpha: 0.7 });
      // Shield bottom point
      g.poly([cx - 6, cy + 4, cx, cy + 8, cx + 6, cy + 4]);
      g.fill({ color });
      g.stroke({ width: 1, color: dark, alpha: 0.6 });
      break;
    }

    case UnitType.Fighter: {
      // Swept-wing jet with tail fin
      // Fuselage
      g.poly([cx + 10, cy, cx - 4, cy - 2, cx - 8, cy, cx - 4, cy + 2]);
      g.fill({ color });
      g.stroke({ width: 1, color: dark, alpha: 0.7 });
      // Swept wings
      g.poly([cx + 2, cy - 1, cx - 3, cy - 8, cx - 5, cy - 7, cx - 2, cy - 1]);
      g.fill({ color });
      g.stroke({ width: 0.5, color: dark, alpha: 0.5 });
      g.poly([cx + 2, cy + 1, cx - 3, cy + 8, cx - 5, cy + 7, cx - 2, cy + 1]);
      g.fill({ color });
      g.stroke({ width: 0.5, color: dark, alpha: 0.5 });
      // Tail fin (vertical)
      g.poly([cx - 6, cy, cx - 9, cy - 4, cx - 8, cy - 4, cx - 6, cy]);
      g.fill({ color: dark });
      // Cockpit
      g.ellipse(cx + 4, cy, 2, 1);
      g.fill({ color: accent, alpha: 0.8 });
      // Wing stripes
      g.moveTo(cx - 1, cy - 3);
      g.lineTo(cx - 3, cy - 5);
      g.stroke({ width: 1, color: accent, alpha: 0.5 });
      g.moveTo(cx - 1, cy + 3);
      g.lineTo(cx - 3, cy + 5);
      g.stroke({ width: 1, color: accent, alpha: 0.5 });
      break;
    }

    case UnitType.Patrol: {
      // Small patrol boat with radar mast
      // Hull
      g.poly([cx - 9, cy + 2, cx - 6, cy + 5, cx + 6, cy + 5, cx + 9, cy + 2, cx + 7, cy - 1, cx - 7, cy - 1]);
      g.fill({ color });
      g.stroke({ width: 1, color: dark, alpha: 0.7 });
      // Deck
      g.rect(cx - 5, cy - 1, 10, 2);
      g.fill({ color: accent, alpha: 0.3 });
      // Cabin
      g.rect(cx - 2, cy - 4, 4, 3);
      g.fill({ color: dark });
      g.stroke({ width: 0.5, color: 0x000000, alpha: 0.4 });
      // Radar mast
      g.moveTo(cx, cy - 4);
      g.lineTo(cx, cy - 8);
      g.stroke({ width: 1, color: 0x333333 });
      // Radar dish
      g.moveTo(cx - 2, cy - 7);
      g.lineTo(cx + 2, cy - 7);
      g.stroke({ width: 1.5, color: 0x666666 });
      // Wake suggestion line
      g.moveTo(cx - 8, cy + 5);
      g.lineTo(cx + 8, cy + 5);
      g.stroke({ width: 0.5, color: accent, alpha: 0.3 });
      break;
    }

    case UnitType.Destroyer: {
      // Sleek warship hull with turret
      // Hull - long sleek shape
      g.poly([cx - 11, cy + 1, cx - 8, cy + 4, cx + 8, cy + 4, cx + 11, cy + 1,
              cx + 9, cy - 2, cx - 9, cy - 2]);
      g.fill({ color });
      g.stroke({ width: 1, color: dark, alpha: 0.7 });
      // Deck stripe
      g.moveTo(cx - 7, cy);
      g.lineTo(cx + 7, cy);
      g.stroke({ width: 1, color: accent, alpha: 0.4 });
      // Forward turret
      g.circle(cx + 4, cy - 1, 2.5);
      g.fill({ color: dark });
      // Turret barrel
      g.moveTo(cx + 4, cy - 1);
      g.lineTo(cx + 9, cy - 3);
      g.stroke({ width: 1.5, color: 0x444444 });
      // Bridge/superstructure
      g.rect(cx - 3, cy - 5, 5, 3);
      g.fill({ color: dark });
      g.stroke({ width: 0.5, color: 0x000000, alpha: 0.4 });
      // Mast
      g.moveTo(cx - 1, cy - 5);
      g.lineTo(cx - 1, cy - 8);
      g.stroke({ width: 0.5, color: 0x444444 });
      break;
    }

    case UnitType.Submarine: {
      // Streamlined hull with conning tower
      // Main hull - elongated oval
      g.ellipse(cx, cy + 1, 11, 4);
      g.fill({ color });
      g.stroke({ width: 1, color: dark, alpha: 0.7 });
      // Conning tower
      g.roundRect(cx - 2, cy - 5, 5, 5, 1);
      g.fill({ color: dark });
      g.stroke({ width: 0.5, color: 0x000000, alpha: 0.5 });
      // Periscope
      g.moveTo(cx + 1, cy - 5);
      g.lineTo(cx + 1, cy - 8);
      g.stroke({ width: 1, color: 0x555555 });
      g.moveTo(cx + 1, cy - 8);
      g.lineTo(cx + 3, cy - 8);
      g.stroke({ width: 1, color: 0x555555 });
      // Bow detail
      g.moveTo(cx + 8, cy + 1);
      g.lineTo(cx + 12, cy + 1);
      g.stroke({ width: 1, color: dark, alpha: 0.5 });
      // Hull stripe
      g.moveTo(cx - 8, cy + 1);
      g.lineTo(cx + 8, cy + 1);
      g.stroke({ width: 0.5, color: accent, alpha: 0.3 });
      break;
    }

    case UnitType.Transport: {
      // Wide cargo hull with deck markings
      // Hull
      g.poly([cx - 11, cy + 1, cx - 8, cy + 5, cx + 8, cy + 5, cx + 11, cy + 1,
              cx + 9, cy - 3, cx - 9, cy - 3]);
      g.fill({ color });
      g.stroke({ width: 1, color: dark, alpha: 0.7 });
      // Cargo deck markings — three sections
      g.rect(cx - 7, cy - 2, 4, 5);
      g.fill({ color: dark, alpha: 0.3 });
      g.stroke({ width: 0.5, color: dark, alpha: 0.4 });
      g.rect(cx - 2, cy - 2, 4, 5);
      g.fill({ color: dark, alpha: 0.3 });
      g.stroke({ width: 0.5, color: dark, alpha: 0.4 });
      g.rect(cx + 3, cy - 2, 4, 5);
      g.fill({ color: dark, alpha: 0.3 });
      g.stroke({ width: 0.5, color: dark, alpha: 0.4 });
      // Small bridge at rear
      g.rect(cx - 9, cy - 5, 4, 3);
      g.fill({ color: dark });
      // Ramp indicator at bow
      g.moveTo(cx + 9, cy - 1);
      g.lineTo(cx + 11, cy + 1);
      g.lineTo(cx + 9, cy + 3);
      g.stroke({ width: 1, color: accent, alpha: 0.5 });
      break;
    }

    case UnitType.Carrier: {
      // Flight deck with runway lines and island structure
      // Flight deck — large flat shape
      g.poly([cx - 12, cy + 1, cx - 10, cy + 5, cx + 10, cy + 5, cx + 12, cy + 1,
              cx + 10, cy - 4, cx - 10, cy - 4]);
      g.fill({ color });
      g.stroke({ width: 1.5, color: dark, alpha: 0.7 });
      // Runway line (center)
      g.moveTo(cx - 8, cy);
      g.lineTo(cx + 8, cy);
      g.stroke({ width: 1, color: accent, alpha: 0.6 });
      // Runway dashes
      for (let i = -6; i <= 6; i += 3) {
        g.moveTo(cx + i, cy - 1);
        g.lineTo(cx + i, cy + 1);
        g.stroke({ width: 0.5, color: accent, alpha: 0.4 });
      }
      // Angled landing lines
      g.moveTo(cx - 4, cy - 3);
      g.lineTo(cx + 6, cy + 4);
      g.stroke({ width: 0.5, color: accent, alpha: 0.3 });
      // Island structure (right side)
      g.rect(cx + 5, cy - 6, 4, 4);
      g.fill({ color: dark });
      g.stroke({ width: 0.5, color: 0x000000, alpha: 0.5 });
      // Island mast
      g.moveTo(cx + 7, cy - 6);
      g.lineTo(cx + 7, cy - 9);
      g.stroke({ width: 0.5, color: 0x555555 });
      break;
    }

    case UnitType.Battleship: {
      // Heavy hull with multiple turrets
      // Heavy hull
      g.poly([cx - 12, cy + 1, cx - 9, cy + 5, cx + 9, cy + 5, cx + 12, cy + 1,
              cx + 10, cy - 3, cx - 10, cy - 3]);
      g.fill({ color });
      g.stroke({ width: 1.5, color: dark, alpha: 0.8 });
      // Armored deck stripe
      g.moveTo(cx - 8, cy);
      g.lineTo(cx + 8, cy);
      g.stroke({ width: 2, color: dark, alpha: 0.3 });
      // Forward turret
      g.circle(cx + 5, cy - 1, 2.5);
      g.fill({ color: dark });
      g.moveTo(cx + 5, cy - 1);
      g.lineTo(cx + 10, cy - 3);
      g.stroke({ width: 2, color: 0x444444 });
      // Rear turret
      g.circle(cx - 5, cy - 1, 2.5);
      g.fill({ color: dark });
      g.moveTo(cx - 5, cy - 1);
      g.lineTo(cx - 10, cy - 3);
      g.stroke({ width: 2, color: 0x444444 });
      // Superstructure
      g.rect(cx - 3, cy - 6, 6, 4);
      g.fill({ color: dark });
      g.stroke({ width: 0.5, color: 0x000000, alpha: 0.5 });
      // Mast
      g.moveTo(cx, cy - 6);
      g.lineTo(cx, cy - 10);
      g.stroke({ width: 1, color: 0x444444 });
      // Accent stripes on hull
      g.moveTo(cx - 6, cy + 3);
      g.lineTo(cx + 6, cy + 3);
      g.stroke({ width: 1, color: accent, alpha: 0.3 });
      break;
    }

    case UnitType.Satellite: {
      // Solar panel wings + central dish
      // Central body
      g.rect(cx - 2, cy - 2, 4, 4);
      g.fill({ color });
      g.stroke({ width: 1, color: dark, alpha: 0.7 });
      // Solar panel left
      g.rect(cx - 11, cy - 3, 8, 6);
      g.fill({ color: accent, alpha: 0.6 });
      g.stroke({ width: 0.5, color: dark, alpha: 0.5 });
      // Solar panel grid lines
      g.moveTo(cx - 7, cy - 3);
      g.lineTo(cx - 7, cy + 3);
      g.stroke({ width: 0.5, color: dark, alpha: 0.3 });
      g.moveTo(cx - 11, cy);
      g.lineTo(cx - 3, cy);
      g.stroke({ width: 0.5, color: dark, alpha: 0.3 });
      // Solar panel right
      g.rect(cx + 3, cy - 3, 8, 6);
      g.fill({ color: accent, alpha: 0.6 });
      g.stroke({ width: 0.5, color: dark, alpha: 0.5 });
      // Solar panel grid lines
      g.moveTo(cx + 7, cy - 3);
      g.lineTo(cx + 7, cy + 3);
      g.stroke({ width: 0.5, color: dark, alpha: 0.3 });
      g.moveTo(cx + 3, cy);
      g.lineTo(cx + 11, cy);
      g.stroke({ width: 0.5, color: dark, alpha: 0.3 });
      // Dish on top
      g.ellipse(cx, cy - 5, 3, 1.5);
      g.stroke({ width: 1, color });
      g.moveTo(cx, cy - 2);
      g.lineTo(cx, cy - 5);
      g.stroke({ width: 0.5, color: 0x555555 });
      break;
    }
  }

  return renderer.generateTexture(g);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function generateAssets(renderer: Renderer): AssetBundle {
  const units = new Map<string, Texture>();

  // Generate unit textures for both players
  for (const owner of [Owner.Player1, Owner.Player2]) {
    for (let t = UnitType.Army; t <= UnitType.Satellite; t++) {
      const key = `unit_${t}_${owner}`;
      units.set(key, makeUnitTexture(renderer, t, owner));
    }
  }

  return {
    terrain: {
      land: makeLandTexture(renderer),
      sea: makeSeaTexture(renderer),
      seaDeep: makeSeaDeepTexture(renderer),
      seaCoastal: makeSeaCoastalTexture(renderer),
      seaShore: makeSeaShoreTexture(renderer),
      shoreFoam: makeShoreFoamTexture(renderer),
      cityNeutral: makeCityTexture(renderer, COLORS.CITY_NEUTRAL),
      cityPlayer1: makeCityTexture(renderer, COLORS.PLAYER1),
      cityPlayer2: makeCityTexture(renderer, COLORS.PLAYER2),
    },
    fog: makeFogTexture(renderer),
    selection: makeSelectionTexture(renderer),
    hover: makeHoverTexture(renderer),
    moveHighlight: makeMoveHighlightTexture(renderer),
    attackHighlight: makeAttackHighlightTexture(renderer),
    units,
  };
}
