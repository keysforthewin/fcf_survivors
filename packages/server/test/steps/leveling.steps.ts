import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { TestWorld } from "../support/world.ts";
import { tryFish } from "../support/world-factory.ts";
import { applyCard, processLevelUps } from "../../src/sim/levelup.ts";
import { parseCardId, xpForLevel } from "@fcf/shared";

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
  "the XP threshold for level {int} is {int}",
  function (_lvl: number, expected: number) {
    // Sanity check on the level curve so balance tweaks are intentional.
    assert.equal(xpForLevel(_lvl), expected);
  }
);

Then("{string} has a pending level-up modal", function (this: TestWorld, name: string) {
  const f = tryFish(this.requireSim(), name);
  assert.ok(f, `${name} missing`);
  assert.ok(
    f.pendingLevelUp.length > 0,
    `Expected ${name} to have a pending level-up modal, got ${f.pendingLevelUp.length} cards`
  );
});

Then("{string} is not in dismissed state", function (this: TestWorld, name: string) {
  const f = tryFish(this.requireSim(), name);
  assert.ok(f, `${name} missing`);
  assert.equal(f.levelUpDismissed, false, `Expected ${name}.levelUpDismissed=false`);
});

Then("{string} is in dismissed state", function (this: TestWorld, name: string) {
  const f = tryFish(this.requireSim(), name);
  assert.ok(f, `${name} missing`);
  assert.equal(f.levelUpDismissed, true, `Expected ${name}.levelUpDismissed=true`);
});

Then(
  "{string} has {int} queued picks",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.equal(
      f.queuedLevelUps, expected,
      `Expected ${name}.queuedLevelUps=${expected}, got ${f.queuedLevelUps}`
    );
  }
);

Then(
  "{string} has at least {int} queued picks",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.ok(
      f.queuedLevelUps >= expected,
      `Expected ${name}.queuedLevelUps>=${expected}, got ${f.queuedLevelUps}`
    );
  }
);

Then(
  "{string} has at least level {int}",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.ok(f.level >= expected, `Expected ${name} level>=${expected}, got ${f.level}`);
  }
);

When("{string} dismisses the level-up modal", function (this: TestWorld, name: string) {
  const f = tryFish(this.requireSim(), name);
  assert.ok(f, `${name} missing`);
  assert.ok(f.pendingLevelUp.length > 0, `${name} has no pending modal to dismiss`);
  f.levelUpDismissed = true;
});

When("{string} restores the level-up modal", function (this: TestWorld, name: string) {
  const f = tryFish(this.requireSim(), name);
  assert.ok(f, `${name} missing`);
  f.levelUpDismissed = false;
});

When("{string} picks the first offered card", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = tryFish(sim, name);
  assert.ok(f, `${name} missing`);
  const card = f.pendingLevelUp[0];
  assert.ok(card, `${name} has no offered cards`);
  const parsed = parseCardId(card.id);
  assert.ok(parsed, `failed to parse cardId ${card.id}`);
  const ok = applyCard(sim.world, f, card.id, parsed);
  assert.ok(ok, `applyCard(${card.id}) failed`);
});

Then(
  "{string} is offered an evolution for {string}",
  function (this: TestWorld, name: string, baseId: string) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    const found = f.pendingLevelUp.some((c) => {
      const parsed = parseCardId(c.id);
      return parsed?.kind === "evolution" && parsed.baseId === baseId;
    });
    assert.ok(
      found,
      `Expected ${name} offered evolution for ${baseId}; got [${f.pendingLevelUp
        .map((c) => c.id)
        .join(", ")}]`
    );
  }
);

Then("{string} is offered no duplicate cards", function (this: TestWorld, name: string) {
  const f = tryFish(this.requireSim(), name);
  assert.ok(f, `${name} missing`);
  const ids = f.pendingLevelUp.map((c) => c.id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    `Expected unique cards; got [${ids.join(", ")}]`
  );
});
