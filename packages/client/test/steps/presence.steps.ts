import { When, Then } from "../fixtures/test.ts";
import { expect } from "@playwright/test";
import { PresencePage } from "../pages/presence-page.ts";

When(
  "the server sends a playerJoined for {string}",
  async ({ page }, name: string) => {
    await page.evaluate((n: string) => {
      (window as any).__test.playerJoined(n);
    }, name);
  }
);

When(
  "the server sends a playerDied for {string} eaten by {string}",
  async ({ page }, name: string, byName: string) => {
    await page.evaluate(
      ([n, by]: string[]) => {
        (window as any).__test.playerDied(n, by);
      },
      [name, byName]
    );
  }
);

When(
  "the server sends a roster with entries:",
  async ({ page }, table: { rawTable: string[][] }) => {
    const header = table.rawTable[0]!;
    const iName = header.indexOf("name");
    const iColor = header.indexOf("color");
    const iMass = header.indexOf("mass");
    const iLevel = header.indexOf("level");
    const iMe = header.indexOf("isMe");
    const rows = table.rawTable.slice(1).map((r) => ({
      name: r[iName]!,
      color: r[iColor] ?? "#7fcfff",
      mass: Number(r[iMass]!),
      level: Number(r[iLevel] ?? "1"),
      isMe: (r[iMe] ?? "false").toLowerCase() === "true",
    }));
    await page.evaluate((players: any[]) => {
      (window as any).__test.roster(players);
    }, rows);
  }
);

Then(
  "a toast containing {string} is visible",
  async ({ page }, text: string) => {
    const presence = new PresencePage(page);
    await expect(presence.toasts.filter({ hasText: text }).first()).toBeVisible();
  }
);

Then("the roster shows {int} rows", async ({ page }, n: number) => {
  await expect(new PresencePage(page).rosterRows).toHaveCount(n);
});

Then(
  "the roster's row {int} shows {string}",
  async ({ page }, n: number, name: string) => {
    const presence = new PresencePage(page);
    await expect(presence.rosterRow(n)).toContainText(name);
  }
);

Then(
  "the roster's self row shows {string}",
  async ({ page }, name: string) => {
    const presence = new PresencePage(page);
    await expect(presence.rosterSelfRow).toContainText(name);
  }
);
