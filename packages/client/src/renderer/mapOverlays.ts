// Empire Reborn — Map Overlays (Phase 2B)
// Renders GoTo path line and vision range ring on the tilemap.

import { Container, Graphics } from "pixi.js";
import { UnitBehavior, UNIT_ATTRIBUTES, locRow, locCol } from "@empire/shared";
import type { UnitState } from "@empire/shared";
import { cartToIso } from "../iso/coords.js";
import { HALF_TILE_W, HALF_TILE_H } from "../constants.js";

export class MapOverlays {
  private container: Container;
  private gotoGraphics: Graphics;
  private visionGraphics: Graphics;
  private time = 0;

  constructor(worldContainer: Container) {
    this.container = new Container();
    this.container.zIndex = 6; // above highlights (5), below fog (10)
    worldContainer.addChild(this.container);

    this.gotoGraphics = new Graphics();
    this.container.addChild(this.gotoGraphics);

    this.visionGraphics = new Graphics();
    this.container.addChild(this.visionGraphics);
  }

  update(selectedUnit: UnitState | null, dt: number): void {
    this.time += dt;
    this.gotoGraphics.clear();
    this.visionGraphics.clear();

    if (!selectedUnit) return;

    this.drawVisionRange(selectedUnit);
    this.drawGoToPath(selectedUnit);
  }

  private drawVisionRange(unit: UnitState): void {
    // Vision range is always 1 tile (adjacent) for all current units
    // Draw a translucent ring around the unit showing visible area
    const col = locCol(unit.loc);
    const row = locRow(unit.loc);
    const center = cartToIso(col, row);

    const pulse = Math.sin(this.time * 2) * 0.03 + 0.12;

    // Draw diamond outlines for each adjacent tile (vision range = 1)
    const offsets = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1],
    ];

    for (const [dr, dc] of offsets) {
      const tCol = col + dc;
      const tRow = row + dr;
      const iso = cartToIso(tCol, tRow);
      this.drawTileDiamond(this.visionGraphics, iso.x, iso.y, 0x44aaff, pulse);
    }
  }

  private drawGoToPath(unit: UnitState): void {
    if (unit.func !== UnitBehavior.GoTo || unit.targetLoc === null) return;

    const srcCol = locCol(unit.loc);
    const srcRow = locRow(unit.loc);
    const dstCol = locCol(unit.targetLoc);
    const dstRow = locRow(unit.targetLoc);

    const srcIso = cartToIso(srcCol, srcRow);
    const dstIso = cartToIso(dstCol, dstRow);

    // Draw dashed line from unit to target
    const pulse = Math.sin(this.time * 3) * 0.15 + 0.6;
    this.drawDashedLine(
      this.gotoGraphics,
      srcIso.x, srcIso.y,
      dstIso.x, dstIso.y,
      0xffaa44, pulse,
    );

    // Draw target marker (pulsing diamond)
    const targetPulse = Math.sin(this.time * 4) * 0.1 + 0.5;
    this.drawTileDiamond(this.gotoGraphics, dstIso.x, dstIso.y, 0xffaa44, targetPulse);
  }

  private drawTileDiamond(g: Graphics, cx: number, cy: number, color: number, alpha: number): void {
    const hw = HALF_TILE_W * 0.85;
    const hh = HALF_TILE_H * 0.85;
    g.poly([
      cx, cy - hh,
      cx + hw, cy,
      cx, cy + hh,
      cx - hw, cy,
    ]);
    g.fill({ color, alpha });
  }

  private drawDashedLine(
    g: Graphics,
    x1: number, y1: number,
    x2: number, y2: number,
    color: number, alpha: number,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const dashLen = 8;
    const gapLen = 6;
    const cycle = dashLen + gapLen;
    const nx = dx / dist;
    const ny = dy / dist;

    // Animate dash offset for a crawling effect
    const offset = (this.time * 30) % cycle;

    let d = -offset;
    while (d < dist) {
      const start = Math.max(0, d);
      const end = Math.min(dist, d + dashLen);
      if (end > start) {
        g.moveTo(x1 + nx * start, y1 + ny * start);
        g.lineTo(x1 + nx * end, y1 + ny * end);
      }
      d += cycle;
    }
    g.stroke({ width: 2, color, alpha });
  }
}
