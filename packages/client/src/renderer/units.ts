// Empire Reborn — Unit Renderer
// Renders units with isometric positioning, player colors, health bars,
// selection glow, smooth movement animation, idle bobbing, and shadows.

import { Container, Sprite, Graphics, Text, TextStyle } from "pixi.js";
import { locRow, locCol, UNIT_ATTRIBUTES, Owner } from "@empire/shared";
import type { UnitState } from "@empire/shared";
import { cartToIso } from "../iso/coords.js";
import {
  UNIT_MOVE_LERP, COLORS,
  UNIT_IDLE_BOB_SPEED, UNIT_IDLE_BOB_AMOUNT, UNIT_SHADOW_ALPHA,
} from "../constants.js";
import type { AssetBundle, SelectionState } from "../types.js";

interface UnitSprite {
  container: Container;
  sprite: Sprite;
  shadow: Graphics;
  healthBar: Graphics | null;
  selectionGlow: Graphics;
  cargoLabel: Text | null;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  fadeAlpha: number;   // for death fade-out (-1 = alive)
  bobOffset: number;   // randomized phase offset for bobbing
}

export class UnitRenderer {
  private unitContainer: Container;
  private sprites = new Map<number, UnitSprite>();
  private assets: AssetBundle;
  private time = 0;

  constructor(worldContainer: Container, assets: AssetBundle) {
    this.assets = assets;

    this.unitContainer = new Container();
    this.unitContainer.zIndex = 20;
    this.unitContainer.sortableChildren = true;
    worldContainer.addChild(this.unitContainer);
  }

  private createUnitSprite(unit: UnitState): UnitSprite {
    const container = new Container();
    container.sortableChildren = true;

    // Shadow (rendered below everything)
    const shadow = new Graphics();
    shadow.ellipse(0, 4, 10, 4);
    shadow.fill({ color: 0x000000, alpha: UNIT_SHADOW_ALPHA });
    shadow.zIndex = -1;
    container.addChild(shadow);

    // Selection glow (rendered below unit)
    const selectionGlow = new Graphics();
    selectionGlow.circle(0, 0, 14);
    selectionGlow.fill({ color: COLORS.SELECTION, alpha: 0.4 });
    selectionGlow.visible = false;
    selectionGlow.zIndex = 0;
    container.addChild(selectionGlow);

    // Unit sprite
    const textureKey = `unit_${unit.type}_${unit.owner}`;
    const texture = this.assets.units.get(textureKey);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0.5);
    sprite.zIndex = 1;
    container.addChild(sprite);

    // Health bar (only for units with max hits > 1)
    const maxHits = UNIT_ATTRIBUTES[unit.type].maxHits;
    let healthBar: Graphics | null = null;
    if (maxHits > 1) {
      healthBar = new Graphics();
      healthBar.zIndex = 2;
      container.addChild(healthBar);
    }

    // Cargo label for transports/carriers
    const unitAttrs = UNIT_ATTRIBUTES[unit.type];
    let cargoLabel: Text | null = null;
    if (unitAttrs.capacity > 0) {
      cargoLabel = new Text({
        text: "",
        style: new TextStyle({
          fontSize: 9,
          fontFamily: "monospace",
          fontWeight: "bold",
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 2 },
        }),
      });
      cargoLabel.anchor.set(0.5, 0);
      cargoLabel.position.set(0, 8);
      cargoLabel.zIndex = 3;
      container.addChild(cargoLabel);
    }

    const col = locCol(unit.loc);
    const row = locRow(unit.loc);
    const iso = cartToIso(col, row);

    this.unitContainer.addChild(container);

    return {
      container,
      sprite,
      shadow,
      healthBar,
      selectionGlow,
      cargoLabel,
      currentX: iso.x,
      currentY: iso.y,
      targetX: iso.x,
      targetY: iso.y,
      fadeAlpha: -1,
      bobOffset: Math.random() * Math.PI * 2, // randomize phase
    };
  }

  private drawHealthBar(bar: Graphics, hits: number, maxHits: number): void {
    bar.clear();
    const w = 20, h = 3;
    const ratio = hits / maxHits;

    // Background
    bar.rect(-w / 2, -18, w, h);
    bar.fill({ color: COLORS.HEALTH_BG });

    // Foreground
    const color = ratio > 0.6 ? COLORS.HEALTH_HIGH
      : ratio > 0.3 ? COLORS.HEALTH_MID
      : COLORS.HEALTH_LOW;
    bar.rect(-w / 2, -18, w * ratio, h);
    bar.fill({ color });
  }

  update(units: UnitState[], selection: SelectionState, dt: number): void {
    this.time += dt;

    // Track which unit IDs are still alive
    const aliveIds = new Set(units.map((u) => u.id));

    // Update or create sprites for living units
    for (const unit of units) {
      let us = this.sprites.get(unit.id);
      if (!us) {
        us = this.createUnitSprite(unit);
        this.sprites.set(unit.id, us);
      }

      // Update target position
      const col = locCol(unit.loc);
      const row = locRow(unit.loc);
      const iso = cartToIso(col, row);
      us.targetX = iso.x;
      us.targetY = iso.y;

      // Lerp toward target
      us.currentX += (us.targetX - us.currentX) * UNIT_MOVE_LERP;
      us.currentY += (us.targetY - us.currentY) * UNIT_MOVE_LERP;

      // Snap when close
      if (Math.abs(us.targetX - us.currentX) < 0.5) us.currentX = us.targetX;
      if (Math.abs(us.targetY - us.currentY) < 0.5) us.currentY = us.targetY;

      // Idle bobbing (only when not moving)
      const isMoving = Math.abs(us.targetX - us.currentX) > 1 || Math.abs(us.targetY - us.currentY) > 1;
      let bobY = 0;
      if (!isMoving) {
        bobY = Math.sin(this.time * UNIT_IDLE_BOB_SPEED + us.bobOffset) * UNIT_IDLE_BOB_AMOUNT;
      }

      us.container.position.set(us.currentX, us.currentY + bobY);
      us.container.zIndex = us.currentY; // depth sort by base Y (not bobbed)

      // Shadow stays on ground (no bob)
      us.shadow.position.set(0, -bobY);

      // Update texture (in case owner changed via capture)
      const textureKey = `unit_${unit.type}_${unit.owner}`;
      const texture = this.assets.units.get(textureKey);
      if (texture && us.sprite.texture !== texture) {
        us.sprite.texture = texture;
      }

      // Health bar
      if (us.healthBar) {
        const maxHits = UNIT_ATTRIBUTES[unit.type].maxHits;
        this.drawHealthBar(us.healthBar, unit.hits, maxHits);
      }

      // Cargo label
      if (us.cargoLabel) {
        const cap = UNIT_ATTRIBUTES[unit.type].capacity;
        us.cargoLabel.text = `${unit.cargoIds.length}/${cap}`;
      }

      // Selection glow with pulse
      const isSelected = selection.selectedUnitId === unit.id;
      us.selectionGlow.visible = isSelected;
      if (isSelected) {
        us.selectionGlow.alpha = Math.sin(this.time * 4) * 0.3 + 0.7;
      }
    }

    // Fade out and remove dead units
    const toRemove: number[] = [];
    for (const [id, us] of this.sprites) {
      if (!aliveIds.has(id)) {
        if (us.fadeAlpha < 0) us.fadeAlpha = 1.0; // start fading
        us.fadeAlpha -= dt * 3; // fade over ~0.3s
        us.container.alpha = Math.max(0, us.fadeAlpha);
        if (us.fadeAlpha <= 0) {
          toRemove.push(id);
        }
      }
    }

    for (const id of toRemove) {
      const us = this.sprites.get(id)!;
      this.unitContainer.removeChild(us.container);
      us.container.destroy({ children: true });
      this.sprites.delete(id);
    }
  }
}
