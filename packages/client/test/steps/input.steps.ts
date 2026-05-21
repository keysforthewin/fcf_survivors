import { Given, When, Then } from "../fixtures/test.ts";
import { expect } from "@playwright/test";

async function awaitInput(page: any): Promise<void> {
  // Inputs are sent at 20Hz (50ms). Wait a bit more than one tick.
  await page.waitForFunction(() => (window as any).__test?.lastInput !== null);
  await page.waitForTimeout(80);
}

When("I press and hold {string}", async ({ page }, key: string) => {
  await page.keyboard.down(key);
  await awaitInput(page);
});

When("I release {string}", async ({ page }, key: string) => {
  await page.keyboard.up(key);
  await page.waitForTimeout(80);
});

When("I tap {string}", async ({ page }, key: string) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(80);
  await page.keyboard.up(key);
});

When("the window loses focus", async ({ page }) => {
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(80);
});

Then(
  "the last input sent has vx {float} and vy {float}",
  async ({ page }, vx: number, vy: number) => {
    const inp = await page.evaluate(() => (window as any).__test.lastInput);
    expect(inp).not.toBeNull();
    expect(Math.abs(inp.vx - vx)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(inp.vy - vy)).toBeLessThanOrEqual(0.01);
  }
);

Then(
  "the last input sent has vx approximately {float} and vy approximately {float}",
  async ({ page }, vx: number, vy: number) => {
    const inp = await page.evaluate(() => (window as any).__test.lastInput);
    expect(inp).not.toBeNull();
    expect(Math.abs(inp.vx - vx)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(inp.vy - vy)).toBeLessThanOrEqual(0.05);
  }
);

Then("the last input sent has boost {string}", async ({ page }, b: string) => {
  const inp = await page.evaluate(() => (window as any).__test.lastInput);
  expect(inp).not.toBeNull();
  expect(inp.boost).toBe(b === "true");
});
