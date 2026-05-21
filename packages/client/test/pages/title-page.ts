import type { Page, Locator } from "@playwright/test";

export class TitlePage {
  constructor(private page: Page) {}

  get overlay(): Locator { return this.page.locator(".title-overlay"); }
  get nameInput(): Locator { return this.page.locator("#name-input"); }
  get diveInButton(): Locator { return this.page.locator(".title-card .play"); }
  swatch(color: string): Locator {
    return this.page.locator(`.color-swatch[data-color="${color}"]`);
  }
  get selectedSwatch(): Locator { return this.page.locator(".color-swatch.selected"); }
}
