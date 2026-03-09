// Empire Reborn — E2E Test Helpers

import { type Page, expect } from "@playwright/test";

/** Navigate to main menu and verify it loaded. */
export async function goToMainMenu(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#menu-screen h1")).toBeVisible({ timeout: 15_000 });
}

/** Start a single-player game and wait for HUD to appear. */
export async function startSinglePlayer(page: Page): Promise<void> {
  await goToMainMenu(page);
  await page.click('[data-menu="new-game"]');
  // Wait for menu to hide and HUD to show
  await expect(page.locator("#menu-screen")).toHaveClass(/hidden/, { timeout: 10_000 });
  await expect(page.locator("#hud-top")).toBeVisible({ timeout: 10_000 });
}

/** Click end turn and wait for the turn number to update. */
export async function endTurn(page: Page, expectedTurn: number): Promise<void> {
  await page.click('[data-action="end-turn"]');
  // The turn stat is the first .stat span in #hud-top
  await expect(page.locator("#hud-top .stat").first()).toHaveText(
    String(expectedTurn),
    { timeout: 10_000 },
  );
}

/** Get the current turn number from the HUD. */
export async function getCurrentTurn(page: Page): Promise<number> {
  const text = await page.locator("#hud-top .stat").first().textContent();
  return parseInt(text ?? "0", 10);
}

/** Collect uncaught page errors during a test. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}
