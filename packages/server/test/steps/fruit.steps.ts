import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { ARENA } from "@fcf/shared";
import { parseCardId, cardSubject } from "@fcf/shared";
import { TestWorld } from "../support/world.ts";
import { makeWorld, tryFish } from "../support/world-factory.ts";
import type { Fruit } from "../../src/sim/entity.ts";
import { rerollCard, banishCard } from "../../src/sim/levelup.ts";

Given("a world with fruit auto-spawn enabled", function (this: TestWorld) {
  this.sim = makeWorld({ seed: 1, autoSpawnPellets: true });
});

Given(
  "a {word} fruit at \\({float}, {float}\\)",
  function (this: TestWorld, reward: string, x: number, y: number) {
    const sim = this.requireSim();
    const id = sim.world.nextId();
    const fr: Fruit = { id, kind: "fruit", x, y, reward: reward as "reroll" | "banish" };
    sim.world.fruits.set(id, fr);
  }
);

Then("there are {int} fruit", function (this: TestWorld, expected: number) {
  const n = this.requireSim().world.fruits.size;
  assert.equal(n, expected, `Expected ${expected} fruit, got ${n}`);
});

Then("all fruit are inside the arena", function (this: TestWorld) {
  for (const fr of this.requireSim().world.fruits.values()) {
    assert.ok(fr.x >= 0 && fr.x <= ARENA.width, `fruit x=${fr.x} OOB`);
    assert.ok(fr.y >= 0 && fr.y <= ARENA.height, `fruit y=${fr.y} OOB`);
  }
});

/* -------- Tokens -------- */

Given(
  "{string} holds {int} re-roll token(s)",
  function (this: TestWorld, name: string, n: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    f.rerollsRemaining = n;
  }
);

Given(
  "{string} holds {int} banish token(s)",
  function (this: TestWorld, name: string, n: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    f.banishesRemaining = n;
  }
);

Then(
  "{string} has {int} re-roll token(s)",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.equal(f.rerollsRemaining, expected, `Expected ${expected} re-roll tokens, got ${f.rerollsRemaining}`);
  }
);

Then(
  "{string} has {int} banish token(s)",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.equal(f.banishesRemaining, expected, `Expected ${expected} banish tokens, got ${f.banishesRemaining}`);
  }
);

/* -------- Re-roll / banish actions -------- */

When("remember the first offered card of {string}", function (this: TestWorld, name: string) {
  const f = tryFish(this.requireSim(), name);
  assert.ok(f, `${name} missing`);
  const card = f.pendingLevelUp[0];
  assert.ok(card, `${name} has no offered cards to remember`);
  this.data.set("rememberedCard", card.id);
});

When("{string} re-rolls the first offered card", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = tryFish(sim, name);
  assert.ok(f, `${name} missing`);
  const card = f.pendingLevelUp[0];
  assert.ok(card, `${name} has no offered cards`);
  rerollCard(sim.world, f, card.id);
});

When("{string} banishes the first offered card", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = tryFish(sim, name);
  assert.ok(f, `${name} missing`);
  const card = f.pendingLevelUp[0];
  assert.ok(card, `${name} has no offered cards`);
  banishCard(sim.world, f, card.id);
});

Then(
  "the first offered card of {string} differs from remembered",
  function (this: TestWorld, name: string) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    const remembered = this.data.get("rememberedCard");
    const now = f.pendingLevelUp[0]?.id;
    assert.notEqual(now, remembered, `Expected first card to change from ${remembered}, still ${now}`);
  }
);

Then(
  "the first offered card of {string} matches remembered",
  function (this: TestWorld, name: string) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    const remembered = this.data.get("rememberedCard");
    const now = f.pendingLevelUp[0]?.id;
    assert.equal(now, remembered, `Expected first card unchanged (${remembered}), got ${now}`);
  }
);

Then(
  "{string} has banished subject {string}",
  function (this: TestWorld, name: string, subject: string) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.ok(
      f.banishedSubjects.has(subject),
      `Expected ${name} to have banished '${subject}'; has [${[...f.banishedSubjects].join(", ")}]`
    );
  }
);

Then(
  "{string} is offered {int} card(s)",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.equal(
      f.pendingLevelUp.length,
      expected,
      `Expected ${name} offered ${expected} cards; got [${f.pendingLevelUp.map((c) => c.id).join(", ")}]`
    );
  }
);

Then(
  "{string} is not offered a card for weapon {string}",
  function (this: TestWorld, name: string, weaponId: string) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    const subject = `weapon:${weaponId}`;
    const offending = f.pendingLevelUp.filter((c) => {
      const p = parseCardId(c.id);
      return p && cardSubject(p) === subject;
    });
    assert.equal(
      offending.length, 0,
      `Expected no card for weapon ${weaponId}; got [${offending.map((c) => c.id).join(", ")}]`
    );
  }
);
