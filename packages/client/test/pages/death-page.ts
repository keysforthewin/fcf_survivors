import type { Page, Locator } from "@playwright/test";

export class DeathPage {
  constructor(private page: Page) {}

  get overlay(): Locator { return this.page.locator(".death-overlay"); }
  get header(): Locator { return this.page.locator(".death-card h1"); }
  get stats(): Locator { return this.page.locator(".death-stats"); }
  get leaderboard(): Locator { return this.page.locator(".leaderboard"); }
  get leaderboardRows(): Locator { return this.page.locator(".leaderboard-row"); }
  get diveAgain(): Locator { return this.page.locator("[data-dive]"); }
  get spectate(): Locator { return this.page.locator("[data-spectate]"); }
  get spectatorHud(): Locator { return this.page.locator(".spectator-hud"); }
  get spectatorDive(): Locator { return this.page.locator(".spectator-dive"); }
}
