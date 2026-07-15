import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { TestWorld } from "../support/world.ts";
import { startTestServer } from "../support/server-harness.ts";

Given(
  "the server is running with an idle grace of {int} ticks",
  { timeout: 10_000 },
  async function (this: TestWorld, graceTicks: number) {
    this.server = await startTestServer({ idleGraceTicks: graceTicks });
  }
);

When("{int}ms passes", async function (this: TestWorld, ms: number) {
  await new Promise((r) => setTimeout(r, ms));
});

Then(
  "the world tick counter is frozen for {int}ms",
  { timeout: 5_000 },
  async function (this: TestWorld, ms: number) {
    const world = this.requireServer().running.world;
    const before = world.tick;
    await new Promise((r) => setTimeout(r, ms));
    assert.equal(
      world.tick,
      before,
      `Expected tick loop to be paused, but tick advanced ${before} → ${world.tick}`
    );
  }
);

Then(
  "the world tick counter advances within {int}ms",
  { timeout: 5_000 },
  async function (this: TestWorld, ms: number) {
    const world = this.requireServer().running.world;
    const before = world.tick;
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (world.tick > before) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.fail(`Expected tick counter to advance within ${ms}ms (stuck at ${before})`);
  }
);
