// Empire Reborn — Debug Panel
// Testing tools: reveal map, AI omniscience, player auto-play, diagnostic logging.

import { setAIDebugLog, setAIVerboseLog } from "@empire/shared";

export interface DebugFlags {
  revealMap: boolean;
  aiOmniscient: boolean;
  playerAI: boolean;
  diagLog: boolean;
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
    playerAI: true,
    diagLog: true,
  };

  // Enable AI logging immediately since diagLog defaults to on
  setAIDebugLog(true);
  setAIVerboseLog(true);

  function render(): void {
    element.innerHTML =
      `<div class="debug-title">Debug</div>` +
      toggle("Reveal Map", "revealMap", flags.revealMap) +
      toggle("AI Omni", "aiOmniscient", flags.aiOmniscient) +
      toggle("Auto-Play", "playerAI", flags.playerAI) +
      toggle("Diag Log", "diagLog", flags.diagLog);
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
    // Diag Log controls AI logging — when on, captures AI decisions into the diagnostic
    if (key === "diagLog") {
      setAIDebugLog(flags.diagLog);
      setAIVerboseLog(flags.diagLog);
    }
    render();
  });

  render();

  return { element, flags };
}
