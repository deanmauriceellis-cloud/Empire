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

function makeUnitTexture(renderer: Renderer, type: UnitType, owner: Owner): Texture {
  const g = new Graphics();
  const color = ownerColor(owner);
  const cx = 16, cy = 16; // center of 32x32 area

  switch (type) {
    case UnitType.Army:
      // Filled circle
      g.circle(cx, cy, 7);
      g.fill({ color });
      g.stroke({ width: 1.5, color: 0x000000, alpha: 0.5 });
      break;

    case UnitType.Fighter:
      // Triangle / arrow pointing right
      g.poly([cx + 9, cy, cx - 6, cy - 7, cx - 4, cy, cx - 6, cy + 7]);
      g.fill({ color });
      g.stroke({ width: 1, color: 0x000000, alpha: 0.5 });
      break;

    case UnitType.Patrol:
      // Small diamond
      g.poly([cx, cy - 7, cx + 7, cy, cx, cy + 7, cx - 7, cy]);
      g.fill({ color });
      g.stroke({ width: 1, color: 0x000000, alpha: 0.5 });
      break;

    case UnitType.Destroyer:
      // Elongated hexagon
      g.poly([cx - 9, cy, cx - 5, cy - 5, cx + 5, cy - 5, cx + 9, cy, cx + 5, cy + 5, cx - 5, cy + 5]);
      g.fill({ color });
      g.stroke({ width: 1, color: 0x000000, alpha: 0.5 });
      break;

    case UnitType.Submarine:
      // Rounded rectangle
      g.roundRect(cx - 9, cy - 4, 18, 8, 4);
      g.fill({ color });
      g.stroke({ width: 1, color: 0x000000, alpha: 0.5 });
      break;

    case UnitType.Transport:
      // Wide rectangle
      g.rect(cx - 10, cy - 5, 20, 10);
      g.fill({ color });
      g.stroke({ width: 1, color: 0x000000, alpha: 0.5 });
      // Deck line
      g.moveTo(cx - 8, cy);
      g.lineTo(cx + 8, cy);
      g.stroke({ width: 1, color: 0x000000, alpha: 0.3 });
      break;

    case UnitType.Carrier:
      // Large rectangle with cross line
      g.rect(cx - 11, cy - 6, 22, 12);
      g.fill({ color });
      g.stroke({ width: 1, color: 0x000000, alpha: 0.5 });
      g.moveTo(cx - 8, cy - 3);
      g.lineTo(cx + 8, cy + 3);
      g.stroke({ width: 1, color: 0x000000, alpha: 0.3 });
      g.moveTo(cx - 8, cy + 3);
      g.lineTo(cx + 8, cy - 3);
      g.stroke({ width: 1, color: 0x000000, alpha: 0.3 });
      break;

    case UnitType.Battleship:
      // Large hexagon
      g.poly([cx - 10, cy, cx - 6, cy - 7, cx + 6, cy - 7, cx + 10, cy, cx + 6, cy + 7, cx - 6, cy + 7]);
      g.fill({ color });
      g.stroke({ width: 1.5, color: 0x000000, alpha: 0.5 });
      break;

    case UnitType.Satellite:
      // Star shape
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(angle) * 9, cy + Math.sin(angle) * 9);
      }
      g.stroke({ width: 2, color });
      g.circle(cx, cy, 3);
      g.fill({ color });
      break;
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
