import type { Page, Locator } from "@playwright/test";

export class TitlePage {
  constructor(private page: Page) {}

  get overlay(): Locator { return this.page.locator(".title-overlay"); }
  get nameInput(): Locator { return this.page.locator("#name-input"); }
  get diveInButton(): Locator { return this.page.locator(".title-card .play"); }
  speciesTile(id: string): Locator {
    return this.page.locator(`.species-tile[data-species="${id}"]`);
  }
  get selectedTile(): Locator { return this.page.locator(".species-tile.selected"); }
}
