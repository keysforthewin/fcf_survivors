import { Given, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { WEAPONS } from "@fcf/shared";
import type { WeaponId } from "@fcf/shared";
import { TestWorld } from "../support/world.ts";
import { getFish } from "../support/world-factory.ts";
import type { World } from "../../src/sim/world.ts";

// Spawn a free-flying car (piercing vehicle body) with an explicit position + velocity, so AI
// car-avoidance can be tested without a player firing the weapon (the random crossing direction
// makes a player-fired car hard to aim at a fish). ownerId -1 has no owning fish, so the car
// steers AI but applies no damage (applyProjectileDamage skips a missing owner) — keeps the dodge
// test isolated. weaponId "nitros" registers it as kind "vehicle"; pierce flags it as a car.
Given(
  "a car at \\({float}, {float}\\) moving \\({float}, {float}\\)",
  function (this: TestWorld, x: number, y: number, vx: number, vy: number) {
    const sim = this.requireSim();
    const lifetimeMs = 7600;
    sim.world.spawnProjectile({
      ownerId: -1,
      weaponId: "nitros",
      x,
      y,
      vx,
      vy,
      damage: 1,
      radius: 240,
      expiresAt: sim.clock.now() + lifetimeMs,
      behavior: "linear",
      pierce: true,
      reHitMs: lifetimeMs,
    });
  },
);

/** Count in-flight vehicle bodies (cars) owned by a fish. */
function vehicleCount(world: World, ownerId: number): number {
  let n = 0;
  for (const p of world.projectiles.values()) {
    if (p.ownerId === ownerId && WEAPONS[p.weaponId as WeaponId]?.kind === "vehicle") n++;
  }
  return n;
}

Then(
  "{int} vehicle bodies owned by {string} are in flight",
  function (this: TestWorld, expected: number, name: string) {
    const sim = this.requireSim();
    const f = getFish(sim, name);
    assert.equal(vehicleCount(sim.world, f.id), expected, `expected ${expected} vehicle bodies`);
  },
);

Then("{string} has aura slow applied", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = getFish(sim, name);
  assert.ok((f.auraSlowMult ?? 1) < 1, `expected ${name} to have an aura slow, got auraSlowMult=${f.auraSlowMult}`);
});

Then("{string} has no aura slow", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = getFish(sim, name);
  assert.equal(f.auraSlowMult ?? 1, 1, `expected ${name} to have no aura slow, got auraSlowMult=${f.auraSlowMult}`);
});
