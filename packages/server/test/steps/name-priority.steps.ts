import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { TestWorld } from "../support/world.ts";
import { addFish } from "./world.steps.ts";
import { spawnAiFish, AI_NAMES } from "../../src/sim/ai.ts";
import type { Fish } from "../../src/sim/entity.ts";

/** Live AI fish in the world (after any renames). */
function aiFish(self: TestWorld): Fish[] {
  return [...self.requireSim().world.fish.values()].filter((f) => f.isAi);
}

Given("an NPC named {string}", function (this: TestWorld, name: string) {
  addFish(this.requireSim(), { name, x: 4000, y: 4000, mass: 10, isAi: true });
});

Given("a human named {string}", function (this: TestWorld, name: string) {
  addFish(this.requireSim(), { name, x: 4200, y: 4000, mass: 10, isAi: false });
});

Given("humans hold every NPC name", function (this: TestWorld) {
  const sim = this.requireSim();
  for (const name of AI_NAMES) {
    addFish(sim, { name, x: 100, y: 100, mass: 10, isAi: false });
  }
});

Given("an NPC for every name in the pool", function (this: TestWorld) {
  const sim = this.requireSim();
  for (const name of AI_NAMES) {
    addFish(sim, { name, x: 100, y: 100, mass: 10, isAi: true });
  }
});

When("a human claims the name {string}", function (this: TestWorld, name: string) {
  const renamed = this.requireSim().world.claimHumanName(name);
  this.data.set("renamed", renamed);
});

When("the world spawns {int} AI fish", function (this: TestWorld, count: number) {
  const sim = this.requireSim();
  for (let i = 0; i < count; i++) {
    const ai = spawnAiFish(sim.world);
    sim.world.fish.set(ai.id, ai);
  }
});

Then("no AI fish is named {string}", function (this: TestWorld, name: string) {
  const offender = aiFish(this).find((f) => f.name === name);
  assert.equal(offender, undefined, `expected no AI fish named ${name}`);
});

Then("an AI fish is named {string}", function (this: TestWorld, name: string) {
  assert.ok(aiFish(this).some((f) => f.name === name), `expected an AI fish named ${name}`);
});

Then("a human fish is named {string}", function (this: TestWorld, name: string) {
  const humans = [...this.requireSim().world.fish.values()].filter((f) => !f.isAi);
  assert.ok(humans.some((f) => f.name === name), `expected a human fish named ${name}`);
});

Then("all AI fish have distinct names", function (this: TestWorld) {
  const names = aiFish(this).map((f) => f.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  assert.equal(dupes.length, 0, `AI fish share names: ${[...new Set(dupes)].join(", ")}`);
});

Then("the renamed NPCs all have distinct names", function (this: TestWorld) {
  const renamed = this.data.get("renamed") as number[];
  const world = this.requireSim().world;
  const names = renamed.map((id) => world.fish.get(id)!.name);
  assert.equal(new Set(names).size, names.length, `renamed NPCs share a name: ${names.join(", ")}`);
});

Then("the renamed NPC has a fallback-suffixed name", function (this: TestWorld) {
  const renamed = this.data.get("renamed") as number[];
  assert.equal(renamed.length, 1, "expected exactly one renamed NPC");
  const fish = this.requireSim().world.fish.get(renamed[0]!)!;
  assert.match(fish.name, /-\d+$/, `expected a "-N" fallback suffix, got ${fish.name}`);
});
