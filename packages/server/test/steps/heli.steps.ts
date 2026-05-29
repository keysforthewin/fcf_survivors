import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { WEAPONS, parseCardId } from "@fcf/shared";
import type { WeaponId } from "@fcf/shared";
import { TestWorld } from "../support/world.ts";
import { getFish, advanceTicks } from "../support/world-factory.ts";
import type { World } from "../../src/sim/world.ts";
import { getMoveSpeed, getEffectiveMoveSpeed } from "../../src/sim/passives.ts";

/** Count in-flight heli BODY projectiles owned by a fish (excludes its bullets). */
function heliBodyCount(world: World, ownerId: number): number {
  let n = 0;
  for (const p of world.projectiles.values()) {
    if (p.ownerId === ownerId && WEAPONS[p.weaponId as WeaponId]?.kind === "heli" && p.isBody) n++;
  }
  return n;
}

Then(
  "{int} heli bodies owned by {string} are in flight",
  function (this: TestWorld, expected: number, name: string) {
    const sim = this.requireSim();
    const f = getFish(sim, name);
    assert.equal(heliBodyCount(sim.world, f.id), expected, `expected ${expected} heli bodies`);
  },
);

// `attackUntil` is set on the enter→attack transition and stays set, so it's a non-transient
// "did this heli ever start attacking?" probe — it stays 0 if the heli is stuck in `enter`.
Then(
  "{string}'s heli has reached the attack phase",
  function (this: TestWorld, name: string) {
    const sim = this.requireSim();
    const f = getFish(sim, name);
    const slot = f.weapons.find((w) => WEAPONS[w.id as WeaponId]?.kind === "heli");
    assert.ok(slot, `${name} has no heli weapon`);
    const st = slot!.state;
    const ship = st && st.kind === "heli" ? st.ship : null;
    assert.ok(ship, `${name}'s heli has no ship in flight`);
    assert.ok(ship!.attackUntil > 0, `expected ${name}'s heli to have reached the attack phase`);
  },
);

/** Find the in-flight heli BODY projectile owned by a fish (the minicopter, not its bullets). */
function findHeliBody(world: World, ownerId: number) {
  for (const p of world.projectiles.values()) {
    if (p.ownerId === ownerId && WEAPONS[p.weaponId as WeaponId]?.kind === "heli" && p.isBody) return p;
  }
  return undefined;
}

// Chase the player's heli body each tick (full-magnitude input straight at it). This is the worst case
// for the exit phase: a player tailing the heli as it peels off must NOT be able to keep it pinned on
// screen — a heli that stops/bounces on a stale exit point stays in view, a heli that streaks straight
// out pulls away and leaves.
When(
  "{string} tails their heli for {int} seconds",
  function (this: TestWorld, name: string, secs: number) {
    const sim = this.requireSim();
    const f = getFish(sim, name);
    const ticks = secs * 20;
    for (let i = 0; i < ticks; i++) {
      const heli = findHeliBody(sim.world, f.id);
      if (heli) {
        const dx = heli.x - f.x;
        const dy = heli.y - f.y;
        const m = Math.hypot(dx, dy) || 1;
        sim.world.applyInput(f, dx / m, dy / m, false, sim.clock.now());
      }
      advanceTicks(sim, 1);
    }
  },
);

Then("{string} is slowed", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = getFish(sim, name);
  assert.ok((f.slowUntil ?? 0) > sim.clock.now(), `expected ${name} to be slowed`);
});

Then("{string} is not slowed", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = getFish(sim, name);
  assert.ok((f.slowUntil ?? 0) <= sim.clock.now(), `expected ${name} not slowed`);
});

Then("{string} effective move speed is halved", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = getFish(sim, name);
  const eff = getEffectiveMoveSpeed(f, sim.clock.now());
  const base = getMoveSpeed(f);
  assert.ok(Math.abs(eff - base * 0.5) < 1e-6, `expected halved speed, got ${eff} vs base ${base}`);
});

Given("{string} is slowed for {int} ms", function (this: TestWorld, name: string, ms: number) {
  const sim = this.requireSim();
  const f = getFish(sim, name);
  f.slowUntil = sim.clock.now() + ms;
});

Then("{string} moves slower than {string}", function (this: TestWorld, slow: string, fast: string) {
  const sim = this.requireSim();
  const a = getFish(sim, slow);
  const b = getFish(sim, fast);
  const sa = Math.hypot(a.vx, a.vy);
  const sb = Math.hypot(b.vx, b.vy);
  assert.ok(sa < sb, `expected ${slow} (speed ${sa.toFixed(1)}) to move slower than ${fast} (speed ${sb.toFixed(1)})`);
});

Then(
  "{string} is not offered an evolution for {string}",
  function (this: TestWorld, name: string, baseId: string) {
    const sim = this.requireSim();
    const f = getFish(sim, name);
    const found = f.pendingLevelUp.some((c) => {
      const parsed = parseCardId(c.id);
      return parsed?.kind === "evolution" && parsed.baseId === baseId;
    });
    assert.ok(!found, `expected ${name} NOT offered an evolution for ${baseId}`);
  },
);
