import { AI, ARENA, FISH, fishHp, canEat } from "@fcf/shared";
import type { Fish } from "./entity.ts";
import type { World } from "./world.ts";

const AI_NAMES = [
  "Bloop", "Gilly", "Splash", "Finley", "Bubble",
  "Nemo", "Wanda", "Cod-Father", "Pesce", "Bass-Drop",
  "Trout-Mouth", "Sushi", "Tuna-Salad", "Kelp", "Reef",
];

const AI_COLORS = [
  "#7fcfff", "#9affcf", "#ffd97f", "#ff9fa4", "#caa8ff",
  "#8fffd8", "#ffa07f", "#a0ffcc", "#ffcf6b", "#9cd2ff",
];

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function spawnAiFish(world: World, mass?: number): Fish {
  const rng = world.rng;
  const m = mass ?? (AI.startMassMin + rng() * (AI.startMassMax - AI.startMassMin));
  const id = world.nextId();
  const fish: Fish = {
    id,
    kind: "fish",
    x: rng() * ARENA.width,
    y: rng() * ARENA.height,
    vx: 0,
    vy: 0,
    targetVx: 0,
    targetVy: 0,
    headingX: 1,
    headingY: 0,
    mass: m,
    hp: fishHp(m),
    maxHp: fishHp(m),
    color: pick(AI_COLORS, rng),
    name: pick(AI_NAMES, rng),
    isAi: true,
    boost: false,
    boostUntil: 0,
    boostReadyAt: 0,
    level: 1,
    xp: 0,
    kills: 0,
    spawnedAt: world.now(),
    socketId: null,
    alive: true,
    aiState: {
      mode: "wander",
      modeUntil: 0,
      wanderHeading: rng() * Math.PI * 2,
      targetId: null,
    },
    weapons: [],
    passives: new Map(),
    pendingLevelUp: [],
  };
  return fish;
}

export function updateAi(fish: Fish, world: World, now: number, dt: number): void {
  if (!fish.isAi || !fish.aiState) return;
  const state = fish.aiState;
  const rng = world.rng;

  if (now >= state.modeUntil) {
    state.mode = "wander";
    state.modeUntil = now + 1500 + rng() * 2500;
    state.wanderHeading += (rng() - 0.5) * 1.2;
  }

  let nearestPredator: Fish | null = null;
  let nearestPrey: Fish | null = null;
  let predatorDist = Infinity;
  let preyDist = Infinity;

  for (const other of world.fish.values()) {
    if (other.id === fish.id || !other.alive) continue;
    const dx = other.x - fish.x;
    const dy = other.y - fish.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > AI.sightRadius * AI.sightRadius) continue;
    if (canEat(other.mass, fish.mass)) {
      if (d2 < predatorDist) {
        predatorDist = d2;
        nearestPredator = other;
      }
    } else if (canEat(fish.mass, other.mass)) {
      if (d2 < preyDist) {
        preyDist = d2;
        nearestPrey = other;
      }
    }
  }

  let speed: number = AI.wanderSpeed;
  let tvx = Math.cos(state.wanderHeading);
  let tvy = Math.sin(state.wanderHeading);

  if (nearestPredator) {
    state.mode = "flee";
    state.modeUntil = now + 1500;
    const dx = fish.x - nearestPredator.x;
    const dy = fish.y - nearestPredator.y;
    const len = Math.hypot(dx, dy) || 1;
    tvx = dx / len;
    tvy = dy / len;
    speed = AI.fleeSpeed;
  } else if (nearestPrey) {
    state.mode = "chase";
    state.modeUntil = now + 1500;
    const dx = nearestPrey.x - fish.x;
    const dy = nearestPrey.y - fish.y;
    const len = Math.hypot(dx, dy) || 1;
    tvx = dx / len;
    tvy = dy / len;
    speed = AI.chaseSpeed;
  }

  // bounce off walls
  const margin = 200;
  if (fish.x < margin) tvx = Math.max(tvx, 0.3);
  if (fish.x > ARENA.width - margin) tvx = Math.min(tvx, -0.3);
  if (fish.y < margin) tvy = Math.max(tvy, 0.3);
  if (fish.y > ARENA.height - margin) tvy = Math.min(tvy, -0.3);

  fish.targetVx = tvx;
  fish.targetVy = tvy;

  // ai uses its own speed model
  const desiredVx = tvx * speed;
  const desiredVy = tvy * speed;
  const accel = 8 * dt;
  fish.vx += (desiredVx - fish.vx) * accel;
  fish.vy += (desiredVy - fish.vy) * accel;
}

export function maintainAiPopulation(world: World): void {
  let playerLikeCount = 0;
  for (const f of world.fish.values()) {
    if (f.alive) playerLikeCount++;
  }
  while (playerLikeCount < AI.minPopulation) {
    const ai = spawnAiFish(world);
    world.fish.set(ai.id, ai);
    playerLikeCount++;
  }
}
