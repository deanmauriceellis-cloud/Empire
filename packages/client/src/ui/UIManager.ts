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
import { createDebugPanel, type DebugPanel } from "./debugPanel.js";
import { createWarStats, type WarStats } from "./warStats.js";
import { createUnitInfoPanel, type UnitInfoPanel } from "./unitInfoPanel.js";
import { createEconomyReview, type EconomyReview } from "./economyReview.js";
import type { Camera } from "../core/camera.js";

export interface UIManager {
  readonly hud: HUD;
  readonly minimap: Minimap;
  readonly actionPanel: ActionPanel;
  readonly cityPanel: CityPanel;
  readonly eventLog: EventLog;
  readonly turnFlow: TurnFlow;
  readonly menus: MenuScreens;
  readonly debug: DebugPanel;
  readonly warStats: WarStats;
  readonly unitInfo: UnitInfoPanel;
  readonly economyReview: EconomyReview;
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
  const debug = createDebugPanel();
  const warStats = createWarStats(camera);
  const unitInfo = createUnitInfoPanel();
  const economyReview = createEconomyReview();

  // Wire war stats button into HUD top bar
  hud.setWarStatsButton(warStats.button);

  // Build sidebar
  const sidebar = document.createElement("div");
  sidebar.id = "sidebar-right";
  sidebar.appendChild(minimap.wrapper);
  sidebar.appendChild(unitInfo.element);
  sidebar.appendChild(actionPanel.element);
  sidebar.appendChild(debug.element);

  // Assemble DOM
  root.appendChild(hud.topBar);
  root.appendChild(hud.bottomBar);
  root.appendChild(sidebar);
  root.appendChild(eventLog.element);
  root.appendChild(cityPanel.element);
  root.appendChild(warStats.element);
  root.appendChild(economyReview.element);
  root.appendChild(menus.element);

  return {
    hud,
    minimap,
    actionPanel,
    cityPanel,
    eventLog,
    turnFlow,
    menus,
    debug,
    warStats,
    unitInfo,
    economyReview,
  };
}
