// Empire Reborn — Performance Benchmark E2E Tests
// Measures load times, game start speed, and turn processing throughput.

import { test, expect } from "@playwright/test";
import { goToMainMenu, startSinglePlayer, trackErrors } from "./helpers.js";

test.describe("Performance Benchmarks", () => {
  test("game loads within 5 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");
    await expect(page.locator("#menu-screen h1")).toBeVisible({ timeout: 5_000 });
    const elapsed = Date.now() - start;

    console.log(`  Menu load time: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5_000);
  });

  test("single-player game starts within 5 seconds", async ({ page }) => {
    await goToMainMenu(page);

    const start = Date.now();
    await page.click('[data-menu="new-game"]');
    await expect(page.locator("#hud-top")).toBeVisible({ timeout: 5_000 });
    const elapsed = Date.now() - start;

    console.log(`  Game start time: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5_000);
  });

  test("end turn completes within 5 seconds", async ({ page }) => {
    await startSinglePlayer(page);

    const start = Date.now();
    await page.keyboard.press("Enter");
    await expect(page.locator("#hud-top .stat").first()).toHaveText("1", {
      timeout: 5_000,
    });
    const elapsed = Date.now() - start;

    console.log(`  End turn time: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5_000);
  });

  test("10-turn stress test completes within 60 seconds", async ({ page }) => {
    const errors = trackErrors(page);
    await startSinglePlayer(page);

    const start = Date.now();
    for (let turn = 1; turn <= 10; turn++) {
      await page.keyboard.press("Enter");
      await expect(page.locator("#hud-top .stat").first()).toHaveText(
        String(turn),
        { timeout: 10_000 },
      );
    }
    const elapsed = Date.now() - start;

    console.log(`  10-turn stress test: ${elapsed}ms (avg ${Math.round(elapsed / 10)}ms/turn)`);
    expect(elapsed).toBeLessThan(60_000);
    expect(errors).toHaveLength(0);
  });
});
