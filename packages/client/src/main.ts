import { Application, Graphics, Text } from "pixi.js";
import { GAME_VERSION } from "@empire/shared";

const app = new Application();

async function init() {
  await app.init({
    background: "#1a1a2e",
    resizeTo: window,
    preference: "webgpu",
  });

  document.body.appendChild(app.canvas);

  // Render a colored rectangle as proof-of-life
  const rect = new Graphics();
  rect.rect(0, 0, 300, 200);
  rect.fill({ color: 0x16213e });
  rect.stroke({ width: 2, color: 0x0f3460 });
  rect.x = (app.screen.width - 300) / 2;
  rect.y = (app.screen.height - 200) / 2;
  app.stage.addChild(rect);

  // Version label
  const label = new Text({
    text: `Empire Reborn v${GAME_VERSION}`,
    style: {
      fontFamily: "monospace",
      fontSize: 24,
      fill: 0xe94560,
      align: "center",
    },
  });
  label.anchor.set(0.5);
  label.x = app.screen.width / 2;
  label.y = app.screen.height / 2;
  app.stage.addChild(label);

  console.log(`Empire Reborn v${GAME_VERSION} — PixiJS initialized`);
}

init();
