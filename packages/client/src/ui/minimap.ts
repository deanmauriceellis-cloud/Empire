// Empire Reborn — Minimap
// Renders a 2px-per-tile overview on a dedicated <canvas>.
// Performance: caches terrain ImageData, only redraws units + viewport each frame.

import { TerrainType, DepositType, locRow, locCol, getPlayerColor, UNOWNED } from "@empire/shared";
import type { RenderableState } from "../types.js";
import type { Camera } from "../core/camera.js";
import { isoToCart } from "../iso/coords.js";

const SCALE = 2; // pixels per tile

export interface Minimap {
  readonly wrapper: HTMLDivElement;
  update(state: RenderableState, camera: Camera, vw: number, vh: number): void;
}

export function createMinimap(camera: Camera): Minimap {
  const wrapper = document.createElement("div");
  wrapper.id = "minimap-wrapper";

  const canvas = document.createElement("canvas");
  wrapper.appendChild(canvas);

  let ctx: CanvasRenderingContext2D | null = null;
  let mapW = 0;
  let mapH = 0;

  // Cached terrain image data (redrawn only when fog/visibility changes)
  let terrainCache: ImageData | null = null;
  let lastTurn = -1;
  let lastTileHash = 0;

  function initCanvas(w: number, h: number): void {
    mapW = w;
    mapH = h;
    canvas.width = w * SCALE;
    canvas.height = h * SCALE;
    ctx = canvas.getContext("2d")!;
    terrainCache = null;
    lastTurn = -1;
    lastTileHash = 0;
  }

  // Click-to-navigate
  canvas.addEventListener("click", (e) => {
    if (!mapW) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const col = Math.floor((e.clientX - rect.left) * scaleX / SCALE);
    const row = Math.floor((e.clientY - rect.top) * scaleY / SCALE);
    if (col >= 0 && col < mapW && row >= 0 && row < mapH) {
      camera.panToTile(col, row);
    }
  });

  // Compute a quick hash of tile visibility to detect changes
  function computeTileHash(state: RenderableState): number {
    // Sample a spread of tiles for a fast dirty check
    let hash = state.units.length * 31 + state.cities.length * 17;
    const step = Math.max(1, Math.floor(state.tiles.length / 200));
    for (let i = 0; i < state.tiles.length; i += step) {
      const t = state.tiles[i];
      hash = ((hash << 5) - hash + t.seen + (t.cityOwner ?? 0)) | 0;
    }
    return hash;
  }

  function renderTerrain(state: RenderableState): ImageData {
    const imgData = ctx!.createImageData(canvas.width, canvas.height);
    const data = imgData.data;

    for (let row = 0; row < mapH; row++) {
      for (let col = 0; col < mapW; col++) {
        const loc = row * mapW + col;
        const tile = state.tiles[loc];

        let r = 0, g = 0, b = 0;
        if (tile.seen === -1) {
          r = 10; g = 10; b = 20;
        } else if (tile.cityOwner !== null) {
          if (tile.cityOwner === UNOWNED) {
            r = 170; g = 170; b = 170;
          } else {
            const c = getPlayerColor(tile.cityOwner);
            r = (c >> 16) & 0xff; g = (c >> 8) & 0xff; b = c & 0xff;
          }
        } else if (tile.terrain === TerrainType.Sea) {
          if (tile.seen < state.turn) { r = 15; g = 30; b = 50; }
          else { r = 26; g = 58; b = 92; }
        } else {
          if (tile.seen < state.turn) { r = 40; g = 70; b = 48; }
          else { r = 74; g = 124; b = 89; }
        }

        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) {
            const px = col * SCALE + dx;
            const py = row * SCALE + dy;
            const i = (py * canvas.width + px) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = 255;
          }
        }
      }
    }

    return imgData;
  }

  return {
    wrapper,

    update(state: RenderableState, cam: Camera, vw: number, vh: number): void {
      if (!ctx || mapW !== state.mapWidth || mapH !== state.mapHeight) {
        initCanvas(state.mapWidth, state.mapHeight);
      }
      if (!ctx) return;

      // Check if terrain needs redraw (turn changed or tiles changed)
      const tileHash = computeTileHash(state);
      if (!terrainCache || lastTurn !== state.turn || lastTileHash !== tileHash) {
        terrainCache = renderTerrain(state);
        lastTurn = state.turn;
        lastTileHash = tileHash;
      }

      // Copy cached terrain
      const imgData = new ImageData(
        new Uint8ClampedArray(terrainCache.data),
        canvas.width, canvas.height,
      );
      const data = imgData.data;

      // Draw deposits as colored dots (brown=ore, dark=oil, green=textile)
      for (const deposit of state.deposits) {
        const col = locCol(deposit.loc);
        const row = locRow(deposit.loc);
        // Deposit type colors
        let r: number, g: number, b: number;
        switch (deposit.type) {
          case DepositType.OreVein:      r = 192; g = 128; b = 64; break;
          case DepositType.OilWell:      r = 60;  g = 60;  b = 80; break;
          case DepositType.TextileFarm:  r = 96;  g = 176; b = 80; break;
        }
        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) {
            const px = col * SCALE + dx;
            const py = row * SCALE + dy;
            const i = (py * canvas.width + px) * 4;
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 220;
          }
        }
      }

      // Draw units as bright dots (changes every frame due to movement)
      for (const unit of state.units) {
        const col = locCol(unit.loc);
        const row = locRow(unit.loc);
        const uc = getPlayerColor(unit.owner);
        const ur = (uc >> 16) & 0xff;
        const ug = (uc >> 8) & 0xff;
        const ub = uc & 0xff;

        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) {
            const px = col * SCALE + dx;
            const py = row * SCALE + dy;
            const i = (py * canvas.width + px) * 4;
            data[i] = ur;
            data[i + 1] = ug;
            data[i + 2] = ub;
            data[i + 3] = 255;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // Draw viewport rectangle
      const halfW = vw / 2 / cam.zoom;
      const halfH = vh / 2 / cam.zoom;
      const topLeft = isoToCart(cam.x - halfW, cam.y - halfH);
      const bottomRight = isoToCart(cam.x + halfW, cam.y + halfH);
      const topRight = isoToCart(cam.x + halfW, cam.y - halfH);
      const bottomLeft = isoToCart(cam.x - halfW, cam.y + halfH);

      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(topLeft.col * SCALE, topLeft.row * SCALE);
      ctx.lineTo(topRight.col * SCALE, topRight.row * SCALE);
      ctx.lineTo(bottomRight.col * SCALE, bottomRight.row * SCALE);
      ctx.lineTo(bottomLeft.col * SCALE, bottomLeft.row * SCALE);
      ctx.closePath();
      ctx.stroke();
    },
  };
}
