import { AI, ARENA, canEat, massSpeedMult } from "@fcf/shared";
import type { Fish } from "./entity.ts";
import type { World } from "./world.ts";
import { NPC_NAMES } from "./npc-names.ts";

/** AI fish name pool. Edit the list in `npc-names.ts`. */
export const AI_NAMES = NPC_NAMES;

const AI_COLORS = [
  "#7fcfff", "#9affcf", "#ffd97f", "#ff9fa4", "#caa8ff",
  "#8fffd8", "#ffa07f", "#a0ffcc", "#ffcf6b", "#9cd2ff",
];

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/**
 * Pick an AI name not in `taken`. Humans get priority over AI names, so callers
 * pass the set of names a human currently holds (plus any already reassigned in
 * the same pass). When the whole pool is taken, fall back to a numeric suffix
 * (`Bloop-2`, `Bloop-3`, ...) so the result is always unique.
 */
export function pickAiName(rng: () => number, taken: ReadonlySet<string>): string {
  const free = AI_NAMES.filter((n) => !taken.has(n));
  if (free.length > 0) return pick(free, rng);
  const base = pick(AI_NAMES, rng);
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Panic-speed lerp: linear interpolation from fleePanicSpeed to fleeSpeed over
 * fleePanicDurationMs. After that, sustained fleeSpeed. Called by both the
 * "predator visible" and "still committed but lost sight" flee branches so
 * they share the same speed curve.
 */
function fleeSpeedAt(elapsedMs: number): number {
  if (elapsedMs >= AI.fleePanicDurationMs) return AI.fleeSpeed;
  const t = Math.max(0, elapsedMs) / AI.fleePanicDurationMs;
  return AI.fleePanicSpeed + (AI.fleeSpeed - AI.fleePanicSpeed) * t;
}

export function spawnAiFish(world: World, mass?: number): Fish {
  const rng = world.rng;
  const m = mass ?? (AI.startMassMin + rng() * (AI.startMassMax - AI.startMassMin));
  const id = world.nextId();
  const now = world.now();
  const x = rng() * ARENA.width;
  const y = rng() * ARENA.height;
  const fish: Fish = {
    id,
    kind: "fish",
    x,
    y,
    vx: 0,
    vy: 0,
    targetVx: 0,
    targetVy: 0,
    headingX: 1,
    headingY: 0,
    mass: m,
    color: pick(AI_COLORS, rng),
    name: pickAiName(rng, world.takenNames()),
    isAi: true,
    boost: false,
    boostUntil: 0,
    boostReadyAt: 0,
    level: 1,
    xp: 0,
    kills: 0,
    peakMass: m,
    hits: 0,
    damageDealt: 0,
    spawnedAt: now,
    socketId: null,
    alive: true,
    aiState: {
      mode: "wander",
      modeUntil: 0,
      wanderHeading: rng() * Math.PI * 2,
      targetId: null,
      targetSince: now,
      lastSampleX: x,
      lastSampleY: y,
      lastSampleAt: now,
      stuckSince: null,
      blacklist: new Map(),
      fleeStartedAt: 0,
      fleeLastKnownX: 0,
      fleeLastKnownY: 0,
      fleeMemoryUntil: 0,
    },
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
  return fish;
}

export function updateAi(fish: Fish, world: World, now: number, dt: number): void {
  if (!fish.isAi || !fish.aiState) return;
  const state = fish.aiState;
  const rng = world.rng;
  const sightR2 = AI.sightRadius * AI.sightRadius;

  // Stuck sampling: every stuckSampleIntervalMs, check whether the fish moved
  // far enough. After stuckTriggerMs of not moving, blacklist the current target
  // and force a wander so the fish stops re-acquiring the same dead end.
  if (now - state.lastSampleAt >= AI.stuckSampleIntervalMs) {
    const dxs = fish.x - state.lastSampleX;
    const dys = fish.y - state.lastSampleY;
    if (dxs * dxs + dys * dys < AI.stuckThreshold * AI.stuckThreshold) {
      if (state.stuckSince == null) state.stuckSince = now;
    } else {
      state.stuckSince = null;
    }
    state.lastSampleX = fish.x;
    state.lastSampleY = fish.y;
    state.lastSampleAt = now;

    if (
      state.stuckSince != null &&
      now - state.stuckSince >= AI.stuckTriggerMs
    ) {
      if (state.targetId != null) {
        state.blacklist.set(state.targetId, now + AI.blacklistDurationMs);
      }
      state.targetId = null;
      state.targetSince = now;
      state.mode = "wander";
      state.modeUntil = now + 1500;
      // Aim the recovery heading toward the arena center so the fish breaks
      // free of whatever wall or corner it was hugging.
      const dxCenter = ARENA.width / 2 - fish.x;
      const dyCenter = ARENA.height / 2 - fish.y;
      state.wanderHeading = (dxCenter === 0 && dyCenter === 0)
        ? rng() * Math.PI * 2
        : Math.atan2(dyCenter, dxCenter) + (rng() - 0.5) * 0.8;
      state.stuckSince = null;
    }
  }

  if (state.blacklist.size > 0) {
    for (const [id, expiry] of state.blacklist) {
      if (expiry <= now) state.blacklist.delete(id);
    }
  }

  if (now >= state.modeUntil) {
    const wasFleeing = state.mode === "flee";
    state.mode = "wander";
    state.modeUntil = now + 1500 + rng() * 2500;
    const repulseR = AI.wallRepulseRadius;
    const nearWall =
      fish.x < repulseR || fish.y < repulseR ||
      ARENA.width - fish.x < repulseR || ARENA.height - fish.y < repulseR;
    if (nearWall) {
      // Bias the new heading toward the arena center so we don't immediately
      // re-aim into the wall we're already next to.
      const dxCenter = ARENA.width / 2 - fish.x;
      const dyCenter = ARENA.height / 2 - fish.y;
      state.wanderHeading = Math.atan2(dyCenter, dxCenter) + (rng() - 0.5) * 1.2;
    } else if (wasFleeing && now < state.fleeMemoryUntil) {
      // Just stopped fleeing — point away from where we last saw the predator
      // so the fish doesn't immediately drift back into the danger zone.
      const dx = fish.x - state.fleeLastKnownX;
      const dy = fish.y - state.fleeLastKnownY;
      if (dx * dx + dy * dy > 1e-6) {
        state.wanderHeading = Math.atan2(dy, dx) + (rng() - 0.5) * 0.4;
      } else {
        state.wanderHeading += (rng() - 0.5) * 1.2;
      }
    } else {
      state.wanderHeading += (rng() - 0.5) * 1.2;
    }
  }

  // Per-tick safety: if we're wandering near a wall but our heading still
  // points into it, snap the heading toward the arena center. Prevents
  // wander-stuck loops where the heading drifts into a wall and the fish
  // hugs it until the next modeUntil reset (1.5–4s).
  if (state.mode === "wander") {
    const repulseR = AI.wallRepulseRadius;
    const hx = Math.cos(state.wanderHeading);
    const hy = Math.sin(state.wanderHeading);
    const intoWall =
      (fish.x < repulseR && hx < -0.3) ||
      (fish.x > ARENA.width - repulseR && hx > 0.3) ||
      (fish.y < repulseR && hy < -0.3) ||
      (fish.y > ARENA.height - repulseR && hy > 0.3);
    if (intoWall) {
      const dxCenter = ARENA.width / 2 - fish.x;
      const dyCenter = ARENA.height / 2 - fish.y;
      state.wanderHeading = Math.atan2(dyCenter, dxCenter) + (rng() - 0.5) * 0.6;
    }
  }

  // Validate the current target so hysteresis can compare against it.
  let currentPredator: Fish | null = null;
  let currentPredatorD2 = Infinity;
  let currentPrey: Fish | null = null;
  let currentPreyD2 = Infinity;
  if (state.targetId != null) {
    const t = world.fish.get(state.targetId);
    if (t && t.alive) {
      const dx = t.x - fish.x;
      const dy = t.y - fish.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= sightR2) {
        if (t.mass >= fish.mass * AI.threatRatio) {
          currentPredator = t;
          currentPredatorD2 = d2;
        } else if (canEat(fish.mass, t.mass)) {
          currentPrey = t;
          currentPreyD2 = d2;
        }
      }
    }
  }

  let nearestPredator: Fish | null = null;
  let nearestPrey: Fish | null = null;
  let predatorDist = Infinity;
  let preyDist = Infinity;

  for (const other of world.fish.values()) {
    if (other.id === fish.id || !other.alive) continue;
    if (state.blacklist.has(other.id)) continue;
    const dx = other.x - fish.x;
    const dy = other.y - fish.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > sightR2) continue;
    if (other.mass >= fish.mass * AI.threatRatio) {
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

  // Hysteresis: keep the current target unless a new candidate is meaningfully closer.
  const hystSq = AI.targetSwitchHysteresis * AI.targetSwitchHysteresis;
  let chosenPredator: Fish | null;
  if (currentPredator && nearestPredator && currentPredator.id !== nearestPredator.id) {
    chosenPredator = predatorDist < hystSq * currentPredatorD2 ? nearestPredator : currentPredator;
  } else {
    chosenPredator = nearestPredator ?? currentPredator;
  }
  let chosenPrey: Fish | null;
  if (currentPrey && nearestPrey && currentPrey.id !== nearestPrey.id) {
    chosenPrey = preyDist < hystSq * currentPreyD2 ? nearestPrey : currentPrey;
  } else {
    chosenPrey = nearestPrey ?? currentPrey;
  }

  let speed: number = AI.wanderSpeed;
  let tvx = Math.cos(state.wanderHeading);
  let tvy = Math.sin(state.wanderHeading);

  if (chosenPredator) {
    const wasFleeing = state.mode === "flee";
    if (state.targetId !== chosenPredator.id) {
      state.targetId = chosenPredator.id;
      state.targetSince = now;
    }
    state.mode = "flee";
    if (!wasFleeing) state.fleeStartedAt = now;
    // Refresh commitment + memory each tick while predator is in sight; the
    // commitment window only counts down once the predator leaves the sight
    // radius.
    state.modeUntil = now + AI.fleeMinDurationMs;
    state.fleeLastKnownX = chosenPredator.x;
    state.fleeLastKnownY = chosenPredator.y;
    state.fleeMemoryUntil = now + AI.fleeMinDurationMs + AI.fleeMemoryMs;
    const dx = fish.x - chosenPredator.x;
    const dy = fish.y - chosenPredator.y;
    const len = Math.hypot(dx, dy) || 1;
    tvx = dx / len;
    tvy = dy / len;
    speed = fleeSpeedAt(now - state.fleeStartedAt);
  } else if (state.mode === "flee" && now < state.modeUntil) {
    // Predator slipped out of sight but the commitment window hasn't elapsed.
    // Keep running away from the last-known position so the fish doesn't
    // immediately turn back the moment the predator hits the sight boundary.
    const dx = fish.x - state.fleeLastKnownX;
    const dy = fish.y - state.fleeLastKnownY;
    const len = Math.hypot(dx, dy) || 1;
    tvx = dx / len;
    tvy = dy / len;
    speed = fleeSpeedAt(now - state.fleeStartedAt);
  } else if (chosenPrey) {
    if (state.targetId !== chosenPrey.id) {
      state.targetId = chosenPrey.id;
      state.targetSince = now;
    }
    state.mode = "chase";
    state.modeUntil = now + 1500;
    const dx = chosenPrey.x - fish.x;
    const dy = chosenPrey.y - fish.y;
    const len = Math.hypot(dx, dy) || 1;
    tvx = dx / len;
    tvy = dy / len;
    speed = AI.chaseSpeed;
  } else if (state.targetId !== null) {
    state.targetId = null;
    state.targetSince = now;
  }

  // Smooth wall repulsion field. Contributes 0 when far from any wall and
  // ramps up with a squared falloff as distance shrinks toward zero. Strong
  // enough at very close range to overpower a wander/flee pointing into the
  // wall — fixes the old "AI hugs the wall and crawls" failure mode where the
  // hard +0.3 clamp left the unit vector tiny.
  const repulseR = AI.wallRepulseRadius;
  const repulseW = AI.wallRepulseWeight;
  const leftD = fish.x;
  const rightD = ARENA.width - fish.x;
  const topD = fish.y;
  const botD = ARENA.height - fish.y;
  if (leftD < repulseR)  tvx += Math.pow(1 - leftD / repulseR, 2) * repulseW;
  if (rightD < repulseR) tvx -= Math.pow(1 - rightD / repulseR, 2) * repulseW;
  if (topD < repulseR)   tvy += Math.pow(1 - topD / repulseR, 2) * repulseW;
  if (botD < repulseR)   tvy -= Math.pow(1 - botD / repulseR, 2) * repulseW;

  // Neighbor separation: blend in a push-away from same-tier fish (peers, not
  // eat/eaten). fishHash reflects last tick's positions (rebuilt at end of step),
  // which is fine for steering. Empty on tick 0.
  const sepScratch: Fish[] = [];
  world.fishHash.query(fish.x, fish.y, AI.separationRadius, sepScratch);
  let sepX = 0;
  let sepY = 0;
  let sepCount = 0;
  const sepR2 = AI.separationRadius * AI.separationRadius;
  for (const other of sepScratch) {
    if (other.id === fish.id || !other.alive) continue;
    if (canEat(other.mass, fish.mass) || canEat(fish.mass, other.mass)) continue;
    const dx = fish.x - other.x;
    const dy = fish.y - other.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 0.001 || d2 > sepR2) continue;
    sepX += dx / d2;
    sepY += dy / d2;
    sepCount++;
  }
  if (sepCount > 0) {
    const sepLen = Math.hypot(sepX, sepY);
    if (sepLen > 0) {
      tvx += (sepX / sepLen) * AI.separationWeight;
      tvy += (sepY / sepLen) * AI.separationWeight;
    }
  }

  // Final clamp: the steering target must be a unit vector at most, otherwise
  // wall repulsion at close range could ramp the desired velocity past the
  // mode speed and the fish would visibly turbo-boost away from walls.
  const mag = Math.hypot(tvx, tvy);
  if (mag > 1) {
    tvx /= mag;
    tvy /= mag;
  }

  fish.targetVx = tvx;
  fish.targetVy = tvy;

  const massMult = massSpeedMult(fish.mass);
  const desiredVx = tvx * speed * massMult;
  const desiredVy = tvy * speed * massMult;
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
