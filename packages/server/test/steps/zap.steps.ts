import { Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { TestWorld } from "../support/world.ts";
import { getFish } from "../support/world-factory.ts";
import type { ZapEventRecord } from "../../src/sim/entity.ts";
import type { World } from "../../src/sim/world.ts";

// In tests we drive the sim via world.step (not the index.ts tick loop), so zapEvents
// accumulate rather than being cleared each tick. Single-tick scenarios assert the last one.
function latestZap(world: World): ZapEventRecord | undefined {
  return world.zapEvents[world.zapEvents.length - 1];
}

Then("a zap event was emitted by {string}", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = getFish(sim, name);
  const z = latestZap(sim.world);
  assert.ok(z, "expected a zap event");
  assert.equal(z.nodes[0]!.id, f.id, "zap origin (nodes[0]) should be the firing fish");
});

Then("no zap event was emitted", function (this: TestWorld) {
  const sim = this.requireSim();
  assert.equal(sim.world.zapEvents.length, 0, "expected no zap events");
});

Then("the zap is a chain", function (this: TestWorld) {
  const z = latestZap(this.requireSim().world);
  assert.ok(z, "expected a zap event");
  assert.ok(z.chain, "expected a chain zap");
});

Then("the zap is not a chain", function (this: TestWorld) {
  const z = latestZap(this.requireSim().world);
  assert.ok(z, "expected a zap event");
  assert.ok(!z.chain, "expected a radial (non-chain) zap");
});

Then("the zap strikes {string} and {string}", function (this: TestWorld, a: string, b: string) {
  const sim = this.requireSim();
  const z = latestZap(sim.world);
  assert.ok(z, "expected a zap event");
  const struck = new Set(z.nodes.slice(1).map((n) => n.id));
  assert.equal(struck.size, 2, `expected 2 struck fish, got ${struck.size}`);
  assert.ok(struck.has(getFish(sim, a).id), `${a} should be struck`);
  assert.ok(struck.has(getFish(sim, b).id), `${b} should be struck`);
});

Then(
  "the zap path is {string} then {string} then {string}",
  function (this: TestWorld, a: string, b: string, c: string) {
    const sim = this.requireSim();
    const z = latestZap(sim.world);
    assert.ok(z, "expected a zap event");
    const ids = z.nodes.map((n) => n.id);
    assert.deepEqual(ids, [getFish(sim, a).id, getFish(sim, b).id, getFish(sim, c).id]);
  },
);
