import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { ARENA, FISH, DEFAULT_SPECIES_ID } from "@fcf/shared";
import { TestWorld } from "../support/world.ts";
import {
  makeWorld,
  advanceTicks,
  tryFish,
  type TestSim,
  type FishSeed,
} from "../support/world-factory.ts";
import type { Fish, Pellet, Chunk, AiState } from "../../src/sim/entity.ts";
import { applyClientWeaponHit } from "../../src/sim/weapon.ts";

function ensureSim(self: TestWorld, seed = 1): TestSim {
  if (!self.sim) self.sim = makeWorld({ seed });
  return self.sim;
}

export function addFish(sim: TestSim, seed: FishSeed): Fish {
  const id = sim.world.nextId();
  const mass = seed.mass ?? 10;
  const fish: Fish = {
    id,
    kind: "fish",
    x: seed.x,
    y: seed.y,
    vx: 0,
    vy: 0,
    targetVx: 0,
    targetVy: 0,
    headingX: 1,
    headingY: 0,
    mass,
    color: seed.color ?? "#7fcfff",
    species: seed.species ?? DEFAULT_SPECIES_ID,
    name: seed.name ?? `Fish${id}`,
    isAi: seed.isAi ?? false,
    boost: false,
    boostUntil: 0,
    boostReadyAt: 0,
    level: 1,
    xp: 0,
    kills: 0,
    peakMass: mass,
    hits: 0,
    damageDealt: 0,
    spawnedAt: sim.clock.now(),
    socketId: seed.socketId ?? (seed.isAi ? null : `test-${id}`),
    alive: true,
    weapons: [],
    passives: new Map(),
    pendingLevelUp: [],
    queuedLevelUps: 0,
    levelUpDismissed: false,
    pendingLevelUpDrawId: 0,
    rerollsRemaining: 0,
    banishesRemaining: 0,
    banishedSubjects: new Set(),
  };
  if (seed.isAi) {
    const aiState: AiState = {
      mode: seed.aiMode ?? "wander",
      modeUntil: sim.clock.now() + 2000,
      wanderHeading: 0,
      targetId: null,
      targetSince: sim.clock.now(),
      lastSampleX: seed.x,
      lastSampleY: seed.y,
      lastSampleAt: sim.clock.now(),
      stuckSince: null,
      blacklist: new Map(),
      aggro: new Map(),
      angeredTargetId: null,
      chaseLastKnownX: 0,
      chaseLastKnownY: 0,
      chaseCommitUntil: 0,
      aggroJitter: 0,
    };
    fish.aiState = aiState;
  }
  sim.world.fish.set(id, fish);
  sim.byName.set(fish.name, id);
  return fish;
}

/* -------- World setup -------- */

Given("a fresh world", function (this: TestWorld) {
  this.sim = makeWorld({ seed: 1 });
});

Given("a fresh world with seed {int}", function (this: TestWorld, seed: number) {
  this.sim = makeWorld({ seed });
});

Given("no humans are connected", function (this: TestWorld) {
  ensureSim(this).world.humansPresent = false;
});

Given("a human is connected", function (this: TestWorld) {
  ensureSim(this).world.humansPresent = true;
});

/* -------- Fish seeding -------- */

Given(
  "a player {string} at \\({float}, {float}\\) with mass {float}",
  function (this: TestWorld, name: string, x: number, y: number, mass: number) {
    const sim = ensureSim(this);
    addFish(sim, { name, x, y, mass, isAi: false });
  }
);

Given(
  "an AI fish {string} at \\({float}, {float}\\) with mass {float}",
  function (this: TestWorld, name: string, x: number, y: number, mass: number) {
    const sim = ensureSim(this);
    addFish(sim, { name, x, y, mass, isAi: true });
  }
);

Given(
  "an AI fish {string} at \\({float}, {float}\\) with mass {float} in {string} mode",
  function (this: TestWorld, name: string, x: number, y: number, mass: number, mode: string) {
    const sim = ensureSim(this);
    addFish(sim, { name, x, y, mass, isAi: true, aiMode: mode as AiState["mode"] });
  }
);

/* -------- Pellet seeding -------- */

Given(
  "a pellet at \\({float}, {float}\\)",
  function (this: TestWorld, x: number, y: number) {
    const sim = ensureSim(this);
    const id = sim.world.nextId();
    const p: Pellet = { id, kind: "pellet", x, y, color: "#ffdf80" };
    sim.world.pellets.set(id, p);
  }
);

/* -------- Chunk seeding -------- */

Given(
  "a chunk at \\({float}, {float}\\) with mass {float}",
  function (this: TestWorld, x: number, y: number, mass: number) {
    const sim = ensureSim(this);
    sim.world.spawnChunk(x, y, mass, "#ffdf80", sim.clock.now());
  }
);

// A chunk with a deterministic outward velocity, for testing that XP balls can't
// drift out through an arena wall (spawnChunk picks a random direction otherwise).
Given(
  "a chunk at \\({float}, {float}\\) with mass {float} moving \\({float}, {float}\\)",
  function (this: TestWorld, x: number, y: number, mass: number, vx: number, vy: number) {
    const sim = ensureSim(this);
    const c = sim.world.spawnChunk(x, y, mass, "#ffdf80", sim.clock.now());
    c.vx = vx;
    c.vy = vy;
  }
);

// Directly invoke the death-drop scatter (the real trigger lives in the server tick loop in
// index.ts, which the world-only harness doesn't run — mirrors how "a chunk at" calls spawnChunk).
Given(
  "a fish dies from damage at \\({float}, {float}\\) with mass {float} and level {int}",
  function (this: TestWorld, x: number, y: number, mass: number, level: number) {
    const sim = ensureSim(this);
    sim.world.spawnDeathDrops(x, y, mass, "#7fcfff", level, sim.clock.now());
  }
);

// A single collectable XP ball (xp-bearing chunk). Velocity is zeroed so a fish placed on it
// collects deterministically in one tick.
Given(
  "an XP ball at \\({float}, {float}\\) worth {int} xp",
  function (this: TestWorld, x: number, y: number, xp: number) {
    const sim = ensureSim(this);
    const c = sim.world.spawnChunk(x, y, 10, "#ffe066", sim.clock.now(), xp);
    c.vx = 0;
    c.vy = 0;
  }
);

// A swallow-style gold ball locked (uncollectable by anyone) until `ms` from now. Stationary so the
// test can park a fish on it and observe the lock gate, then collection once it expires.
Given(
  "a locked XP ball at \\({float}, {float}\\) worth {int} xp, unlockable in {int} ms",
  function (this: TestWorld, x: number, y: number, xp: number, ms: number) {
    const sim = ensureSim(this);
    const c = sim.world.spawnChunk(x, y, 60, "#ffe066", sim.clock.now(), xp);
    c.vx = 0;
    c.vy = 0;
    c.collectableAt = sim.clock.now() + ms;
  }
);

/* -------- Projectile seeding -------- */

Given(
  "a projectile at \\({float}, {float}\\) with radius {float}",
  function (this: TestWorld, x: number, y: number, radius: number) {
    const sim = ensureSim(this);
    sim.world.spawnProjectile({
      ownerId: 0,
      weaponId: "pulse",
      x,
      y,
      vx: 0,
      vy: 0,
      damage: 0,
      radius,
      expiresAt: sim.clock.now() + 60_000,
      behavior: "static",
      reHitMs: 0,
    });
  }
);

Given(
  "{string} owns a projectile at \\({float}, {float}\\) with damage {float}",
  function (this: TestWorld, name: string, x: number, y: number, damage: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    if (!f) throw new Error(`No fish named ${name}`);
    const proj = sim.world.spawnProjectile({
      ownerId: f.id,
      weaponId: "bubble",
      x, y, vx: 0, vy: 0,
      damage,
      radius: 20,
      expiresAt: sim.clock.now() + 60_000,
      behavior: "linear",
      reHitMs: 0,
    });
    this.data.set(`${name}.projId`, proj.id);
  }
);

When(
  "{string} reports a client weapon hit on {string}",
  function (this: TestWorld, attacker: string, target: string) {
    const sim = this.requireSim();
    const a = tryFish(sim, attacker);
    const t = tryFish(sim, target);
    if (!a || !t) throw new Error(`Missing fish ${attacker} or ${target}`);
    const projId = this.data.get(`${attacker}.projId`) as number | undefined;
    if (projId == null) throw new Error(`No projectile recorded for ${attacker}`);
    const applied = applyClientWeaponHit(sim.world, a, projId, t.id, sim.clock.now());
    this.data.set("lastWeaponHitApplied", applied);
  }
);

Then("the client weapon hit was applied", function (this: TestWorld) {
  assert.equal(this.data.get("lastWeaponHitApplied"), true, "expected weapon hit to apply");
});

Then("the client weapon hit was rejected", function (this: TestWorld) {
  assert.equal(this.data.get("lastWeaponHitApplied"), false, "expected weapon hit to be rejected");
});

/* -------- Loadout -------- */

Given(
  "{string} has weapon {string} at level {int}",
  function (this: TestWorld, name: string, weaponId: string, level: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    if (!f) throw new Error(`No fish named ${name}`);
    f.weapons.push({ id: weaponId as never, level, cooldownReadyAt: 0 });
  }
);

/* -------- Input -------- */

/** Match the protocol-layer clamp in index.ts: any input with magnitude > 1 is normalised. */
function clampInput(vx: number, vy: number): [number, number] {
  const m = Math.hypot(vx, vy);
  if (m > 1) return [vx / m, vy / m];
  return [vx, vy];
}

Given(
  "{string} has input \\({float}, {float}\\)",
  function (this: TestWorld, name: string, vx: number, vy: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    if (!f) throw new Error(`No fish named ${name}`);
    const [nx, ny] = clampInput(vx, vy);
    sim.world.applyInput(f, nx, ny, false, sim.clock.now());
  }
);

When(
  "{string} sends input \\({float}, {float}\\)",
  function (this: TestWorld, name: string, vx: number, vy: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    if (!f) throw new Error(`No fish named ${name}`);
    const [nx, ny] = clampInput(vx, vy);
    sim.world.applyInput(f, nx, ny, false, sim.clock.now());
  }
);

When(
  "{string} sends input \\({float}, {float}\\) with boost",
  function (this: TestWorld, name: string, vx: number, vy: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    if (!f) throw new Error(`No fish named ${name}`);
    const [nx, ny] = clampInput(vx, vy);
    sim.world.applyInput(f, nx, ny, true, sim.clock.now());
  }
);

When(
  "{string} reports client position \\({float}, {float}\\) velocity \\({float}, {float}\\)",
  function (this: TestWorld, name: string, x: number, y: number, vx: number, vy: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    if (!f) throw new Error(`No fish named ${name}`);
    const hm = Math.hypot(vx, vy);
    const hx = hm > 0.01 ? vx / hm : 1;
    const hy = hm > 0.01 ? vy / hm : 0;
    sim.world.applyClientState(f, { x, y, vx, vy, hx, hy }, false, sim.clock.now());
  }
);

/* -------- Advance -------- */

When("the world advances 1 tick", function (this: TestWorld) {
  advanceTicks(this.requireSim(), 1);
});

When("the world advances {int} ticks", function (this: TestWorld, n: number) {
  advanceTicks(this.requireSim(), n);
});

When("the world advances {int} ms", function (this: TestWorld, ms: number) {
  const sim = this.requireSim();
  const ticks = Math.max(1, Math.round(ms / 50));
  advanceTicks(sim, ticks, ms / ticks);
});

When("the world advances {int} seconds", function (this: TestWorld, s: number) {
  const sim = this.requireSim();
  advanceTicks(sim, s * 20);
});

/* -------- Generic assertions -------- */

Then("{string} is alive", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = tryFish(sim, name);
  assert.ok(f && f.alive, `Expected ${name} alive`);
});

Then("{string} is dead", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = tryFish(sim, name);
  // Dead means: either removed from world, or alive=false (transient)
  if (!f) return; // removed = dead
  assert.equal(f.alive, false, `Expected ${name} dead but still alive`);
});

Then("{string} is biting", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = tryFish(sim, name);
  assert.ok(f, `${name} missing from world`);
  assert.equal(
    f.bitingTick, sim.world.tick,
    `Expected ${name} to be biting this tick (bitingTick=${f.bitingTick}, tick=${sim.world.tick})`,
  );
});

Then("{string} is not biting", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = tryFish(sim, name);
  assert.ok(f, `${name} missing from world`);
  assert.notEqual(f.bitingTick, sim.world.tick, `Expected ${name} NOT to be biting this tick`);
});

Then(
  "a bite toast was emitted for {string} by {string}",
  function (this: TestWorld, victim: string, attacker: string) {
    const sim = this.requireSim();
    const vid = sim.byName.get(victim);
    const aid = sim.byName.get(attacker);
    assert.ok(vid != null && aid != null, `Unknown fish in bite-toast assertion (${victim}/${attacker})`);
    const att = sim.world.fish.get(aid!);
    const found = sim.world.combatEvents.some(
      (e) => e.kind === "bitten" && e.recipientId === vid && e.otherName === att?.name,
    );
    assert.ok(found, `Expected a "bitten" toast for ${victim} by ${attacker}; got ${JSON.stringify(sim.world.combatEvents)}`);
  },
);

Then(
  "there are {int} bite toasts for {string}",
  function (this: TestWorld, count: number, victim: string) {
    const sim = this.requireSim();
    const vid = sim.byName.get(victim);
    const n = sim.world.combatEvents.filter((e) => e.kind === "bitten" && e.recipientId === vid).length;
    assert.equal(n, count, `Expected ${count} bitten toasts for ${victim}, got ${n}`);
  },
);

Then(
  "a hit toast was emitted for {string} hitting {string}",
  function (this: TestWorld, attacker: string, victim: string) {
    const sim = this.requireSim();
    const aid = sim.byName.get(attacker);
    const vid = sim.byName.get(victim);
    assert.ok(aid != null && vid != null, `Unknown fish in hit-toast assertion (${attacker}/${victim})`);
    const vic = sim.world.fish.get(vid!);
    const found = sim.world.combatEvents.some(
      (e) => e.kind === "hit" && e.recipientId === aid && e.otherName === vic?.name,
    );
    assert.ok(found, `Expected a "hit" toast for ${attacker} hitting ${victim}; got ${JSON.stringify(sim.world.combatEvents)}`);
  },
);

Then(
  "there are {int} hit toasts for {string}",
  function (this: TestWorld, count: number, attacker: string) {
    const sim = this.requireSim();
    const aid = sim.byName.get(attacker);
    const n = sim.world.combatEvents.filter((e) => e.kind === "hit" && e.recipientId === aid).length;
    assert.equal(n, count, `Expected ${count} hit toasts for ${attacker}, got ${n}`);
  },
);

Then(
  "{string} was swallowed whole",
  function (this: TestWorld, victim: string) {
    const sim = this.requireSim();
    const vid = sim.byName.get(victim);
    const v = vid != null ? sim.world.fish.get(vid) : undefined;
    assert.ok(v && v.eatenWhole === true && v.alive === false, `Expected ${victim} swallowed whole; got ${JSON.stringify(v && { alive: v.alive, eatenWhole: v.eatenWhole })}`);
  },
);

Then(
  "{string} was killed by {string}",
  function (this: TestWorld, victim: string, killer: string) {
    const sim = this.requireSim();
    const vid = sim.byName.get(victim);
    const kid = sim.byName.get(killer);
    assert.ok(vid != null && kid != null, `Unknown fish in kill assertion (${victim}/${killer})`);
    const v = sim.world.fish.get(vid!);
    assert.equal(v?.killedById, kid, `Expected ${victim}.killedById=${killer}'s id (${kid}), got ${v?.killedById}`);
  },
);

Then(
  "{string} has killedByWeaponId {string}",
  function (this: TestWorld, victim: string, weaponId: string) {
    const sim = this.requireSim();
    const vid = sim.byName.get(victim);
    const v = vid != null ? sim.world.fish.get(vid) : undefined;
    assert.equal(v?.killedByWeaponId, weaponId, `Expected ${victim}.killedByWeaponId=${weaponId}, got ${v?.killedByWeaponId}`);
  },
);

Then(
  "{string} has no killedByWeaponId",
  function (this: TestWorld, victim: string) {
    const sim = this.requireSim();
    const vid = sim.byName.get(victim);
    const v = vid != null ? sim.world.fish.get(vid) : undefined;
    assert.equal(v?.killedByWeaponId, undefined, `Expected ${victim}.killedByWeaponId undefined, got ${v?.killedByWeaponId}`);
  },
);

Then("{string} has been removed from the world", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const id = sim.byName.get(name);
  if (id == null) throw new Error(`${name} was never registered`);
  assert.ok(!sim.world.fish.has(id), `Expected ${name} (id=${id}) removed`);
});

Then(
  "{string} has mass {float}",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing from world`);
    assert.ok(
      Math.abs(f.mass - expected) < 0.01,
      `Expected ${name} mass=${expected}, got ${f.mass}`
    );
  }
);

Then(
  "{string} has mass approximately {float}",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing from world`);
    assert.ok(
      Math.abs(f.mass - expected) <= 0.5,
      `Expected ${name} mass≈${expected} (±0.5), got ${f.mass}`
    );
  }
);

Then(
  "{string} has at least mass {float}",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing from world`);
    assert.ok(f.mass >= expected, `Expected ${name} mass≥${expected}, got ${f.mass}`);
  }
);

Then(
  "{string} has at most mass {float}",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing from world`);
    assert.ok(f.mass <= expected, `Expected ${name} mass≤${expected}, got ${f.mass}`);
  }
);

Then(
  "{string} has peak mass {float}",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing from world`);
    assert.ok(
      Math.abs(f.peakMass - expected) < 0.01,
      `Expected ${name} peakMass=${expected}, got ${f.peakMass}`
    );
  }
);

Then(
  "{string} has peak mass at least {float}",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing from world`);
    assert.ok(f.peakMass >= expected, `Expected ${name} peakMass≥${expected}, got ${f.peakMass}`);
  }
);

Then(
  "{string} has {int} weapon hit(s)",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing from world`);
    assert.equal(f.hits, expected, `Expected ${name} hits=${expected}, got ${f.hits}`);
  }
);

Then(
  "{string} has at least {int} weapon hit(s)",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing from world`);
    assert.ok(f.hits >= expected, `Expected ${name} hits≥${expected}, got ${f.hits}`);
  }
);

Then(
  "the latest hit was from weapon {string}",
  function (this: TestWorld, weaponId: string) {
    const events = this.requireSim().world.hitEvents;
    const last = events[events.length - 1];
    assert.ok(last, "expected a hit event");
    assert.equal(last.weaponId, weaponId, `expected hit weapon ${weaponId}, got ${last.weaponId}`);
  }
);

Then(
  "{string} has dealt at least {float} damage",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing from world`);
    assert.ok(
      f.damageDealt >= expected,
      `Expected ${name} damageDealt≥${expected}, got ${f.damageDealt}`
    );
  }
);

Then("{string} has XP {int}", function (this: TestWorld, name: string, expected: number) {
  const f = tryFish(this.requireSim(), name);
  assert.ok(f, `${name} missing from world`);
  assert.equal(f.xp, expected, `Expected ${name} xp=${expected}, got ${f.xp}`);
});

Then(
  "{string} has at least XP {int}",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing from world`);
    assert.ok(f.xp >= expected, `Expected ${name} xp≥${expected}, got ${f.xp}`);
  }
);

Then("{string} has kill count {int}", function (this: TestWorld, name: string, expected: number) {
  const f = tryFish(this.requireSim(), name);
  assert.ok(f, `${name} missing from world`);
  assert.equal(f.kills, expected, `Expected ${name} kills=${expected}, got ${f.kills}`);
});

Then(
  "there are {int} pellets",
  function (this: TestWorld, expected: number) {
    assert.equal(this.requireSim().world.pellets.size, expected);
  }
);

Then(
  "there are {int} pellet(s) remaining",
  function (this: TestWorld, expected: number) {
    assert.equal(this.requireSim().world.pellets.size, expected);
  }
);

Then(
  "there are {int} chunk(s) in the world",
  function (this: TestWorld, expected: number) {
    assert.equal(this.requireSim().world.chunks.size, expected);
  }
);

Then(
  "there is at least {int} chunk in the world",
  function (this: TestWorld, expected: number) {
    const n = this.requireSim().world.chunks.size;
    assert.ok(n >= expected, `Expected ≥${expected} chunks, got ${n}`);
  }
);

Then(
  "the total burp XP in the world is {int}",
  function (this: TestWorld, expected: number) {
    let total = 0;
    for (const c of this.requireSim().world.chunks.values()) total += c.xp ?? 0;
    assert.equal(total, expected, `Expected total burp XP=${expected}, got ${total}`);
  }
);

Then(
  "there are {int} projectile(s)",
  function (this: TestWorld, expected: number) {
    const n = this.requireSim().world.projectiles.size;
    assert.equal(n, expected, `Expected ${expected} projectiles, got ${n}`);
  }
);

Then(
  "there are at most {int} projectile(s)",
  function (this: TestWorld, expected: number) {
    const n = this.requireSim().world.projectiles.size;
    assert.ok(n <= expected, `Expected ≤${expected} projectiles, got ${n}`);
  }
);

Then(
  "there are at least {int} projectile(s)",
  function (this: TestWorld, expected: number) {
    const n = this.requireSim().world.projectiles.size;
    assert.ok(n >= expected, `Expected ≥${expected} projectiles, got ${n}`);
  }
);

Then("there are {int} living fish", function (this: TestWorld, expected: number) {
  let n = 0;
  for (const f of this.requireSim().world.fish.values()) if (f.alive) n++;
  assert.equal(n, expected);
});

Then("there are at least {int} living fish", function (this: TestWorld, expected: number) {
  let n = 0;
  for (const f of this.requireSim().world.fish.values()) if (f.alive) n++;
  assert.ok(n >= expected, `Expected ≥${expected} fish, got ${n}`);
});

Then(
  "{string} is in {string} mode",
  function (this: TestWorld, name: string, mode: string) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.ok(f.aiState, `${name} is not an AI fish`);
    assert.equal(f.aiState.mode, mode);
  }
);

Then(
  "{string} is inside the arena",
  function (this: TestWorld, name: string) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.ok(f.x >= 0 && f.x <= ARENA.width, `${name} x=${f.x} out of arena`);
    assert.ok(f.y >= 0 && f.y <= ARENA.height, `${name} y=${f.y} out of arena`);
  }
);

Then(
  "{string} is at approximately \\({float}, {float}\\)",
  function (this: TestWorld, name: string, x: number, y: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    assert.ok(Math.abs(f.x - x) < 1, `${name} x=${f.x} expected ~${x}`);
    assert.ok(Math.abs(f.y - y) < 1, `${name} y=${f.y} expected ~${y}`);
  }
);

Then(
  "{string} has moved at least {float} units",
  function (this: TestWorld, name: string, dist: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    assert.ok(f, `${name} missing`);
    const startX = this.data.get(`${name}.startX`) as number | undefined;
    const startY = this.data.get(`${name}.startY`) as number | undefined;
    if (startX == null || startY == null) {
      throw new Error(`No baseline position for ${name}. Use "Given baseline position of '${name}'" first.`);
    }
    const dx = f.x - startX;
    const dy = f.y - startY;
    const moved = Math.hypot(dx, dy);
    assert.ok(moved >= dist, `Expected ${name} moved ≥${dist}, actual ${moved.toFixed(2)}`);
  }
);

function movedDistance(world: TestWorld, name: string): number {
  const sim = world.requireSim();
  const f = tryFish(sim, name);
  assert.ok(f, `${name} missing`);
  const startX = world.data.get(`${name}.startX`) as number | undefined;
  const startY = world.data.get(`${name}.startY`) as number | undefined;
  if (startX == null || startY == null) {
    throw new Error(`No baseline position for ${name}. Use "Given baseline position of '${name}'" first.`);
  }
  return Math.hypot(f.x - startX, f.y - startY);
}

Then(
  "{string} has moved at least {float} times as far as {string}",
  function (this: TestWorld, fast: string, ratio: number, slow: string) {
    const fastMoved = movedDistance(this, fast);
    const slowMoved = movedDistance(this, slow);
    assert.ok(
      fastMoved >= slowMoved * ratio,
      `Expected ${fast} (${fastMoved.toFixed(2)}) to move ≥${ratio}× ${slow} (${slowMoved.toFixed(2)})`
    );
  }
);

Given("baseline position of {string}", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = tryFish(sim, name);
  assert.ok(f, `${name} missing`);
  this.data.set(`${name}.startX`, f.x);
  this.data.set(`${name}.startY`, f.y);
});

Given("baseline heading of {string}", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = tryFish(sim, name);
  assert.ok(f, `${name} missing`);
  this.data.set(`${name}.headingAngle`, Math.atan2(f.headingY, f.headingX));
});

Then(
  "{string} heading has rotated by at most {float} radians from baseline",
  function (this: TestWorld, name: string, maxRad: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    assert.ok(f, `${name} missing`);
    const baseline = this.data.get(`${name}.headingAngle`) as number | undefined;
    if (baseline == null) {
      throw new Error(`No baseline heading for ${name}. Use "Given baseline heading of '${name}'" first.`);
    }
    const cur = Math.atan2(f.headingY, f.headingX);
    let delta = cur - baseline;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const mag = Math.abs(delta);
    assert.ok(
      mag <= maxRad,
      `Expected ${name} heading delta ≤ ${maxRad} rad, actual ${mag.toFixed(3)} rad`,
    );
  },
);

Given(
  "{string} has heading \\({float}, {float}\\)",
  function (this: TestWorld, name: string, hx: number, hy: number) {
    const sim = this.requireSim();
    const f = tryFish(sim, name);
    assert.ok(f, `${name} missing`);
    f.headingX = hx;
    f.headingY = hy;
  }
);

Then(
  "{string} has speed at most {float}",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    const s = Math.hypot(f.vx, f.vy);
    assert.ok(s <= expected, `Expected speed≤${expected}, got ${s.toFixed(2)}`);
  }
);

Then("{string} is boosting", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = tryFish(sim, name);
  assert.ok(f, `${name} missing`);
  assert.ok(f.boost, `Expected ${name} boosting, but boost=false`);
});

Then("{string} is not boosting", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = tryFish(sim, name);
  assert.ok(f, `${name} missing`);
  assert.ok(!f.boost, `Expected ${name} not boosting, but boost=true`);
});

Then(
  "the speed of {string} is approximately {float}",
  function (this: TestWorld, name: string, expected: number) {
    const f = tryFish(this.requireSim(), name);
    assert.ok(f, `${name} missing`);
    const s = Math.hypot(f.vx, f.vy);
    assert.ok(
      Math.abs(s - expected) < expected * 0.2 + 5,
      `Expected speed≈${expected}, got ${s.toFixed(2)}`
    );
  }
);
