// Empire Reborn — Action Collector
// Accumulates player actions during a turn. Actions are applied immediately
// to game state for visual feedback, then tracked for end-of-turn processing.

import {
  type SinglePlayerGame,
  type PlayerAction,
  type TurnResult,
  type TurnEvent,
  Owner,
  Direction,
  UnitType,
  UnitBehavior,
  DIR_OFFSET,
  findUnit,
  goodLoc,
  objMoves,
  processAction,
  scan,
} from "@empire/shared";
import type { Loc } from "@empire/shared";

export interface ActionCollector {
  readonly actions: ReadonlyArray<PlayerAction>;
  readonly turnEvents: ReadonlyArray<TurnEvent>;
  readonly movedUnitIds: ReadonlySet<number>;

  /** Try to move a unit in the given direction. Returns true if action was valid. */
  moveUnit(unitId: number, direction: Direction): boolean;

  /** Try to attack a target location. Returns true if valid. */
  attackTarget(unitId: number, targetLoc: Loc): boolean;

  /** Set city production. */
  setProduction(cityId: number, unitType: UnitType): void;

  /** Set unit behavior. */
  setBehavior(unitId: number, behavior: UnitBehavior): void;

  /** Set unit navigation target (GoTo). */
  setTarget(unitId: number, targetLoc: Loc): void;

  /** End the turn: submit to game, run AI, tick production. Returns turn result. */
  endTurn(): TurnResult;

  /** Reset for a new turn. */
  reset(): void;
}

export function createActionCollector(game: SinglePlayerGame): ActionCollector {
  let actions: PlayerAction[] = [];
  let turnEvents: TurnEvent[] = [];
  let movedUnitIds = new Set<number>();

  function applyAction(action: PlayerAction): TurnEvent[] {
    const events = processAction(game.state, action, Owner.Player1);
    // Update vision after moves
    if (action.type === "move") {
      const unit = findUnit(game.state, action.unitId);
      if (unit) {
        scan(game.state, Owner.Player1, unit.loc);
      }
    }
    return events;
  }

  return {
    get actions() { return actions; },
    get turnEvents() { return turnEvents; },
    get movedUnitIds() { return movedUnitIds; },

    moveUnit(unitId: number, direction: Direction): boolean {
      const unit = findUnit(game.state, unitId);
      if (!unit || unit.owner !== Owner.Player1) return false;
      if (unit.moved >= objMoves(unit)) return false;

      const targetLoc = unit.loc + DIR_OFFSET[direction];

      // Check if there's an enemy at targetLoc — if so, attack instead
      const enemyAtTarget = game.state.units.find(
        (u) => u.loc === targetLoc && u.owner !== Owner.Player1 && u.shipId === null,
      );
      if (enemyAtTarget) {
        return this.attackTarget(unitId, targetLoc);
      }

      // Check if there's an enemy city at targetLoc
      const cell = game.state.map[targetLoc];
      if (cell && cell.cityId !== null) {
        const city = game.state.cities[cell.cityId];
        if (city.owner !== Owner.Player1 && city.owner !== Owner.Unowned) {
          return this.attackTarget(unitId, targetLoc);
        }
        // Unowned city — army can attack/capture
        if (city.owner === Owner.Unowned && unit.type === UnitType.Army) {
          return this.attackTarget(unitId, targetLoc);
        }
      }

      if (!goodLoc(game.state, unit, targetLoc)) return false;

      const action: PlayerAction = { type: "move", unitId, loc: targetLoc };
      actions.push(action);
      const events = applyAction(action);
      turnEvents.push(...events);
      movedUnitIds.add(unitId);
      return true;
    },

    attackTarget(unitId: number, targetLoc: Loc): boolean {
      const unit = findUnit(game.state, unitId);
      if (!unit || unit.owner !== Owner.Player1) return false;

      const action: PlayerAction = { type: "attack", unitId, targetLoc };
      actions.push(action);
      const events = applyAction(action);
      turnEvents.push(...events);
      movedUnitIds.add(unitId);
      return true;
    },

    setProduction(cityId: number, unitType: UnitType): void {
      const action: PlayerAction = { type: "setProduction", cityId, unitType };
      actions.push(action);
      applyAction(action);
    },

    setBehavior(unitId: number, behavior: UnitBehavior): void {
      const action: PlayerAction = { type: "setBehavior", unitId, behavior };
      actions.push(action);
      applyAction(action);
    },

    setTarget(unitId: number, targetLoc: Loc): void {
      const action: PlayerAction = { type: "setTarget", unitId, targetLoc };
      actions.push(action);
      applyAction(action);
    },

    endTurn(): TurnResult {
      // Actions already applied to state. Now submit empty player actions
      // and let submitTurn handle AI + production + repair + turn advance.
      // We pass the original actions so executeTurn can track movedUnits for repair.
      const result = game.submitTurn(actions);
      turnEvents.push(...result.events);
      return result;
    },

    reset(): void {
      actions = [];
      turnEvents = [];
      movedUnitIds = new Set();
    },
  };
}
