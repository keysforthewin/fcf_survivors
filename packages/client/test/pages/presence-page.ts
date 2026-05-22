import type { Page, Locator } from "@playwright/test";

export class PresencePage {
  constructor(private page: Page) {}

  get toasts(): Locator { return this.page.locator(".toast"); }
  get roster(): Locator { return this.page.locator(".roster"); }
  get rosterRows(): Locator { return this.page.locator(".roster-row"); }
  rosterRow(n: number): Locator { return this.page.locator(`.roster-row:nth-child(${n})`); }
  get rosterSelfRow(): Locator { return this.page.locator(".roster-row.is-me"); }
}
