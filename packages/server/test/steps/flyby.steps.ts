import { Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { WEAPONS } from "@fcf/shared";
import type { WeaponId } from "@fcf/shared";
import { TestWorld } from "../support/world.ts";
import { getFish } from "../support/world-factory.ts";
import type { World } from "../../src/sim/world.ts";

/** Count the in-flight Alien Friends / Overlord UFO projectiles owned by a fish. */
function flybyShipCount(world: World, ownerId: number): number {
  let n = 0;
  for (const p of world.projectiles.values()) {
    if (p.ownerId === ownerId && WEAPONS[p.weaponId as WeaponId]?.kind === "flyby") n++;
  }
  return n;
}

Then(
  "{int} flyby ship(s) owned by {string} are in flight",
  function (this: TestWorld, expected: number, name: string) {
    const sim = this.requireSim();
    const f = getFish(sim, name);
    const n = flybyShipCount(sim.world, f.id);
    assert.equal(n, expected, `expected ${expected} flyby ship(s) in flight, got ${n}`);
  },
);

Then("the latest zap used weapon {string}", function (this: TestWorld, weaponId: string) {
  const sim = this.requireSim();
  const z = sim.world.zapEvents[sim.world.zapEvents.length - 1];
  assert.ok(z, "expected a zap event");
  assert.equal(z.weaponId, weaponId, `expected zap weapon ${weaponId}, got ${z.weaponId}`);
});

Then("the latest zap strikes {string}", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const z = sim.world.zapEvents[sim.world.zapEvents.length - 1];
  assert.ok(z, "expected a zap event");
  const f = getFish(sim, name);
  // nodes[0] is the firing source (the UFO); nodes[1..] are the struck fish.
  const struck = new Set(z.nodes.slice(1).map((n) => n.id));
  assert.ok(struck.has(f.id), `expected the laser to strike ${name}`);
});
