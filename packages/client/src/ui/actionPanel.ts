// Empire Reborn — Action Panel
// Shows available actions based on selection state.

import {
  UNIT_ATTRIBUTES, Owner, UnitType, UnitBehavior,
  objMoves,
} from "@empire/shared";
import type { UnitState, GameState } from "@empire/shared";

export interface ActionPanel {
  readonly element: HTMLDivElement;
  update(
    selectedUnit: UnitState | null,
    selectedCityId: number | null,
    gameState: GameState,
    hasHighlights: boolean,
  ): void;
  /** Returns the action key if a panel button was clicked, or null. */
  consumeClick(): string | null;
}

export function createActionPanel(): ActionPanel {
  const element = document.createElement("div");
  element.id = "action-panel";

  let pendingClick: string | null = null;

  function btn(label: string, hotkey: string, action: string, disabled = false): string {
    const cls = disabled ? "action-btn disabled" : "action-btn";
    return `<button class="${cls}" data-action="${action}">` +
      `<span>${label}</span><span class="hotkey">${hotkey}</span></button>`;
  }

  element.addEventListener("pointerdown", (e) => {
    const target = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
    if (target && !target.classList.contains("disabled")) {
      e.preventDefault(); // prevent button from stealing keyboard focus
      pendingClick = target.dataset.action!;
    }
  });

  return {
    element,

    update(selectedUnit, selectedCityId, gameState, hasHighlights): void {
      if (!selectedUnit && selectedCityId === null) {
        element.innerHTML = `<div class="section-label">No selection</div>` +
          `<div style="color:#555;font-size:11px;margin-top:4px">Click a unit or city</div>`;
        return;
      }

      const parts: string[] = [];

      if (selectedUnit) {
        const u = selectedUnit;
        const attrs = UNIT_ATTRIBUTES[u.type];
        const movesLeft = attrs.speed - u.moved;
        const canMove = movesLeft > 0;

        if (hasHighlights) {
          parts.push(`<div class="section-label">Movement</div>`);
          parts.push(`<div style="color:#4c8;font-size:11px;margin-bottom:4px">` +
            `Click highlighted tiles to move/attack</div>`);
        } else if (!canMove) {
          parts.push(`<div style="color:#888;font-size:11px;margin-bottom:4px">` +
            `No moves remaining</div>`);
        }

        // Show current behavior if set
        if (u.func !== UnitBehavior.None) {
          const behaviorNames: Record<number, string> = {
            [UnitBehavior.Sentry]: "Sentry",
            [UnitBehavior.Explore]: "Exploring",
            [UnitBehavior.GoTo]: "Navigating",
            [UnitBehavior.Aggressive]: "Aggressive",
            [UnitBehavior.Cautious]: "Cautious",
            [UnitBehavior.WaitForTransport]: "Waiting",
          };
          const name = behaviorNames[u.func] ?? "Orders";
          parts.push(`<div style="color:#fa4;font-size:11px;margin-bottom:4px">` +
            `Mode: ${name}</div>`);
        }

        parts.push(`<div class="section-label">Orders</div>`);
        parts.push(btn("Skip Unit", "Space", "skip"));
        parts.push(btn("Sentry", "G", "sentry", !canMove));
        parts.push(btn("Explore", "F", "explore", !canMove));
        parts.push(btn("Aggressive", "A", "aggressive", !canMove));
        parts.push(btn("Cautious", "D", "cautious", !canMove));

        if (u.type === UnitType.Army) {
          parts.push(btn("Wait for Transport", "T", "wait-transport", !canMove));
        }

        if (u.shipId !== null) {
          parts.push(btn("Disembark", "U", "disembark"));
        }

        parts.push(`<div style="color:#555;font-size:10px;margin-top:2px">` +
          `Right-click tile to navigate</div>`);
      }

      if (selectedCityId !== null) {
        const city = gameState.cities.find((c) => c.id === selectedCityId);
        if (city && city.owner === Owner.Player1) {
          parts.push(`<div class="section-label">City</div>`);
          parts.push(btn("Change Production", "P", "open-city-panel"));
        }
      }

      // Turn actions (always shown)
      parts.push(`<div class="section-label" style="margin-top:auto">Turn</div>`);
      parts.push(btn("Next Unit", "N", "next-unit"));
      parts.push(`<button class="action-btn end-turn" data-action="end-turn">` +
        `<span>End Turn</span><span class="hotkey">Enter</span></button>`);

      element.innerHTML = parts.join("");
    },

    consumeClick(): string | null {
      const click = pendingClick;
      pendingClick = null;
      return click;
    },
  };
}
