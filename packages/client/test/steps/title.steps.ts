import { When, Then } from "../fixtures/test.ts";
import { expect } from "@playwright/test";
import { TitlePage } from "../pages/title-page.ts";

Then("I see the title overlay", async ({ page }) => {
  const title = new TitlePage(page);
  await expect(title.overlay).toBeVisible();
  await expect(title.nameInput).toBeVisible();
  await expect(title.diveInButton).toContainText("DIVE IN");
});

Then("the first color swatch is selected by default", async ({ page }) => {
  const title = new TitlePage(page);
  await expect(title.selectedSwatch).toHaveCount(1);
  // The default palette[0] is #ffd97f per scenes/title.ts.
  await expect(title.selectedSwatch).toHaveAttribute("data-color", "#ffd97f");
});

When("I type {string} into the name input", async ({ page }, name: string) => {
  await new TitlePage(page).nameInput.fill(name);
});

When("I leave the name input empty", async () => {
  // No-op: input starts empty in a fresh page.
});

When("I click the {string} color swatch", async ({ page }, color: string) => {
  await new TitlePage(page).swatch(color).click();
});

When("I press Enter in the name input", async ({ page }) => {
  await new TitlePage(page).nameInput.press("Enter");
});

When("I click DIVE IN", async ({ page }) => {
  await new TitlePage(page).diveInButton.click();
});

Then(
  "the {string} swatch is selected",
  async ({ page }, color: string) => {
    const title = new TitlePage(page);
    await expect(title.swatch(color)).toHaveClass(/selected/);
  }
);

Then("the title overlay is gone", async ({ page }) => {
  await expect(new TitlePage(page).overlay).toHaveCount(0);
});

Then(
  "the hello message sent to the server has name {string}",
  async ({ page }, expected: string) => {
    // Wait a beat for the post-click sequence to fire the hello over WS.
    await page.waitForFunction(() => (window as any).__test?.lastHello !== null);
    const hello = await page.evaluate(() => (window as any).__test.lastHello);
    expect(hello.name).toBe(expected);
  }
);

Then(
  "the hello message sent to the server has color {string}",
  async ({ page }, expected: string) => {
    await page.waitForFunction(() => (window as any).__test?.lastHello !== null);
    const hello = await page.evaluate(() => (window as any).__test.lastHello);
    expect(hello.color).toBe(expected);
  }
);
