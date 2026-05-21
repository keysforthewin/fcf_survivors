import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { TestWorld } from "../support/world.ts";
import { tryFish } from "../support/world-factory.ts";
import { processLevelUps } from "../../src/sim/world.ts";
import { xpForLevel } from "@fcf/shared";

When("level-ups are processed", function (this: TestWorld) {
  processLevelUps(this.requireSim().world);
});

Given(
  "{string} has accumulated {int} XP",
  function (this: TestWorld, name: string, xp: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    f.xp = xp;
  }
);

Then("{string} has level {int}", function (this: TestWorld, name: string, lvl: number) {
  const f = tryFish(this.requireSim(), name);
  assert.ok(f, `${name} missing`);
  assert.equal(f.level, lvl, `Expected ${name} level=${lvl}, got ${f.level}`);
});

Then(
  "{string} has max HP {int}",
  function (this: TestWorld, name: string, hp: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.equal(f.maxHp, hp);
  }
);

Then(
  "the XP threshold for level {int} is {int}",
  function (_lvl: number, expected: number) {
    // Sanity check on the level curve so balance tweaks are intentional.
    assert.equal(xpForLevel(_lvl), expected);
  }
);
