// Empire Reborn — Game State Bridge
// Adapts SinglePlayerGame (full GameState) to RenderableState for the renderer.

import { Owner, TerrainType, type SinglePlayerGame, isCrownCity } from "@empire/shared";
import type { RenderableState, RenderableTile, RenderableCity } from "../types.js";

/**
 * Build a RenderableState from a SinglePlayerGame.
 * @param playerOwner The human player's owner ID (default Player1 for backward compat).
 */
export function buildRenderableState(game: SinglePlayerGame, playerOwner: Owner = Owner.Player1): RenderableState {
  const state = game.state;
  const owner = playerOwner;
  const viewMap = state.viewMaps[owner];

  // Build renderable tiles: combine ground truth terrain with player's view
  const tiles: RenderableTile[] = new Array(state.map.length);
  for (let i = 0; i < state.map.length; i++) {
    const cell = state.map[i];
    const view = viewMap[i];
    // Deposit info (only if tile has been seen)
    let depositType: import("@empire/shared").DepositType | null = null;
    let depositOwner: Owner | null = null;
    let depositComplete = false;
    if (cell.depositId !== null && view.seen >= 0) {
      const deposit = state.deposits[cell.depositId];
      depositType = deposit.type;
      depositOwner = deposit.owner;
      depositComplete = deposit.buildingComplete;
    }

    tiles[i] = {
      terrain: cell.terrain,
      seen: view.seen,
      cityOwner: cell.cityId !== null ? state.cities[cell.cityId].owner : null,
      depositType,
      depositOwner,
      depositComplete,
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

  // Visible deposits (only seen tiles)
  const visibleDeposits = state.deposits.filter((d) => viewMap[d.loc].seen >= 0);

  // Crown city locations (for minimap rendering)
  const crownCityLocs = new Set<number>();
  if (state.kingdoms) {
    for (const city of state.cities) {
      if (isCrownCity(state, city.id) && viewMap[city.loc].seen >= 0) {
        crownCityLocs.add(city.loc);
      }
    }
  }

  return {
    turn: state.turn,
    tiles,
    cities,
    units: visibleUnits,
    deposits: visibleDeposits,
    resources: state.resources[owner],
    mapWidth: state.config.mapWidth,
    mapHeight: state.config.mapHeight,
    owner,
    crownCityLocs,
  };
}
