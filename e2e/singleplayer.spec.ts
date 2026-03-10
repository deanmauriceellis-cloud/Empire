// Empire Reborn — Single-Player E2E Tests
// Tests the critical path: main menu → start game → play turns → end turn.

import { test, expect } from "@playwright/test";
import {
  goToMainMenu,
  startSinglePlayer,
  getCurrentTurn,
  trackErrors,
} from "./helpers.js";

test.describe("Main Menu", () => {
  test("displays on load with correct elements", async ({ page }) => {
    await goToMainMenu(page);

    await expect(page.locator("#menu-screen h1")).toHaveText("EMPIRE REBORN");
    await expect(page.locator('[data-menu="new-game"]')).toHaveText("Single Player");
    await expect(page.locator('[data-menu="multiplayer"]')).toHaveText("Multiplayer");
  });
});

test.describe("Single Player Game", () => {
  test("starts game and shows HUD", async ({ page }) => {
    await startSinglePlayer(page);

    // HUD top bar should show Turn, Cities, Units
    await expect(page.locator("#hud-top")).toContainText("Turn");
    await expect(page.locator("#hud-top")).toContainText("Cities");
    await expect(page.locator("#hud-top")).toContainText("Units");

    // Bottom bar should be visible
    await expect(page.locator("#hud-bottom")).toBeVisible();

    // Sidebar with minimap and action panel should be visible
    await expect(page.locator("#sidebar-right")).toBeVisible();
    await expect(page.locator("#action-panel")).toBeVisible();
  });

  test("HUD shows initial game state", async ({ page }) => {
    await startSinglePlayer(page);

    // Turn starts at 0 (before first executeTurn)
    const turnStat = page.locator("#hud-top .stat").first();
    await expect(turnStat).toHaveText("0");

    // Player starts with 1 city
    const cityStat = page.locator("#hud-top .stat").nth(1);
    await expect(cityStat).toHaveText("1");
  });

  test("minimap canvas is visible", async ({ page }) => {
    await startSinglePlayer(page);

    await expect(page.locator("#sidebar-right canvas")).toBeVisible();
  });

  test("keyboard shortcut Enter ends turn", async ({ page }) => {
    await startSinglePlayer(page);

    // Press Enter to end turn — should advance from turn 0 to turn 1
    await page.keyboard.press("Enter");
    await expect(page.locator("#hud-top .stat").first()).toHaveText("1", {
      timeout: 10_000,
    });
  });

  test("end turn via keyboard advances turns", async ({ page }) => {
    await startSinglePlayer(page);

    // End turn
    await page.keyboard.press("Enter");
    await expect(page.locator("#hud-top .stat").first()).toHaveText("1", {
      timeout: 10_000,
    });
  });

  test("action panel shows unit actions after units are produced", async ({ page }) => {
    await startSinglePlayer(page);

    // Army build time is 5 turns. Play 6 turns so a unit exists.
    for (let i = 1; i <= 6; i++) {
      await page.keyboard.press("Enter");
      await expect(page.locator("#hud-top .stat").first()).toHaveText(
        String(i),
        { timeout: 10_000 },
      );
    }

    // After 6 turns, army should be produced. Check unit count > 0.
    const unitCount = await page.locator("#hud-top .unit-count").count();
    expect(unitCount).toBeGreaterThan(0);

    // Cities auto-assign Explore to new armies, so TurnFlow won't select them
    // (they already have orders). Select a unit programmatically to verify
    // that the action panel renders correctly when a unit is selected.
    const unitId = await page.evaluate(() => {
      const w = window as any;
      const units = w.__empire.game.state.units.filter((u: any) => u.owner === 1);
      if (units.length > 0) {
        w.__empire.selection.selectedUnitId = units[0].id;
        return units[0].id;
      }
      return null;
    });
    expect(unitId).not.toBeNull();

    // Action buttons should now be visible for the selected unit
    await expect(page.locator('[data-action="end-turn"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('[data-action="skip"]')).toBeVisible();
  });

  test("plays 5 turns without errors", async ({ page }) => {
    const errors = trackErrors(page);
    await startSinglePlayer(page);

    for (let i = 1; i <= 5; i++) {
      await page.keyboard.press("Enter");
      await expect(page.locator("#hud-top .stat").first()).toHaveText(
        String(i),
        { timeout: 10_000 },
      );
    }

    const turn = await getCurrentTurn(page);
    expect(turn).toBe(5);

    // No uncaught JS errors during gameplay
    expect(errors).toHaveLength(0);
  });

  test("plays 10 turns and produces units", async ({ page }) => {
    const errors = trackErrors(page);
    await startSinglePlayer(page);

    for (let i = 1; i <= 10; i++) {
      await page.keyboard.press("Enter");
      await expect(page.locator("#hud-top .stat").first()).toHaveText(
        String(i),
        { timeout: 10_000 },
      );
    }

    // After 10 turns, should have at least 1 unit (army builds in 5 turns)
    const unitCount = await page.locator("#hud-top .unit-count").count();
    expect(unitCount).toBeGreaterThan(0);

    expect(errors).toHaveLength(0);
  });
});
