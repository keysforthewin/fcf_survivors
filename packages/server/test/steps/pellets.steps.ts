import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { ARENA, PELLET } from "@fcf/shared";
import { TestWorld } from "../support/world.ts";
import { makeWorld, advanceTicks } from "../support/world-factory.ts";

Given("a world with pellet auto-spawn enabled", function (this: TestWorld) {
  this.sim = makeWorld({ seed: 1, autoSpawnPellets: true });
});

Given("a world with pellet auto-spawn enabled but no humans connected", function (this: TestWorld) {
  this.sim = makeWorld({ seed: 1, autoSpawnPellets: true, humansPresent: false });
});

Then(
  "the pellet count is approaching the target",
  function (this: TestWorld) {
    const n = this.requireSim().world.pellets.size;
    assert.ok(n > 0, `Expected pellets to spawn, got ${n}`);
    assert.ok(n <= PELLET.targetCount, `Pellet count ${n} exceeds target ${PELLET.targetCount}`);
  }
);

Then(
  "the pellet count grew by at most {int}",
  function (this: TestWorld, max: number) {
    const n = this.requireSim().world.pellets.size;
    assert.ok(n <= max, `Expected ≤${max} new pellets per tick, got ${n}`);
  }
);

Then("all pellets are inside the arena", function (this: TestWorld) {
  for (const p of this.requireSim().world.pellets.values()) {
    assert.ok(p.x >= 0 && p.x <= ARENA.width, `pellet x=${p.x} OOB`);
    assert.ok(p.y >= 0 && p.y <= ARENA.height, `pellet y=${p.y} OOB`);
  }
});
