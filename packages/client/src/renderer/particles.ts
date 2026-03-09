// Empire Reborn — Particle Effects System
// Lightweight custom particles using pooled Graphics objects.

import { Container, Graphics } from "pixi.js";
import { locRow, locCol, Owner } from "@empire/shared";
import type { Loc } from "@empire/shared";
import { cartToIso } from "../iso/coords.js";
import { COLORS } from "../constants.js";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
  graphic: Graphics;
  isRipple: boolean;
}

export class ParticleSystem {
  private container: Container;
  private particles: Particle[] = [];
  private pool: Graphics[] = [];

  constructor(effectsContainer: Container) {
    this.container = effectsContainer;
  }

  private getGraphic(): Graphics {
    const g = this.pool.pop() || new Graphics();
    g.visible = true;
    g.alpha = 1;
    this.container.addChild(g);
    return g;
  }

  private recycleGraphic(g: Graphics): void {
    g.clear();
    g.visible = false;
    this.container.removeChild(g);
    this.pool.push(g);
  }

  private locToWorld(loc: Loc): { x: number; y: number } {
    return cartToIso(locCol(loc), locRow(loc));
  }

  private emit(x: number, y: number, count: number, color: number, opts: {
    speedMin?: number;
    speedMax?: number;
    sizeMin?: number;
    sizeMax?: number;
    life?: number;
    spread?: number;
  } = {}): void {
    const {
      speedMin = 20, speedMax = 60,
      sizeMin = 2, sizeMax = 5,
      life = 0.5, spread = Math.PI * 2,
    } = opts;

    for (let i = 0; i < count; i++) {
      const angle = (Math.random() - 0.5) * spread + Math.PI * 1.5; // bias upward
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const size = sizeMin + Math.random() * (sizeMax - sizeMin);
      const g = this.getGraphic();

      g.circle(0, 0, size);
      g.fill({ color });
      g.position.set(x, y);

      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color,
        size,
        graphic: g,
        isRipple: false,
      });
    }
  }

  // ─── Effect Emitters ────────────────────────────────────────────────────

  emitExplosion(loc: Loc): void {
    const { x, y } = this.locToWorld(loc);
    this.emit(x, y, 18, 0xff6600, { speedMin: 30, speedMax: 80, life: 0.5 });
    this.emit(x, y, 8, 0xffcc00, { speedMin: 15, speedMax: 40, life: 0.3, sizeMin: 1, sizeMax: 3 });
  }

  emitDeath(loc: Loc, owner: Owner): void {
    const { x, y } = this.locToWorld(loc);
    const color = owner === Owner.Player1 ? COLORS.PLAYER1 : COLORS.PLAYER2;
    this.emit(x, y, 10, color, { speedMin: 10, speedMax: 30, life: 0.8, spread: Math.PI });
  }

  emitCapture(loc: Loc, captor: Owner): void {
    const { x, y } = this.locToWorld(loc);
    const color = captor === Owner.Player1 ? COLORS.PLAYER1 : COLORS.PLAYER2;
    // Ring burst outward
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const g = this.getGraphic();
      g.circle(0, 0, 3);
      g.fill({ color });
      g.position.set(x, y);

      this.particles.push({
        x, y,
        vx: Math.cos(angle) * 50,
        vy: Math.sin(angle) * 50,
        life: 0.6,
        maxLife: 0.6,
        color,
        size: 3,
        graphic: g,
        isRipple: false,
      });
    }
  }

  emitWaterRipple(loc: Loc): void {
    const { x, y } = this.locToWorld(loc);
    // Expanding ring effect using circle outlines
    for (let ring = 0; ring < 3; ring++) {
      const g = this.getGraphic();
      const delay = ring * 0.3;
      g.circle(0, 0, 2);
      g.stroke({ width: 1, color: 0x88bbdd });
      g.position.set(x, y);
      g.scale.set(0.1);

      this.particles.push({
        x, y,
        vx: 0,
        vy: 0,
        life: 1.5 + delay,
        maxLife: 1.5 + delay,
        color: 0x88bbdd,
        size: 15 + ring * 5,
        graphic: g,
        isRipple: true,
      });
    }
  }

  // ─── Update Loop ────────────────────────────────────────────────────────

  update(dt: number): void {
    const alive: Particle[] = [];

    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        this.recycleGraphic(p.graphic);
        continue;
      }

      const progress = 1 - p.life / p.maxLife;

      if (p.isRipple) {
        // Ripples: expand in place, no movement
        p.graphic.scale.set(0.1 + progress * (p.size / 5));
      } else {
        // Regular particles: physics
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 20 * dt; // gravity
        p.graphic.position.set(p.x, p.y);
      }

      p.graphic.alpha = 1 - progress;

      alive.push(p);
    }

    this.particles = alive;
  }
}
