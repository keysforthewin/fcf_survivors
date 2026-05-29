import { Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { WEAPONS } from "@fcf/shared";
import type { WeaponId } from "@fcf/shared";
import { TestWorld } from "../support/world.ts";
import { getFish } from "../support/world-factory.ts";
import type { World } from "../../src/sim/world.ts";

/** Count in-flight heli BODY projectiles owned by a fish (excludes its bullets). */
function heliBodyCount(world: World, ownerId: number): number {
  let n = 0;
  for (const p of world.projectiles.values()) {
    if (p.ownerId === ownerId && WEAPONS[p.weaponId as WeaponId]?.kind === "heli" && p.isBody) n++;
  }
  return n;
}

Then(
  "{int} heli bodies owned by {string} are in flight",
  function (this: TestWorld, expected: number, name: string) {
    const sim = this.requireSim();
    const f = getFish(sim, name);
    assert.equal(heliBodyCount(sim.world, f.id), expected, `expected ${expected} heli bodies`);
  },
);
