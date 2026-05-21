import { Given, When, Then, installMockWebSocket } from "../fixtures/test.ts";
import { expect } from "@playwright/test";
import { TitlePage } from "../pages/title-page.ts";
import { ArenaPage } from "../pages/arena-page.ts";

Given("the WebSocket is mocked", async ({ page }) => {
  await installMockWebSocket(page);
});

Given("I open the title screen", async ({ page }) => {
  await page.goto("/");
  await expect(new TitlePage(page).overlay).toBeVisible();
});

When("I dive in as {string}", async ({ page }, name: string) => {
  const title = new TitlePage(page);
  await title.nameInput.fill(name);
  await title.diveInButton.click();
  // Wait for the title overlay to detach and the HUD to mount.
  await expect(title.overlay).toHaveCount(0);
  await expect(new ArenaPage(page).hud).toBeVisible();
});

When("the server sends a welcome", async ({ page }) => {
  await page.evaluate(() => (window as any).__test.welcome());
});

When(
  "the server sends a snapshot with mass {int}",
  async ({ page }, mass: number) => {
    await page.evaluate((m: number) => {
      (window as any).__test.snapshot({ you: { mass: m } });
    }, mass);
  }
);

When(
  "the server sends a snapshot with mass {int} and level {int} and xp {int} of {int}",
  async ({ page }, mass: number, level: number, xp: number, next: number) => {
    await page.evaluate(
      ([m, l, x, n]: number[]) => {
        (window as any).__test.snapshot({
          you: { mass: m, level: l, xp: x, nextLevelXp: n },
        });
      },
      [mass, level, xp, next]
    );
  }
);

When(
  "the server sends a snapshot with boost ready in {int} seconds",
  async ({ page }, sec: number) => {
    await page.evaluate((s: number) => {
      const now = Date.now();
      (window as any).__test.snapshot({
        you: { serverNow: now, boostReadyAt: now + s * 1000 },
      });
    }, sec);
  }
);

When(
  "the server sends a snapshot with boost ready",
  async ({ page }) => {
    await page.evaluate(() => {
      const now = Date.now();
      (window as any).__test.snapshot({
        you: { serverNow: now, boostReadyAt: now - 1 },
      });
    });
  }
);

When(
  "the server sends an eaten message from {string}",
  async ({ page }, killer: string) => {
    await page.evaluate((name: string) => {
      (window as any).__test.eaten({ byName: name });
    }, killer);
  }
);

When(
  "the server sends an eaten message",
  async ({ page }) => {
    await page.evaluate(() => (window as any).__test.eaten());
  }
);

When(
  "the server sends a leaderboard with entries:",
  async ({ page }, table: { rawTable: string[][] }) => {
    const header = table.rawTable[0]!;
    const iName = header.indexOf("name");
    const iColor = header.indexOf("color");
    const iMass = header.indexOf("finalMass");
    const iLevel = header.indexOf("level");
    const rows = table.rawTable.slice(1).map((r) => ({
      name: r[iName]!,
      color: r[iColor] ?? "#7fcfff",
      finalMass: Number(r[iMass]!),
      level: Number(r[iLevel] ?? "1"),
      endedAt: Date.now(),
    }));
    await page.evaluate((top: any[]) => {
      (window as any).__test.leaderboard(top);
    }, rows);
  }
);
