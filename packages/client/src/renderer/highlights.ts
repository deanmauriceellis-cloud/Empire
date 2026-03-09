// Empire Reborn — Tile Highlight Renderer
// Renders move/attack highlights and hover overlay on the tilemap.

import { Container, Sprite } from "pixi.js";
import { locRow, locCol } from "@empire/shared";
import { cartToIso } from "../iso/coords.js";
import { HALF_TILE_W, HALF_TILE_H } from "../constants.js";
import type { AssetBundle, TileHighlight, SelectionState } from "../types.js";

export class HighlightRenderer {
  private container: Container;
  private pool: Sprite[] = [];
  private hoverSprite: Sprite;
  private activeCount = 0;
  private assets: AssetBundle;
  private time = 0;

  constructor(worldContainer: Container, assets: AssetBundle) {
    this.assets = assets;

    this.container = new Container();
    this.container.zIndex = 5; // between terrain (0) and fog (10)
    worldContainer.addChild(this.container);

    // Hover sprite (always on top of highlights)
    this.hoverSprite = new Sprite(assets.hover);
    this.hoverSprite.anchor.set(0, 0);
    this.hoverSprite.visible = false;
    this.hoverSprite.zIndex = 1000;
    this.container.addChild(this.hoverSprite);
  }

  private getSprite(index: number): Sprite {
    if (index < this.pool.length) {
      return this.pool[index];
    }
    const sprite = new Sprite();
    sprite.anchor.set(0, 0);
    this.container.addChild(sprite);
    this.pool.push(sprite);
    return sprite;
  }

  update(
    highlights: TileHighlight[],
    selection: SelectionState,
    mapWidth: number,
    dt: number,
  ): void {
    this.time += dt;
    this.activeCount = 0;

    // Pulse animation for highlights
    const pulse = Math.sin(this.time * 3) * 0.15 + 0.85;

    // Render move/attack highlights
    for (const h of highlights) {
      const col = locCol(h.loc);
      const row = locRow(h.loc);
      const iso = cartToIso(col, row);
      const px = iso.x - HALF_TILE_W;
      const py = iso.y - HALF_TILE_H;

      const sprite = this.getSprite(this.activeCount++);
      sprite.texture = h.type === "move"
        ? this.assets.moveHighlight
        : this.assets.attackHighlight;
      sprite.position.set(px, py);
      sprite.alpha = pulse;
      sprite.visible = true;
    }

    // Hide unused pool sprites
    for (let i = this.activeCount; i < this.pool.length; i++) {
      this.pool[i].visible = false;
    }

    // Hover tile
    if (selection.hoveredTile) {
      const iso = cartToIso(selection.hoveredTile.col, selection.hoveredTile.row);
      this.hoverSprite.position.set(iso.x - HALF_TILE_W, iso.y - HALF_TILE_H);
      this.hoverSprite.visible = true;
    } else {
      this.hoverSprite.visible = false;
    }
  }
}
