import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { TestWorld } from "../support/world.ts";
import { tryFish } from "../support/world-factory.ts";
import { discardWeapon, discardPassive } from "../../src/sim/discard.ts";
import type { PassiveId, WeaponId } from "@fcf/shared";

Given(
  "{string} has passive {string} at stack {int}",
  function (this: TestWorld, name: string, passive: string, stack: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    f.passives.set(passive as PassiveId, stack);
  },
);

When(
  "{string} discards weapon {string}",
  function (this: TestWorld, name: string, weaponId: string) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    assert.ok(f, `${name} missing`);
    discardWeapon(sim.world, f, weaponId as WeaponId);
  },
);

When(
  "{string} discards passive {string}",
  function (this: TestWorld, name: string, passiveId: string) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    assert.ok(f, `${name} missing`);
    discardPassive(sim.world, f, passiveId as PassiveId);
  },
);

Then(
  "{string} has {int} weapon slot(s)",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.equal(f.weapons.length, expected, `Expected ${expected} weapons, got ${f.weapons.length}`);
  },
);

Then(
  "{string} has {int} passive slot(s)",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.equal(f.passives.size, expected, `Expected ${expected} passives, got ${f.passives.size}`);
  },
);

Then(
  "{string} has no pending level-up modal",
  function (this: TestWorld, name: string) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.equal(
      f.pendingLevelUp.length,
      0,
      `Expected no pending cards, got ${f.pendingLevelUp.length}`,
    );
  },
);

Then(
  "{string}'s pending cards do not add a new weapon",
  function (this: TestWorld, name: string) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    const adds = f.pendingLevelUp.filter((c) => c.kind === "weapon");
    assert.equal(
      adds.length,
      0,
      `Expected no new-weapon cards, got [${adds.map((c) => c.id).join(", ")}]`,
    );
  },
);

Then(
  "{string}'s pending cards do not stack a new passive",
  function (this: TestWorld, name: string) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    const newOnes = f.pendingLevelUp.filter((c) => {
      if (c.kind !== "passive") return false;
      // card id form: "passive:<id>:stack:<n>"
      const parts = c.id.split(":");
      const passiveId = parts[1];
      return passiveId !== undefined && !f.passives.has(passiveId as PassiveId);
    });
    assert.equal(
      newOnes.length,
      0,
      `Expected no new-passive cards, got [${newOnes.map((c) => c.id).join(", ")}]`,
    );
  },
);

Then(
  "{string} has mass between {float} and {float}",
  function (this: TestWorld, name: string, lo: number, hi: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.ok(
      f.mass >= lo && f.mass <= hi,
      `Expected ${name} mass in [${lo}, ${hi}], got ${f.mass.toFixed(3)}`,
    );
  },
);
