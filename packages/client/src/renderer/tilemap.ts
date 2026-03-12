// Empire Reborn — Tilemap Renderer
// Renders terrain tiles with frustum culling, multi-depth ocean, shore foam,
// animated water, and smooth fog transitions.

import { Container, Sprite, type Texture } from "pixi.js";
import { TerrainType, Owner, DepositType, UNOWNED } from "@empire/shared";
import { cartToIso, getVisibleTileBounds } from "../iso/coords.js";
import {
  HALF_TILE_W, HALF_TILE_H,
  FOG_UNSEEN_ALPHA, FOG_STALE_ALPHA, FOG_LERP_SPEED,
  WATER_ANIM_SPEED, WATER_ANIM_SPEED2, WATER_ANIM_SPEED3,
  WATER_ALPHA_RANGE, WATER_BOB_AMOUNT,
  FOAM_PULSE_SPEED, FOAM_SCALE_AMOUNT,
} from "../constants.js";
import type { AssetBundle, RenderableState, RenderableTile } from "../types.js";
import type { Camera } from "../core/camera.js";

/** Count how many of the 4 cardinal neighbors are land or city tiles. */
function countAdjacentLand(
  tiles: RenderableTile[],
  row: number, col: number,
  mapW: number, mapH: number,
): number {
  let count = 0;
  const neighbors: [number, number][] = [
    [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1],
  ];
  for (const [r, c] of neighbors) {
    if (r < 0 || r >= mapH || c < 0 || c >= mapW) continue;
    const t = tiles[r * mapW + c];
    if (t && (t.terrain === TerrainType.Land || t.terrain === TerrainType.City || t.cityOwner !== null)) {
      count++;
    }
  }
  return count;
}

/** Check if any of the 8 surrounding tiles is land/city (for foam detection). */
function hasAdjacentLand(
  tiles: RenderableTile[],
  row: number, col: number,
  mapW: number, mapH: number,
): boolean {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr, c = col + dc;
      if (r < 0 || r >= mapH || c < 0 || c >= mapW) continue;
      const t = tiles[r * mapW + c];
      if (t && (t.terrain === TerrainType.Land || t.terrain === TerrainType.City || t.cityOwner !== null)) {
        return true;
      }
    }
  }
  return false;
}

export class TilemapRenderer {
  private tileContainer: Container;
  private foamContainer: Container;
  private depositContainer: Container;
  private fogContainer: Container;
  private tilePool: Sprite[] = [];
  private foamPool: Sprite[] = [];
  private depositPool: Sprite[] = [];
  private fogPool: Sprite[] = [];
  private activeTiles = 0;
  private activeFoam = 0;
  private activeDeposits = 0;
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

    this.foamContainer = new Container();
    this.foamContainer.zIndex = 1;
    worldContainer.addChild(this.foamContainer);

    this.depositContainer = new Container();
    this.depositContainer.zIndex = 11; // above fog (10) so deposits are always visible on explored tiles
    worldContainer.addChild(this.depositContainer);

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

  private getFoamSprite(index: number): Sprite {
    if (index < this.foamPool.length) {
      return this.foamPool[index];
    }
    const sprite = new Sprite(this.assets.terrain.shoreFoam);
    sprite.anchor.set(0, 0);
    this.foamContainer.addChild(sprite);
    this.foamPool.push(sprite);
    return sprite;
  }

  private getDepositSprite(index: number): Sprite {
    if (index < this.depositPool.length) {
      return this.depositPool[index];
    }
    const sprite = new Sprite();
    sprite.anchor.set(0, 0);
    this.depositContainer.addChild(sprite);
    this.depositPool.push(sprite);
    return sprite;
  }

  private getDepositTexture(depositType: DepositType): Texture {
    switch (depositType) {
      case DepositType.OreVein: return this.assets.deposits.get("ore")!;
      case DepositType.OilWell: return this.assets.deposits.get("oil")!;
      case DepositType.TextileFarm: return this.assets.deposits.get("textile")!;
    }
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
      // Use N-player city texture map if available, fall back to legacy fields
      if (this.assets.cityTextures && cityOwner !== null) {
        return this.assets.cityTextures.get(cityOwner) ?? this.assets.terrain.cityNeutral;
      }
      return this.assets.terrain.cityNeutral;
    }
    if (terrain === TerrainType.Sea) return this.assets.terrain.sea; // default, overridden below
    return this.assets.terrain.land;
  }

  /** Pick water texture based on how many adjacent tiles are land. */
  private getSeaTexture(adjLand: number): Texture {
    if (adjLand >= 3) return this.assets.terrain.seaShore;
    if (adjLand >= 1) return this.assets.terrain.seaCoastal;
    return this.assets.terrain.seaDeep;
  }

  update(state: RenderableState, camera: Camera, viewportW: number, viewportH: number, dt: number): void {
    this.time += dt;

    const bounds = getVisibleTileBounds(
      camera, viewportW, viewportH,
      state.mapWidth, state.mapHeight,
    );

    this.activeTiles = 0;
    this.activeFoam = 0;
    this.activeDeposits = 0;
    this.activeFog = 0;

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
        sprite.position.set(px, py);
        sprite.visible = true;

        const isSea = tile.terrain === TerrainType.Sea && tile.cityOwner === null;

        if (isSea) {
          // Multi-depth ocean: pick texture by adjacent land count
          const adjLand = countAdjacentLand(state.tiles, row, col, state.mapWidth, state.mapHeight);
          sprite.texture = this.getSeaTexture(adjLand);

          // Per-tile phase offset based on position (creates rolling wave pattern)
          const tilePhase = col * 0.4 + row * 0.6;

          // Three-frequency wave blend for organic motion
          const wave1 = Math.sin(this.time * WATER_ANIM_SPEED + tilePhase);
          const wave2 = Math.sin(this.time * WATER_ANIM_SPEED2 + col * 0.8 - row * 0.3) * 0.6;
          const wave3 = Math.sin(this.time * WATER_ANIM_SPEED3 + row * 1.2 + col * 0.2) * 0.3;
          const combinedWave = (wave1 + wave2 + wave3) / 1.9; // normalized -1..1

          // Alpha oscillation — visible brightness ebb and flow
          sprite.alpha = 1.0 + combinedWave * WATER_ALPHA_RANGE;

          // Vertical bob — tiles physically rise and fall like waves
          const bobY = combinedWave * WATER_BOB_AMOUNT;
          sprite.position.set(px, py + bobY);

          // Shore foam overlay on water tiles adjacent to land (8-neighbor check)
          if (hasAdjacentLand(state.tiles, row, col, state.mapWidth, state.mapHeight)) {
            const foam = this.getFoamSprite(this.activeFoam++);
            foam.position.set(px, py + bobY);
            foam.visible = true;

            // Foam pulses with its own rhythm — stronger near shore, breathing in/out
            const foamWave = Math.sin(this.time * FOAM_PULSE_SPEED + tilePhase * 1.3);
            const foamAlpha = 0.35 + foamWave * 0.25;
            foam.alpha = foamAlpha;

            // Foam scale breathing — grows and shrinks slightly
            const foamScale = 1.0 + foamWave * FOAM_SCALE_AMOUNT;
            foam.scale.set(foamScale);
          }
        } else {
          sprite.texture = this.getTerrainTexture(tile.terrain, tile.cityOwner);
          sprite.alpha = 1;
        }

        // Deposit overlay (only on seen land tiles with deposits)
        if (tile.depositType !== null && tile.seen >= 0) {
          const dep = this.getDepositSprite(this.activeDeposits++);
          dep.texture = this.getDepositTexture(tile.depositType);
          dep.position.set(px, py);
          dep.visible = true;
          // Gentle pulse to make deposits noticeable
          dep.alpha = 0.85 + Math.sin(this.time * 1.5 + loc * 0.3) * 0.1;
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
          this.fogAlphaMap.delete(loc);
        }
      }
    }

    // Hide unused pool sprites
    for (let i = this.activeTiles; i < this.tilePool.length; i++) {
      this.tilePool[i].visible = false;
    }
    for (let i = this.activeFoam; i < this.foamPool.length; i++) {
      this.foamPool[i].visible = false;
    }
    for (let i = this.activeDeposits; i < this.depositPool.length; i++) {
      this.depositPool[i].visible = false;
    }
    for (let i = this.activeFog; i < this.fogPool.length; i++) {
      this.fogPool[i].visible = false;
    }
  }
}
