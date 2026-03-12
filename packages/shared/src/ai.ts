// Empire Reborn — AI System (Orchestrator)
// Coordinates AI turn execution: scan → production → movement → idle assignment → surrender check
// Delegates to AIPlanner for incremental computation (Phase 18)

import type {
  Owner,
} from "./constants.js";
import type {
  GameState,
  PlayerAction,
} from "./types.js";
import { createAIPlanner } from "./ai-planner.js";

// ─── Re-exports ──────────────────────────────────────────────────────────────────
// Preserve the public API — consumers import from ai.ts

export {
  setAIDebugLog,
  setAIVerboseLog,
  startAILogCapture,
  stopAILogCapture,
  aiDebugLog,
  aiVerboseLog,
} from "./ai-helpers.js";

export { createAIPlanner } from "./ai-planner.js";
export type { AIPlanner } from "./ai-planner.js";

// ─── AI Turn Orchestrator ────────────────────────────────────────────────────────

/**
 * Compute all AI actions for a turn (synchronous convenience wrapper).
 * Internally uses the incremental AIPlanner but drains all steps at once.
 * For spreading AI work across frames/intervals, use createAIPlanner() directly.
 */
export function computeAITurn(
  state: GameState,
  aiOwner: Owner,
): PlayerAction[] {
  const planner = createAIPlanner(state, aiOwner);
  while (planner.step()) { /* drain all steps */ }
  return planner.getActions();
}
