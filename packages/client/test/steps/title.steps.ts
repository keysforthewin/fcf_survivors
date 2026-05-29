import { When, Then } from "../fixtures/test.ts";
import { expect } from "@playwright/test";
import { TitlePage } from "../pages/title-page.ts";

Then("I see the title overlay", async ({ page }) => {
  const title = new TitlePage(page);
  await expect(title.overlay).toBeVisible();
  await expect(title.nameInput).toBeVisible();
  await expect(title.goDeepButton).toContainText("GO DEEP");
});

Then("the default species is selected", async ({ page }) => {
  const title = new TitlePage(page);
  await expect(title.selectedTile).toHaveCount(1);
  // DEFAULT_SPECIES_ID is "clownfish" per shared/species.ts.
  await expect(title.selectedTile).toHaveAttribute("data-species", "clownfish");
});

When("I type {string} into the name input", async ({ page }, name: string) => {
  await new TitlePage(page).nameInput.fill(name);
});

When("I leave the name input empty", async () => {
  // No-op: input starts empty in a fresh page.
});

When("I click the {string} species", async ({ page }, id: string) => {
  await new TitlePage(page).speciesTile(id).click();
});

When("I press Enter in the name input", async ({ page }) => {
  await new TitlePage(page).nameInput.press("Enter");
});

When("I click GO DEEP", async ({ page }) => {
  await new TitlePage(page).goDeepButton.click();
});

Then(
  "the {string} species is selected",
  async ({ page }, id: string) => {
    const title = new TitlePage(page);
    await expect(title.speciesTile(id)).toHaveClass(/selected/);
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

Then(
  "the hello message sent to the server has species {string}",
  async ({ page }, expected: string) => {
    await page.waitForFunction(() => (window as any).__test?.lastHello !== null);
    const hello = await page.evaluate(() => (window as any).__test.lastHello);
    expect(hello.species).toBe(expected);
  }
);
