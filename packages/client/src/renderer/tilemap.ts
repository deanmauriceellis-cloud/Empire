// Empire Reborn — Tilemap Renderer
// Renders terrain tiles with frustum culling, animated water, and smooth fog transitions.

import { Container, Sprite, type Texture } from "pixi.js";
import { TerrainType, Owner } from "@empire/shared";
import { cartToIso, getVisibleTileBounds } from "../iso/coords.js";
import {
  HALF_TILE_W, HALF_TILE_H,
  FOG_UNSEEN_ALPHA, FOG_STALE_ALPHA, FOG_LERP_SPEED,
  WATER_ANIM_SPEED, WATER_ANIM_AMPLITUDE,
} from "../constants.js";
import type { AssetBundle, RenderableState } from "../types.js";
import type { Camera } from "../core/camera.js";

export class TilemapRenderer {
  private tileContainer: Container;
  private fogContainer: Container;
  private tilePool: Sprite[] = [];
  private fogPool: Sprite[] = [];
  private activeTiles = 0;
  private activeFog = 0;
  private assets: AssetBundle;
  private time = 0;

  // Fog alpha tracking for smooth transitions (keyed by loc)
  private fogAlphaMap = new Map<number, number>();

  constructor(worldContainer: Container, assets: AssetBundle) {
    this.assets = assets;

    this.tileContainer = new Container();
    this.tileContainer.zIndex = 0;
    worldContainer.addChild(this.tileContainer);

    this.fogContainer = new Container();
    this.fogContainer.zIndex = 10;
    worldContainer.addChild(this.fogContainer);
  }

  private getTileSprite(index: number): Sprite {
    if (index < this.tilePool.length) {
      return this.tilePool[index];
    }
    const sprite = new Sprite();
    sprite.anchor.set(0, 0);
    this.tileContainer.addChild(sprite);
    this.tilePool.push(sprite);
    return sprite;
  }

  private getFogSprite(index: number): Sprite {
    if (index < this.fogPool.length) {
      return this.fogPool[index];
    }
    const sprite = new Sprite(this.assets.fog);
    sprite.anchor.set(0, 0);
    this.fogContainer.addChild(sprite);
    this.fogPool.push(sprite);
    return sprite;
  }

  private getTerrainTexture(terrain: TerrainType, cityOwner: Owner | null): Texture {
    if (terrain === TerrainType.City || cityOwner !== null) {
      if (cityOwner === Owner.Player1) return this.assets.terrain.cityPlayer1;
      if (cityOwner === Owner.Player2) return this.assets.terrain.cityPlayer2;
      return this.assets.terrain.cityNeutral;
    }
    if (terrain === TerrainType.Sea) return this.assets.terrain.sea;
    return this.assets.terrain.land;
  }

  update(state: RenderableState, camera: Camera, viewportW: number, viewportH: number, dt: number): void {
    this.time += dt;

    const bounds = getVisibleTileBounds(
      camera, viewportW, viewportH,
      state.mapWidth, state.mapHeight,
    );

    this.activeTiles = 0;
    this.activeFog = 0;

    // Water animation: subtle alpha oscillation
    const waterPulse = 1.0 + Math.sin(this.time * WATER_ANIM_SPEED) * WATER_ANIM_AMPLITUDE;

    for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
      for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
        const loc = row * state.mapWidth + col;
        const tile = state.tiles[loc];
        if (!tile) continue;

        const iso = cartToIso(col, row);
        const px = iso.x - HALF_TILE_W;
        const py = iso.y - HALF_TILE_H;

        // Terrain sprite
        const sprite = this.getTileSprite(this.activeTiles++);
        sprite.texture = this.getTerrainTexture(tile.terrain, tile.cityOwner);
        sprite.position.set(px, py);
        sprite.visible = true;

        // Animate water tiles with phase offset based on position
        if (tile.terrain === TerrainType.Sea && tile.cityOwner === null) {
          const phase = Math.sin(this.time * WATER_ANIM_SPEED + col * 0.3 + row * 0.5) * WATER_ANIM_AMPLITUDE;
          sprite.alpha = 1.0 + phase;
        } else {
          sprite.alpha = 1;
        }

        // Fog overlay with smooth alpha transitions
        let targetAlpha = 0;
        if (tile.seen === -1) {
          targetAlpha = FOG_UNSEEN_ALPHA;
        } else if (tile.seen < state.turn) {
          targetAlpha = FOG_STALE_ALPHA;
        }

        // Get current fog alpha for this tile
        const currentAlpha = this.fogAlphaMap.get(loc) ?? targetAlpha;
        // Lerp toward target
        const newAlpha = currentAlpha + Math.sign(targetAlpha - currentAlpha) *
          Math.min(Math.abs(targetAlpha - currentAlpha), FOG_LERP_SPEED * dt);

        if (newAlpha > 0.01) {
          const fog = this.getFogSprite(this.activeFog++);
          fog.position.set(px, py);
          fog.alpha = newAlpha;
          fog.visible = true;
          this.fogAlphaMap.set(loc, newAlpha);
        } else {
          this.fogAlphaMap.set(loc, 0);
        }
      }
    }

    // Hide unused pool sprites
    for (let i = this.activeTiles; i < this.tilePool.length; i++) {
      this.tilePool[i].visible = false;
    }
    for (let i = this.activeFog; i < this.fogPool.length; i++) {
      this.fogPool[i].visible = false;
    }
  }
}
