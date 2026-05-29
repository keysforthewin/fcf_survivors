import { Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { TestWorld } from "../support/world.ts";
import { tryFish } from "../support/world-factory.ts";

// Assert the fish's steering direction (targetVx/targetVy — the unit vector updateAi commits to
// before the engine integrates velocity) points at a world point. dot > 0.7 ⇒ within ~45°, which
// is enough to distinguish "rushing the ball" from "wandering elsewhere".
Then(
  "{string} is steering toward \\({float}, {float}\\)",
  function (this: TestWorld, name: string, x: number, y: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    assert.ok(f, `${name} missing`);
    const tlen = Math.hypot(x - f.x, y - f.y) || 1;
    const slen = Math.hypot(f.targetVx, f.targetVy) || 1;
    const dot = ((x - f.x) / tlen) * (f.targetVx / slen) + ((y - f.y) / tlen) * (f.targetVy / slen);
    assert.ok(
      dot > 0.7,
      `Expected ${name} steering toward (${x}, ${y}) (dot>0.7), got dot=${dot.toFixed(3)} ` +
        `[pos=(${f.x.toFixed(0)},${f.y.toFixed(0)}) steer=(${f.targetVx.toFixed(2)},${f.targetVy.toFixed(2)})]`
    );
  }
);
