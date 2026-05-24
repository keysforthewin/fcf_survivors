// Direct simulation test (no networking) for M4 level-up flow.
// Spawns a player, runs the world forward by ticks, asserts:
//   - pellet eating grows mass + xp
//   - reaching xpForLevel triggers pendingLevelUp with 3 distinct cards
//   - applyCard with valid card mutates state + clears pendingLevelUp

import { xpForLevel, parseCardId } from "../packages/shared/src/index.ts";
import { World } from "../packages/server/src/sim/world.ts";
import { applyCard, processLevelUps } from "../packages/server/src/sim/levelup.ts";

let now = 1_000_000;
const world = new World({
  now: () => now,
  rng: (() => {
    // deterministic RNG for the test
    let s = 1;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  })(),
  autoSpawnPellets: false,
  maintainAi: false,
});

const fish = world.spawnPlayer("Tester", "#7fcfff", "smoke");
console.log(`spawn: mass=${fish.mass} xp=${fish.xp} level=${fish.level}`);

// Spawn a cluster of pellets right next to the fish.
for (let i = 0; i < 30; i++) {
  const p = world.spawnPellet();
  p.x = fish.x + (i - 15);
  p.y = fish.y;
}
console.log(`spawned 30 pellets at fish position`);

// Tick the world a few times. Don't apply input — pellets are inside fish radius.
for (let i = 0; i < 5; i++) {
  now += 50;
  world.step(0.05, now);
  processLevelUps(world);
}

console.log(`after 5 ticks: mass=${fish.mass.toFixed(1)} xp=${fish.xp} level=${fish.level} pending=${fish.pendingLevelUp.length}`);

const ok = (cond: boolean, label: string): boolean => {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  return cond;
};

let pass = true;
pass = ok(fish.mass > 10, `mass grew from 10 → ${fish.mass.toFixed(1)}`) && pass;
pass = ok(fish.xp > 0 || fish.level > 1, `xp accumulated or leveled (xp=${fish.xp}, lvl=${fish.level})`) && pass;

// Force a level-up.
fish.xp = xpForLevel(fish.level);
now += 50;
processLevelUps(world);
console.log(`forced level-up: level=${fish.level} pending=${fish.pendingLevelUp.length}`);

pass = ok(fish.level > 1, `fish leveled past 1`) && pass;
pass = ok(fish.pendingLevelUp.length === 3, `pendingLevelUp has 3 cards (got ${fish.pendingLevelUp.length})`) && pass;
const ids = new Set(fish.pendingLevelUp.map((c) => c.id));
pass = ok(ids.size === 3, `cards have 3 distinct ids (got ${ids.size})`) && pass;

// Pick a card.
const picked = fish.pendingLevelUp[0]!;
const parsed = parseCardId(picked.id);
pass = ok(parsed !== null, `cardId "${picked.id}" parses`) && pass;
const before = describe(fish);
console.log(`picking: ${picked.id} (${picked.kind})`);
const applied = applyCard(world, fish, picked.id, parsed!);
const after = describe(fish);
console.log(`after pick: ${after}`);

pass = ok(applied, `applyCard returned true`) && pass;
pass = ok(fish.pendingLevelUp.length === 0, `pendingLevelUp cleared`) && pass;
pass = ok(before !== after, `fish state changed (before="${before}" after="${after}")`) && pass;

// Force enough levels + max-stack Morning Raids to test forced-evolution branch.
console.log("\n--- evolution gate test ---");
// Give the player AK-47 Lv 5 (it's already Lv 1 by default; spawn function sets it).
fish.weapons[0]!.level = 5;
// Max stack Morning Raids (paired passive of bubble).
fish.passives.set("magnet", 3);
fish.pendingLevelUp = [];
fish.xp = xpForLevel(fish.level);
processLevelUps(world);
const cards = fish.pendingLevelUp;
const hasEvolution = cards.some((c) => c.kind === "evolution" && c.id === "evolution:bubble");
pass = ok(hasEvolution, `evolution card was forced into the pool (${cards.map(c => c.id).join(", ")})`) && pass;

// Pick the evolution.
const evoCard = cards.find((c) => c.kind === "evolution")!;
const evoParsed = parseCardId(evoCard.id)!;
applyCard(world, fish, evoCard.id, evoParsed);
const hasTidal = fish.weapons.some((s) => s.id === "tidal");
const hasBubble = fish.weapons.some((s) => s.id === "bubble");
pass = ok(hasTidal, `AK-47 evolved to P4uly's Gun`) && pass;
pass = ok(!hasBubble, `original AK-47 removed`) && pass;

console.log(pass ? "\n✓ LEVELUP-TEST PASS" : "\n✗ LEVELUP-TEST FAIL");
process.exit(pass ? 0 : 1);

function describe(f: typeof fish): string {
  return `weapons=[${f.weapons.map(s => `${s.id}L${s.level}`).join(",")}] passives=[${[...f.passives.entries()].map(([k, v]) => `${k}=${v}`).join(",")}]`;
}
