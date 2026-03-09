// Empire Reborn — Event Log

import type { TurnEvent, Loc } from "@empire/shared";
import { locRow, locCol } from "@empire/shared";
import type { Camera } from "../core/camera.js";

export interface EventLog {
  readonly element: HTMLDivElement;
  /** Add events from a turn result. */
  addEvents(events: TurnEvent[]): void;
  /** Clear all events. */
  clear(): void;
}

export function createEventLog(camera: Camera): EventLog {
  const element = document.createElement("div");
  element.id = "event-log";

  const MAX_EVENTS = 30;
  let eventCount = 0;

  return {
    element,

    addEvents(events: TurnEvent[]): void {
      for (const event of events) {
        const div = document.createElement("div");
        div.className = `event ${event.type}`;

        const col = locCol(event.loc);
        const row = locRow(event.loc);
        div.textContent = event.description;
        div.title = `(${col}, ${row})`;

        div.addEventListener("click", () => {
          camera.panToTile(col, row);
        });

        element.appendChild(div);
        eventCount++;
      }

      // Trim old events
      while (eventCount > MAX_EVENTS && element.firstChild) {
        element.removeChild(element.firstChild);
        eventCount--;
      }

      // Auto-scroll
      element.scrollTop = element.scrollHeight;
    },

    clear(): void {
      element.innerHTML = "";
      eventCount = 0;
    },
  };
}
