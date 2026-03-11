// Empire Reborn — N-Player Helpers
// Utility functions for working with dynamic player lists.

import { UNOWNED, STARTING_ORE, STARTING_OIL, STARTING_TEXTILE } from "./constants.js";
import type { PlayerId } from "./constants.js";
import type { GameState, PlayerInfo, ViewMapCell } from "./types.js";
import { initViewMap } from "./game.js";

// ─── Player Color Palette ──────────────────────────────────────────────────

/** 16 distinct player colors for N-player games. */
export const PLAYER_COLORS: readonly number[] = [
  0x00cc00, // 1: green
  0xcc0000, // 2: red
  0x3366ff, // 3: blue
  0xffcc00, // 4: yellow
  0xff6600, // 5: orange
  0xcc00cc, // 6: magenta
  0x00cccc, // 7: cyan
  0x996633, // 8: brown
  0x66ff66, // 9: lime
  0xff6699, // 10: pink
  0x6633cc, // 11: purple
  0x33cccc, // 12: teal
  0xcc9900, // 13: gold
  0x9999ff, // 14: lavender
  0xff3333, // 15: coral
  0x339933, // 16: forest
] as const;

/** Default player names. */
export const PLAYER_NAMES: readonly string[] = [
  "Player 1", "Player 2", "Player 3", "Player 4",
  "Player 5", "Player 6", "Player 7", "Player 8",
  "Player 9", "Player 10", "Player 11", "Player 12",
  "Player 13", "Player 14", "Player 15", "Player 16",
] as const;

// ─── Player List Helpers ────────────────────────────────────────────────────

/** Get all active player IDs from the game state. */
export function getPlayerIds(state: GameState): PlayerId[] {
  return state.players.filter(p => p.status === "active").map(p => p.id);
}

/** Get all player IDs that are enemies of the given player (all other active players). */
export function getEnemyIds(state: GameState, owner: PlayerId): PlayerId[] {
  return state.players
    .filter(p => p.id !== owner && p.id !== UNOWNED && p.status === "active")
    .map(p => p.id);
}

/** Check if a given owner is an enemy (any other active player). */
export function isEnemy(state: GameState, self: PlayerId, other: PlayerId): boolean {
  if (other === UNOWNED || other === self) return false;
  const player = state.players.find(p => p.id === other);
  return player !== undefined && player.status === "active";
}

/** Check if a given owner is any player (not unowned). */
export function isPlayer(owner: PlayerId): boolean {
  return owner !== UNOWNED;
}

/** Get PlayerInfo by ID. */
export function getPlayerInfo(state: GameState, id: PlayerId): PlayerInfo | undefined {
  return state.players.find(p => p.id === id);
}

/** Get display name for a player. */
export function getPlayerName(state: GameState, id: PlayerId): string {
  if (id === UNOWNED) return "Neutral";
  const info = state.players.find(p => p.id === id);
  return info?.name ?? `Player ${id}`;
}

/** Get color for a player. */
export function getPlayerColor(id: PlayerId): number {
  if (id === UNOWNED) return 0x888888;
  return PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length];
}

// ─── State Initialization ───────────────────────────────────────────────────

/** Create a PlayerInfo entry. */
export function createPlayerInfo(
  id: PlayerId,
  name?: string,
  isAI = false,
): PlayerInfo {
  return {
    id,
    name: name ?? PLAYER_NAMES[(id - 1) % PLAYER_NAMES.length],
    color: PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length],
    isAI,
    status: "active",
  };
}

/** Initialize per-player data structures in GameState for a new player. */
export function initPlayerData(state: GameState, playerId: PlayerId): void {
  state.viewMaps[playerId] = initViewMap();
  state.resources[playerId] = [STARTING_ORE, STARTING_OIL, STARTING_TEXTILE];
  state.techResearch[playerId] = [0, 0, 0, 0];
}

/** Initialize per-player data for all players (including Unowned slot). */
export function initAllPlayerData(state: GameState): void {
  // Unowned slot (index 0) — empty
  state.viewMaps[UNOWNED] = [];
  state.resources[UNOWNED] = [0, 0, 0];
  state.techResearch[UNOWNED] = [0, 0, 0, 0];

  for (const p of state.players) {
    initPlayerData(state, p.id);
  }
}

// ─── Aggregate Helpers ──────────────────────────────────────────────────────

/** Count cities owned by each player. Returns Map<PlayerId, number>. */
export function countCitiesByPlayer(state: GameState): Map<PlayerId, number> {
  const counts = new Map<PlayerId, number>();
  for (const p of state.players) counts.set(p.id, 0);
  for (const city of state.cities) {
    if (city.owner !== UNOWNED) {
      counts.set(city.owner, (counts.get(city.owner) ?? 0) + 1);
    }
  }
  return counts;
}

/** Count armies owned by each player. Returns Map<PlayerId, number>. */
export function countArmiesByPlayer(state: GameState): Map<PlayerId, number> {
  const counts = new Map<PlayerId, number>();
  for (const p of state.players) counts.set(p.id, 0);
  for (const unit of state.units) {
    if (unit.type === 0 /* UnitType.Army */ && unit.owner !== UNOWNED) {
      counts.set(unit.owner, (counts.get(unit.owner) ?? 0) + 1);
    }
  }
  return counts;
}

/** Get the strongest enemy (most cities + armies combined). */
export function getStrongestEnemy(state: GameState, owner: PlayerId): PlayerId | null {
  const enemies = getEnemyIds(state, owner);
  if (enemies.length === 0) return null;

  let bestId: PlayerId | null = null;
  let bestScore = -1;
  for (const eid of enemies) {
    const cities = state.cities.filter(c => c.owner === eid).length;
    const armies = state.units.filter(u => u.owner === eid && u.type === 0).length;
    const score = cities * 3 + armies;
    if (score > bestScore) {
      bestScore = score;
      bestId = eid;
    }
  }
  return bestId;
}
