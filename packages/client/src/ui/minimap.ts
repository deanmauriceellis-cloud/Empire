// Empire Reborn — Minimap
// Renders a 1px-per-tile overview on a dedicated <canvas>.

import { TerrainType, Owner, locRow, locCol } from "@empire/shared";
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

  function initCanvas(w: number, h: number): void {
    mapW = w;
    mapH = h;
    canvas.width = w * SCALE;
    canvas.height = h * SCALE;
    ctx = canvas.getContext("2d")!;
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

  return {
    wrapper,

    update(state: RenderableState, cam: Camera, vw: number, vh: number): void {
      if (!ctx || mapW !== state.mapWidth || mapH !== state.mapHeight) {
        initCanvas(state.mapWidth, state.mapHeight);
      }
      if (!ctx) return;

      const imgData = ctx.createImageData(canvas.width, canvas.height);
      const data = imgData.data;

      // Draw terrain
      for (let row = 0; row < mapH; row++) {
        for (let col = 0; col < mapW; col++) {
          const loc = row * mapW + col;
          const tile = state.tiles[loc];

          let r = 0, g = 0, b = 0;
          if (tile.seen === -1) {
            // Unseen: black
            r = 10; g = 10; b = 20;
          } else if (tile.cityOwner !== null) {
            if (tile.cityOwner === Owner.Player1) { r = 68; g = 136; b = 255; }
            else if (tile.cityOwner === Owner.Player2) { r = 255; g = 68; b = 68; }
            else { r = 170; g = 170; b = 170; }
          } else if (tile.terrain === TerrainType.Sea) {
            if (tile.seen < state.turn) { r = 15; g = 30; b = 50; }
            else { r = 26; g = 58; b = 92; }
          } else {
            if (tile.seen < state.turn) { r = 40; g = 70; b = 48; }
            else { r = 74; g = 124; b = 89; }
          }

          // Write 2x2 pixel block
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

      // Draw units as bright dots
      for (const unit of state.units) {
        const col = locCol(unit.loc);
        const row = locRow(unit.loc);
        const isP1 = unit.owner === Owner.Player1;

        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) {
            const px = col * SCALE + dx;
            const py = row * SCALE + dy;
            const i = (py * canvas.width + px) * 4;
            data[i] = isP1 ? 100 : 255;
            data[i + 1] = isP1 ? 200 : 100;
            data[i + 2] = isP1 ? 255 : 100;
            data[i + 3] = 255;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // Draw viewport rectangle
      // Convert camera view to tile coords
      const halfW = vw / 2 / cam.zoom;
      const halfH = vh / 2 / cam.zoom;
      // Convert iso world coords to tile coords
      const topLeft = isoToCart(cam.x - halfW, cam.y - halfH);
      const bottomRight = isoToCart(cam.x + halfW, cam.y + halfH);
      // We need all 4 corners for the rotated rect
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
