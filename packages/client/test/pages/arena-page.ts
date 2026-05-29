import type { Page, Locator } from "@playwright/test";

export class ArenaPage {
  constructor(private page: Page) {}

  get hud(): Locator { return this.page.locator(".hud"); }
  get mass(): Locator { return this.page.locator("[data-mass]"); }
  get level(): Locator { return this.page.locator("[data-level]"); }
  get xpBar(): Locator { return this.page.locator("[data-xp]"); }
  get boost(): Locator { return this.page.locator("[data-boost]"); }
  get canvas(): Locator { return this.page.locator("#game-root canvas"); }
}
