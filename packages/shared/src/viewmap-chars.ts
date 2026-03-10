// Empire Reborn — ViewMap Character Constants & Helpers
// Phase R1: Replace magic character literals with named constants

// ─── Terrain Characters ──────────────────────────────────────────────────────────

/** Unexplored/unseen tile */
export const VM_UNEXPLORED = " ";
/** Water tile */
export const VM_WATER = ".";
/** Land tile (no unit/city) */
export const VM_LAND = "+";

// ─── City Characters ────────────────────────────────────────────────────────────

/** Own city (from viewer's perspective) */
export const VM_OWN_CITY = "O";
/** Enemy city (from viewer's perspective) */
export const VM_ENEMY_CITY = "X";
/** Unowned (neutral) city */
export const VM_UNOWNED_CITY = "*";

// ─── Transport Load Map Markers ──────────────────────────────────────────────────

/** Water adjacent to 1 waiting army */
export const VM_PICKUP_SINGLE = "$";
/** Water adjacent to 2+ waiting armies (cluster) */
export const VM_PICKUP_CLUSTER = "%";
/** Water adjacent to own city (home port) */
export const VM_HOME_PORT = "H";

// ─── Helper Functions ────────────────────────────────────────────────────────────

/** Is this character an enemy unit? (lowercase letter on viewMap) */
export function isEnemyUnit(c: string): boolean {
  return c >= "a" && c <= "z";
}

/** Is this character any city (own, enemy, or unowned)? */
export function isCity(c: string): boolean {
  return c === VM_OWN_CITY || c === VM_ENEMY_CITY || c === VM_UNOWNED_CITY;
}

/** Is this character a target city (enemy or unowned)? */
export function isTargetCity(c: string): boolean {
  return c === VM_ENEMY_CITY || c === VM_UNOWNED_CITY;
}

/** Is this character traversable land (land, any city)? */
export function isTraversableLand(c: string): boolean {
  return c === VM_LAND || c === VM_OWN_CITY || c === VM_ENEMY_CITY || c === VM_UNOWNED_CITY;
}

/** Is this a pickup marker on a load map? */
export function isPickupMarker(c: string): boolean {
  return c === VM_PICKUP_SINGLE || c === VM_PICKUP_CLUSTER;
}
