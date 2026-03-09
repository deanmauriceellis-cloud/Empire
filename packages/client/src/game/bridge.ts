// Empire Reborn — Game State Bridge
// Adapts SinglePlayerGame (full GameState) to RenderableState for the renderer.

import { Owner, TerrainType, type SinglePlayerGame } from "@empire/shared";
import type { RenderableState, RenderableTile, RenderableCity } from "../types.js";

/**
 * Build a RenderableState from a SinglePlayerGame.
 * The human player is always Player1.
 */
export function buildRenderableState(game: SinglePlayerGame): RenderableState {
  const state = game.state;
  const owner = Owner.Player1;
  const viewMap = state.viewMaps[owner];

  // Build renderable tiles: combine ground truth terrain with player's view
  const tiles: RenderableTile[] = new Array(state.map.length);
  for (let i = 0; i < state.map.length; i++) {
    const cell = state.map[i];
    const view = viewMap[i];
    tiles[i] = {
      terrain: cell.terrain,
      seen: view.seen,
      cityOwner: cell.cityId !== null ? state.cities[cell.cityId].owner : null,
    };
  }

  // Visible units: only those the player can currently see and not embarked
  const visibleUnits = state.units.filter((u) => {
    if (u.shipId !== null) return false;
    const view = viewMap[u.loc];
    // Show own units always, enemy units only if currently visible
    return u.owner === owner || view.seen === state.turn;
  });

  // Visible cities
  const cities: RenderableCity[] = state.cities
    .filter((c) => viewMap[c.loc].seen >= 0)
    .map((c) => ({
      id: c.id,
      loc: c.loc,
      owner: c.owner,
      production: c.owner === owner ? c.production : null,
    }));

  return {
    turn: state.turn,
    tiles,
    cities,
    units: visibleUnits,
    mapWidth: state.config.mapWidth,
    mapHeight: state.config.mapHeight,
    owner,
  };
}
