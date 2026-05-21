import { Then } from "../fixtures/test.ts";
import { expect } from "@playwright/test";
import { DeathPage } from "../pages/death-page.ts";

Then(
  "the death screen reports being eaten by {string}",
  async ({ page }, name: string) => {
    const death = new DeathPage(page);
    await expect(death.overlay).toBeVisible();
    await expect(death.header).toContainText(name);
  }
);

Then(
  "the death screen shows final mass {int}",
  async ({ page }, mass: number) => {
    const death = new DeathPage(page);
    await expect(death.stats).toContainText(String(mass));
  }
);

Then(
  "the death screen shows {int} leaderboard rows",
  async ({ page }, n: number) => {
    const death = new DeathPage(page);
    await expect(death.leaderboardRows).toHaveCount(n);
  }
);

Then(
  "the leaderboard's top row shows {string}",
  async ({ page }, name: string) => {
    const death = new DeathPage(page);
    await expect(death.leaderboardRows.first()).toContainText(name);
  }
);
