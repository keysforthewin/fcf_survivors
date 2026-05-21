import { Then } from "../fixtures/test.ts";
import { expect } from "@playwright/test";
import { ArenaPage } from "../pages/arena-page.ts";

Then("the HUD is visible", async ({ page }) => {
  await expect(new ArenaPage(page).hud).toBeVisible();
});

Then("the HUD shows mass {int}", async ({ page }, mass: number) => {
  await expect(new ArenaPage(page).mass).toHaveText(String(mass));
});

Then("the HUD shows level {int}", async ({ page }, level: number) => {
  await expect(new ArenaPage(page).level).toHaveText(String(level));
});

Then(
  "the XP bar is at approximately {int}%",
  async ({ page }, pct: number) => {
    const arena = new ArenaPage(page);
    // The fill width is set via inline style. Read it directly.
    const widthPct = await arena.xpBar.evaluate((el: HTMLElement) => {
      const style = el.style.width;
      return parseFloat(style.replace("%", ""));
    });
    expect(widthPct).toBeGreaterThanOrEqual(pct - 1);
    expect(widthPct).toBeLessThanOrEqual(pct + 1);
  }
);

Then("the boost indicator is ready", async ({ page }) => {
  const arena = new ArenaPage(page);
  await expect(arena.boost).toHaveText("BOOST [Space]");
  await expect(arena.boost).toHaveClass(/ready/);
});

Then(
  "the boost indicator reports approximately {int} seconds cooldown",
  async ({ page }, sec: number) => {
    const arena = new ArenaPage(page);
    // HUD repaints per rAF; wait until the cooldown text appears.
    await expect(arena.boost).toContainText("BOOST in", { timeout: 2000 });
    const txt = await arena.boost.textContent();
    const m = txt!.match(/BOOST in (\d+\.\d)s/);
    expect(m).not.toBeNull();
    const reported = Number(m![1]);
    expect(Math.abs(reported - sec)).toBeLessThanOrEqual(0.5);
  }
);
