// Empire Reborn — PixiJS Application Bootstrap

import { Application, Container } from "pixi.js";
import { COLORS } from "../constants.js";

export interface AppContext {
  app: Application;
  worldContainer: Container;
  uiContainer: Container;
  effectsContainer: Container;
}

/**
 * Initialize PixiJS with WebGPU preference, create the scene graph
 * with three layer containers:
 *   - worldContainer: tilemap + units (camera-transformed)
 *   - effectsContainer: particles (child of worldContainer, above units)
 *   - uiContainer: HUD elements (screen-space, not camera-transformed)
 */
export async function createApp(): Promise<AppContext> {
  const app = new Application();

  await app.init({
    background: COLORS.BG,
    resizeTo: window,
    preference: "webgpu",
    antialias: true,
  });

  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.appendChild(app.canvas);

  // Scene graph layers
  const worldContainer = new Container();
  worldContainer.sortableChildren = true;

  const effectsContainer = new Container();
  effectsContainer.zIndex = 100;

  worldContainer.addChild(effectsContainer);
  app.stage.addChild(worldContainer);

  const uiContainer = new Container();
  app.stage.addChild(uiContainer);

  return { app, worldContainer, uiContainer, effectsContainer };
}
