import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { ARENA, FISH } from "@fcf/shared";
import { TestWorld } from "../support/world.ts";
import {
  makeWorld,
  advanceTicks,
  tryFish,
  type TestSim,
  type FishSeed,
} from "../support/world-factory.ts";
import type { Fish, Pellet, Chunk, AiState } from "../../src/sim/entity.ts";

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
