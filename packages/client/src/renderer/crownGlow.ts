// Empire Reborn — Crown City Glow Renderer (Phase 16D)
// Renders a golden halo around crown cities, visible from distance.

import { Container, Graphics } from "pixi.js";
import { locRow, locCol } from "@empire/shared";
import type { Loc } from "@empire/shared";
import { cartToIso } from "../iso/coords.js";
import { CROWN_GLOW_RADIUS, CROWN_GLOW_PULSE_SPEED, CROWN_GLOW_ALPHA } from "../constants.js";

export class CrownGlowRenderer {
  private container: Container;
  private glows = new Map<number, Graphics>(); // loc → glow graphic
  private time = 0;

  constructor(worldContainer: Container) {
    this.container = new Container();
    this.container.zIndex = 2; // above tiles, below highlights
    worldContainer.addChild(this.container);
  }

  update(crownCityLocs: Set<number>, dt: number): void {
    this.time += dt;

    // Remove glows for locations no longer crown cities
    for (const [loc, g] of this.glows) {
      if (!crownCityLocs.has(loc)) {
        this.container.removeChild(g);
        g.destroy();
        this.glows.delete(loc);
      }
    }

    // Create or update glows for current crown cities
    for (const loc of crownCityLocs) {
      let g = this.glows.get(loc);
      if (!g) {
        g = this.createGlow(loc as Loc);
        this.glows.set(loc, g);
      }

      // Pulsing alpha
      const pulse = Math.sin(this.time * CROWN_GLOW_PULSE_SPEED + loc * 0.1) * 0.08;
      g.alpha = CROWN_GLOW_ALPHA + pulse;

      // Subtle breathing scale
      const breathe = 1.0 + Math.sin(this.time * CROWN_GLOW_PULSE_SPEED * 0.7) * 0.05;
      g.scale.set(breathe);
    }
  }

  private createGlow(loc: Loc): Graphics {
    const col = locCol(loc);
    const row = locRow(loc);
    const iso = cartToIso(col, row);

    const g = new Graphics();

    // Outer soft glow
    g.circle(0, 0, CROWN_GLOW_RADIUS);
    g.fill({ color: 0xffd700, alpha: 0.3 });

    // Inner bright core
    g.circle(0, 0, CROWN_GLOW_RADIUS * 0.5);
    g.fill({ color: 0xffee88, alpha: 0.4 });

    // Tiny bright center
    g.circle(0, 0, CROWN_GLOW_RADIUS * 0.2);
    g.fill({ color: 0xfffff0, alpha: 0.5 });

    g.position.set(iso.x, iso.y);
    this.container.addChild(g);
    return g;
  }
}
