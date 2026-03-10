// Empire Reborn — Debug Panel
// Testing tools: reveal map, AI omniscience, player auto-play, AI logging.

import { setAIDebugLog } from "@empire/shared";

export interface DebugFlags {
  revealMap: boolean;
  aiOmniscient: boolean;
  playerAI: boolean;
  aiLog: boolean;
}

export interface DebugPanel {
  readonly element: HTMLDivElement;
  readonly flags: DebugFlags;
}

export function createDebugPanel(): DebugPanel {
  const element = document.createElement("div");
  element.id = "debug-panel";

  const flags: DebugFlags = {
    revealMap: false,
    aiOmniscient: false,
    playerAI: false,
    aiLog: false,
  };

  function render(): void {
    element.innerHTML =
      `<div class="debug-title">Debug</div>` +
      toggle("Reveal Map", "revealMap", flags.revealMap) +
      toggle("AI Omni", "aiOmniscient", flags.aiOmniscient) +
      toggle("Auto-Play", "playerAI", flags.playerAI) +
      toggle("AI Log", "aiLog", flags.aiLog);
  }

  function toggle(label: string, key: string, on: boolean): string {
    const cls = on ? "debug-toggle on" : "debug-toggle";
    return `<button class="${cls}" data-debug="${key}"><span>${label}</span><span class="debug-state">${on ? "ON" : "OFF"}</span></button>`;
  }

  element.addEventListener("pointerdown", (e) => {
    const target = (e.target as HTMLElement).closest("[data-debug]") as HTMLElement | null;
    if (!target) return;
    e.preventDefault();
    const key = target.dataset.debug as keyof DebugFlags;
    flags[key] = !flags[key];
    if (key === "aiLog") {
      setAIDebugLog(flags.aiLog);
    }
    render();
  });

  render();

  return { element, flags };
}
