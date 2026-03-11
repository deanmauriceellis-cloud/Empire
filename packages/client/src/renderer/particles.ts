// Empire Reborn — Particle Effects System
// Lightweight custom particles using pooled Graphics objects.
// Enhanced effects: more particles, lingering smoke, richer explosions.

import { Container, Graphics } from "pixi.js";
import { locRow, locCol, Owner, getPlayerColor } from "@empire/shared";
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
  /** If true, particle fades but doesn't move (smoke) */
  isSmoke: boolean;
  /** Gravity multiplier (0 = no gravity) */
  gravity: number;
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
    g.scale.set(1);
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
    gravity?: number;
    isSmoke?: boolean;
  } = {}): void {
    const {
      speedMin = 20, speedMax = 60,
      sizeMin = 2, sizeMax = 5,
      life = 0.5, spread = Math.PI * 2,
      gravity = 20, isSmoke = false,
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
        life: life + Math.random() * life * 0.3, // slight variance
        maxLife: life,
        color,
        size,
        graphic: g,
        isRipple: false,
        isSmoke,
        gravity,
      });
    }
  }

  // ─── Effect Emitters ────────────────────────────────────────────────────

  emitExplosion(loc: Loc): void {
    const { x, y } = this.locToWorld(loc);
    // Main burst — orange/red
    this.emit(x, y, 24, 0xff6600, { speedMin: 30, speedMax: 90, life: 0.6, sizeMin: 2, sizeMax: 5 });
    // Inner flash — bright yellow
    this.emit(x, y, 12, 0xffcc00, { speedMin: 15, speedMax: 50, life: 0.35, sizeMin: 1, sizeMax: 3 });
    // White-hot core
    this.emit(x, y, 6, 0xffffff, { speedMin: 5, speedMax: 25, life: 0.2, sizeMin: 1, sizeMax: 2 });
    // Lingering smoke — dark, slow, floats up
    this.emit(x, y, 8, 0x333333, {
      speedMin: 5, speedMax: 15, life: 1.5, sizeMin: 3, sizeMax: 6,
      spread: Math.PI * 0.6, gravity: -5, isSmoke: true,
    });
  }

  emitDeath(loc: Loc, owner: Owner): void {
    const { x, y } = this.locToWorld(loc);
    const color = getPlayerColor(owner);
    this.emit(x, y, 14, color, { speedMin: 10, speedMax: 35, life: 0.9, spread: Math.PI });
    // Small debris
    this.emit(x, y, 6, 0x555555, { speedMin: 15, speedMax: 40, life: 0.6, sizeMin: 1, sizeMax: 2 });
  }

  emitCapture(loc: Loc, captor: Owner): void {
    const { x, y } = this.locToWorld(loc);
    const color = getPlayerColor(captor);
    // Ring burst outward
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const g = this.getGraphic();
      g.circle(0, 0, 3);
      g.fill({ color });
      g.position.set(x, y);

      this.particles.push({
        x, y,
        vx: Math.cos(angle) * 55,
        vy: Math.sin(angle) * 55,
        life: 0.7,
        maxLife: 0.7,
        color,
        size: 3,
        graphic: g,
        isRipple: false,
        isSmoke: false,
        gravity: 0,
      });
    }
    // Upward sparkle burst
    this.emit(x, y - 5, 8, 0xffffff, {
      speedMin: 20, speedMax: 50, life: 0.5, sizeMin: 1, sizeMax: 2,
      spread: Math.PI * 0.5, gravity: 10,
    });
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
        isSmoke: false,
        gravity: 0,
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
      } else if (p.isSmoke) {
        // Smoke: drift slowly, expand slightly
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.gravity * dt; // negative gravity = float up
        p.graphic.position.set(p.x, p.y);
        p.graphic.scale.set(1 + progress * 0.5);
      } else {
        // Regular particles: physics
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.gravity * dt;
        p.graphic.position.set(p.x, p.y);
      }

      p.graphic.alpha = 1 - progress;

      alive.push(p);
    }

    this.particles = alive;
  }
}
