import { When, Then } from "../fixtures/test.ts";
import { expect } from "@playwright/test";
import { DeathPage } from "../pages/death-page.ts";

When("I click SPECTATE", async ({ page }) => {
  const death = new DeathPage(page);
  await death.spectate.click();
});

When("I click DIVE AGAIN", async ({ page }) => {
  const death = new DeathPage(page);
  await death.diveAgain.click();
});

When("I click DIVE AGAIN from spectator", async ({ page }) => {
  const death = new DeathPage(page);
  await death.spectatorDive.click();
});

Then("the death overlay is translucent", async ({ page }) => {
  const overlay = page.locator(".death-overlay-translucent");
  await expect(overlay).toBeVisible();
});

Then("the death screen offers a SPECTATE button", async ({ page }) => {
  await expect(new DeathPage(page).spectate).toBeVisible();
});

Then("the death screen offers a DIVE AGAIN button", async ({ page }) => {
  await expect(new DeathPage(page).diveAgain).toBeVisible();
});

Then("the death overlay is dismissed", async ({ page }) => {
  await expect(new DeathPage(page).overlay).toHaveCount(0);
});

Then("the spectator HUD is visible", async ({ page }) => {
  await expect(new DeathPage(page).spectatorHud).toBeVisible();
});

Then("a spectate message is sent to the server", async ({ page }) => {
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const sent = (window as any).__test.sent as Array<{ t: string }>;
      return sent.some((m) => m.t === "spectate");
    });
  }).toBe(true);
});

Then("a respawn message is sent to the server", async ({ page }) => {
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const sent = (window as any).__test.sent as Array<{ t: string }>;
      return sent.some((m) => m.t === "respawn");
    });
  }).toBe(true);
});
