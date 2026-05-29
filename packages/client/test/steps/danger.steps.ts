import { When, Then } from "../fixtures/test.ts";
import { expect, type Page } from "@playwright/test";

When(
  "the server sends a snapshot with my mass {int} and fish:",
  async ({ page }, mass: number, table: { rawTable: string[][] }) => {
    const header = table.rawTable[0]!;
    const iId = header.indexOf("id");
    const iName = header.indexOf("name");
    const iMass = header.indexOf("mass");
    const entities = table.rawTable.slice(1).map((r, idx) => ({
      id: Number(r[iId]!),
      kind: "fish",
      x: 4150,
      y: 4000 + idx * 80,
      mass: Number(r[iMass]!),
      name: r[iName]!,
    }));
    await page.evaluate(
      (args: { mass: number; entities: unknown[] }) => {
        (window as any).__test.snapshot({ you: { mass: args.mass }, entities: args.entities });
      },
      { mass, entities },
    );
  },
);

/** Current nameplate text for the fish with the given name (undefined if not rendered yet). */
function labelFor(page: Page, name: string): Promise<string | undefined> {
  return page.evaluate((n: string) => {
    const plates = (window as any).__nameplates?.() ?? [];
    return plates.find((p: { name: string }) => p.name === n)?.label as string | undefined;
  }, name);
}

Then(
  "the nameplate for {string} shows a danger marker",
  async ({ page }, name: string) => {
    await expect.poll(() => labelFor(page, name), { timeout: 4000 }).toContain("💀");
  },
);

Then(
  "the nameplate for {string} has no danger marker",
  async ({ page }, name: string) => {
    // Poll until the fish is rendered and its label is exactly the bare name (no 💀 prefix).
    await expect.poll(() => labelFor(page, name), { timeout: 4000 }).toBe(name);
  },
);
