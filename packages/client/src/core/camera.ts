// Empire Reborn — Camera System

import { cartToIso } from "../iso/coords.js";
import {
  MIN_ZOOM, MAX_ZOOM, ZOOM_SPEED,
  PAN_SPEED, EDGE_PAN_MARGIN, LERP_FACTOR,
  HALF_TILE_W, HALF_TILE_H,
} from "../constants.js";
import type { InputState } from "./input.js";
import type { Container } from "pixi.js";

export interface Camera {
  /** Current interpolated position (world coords, center of view). */
  x: number;
  y: number;
  zoom: number;

  /** Target position for lerp smoothing. */
  targetX: number;
  targetY: number;
  targetZoom: number;

  /** Update camera from input. Call once per frame. */
  update(input: InputState, viewportW: number, viewportH: number): void;

  /** Apply camera transform to the world container. */
  applyTo(container: Container, viewportW: number, viewportH: number): void;

  /** Center camera on a tile immediately (no lerp). */
  centerOnTile(col: number, row: number): void;

  /** Smoothly move camera to center on a tile. */
  panToTile(col: number, row: number): void;
}

export function createCamera(mapWidth: number, mapHeight: number): Camera {
  // Compute world bounds in iso space
  const topLeft = cartToIso(0, 0);
  const topRight = cartToIso(mapWidth - 1, 0);
  const bottomLeft = cartToIso(0, mapHeight - 1);
  const bottomRight = cartToIso(mapWidth - 1, mapHeight - 1);

  const worldMinX = bottomLeft.x - HALF_TILE_W;
  const worldMaxX = topRight.x + HALF_TILE_W;
  const worldMinY = topLeft.y - HALF_TILE_H;
  const worldMaxY = bottomRight.y + HALF_TILE_H;

  let x = (worldMinX + worldMaxX) / 2;
  let y = (worldMinY + worldMaxY) / 2;
  let zoom = 1.0;
  let targetX = x;
  let targetY = y;
  let targetZoom = zoom;

  function clampPosition(vw: number, vh: number): void {
    // Allow viewing entire map but don't pan past edges
    const halfViewW = vw / 2 / zoom;
    const halfViewH = vh / 2 / zoom;
    targetX = Math.max(worldMinX + halfViewW, Math.min(worldMaxX - halfViewW, targetX));
    targetY = Math.max(worldMinY + halfViewH, Math.min(worldMaxY - halfViewH, targetY));
  }

  return {
    get x() { return x; },
    get y() { return y; },
    get zoom() { return zoom; },
    set x(v) { x = v; },
    set y(v) { y = v; },
    set zoom(v) { zoom = v; },
    get targetX() { return targetX; },
    get targetY() { return targetY; },
    get targetZoom() { return targetZoom; },
    set targetX(v) { targetX = v; },
    set targetY(v) { targetY = v; },
    set targetZoom(v) { targetZoom = v; },

    update(input: InputState, viewportW: number, viewportH: number): void {
      const panAmount = PAN_SPEED / zoom;

      // WASD / Arrow key panning
      if (input.isKeyDown("w") || input.isKeyDown("arrowup")) targetY -= panAmount;
      if (input.isKeyDown("s") || input.isKeyDown("arrowdown")) targetY += panAmount;
      if (input.isKeyDown("a") || input.isKeyDown("arrowleft")) targetX -= panAmount;
      if (input.isKeyDown("d") || input.isKeyDown("arrowright")) targetX += panAmount;

      // Edge panning
      if (input.mouseX < EDGE_PAN_MARGIN) targetX -= panAmount * 0.5;
      if (input.mouseX > viewportW - EDGE_PAN_MARGIN) targetX += panAmount * 0.5;
      if (input.mouseY < EDGE_PAN_MARGIN) targetY -= panAmount * 0.5;
      if (input.mouseY > viewportH - EDGE_PAN_MARGIN) targetY += panAmount * 0.5;

      // Zoom
      if (input.wheelDelta !== 0) {
        targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
          targetZoom - input.wheelDelta * ZOOM_SPEED));
        input.consumeWheel();
      }

      // Clamp position
      clampPosition(viewportW, viewportH);

      // Lerp toward targets
      x += (targetX - x) * LERP_FACTOR;
      y += (targetY - y) * LERP_FACTOR;
      zoom += (targetZoom - zoom) * LERP_FACTOR;
    },

    applyTo(container: Container, viewportW: number, viewportH: number): void {
      container.x = viewportW / 2 - x * zoom;
      container.y = viewportH / 2 - y * zoom;
      container.scale.set(zoom);
    },

    centerOnTile(col: number, row: number): void {
      const iso = cartToIso(col, row);
      targetX = iso.x;
      targetY = iso.y;
      x = iso.x;
      y = iso.y;
    },

    panToTile(col: number, row: number): void {
      const iso = cartToIso(col, row);
      targetX = iso.x;
      targetY = iso.y;
    },
  };
}
