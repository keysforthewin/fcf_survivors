import { Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { WEAPONS, parseCardId } from "@fcf/shared";
import type { WeaponId } from "@fcf/shared";
import { TestWorld } from "../support/world.ts";
import { getFish } from "../support/world-factory.ts";
import type { World } from "../../src/sim/world.ts";
import { getMoveSpeed, getEffectiveMoveSpeed } from "../../src/sim/passives.ts";

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

Then("{string} is slowed", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = getFish(sim, name);
  assert.ok((f.slowUntil ?? 0) > sim.clock.now(), `expected ${name} to be slowed`);
});

Then("{string} is not slowed", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = getFish(sim, name);
  assert.ok((f.slowUntil ?? 0) <= sim.clock.now(), `expected ${name} not slowed`);
});

Then("{string} effective move speed is halved", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = getFish(sim, name);
  const eff = getEffectiveMoveSpeed(f, sim.clock.now());
  const base = getMoveSpeed(f);
  assert.ok(Math.abs(eff - base * 0.5) < 1e-6, `expected halved speed, got ${eff} vs base ${base}`);
});

Then(
  "{string} is not offered an evolution for {string}",
  function (this: TestWorld, name: string, baseId: string) {
    const sim = this.requireSim();
    const f = getFish(sim, name);
    const found = f.pendingLevelUp.some((c) => {
      const parsed = parseCardId(c.id);
      return parsed?.kind === "evolution" && parsed.baseId === baseId;
    });
    assert.ok(!found, `expected ${name} NOT offered an evolution for ${baseId}`);
  },
);
