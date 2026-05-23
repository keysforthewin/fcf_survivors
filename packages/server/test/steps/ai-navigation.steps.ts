import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { ARENA } from "@fcf/shared";
import { TestWorld } from "../support/world.ts";
import { advanceTicks, tryFish } from "../support/world-factory.ts";

When(
  "{string} is moved to \\({float}, {float}\\)",
  function (this: TestWorld, name: string, x: number, y: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    if (!f) throw new Error(`No fish named ${name}`);
    f.x = x;
    f.y = y;
  }
);

When(
  "{string} is held at \\({float}, {float}\\) for {int} ticks",
  function (this: TestWorld, name: string, x: number, y: number, ticks: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    if (!f) throw new Error(`No fish named ${name}`);
    for (let i = 0; i < ticks; i++) {
      f.x = x;
      f.y = y;
      f.vx = 0;
      f.vy = 0;
      advanceTicks(sim, 1);
    }
  }
);

Then(
  "{string} has target {string}",
  function (this: TestWorld, name: string, targetName: string) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    assert.ok(f, `${name} missing`);
    assert.ok(f.aiState, `${name} is not an AI fish`);
    const expectedId = sim.byName.get(targetName);
    assert.ok(expectedId != null, `Target ${targetName} not registered`);
    assert.equal(
      f.aiState.targetId,
      expectedId,
      `Expected ${name} target=${targetName}(${expectedId}), got ${f.aiState.targetId}`
    );
  }
);

Then("{string} has no target", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = tryFish(sim, name);
  assert.ok(f, `${name} missing`);
  assert.ok(f.aiState, `${name} is not an AI fish`);
  assert.equal(f.aiState.targetId, null, `Expected ${name} target=null, got ${f.aiState.targetId}`);
});

Then(
  "{string} has blacklisted {string}",
  function (this: TestWorld, name: string, targetName: string) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    assert.ok(f, `${name} missing`);
    assert.ok(f.aiState, `${name} is not an AI fish`);
    const id = sim.byName.get(targetName);
    assert.ok(id != null, `Target ${targetName} not registered`);
    const bl = f.aiState.blacklist;
    assert.ok(bl, `${name} has no blacklist on aiState`);
    const expiry = bl.get(id);
    assert.ok(
      expiry != null && expiry > sim.clock.now(),
      `Expected ${name} blacklist[${targetName}=${id}] > now=${sim.clock.now()}, got ${expiry}`
    );
  }
);

Then(
  "{string} and {string} are more than {float} units apart",
  function (this: TestWorld, nameA: string, nameB: string, dist: number) {
    const sim = this.requireSim();
    const a = tryFish(sim, nameA);
    const b = tryFish(sim, nameB);
    assert.ok(a, `${nameA} missing`);
    assert.ok(b, `${nameB} missing`);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    assert.ok(d > dist, `Expected ${nameA}↔${nameB} > ${dist}, got ${d.toFixed(2)}`);
  }
);

Given(
  "{string} has wander heading {float}",
  function (this: TestWorld, name: string, heading: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    assert.ok(f, `${name} missing`);
    assert.ok(f.aiState, `${name} is not an AI fish`);
    f.aiState.wanderHeading = heading;
  }
);

Then(
  /^"([^"]+)" is at least ([\d.]+) units from the (left|right|top|bottom) wall$/,
  function (this: TestWorld, name: string, distStr: string, wall: string) {
    const dist = Number(distStr);
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    assert.ok(f, `${name} missing`);
    let d: number;
    switch (wall) {
      case "left":   d = f.x; break;
      case "right":  d = ARENA.width - f.x; break;
      case "top":    d = f.y; break;
      case "bottom": d = ARENA.height - f.y; break;
      default: throw new Error(`Unknown wall '${wall}' (expected left/right/top/bottom)`);
    }
    assert.ok(
      d >= dist,
      `Expected ${name} ≥${dist} from ${wall} wall, got ${d.toFixed(2)}`
    );
  }
);

Then(
  "{string} is at least {float} units from \\({float}, {float}\\)",
  function (this: TestWorld, name: string, dist: number, x: number, y: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    assert.ok(f, `${name} missing`);
    const d = Math.hypot(f.x - x, f.y - y);
    assert.ok(
      d >= dist,
      `Expected ${name} ≥${dist} units from (${x}, ${y}), got ${d.toFixed(2)}`
    );
  }
);
