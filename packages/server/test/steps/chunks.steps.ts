import { Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { ARENA } from "@fcf/shared";
import { TestWorld } from "../support/world.ts";

Then(
  "the chunk speed has decayed below {float}",
  function (this: TestWorld, threshold: number) {
    const chunks = [...this.requireSim().world.chunks.values()];
    assert.ok(chunks.length > 0, "no chunks in world");
    const slowEnough = chunks.every((c) => Math.hypot(c.vx, c.vy) < threshold);
    assert.ok(
      slowEnough,
      `Some chunks still fast: ${chunks.map((c) => Math.hypot(c.vx, c.vy).toFixed(1)).join(", ")}`
    );
  }
);

Then(
  "all chunks are within the arena bounds",
  function (this: TestWorld) {
    const chunks = [...this.requireSim().world.chunks.values()];
    assert.ok(chunks.length > 0, "no chunks in world to check");
    for (const c of chunks) {
      assert.ok(
        c.x >= 0 && c.x <= ARENA.width && c.y >= 0 && c.y <= ARENA.height,
        `Chunk escaped arena at (${c.x.toFixed(1)}, ${c.y.toFixed(1)})`
      );
    }
  }
);

Then(
  "the total chunk mass is between {float} and {float}",
  function (this: TestWorld, lo: number, hi: number) {
    let total = 0;
    for (const c of this.requireSim().world.chunks.values()) total += c.mass;
    assert.ok(total >= lo && total <= hi, `Total chunk mass ${total.toFixed(2)} not in [${lo}, ${hi}]`);
  }
);
