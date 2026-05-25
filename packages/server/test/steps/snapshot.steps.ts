import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { TestWorld } from "../support/world.ts";
import { tryFish } from "../support/world-factory.ts";
import { buildSnapshot, ClientView } from "../../src/net/snapshot.ts";
import type { SnapshotMsg } from "@fcf/shared";
import { viewRadius } from "@fcf/shared";

function snapKey(t: TestWorld, observer: string): string {
  return `snapshot:${observer}`;
}
function viewKey(t: TestWorld, observer: string): string {
  return `view:${observer}`;
}

function getOrMakeView(t: TestWorld, observer: string): ClientView {
  const key = viewKey(t, observer);
  let v = t.data.get(key) as ClientView | undefined;
  if (!v) {
    v = new ClientView();
    t.data.set(key, v);
  }
  return v;
}

When("{string} builds a snapshot", function (this: TestWorld, observer: string) {
  const sim = this.requireSim();
  const self = tryFish(sim, observer);
  assert.ok(self, `${observer} missing`);
  const view = getOrMakeView(this, observer);
  // Mirror the production tick loop: snapshots query the spatial hashes for interest
  // culling, so they must reflect current entity positions. Scenarios that set up
  // fish/pellets without advancing the world never populate the hashes otherwise.
  sim.world.rebuildSpatialHashes();
  const snap = buildSnapshot(sim.world, self, view, sim.clock.now());
  this.data.set(snapKey(this, observer), snap);
});

Then(
  "{string}'s snapshot includes {string}",
  function (this: TestWorld, observer: string, target: string) {
    const sim = this.requireSim();
    const tid = sim.byName.get(target);
    assert.ok(tid, `${target} not registered`);
    const snap = this.data.get(snapKey(this, observer)) as SnapshotMsg | undefined;
    assert.ok(snap, "Build a snapshot first");
    const hit = snap.entities.find((e) => e.id === tid);
    assert.ok(hit, `Snapshot for ${observer} omitted ${target} (id=${tid}). Saw ids: ${snap.entities.map((e) => e.id).join(", ")}`);
  }
);

Then(
  "{string}'s snapshot omits {string}",
  function (this: TestWorld, observer: string, target: string) {
    const sim = this.requireSim();
    const tid = sim.byName.get(target);
    assert.ok(tid, `${target} not registered`);
    const snap = this.data.get(snapKey(this, observer)) as SnapshotMsg | undefined;
    assert.ok(snap, "Build a snapshot first");
    const hit = snap.entities.find((e) => e.id === tid);
    assert.ok(!hit, `Snapshot for ${observer} should omit ${target} but included it`);
  }
);

Then(
  "{string}'s snapshot lists {string} as removed",
  function (this: TestWorld, observer: string, target: string) {
    const sim = this.requireSim();
    const tid = sim.byName.get(target);
    assert.ok(tid, `${target} not registered`);
    const snap = this.data.get(snapKey(this, observer)) as SnapshotMsg | undefined;
    assert.ok(snap, "Build a snapshot first");
    assert.ok(
      snap.removed.includes(tid),
      `Expected ${target} in removed list. removed=${snap.removed.join(", ")}`
    );
  }
);

Then(
  "{string}'s snapshot does not list {string} as removed",
  function (this: TestWorld, observer: string, target: string) {
    const sim = this.requireSim();
    const tid = sim.byName.get(target);
    assert.ok(tid, `${target} not registered`);
    const snap = this.data.get(snapKey(this, observer)) as SnapshotMsg | undefined;
    assert.ok(snap, "Build a snapshot first");
    assert.ok(
      !snap.removed.includes(tid),
      `Expected ${target} NOT in removed list. removed=${snap.removed.join(", ")}`
    );
  }
);

Then(
  "{string}'s snapshot includes a projectile",
  function (this: TestWorld, observer: string) {
    const snap = this.data.get(snapKey(this, observer)) as SnapshotMsg | undefined;
    assert.ok(snap, "Build a snapshot first");
    assert.ok(
      snap.entities.some((e) => e.kind === "projectile"),
      `Snapshot for ${observer} included no projectile`
    );
  }
);

Then(
  "{string}'s snapshot omits all projectiles",
  function (this: TestWorld, observer: string) {
    const snap = this.data.get(snapKey(this, observer)) as SnapshotMsg | undefined;
    assert.ok(snap, "Build a snapshot first");
    assert.ok(
      !snap.entities.some((e) => e.kind === "projectile"),
      `Snapshot for ${observer} should omit all projectiles`
    );
  }
);

Then(
  "{string}'s view radius is greater than {float}",
  function (this: TestWorld, observer: string, threshold: number) {
    const sim = this.requireSim();
    const self = tryFish(sim, observer);
    assert.ok(self, `${observer} missing`);
    const r = viewRadius(self.mass);
    assert.ok(r > threshold, `View radius ${r.toFixed(1)} not > ${threshold}`);
  }
);

Then(
  "{string}'s snapshot self mass is {float}",
  function (this: TestWorld, observer: string, mass: number) {
    const snap = this.data.get(snapKey(this, observer)) as SnapshotMsg | undefined;
    assert.ok(snap, "Build a snapshot first");
    assert.ok(
      Math.abs(snap.you.mass - mass) < 0.5,
      `Snapshot self mass ${snap.you.mass} ≠ ${mass}`
    );
  }
);

Then(
  "{string}'s snapshot self moveSpeed is {float}",
  function (this: TestWorld, observer: string, expected: number) {
    const snap = this.data.get(snapKey(this, observer)) as SnapshotMsg | undefined;
    assert.ok(snap, "Build a snapshot first");
    assert.ok(
      Math.abs(snap.you.moveSpeed - expected) < 0.5,
      `Snapshot self moveSpeed ${snap.you.moveSpeed} ≠ ${expected}`
    );
  }
);

Then(
  "{string}'s snapshot self velocity points in +X",
  function (this: TestWorld, observer: string) {
    const snap = this.data.get(snapKey(this, observer)) as SnapshotMsg | undefined;
    assert.ok(snap, "Build a snapshot first");
    assert.ok(snap.you.vx > 0, `Snapshot self vx ${snap.you.vx} not > 0`);
    assert.equal(typeof snap.you.vy, "number", "Snapshot self vy missing");
  }
);
