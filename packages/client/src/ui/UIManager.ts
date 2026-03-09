// Empire Reborn — UI Manager
// Creates the HTML overlay and manages all UI panels.

import { injectStyles } from "./styles.js";
import { createHUD, type HUD } from "./hud.js";
import { createMinimap, type Minimap } from "./minimap.js";
import { createActionPanel, type ActionPanel } from "./actionPanel.js";
import { createCityPanel, type CityPanel } from "./cityPanel.js";
import { createEventLog, type EventLog } from "./eventLog.js";
import { createTurnFlow, type TurnFlow } from "./turnFlow.js";
import { createMenuScreens, type MenuScreens } from "./menuScreens.js";
import type { Camera } from "../core/camera.js";

export interface UIManager {
  readonly hud: HUD;
  readonly minimap: Minimap;
  readonly actionPanel: ActionPanel;
  readonly cityPanel: CityPanel;
  readonly eventLog: EventLog;
  readonly turnFlow: TurnFlow;
  readonly menus: MenuScreens;
}

export function createUIManager(camera: Camera): UIManager {
  injectStyles();

  // Create root overlay
  const root = document.createElement("div");
  root.id = "empire-ui";
  document.body.appendChild(root);

  // Create components
  const hud = createHUD();
  const minimap = createMinimap(camera);
  const actionPanel = createActionPanel();
  const cityPanel = createCityPanel();
  const eventLog = createEventLog(camera);
  const turnFlow = createTurnFlow();
  const menus = createMenuScreens();

  // Build sidebar
  const sidebar = document.createElement("div");
  sidebar.id = "sidebar-right";
  sidebar.appendChild(minimap.wrapper);
  sidebar.appendChild(actionPanel.element);

  // Assemble DOM
  root.appendChild(hud.topBar);
  root.appendChild(hud.bottomBar);
  root.appendChild(sidebar);
  root.appendChild(eventLog.element);
  root.appendChild(cityPanel.element);
  root.appendChild(menus.element);

  return {
    hud,
    minimap,
    actionPanel,
    cityPanel,
    eventLog,
    turnFlow,
    menus,
  };
}
