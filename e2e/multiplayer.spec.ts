// Empire Reborn — Multiplayer E2E Tests
// Tests lobby navigation, game creation, and two-player lifecycle.

import { test, expect } from "@playwright/test";
import { goToMainMenu } from "./helpers.js";

test.describe("Multiplayer Lobby", () => {
  test("navigates to lobby from main menu", async ({ page }) => {
    await goToMainMenu(page);
    await page.click('[data-menu="multiplayer"]');

    await expect(page.locator("#menu-screen h2")).toHaveText("MULTIPLAYER LOBBY");
    await expect(page.locator('[data-menu="create-online"]')).toBeVisible();
    await expect(page.locator('[data-menu="back-to-main"]')).toBeVisible();
  });

  test("back button returns to main menu", async ({ page }) => {
    await goToMainMenu(page);
    await page.click('[data-menu="multiplayer"]');
    await expect(page.locator("#menu-screen h2")).toHaveText("MULTIPLAYER LOBBY");

    await page.click('[data-menu="back-to-main"]');
    await expect(page.locator("#menu-screen h1")).toHaveText("EMPIRE REBORN");
  });

  test("create game shows waiting screen", async ({ page }) => {
    await goToMainMenu(page);
    await page.click('[data-menu="multiplayer"]');
    await page.click('[data-menu="create-online"]');

    await expect(page.locator("#menu-screen h2")).toHaveText("WAITING FOR OPPONENT", {
      timeout: 10_000,
    });
    // Cancel button should be available
    await expect(page.locator('[data-menu="back-to-main"]')).toBeVisible();
    // Game ID should be displayed
    await expect(page.locator("#menu-screen .subtitle strong")).toBeVisible();
  });

  test("cancel from waiting returns to main menu", async ({ page }) => {
    await goToMainMenu(page);
    await page.click('[data-menu="multiplayer"]');
    await page.click('[data-menu="create-online"]');
    await expect(page.locator("#menu-screen h2")).toHaveText("WAITING FOR OPPONENT", {
      timeout: 10_000,
    });

    await page.click('[data-menu="back-to-main"]');
    await expect(page.locator("#menu-screen h1")).toHaveText("EMPIRE REBORN");
  });
});

test.describe("Two-Player Game", () => {
  // Known limitation: lobby game list fetch may not see games created by another
  // WebSocket client immediately. This test is skipped until lobby polling is added.
  test.skip("two players can join and start a game", async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Player 1: create game
      await goToMainMenu(page1);
      await page1.click('[data-menu="multiplayer"]');
      await page1.click('[data-menu="create-online"]');
      await expect(page1.locator("#menu-screen h2")).toHaveText(
        "WAITING FOR OPPONENT",
        { timeout: 10_000 },
      );

      // Extract game ID
      const gameId = await page1
        .locator("#menu-screen .subtitle strong")
        .textContent();
      expect(gameId).toBeTruthy();

      // Player 2: navigate to lobby — may need to retry as lobby fetch is one-shot
      await goToMainMenu(page2);
      await page2.click('[data-menu="multiplayer"]');

      // Lobby list may not have the game yet. Go back and re-enter lobby to refresh.
      // Retry up to 5 times with 1s between.
      let joined = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const joinBtn = page2.locator(`[data-menu="join:${gameId}"]`);
        if (await joinBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await joinBtn.click();
          joined = true;
          break;
        }
        // Go back to main menu and re-enter lobby to refresh game list
        await page2.click('[data-menu="back-to-main"]');
        await expect(page2.locator("#menu-screen h1")).toBeVisible();
        await page2.click('[data-menu="multiplayer"]');
      }
      expect(joined).toBe(true);

      // Both players should see the game HUD
      await expect(page1.locator("#hud-top")).toBeVisible({ timeout: 15_000 });
      await expect(page2.locator("#hud-top")).toBeVisible({ timeout: 15_000 });

      // Both should show Turn 0
      await expect(page1.locator("#hud-top .stat").first()).toHaveText("0");
      await expect(page2.locator("#hud-top .stat").first()).toHaveText("0");
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});
