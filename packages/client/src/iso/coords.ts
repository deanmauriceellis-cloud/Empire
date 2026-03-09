// Empire Reborn — Isometric Coordinate System

import { HALF_TILE_W, HALF_TILE_H } from "../constants.js";

/**
 * Convert cartesian grid (col, row) to isometric world position.
 * Returns the center of the tile diamond.
 */
export function cartToIso(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * HALF_TILE_W,
    y: (col + row) * HALF_TILE_H,
  };
}

/**
 * Convert isometric world position to fractional cartesian grid coordinates.
 */
export function isoToCart(x: number, y: number): { col: number; row: number } {
  return {
    col: (x / HALF_TILE_W + y / HALF_TILE_H) / 2,
    row: (y / HALF_TILE_H - x / HALF_TILE_W) / 2,
  };
}

/**
 * Convert screen pixel coordinates to tile (col, row), accounting for
 * camera position and zoom.
 */
export function screenToTile(
  screenX: number,
  screenY: number,
  camera: { x: number; y: number; zoom: number },
  viewportWidth: number,
  viewportHeight: number,
): { col: number; row: number } {
  // Screen → world
  const worldX = (screenX - viewportWidth / 2) / camera.zoom + camera.x;
  const worldY = (screenY - viewportHeight / 2) / camera.zoom + camera.y;
  // World → tile
  const raw = isoToCart(worldX, worldY);
  return { col: Math.floor(raw.col), row: Math.floor(raw.row) };
}

/**
 * Get the isometric bounding box visible on screen (in tile coordinates).
 * Returns inclusive min/max row and col, clamped to map bounds.
 */
export function getVisibleTileBounds(
  camera: { x: number; y: number; zoom: number },
  viewportWidth: number,
  viewportHeight: number,
  mapWidth: number,
  mapHeight: number,
): { minRow: number; maxRow: number; minCol: number; maxCol: number } {
  // Sample all four screen corners → tile coords
  const margin = 2; // extra tiles around edges
  const corners = [
    screenToTile(0, 0, camera, viewportWidth, viewportHeight),
    screenToTile(viewportWidth, 0, camera, viewportWidth, viewportHeight),
    screenToTile(0, viewportHeight, camera, viewportWidth, viewportHeight),
    screenToTile(viewportWidth, viewportHeight, camera, viewportWidth, viewportHeight),
  ];

  let minRow = Infinity, maxRow = -Infinity;
  let minCol = Infinity, maxCol = -Infinity;
  for (const c of corners) {
    minRow = Math.min(minRow, c.row);
    maxRow = Math.max(maxRow, c.row);
    minCol = Math.min(minCol, c.col);
    maxCol = Math.max(maxCol, c.col);
  }

  return {
    minRow: Math.max(0, minRow - margin),
    maxRow: Math.min(mapHeight - 1, maxRow + margin),
    minCol: Math.max(0, minCol - margin),
    maxCol: Math.min(mapWidth - 1, maxCol + margin),
  };
}
