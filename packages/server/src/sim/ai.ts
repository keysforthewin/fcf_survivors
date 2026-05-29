import { AGGRO, AI, ARENA, FRENZY, SPECIES, canEat, massSpeedMult } from "@fcf/shared";
import type { EntityId } from "@fcf/shared";
import type { AiState, Chunk, Fish } from "./entity.ts";
import type { World } from "./world.ts";

/**
 * Add aggro toward `attackerId` (clamped to AGGRO.maxMeter). Called from the fish-eat loop when a
 * smaller fish nibbles this AI — sustained nibble damage crosses the commit threshold and turns the
 * AI on its attacker. Lazy-inits the meter map so a harness-built AiState (no `aggro`) is safe.
 */
export function addAggro(state: AiState, attackerId: EntityId, amount: number): void {
  if (!state.aggro) state.aggro = new Map();
  state.aggro.set(attackerId, Math.min(AGGRO.maxMeter, (state.aggro.get(attackerId) ?? 0) + amount));
}
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
    clientAuthoritative: false,
    headingX: 1,
    headingY: 0,
    mass: m,
    color: pick(AI_COLORS, rng),
    species: pick(SPECIES, rng).id,
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
      aggro: new Map(),
      angeredTargetId: null,
      chaseLastKnownX: 0,
      chaseLastKnownY: 0,
      chaseCommitUntil: 0,
      aggroJitter: rng(),
      feedTargetId: null,
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

// Reused across updateAi calls so the per-tick frenzy query allocates nothing. SpatialHash.query
// appends, so callers must reset length to 0 first (mirrors the scratch pattern in world.ts).
const feedScratch: Chunk[] = [];

/**
 * Nearest dropped XP ball (an xp-bearing chunk) within FRENZY.radius of the fish, or null. Includes
 * locked burp balls — the fish gathers around the big gold ball until it arms (flee still protects
 * it from the eater). Light hysteresis (AI.targetSwitchHysteresis, mirroring the fish-target logic)
 * keeps the fish committed to its current ball unless a new one is meaningfully closer, so it
 * doesn't jitter between near-equidistant balls in a swarm.
 */
function nearestFeedChunk(world: World, fish: Fish, state: AiState): Chunk | null {
  feedScratch.length = 0;
  world.chunkHash.query(fish.x, fish.y, FRENZY.radius, feedScratch);
  const r2 = FRENZY.radius * FRENZY.radius;
  let nearest: Chunk | null = null;
  let nearestD2 = Infinity;
  let current: Chunk | null = null;
  let currentD2 = Infinity;
  for (const c of feedScratch) {
    if (c.xp === undefined) continue; // XP balls only — ignore mass-bearing corpse chunks
    const dx = c.x - fish.x;
    const dy = c.y - fish.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue; // the hash is cell-granular — enforce the exact radius
    if (c.id === state.feedTargetId) { current = c; currentD2 = d2; }
    if (d2 < nearestD2) { nearestD2 = d2; nearest = c; }
  }
  if (current && nearest && nearest.id !== current.id) {
    const hystSq = AI.targetSwitchHysteresis * AI.targetSwitchHysteresis;
    return nearestD2 < hystSq * currentD2 ? nearest : current;
  }
  return nearest;
}

export function updateAi(fish: Fish, world: World, now: number, dt: number): void {
  if (!fish.isAi || !fish.aiState) return;
  const state = fish.aiState;
  const rng = world.rng;
  const sightR2 = AI.sightRadius * AI.sightRadius;

  // Lazy-init aggro fields: the cucumber harness builds AiState literals that omit them (tests are
  // not typechecked), so default them here rather than assume spawnAiFish ran.
  if (!state.aggro) state.aggro = new Map();
  if (state.aggroJitter === undefined) state.aggroJitter = 0;
  if (state.angeredTargetId === undefined) state.angeredTargetId = null;
  if (state.chaseCommitUntil === undefined) state.chaseCommitUntil = 0;
  if (state.chaseLastKnownX === undefined) state.chaseLastKnownX = 0;
  if (state.chaseLastKnownY === undefined) state.chaseLastKnownY = 0;
  if (state.feedTargetId === undefined) state.feedTargetId = null;

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
      // Blacklist whatever we were locked onto (committed angered target or plain targetId) and
      // drop its aggro so the commit scan below can't immediately re-anger us at the same fish.
      const lost = state.targetId ?? state.angeredTargetId;
      if (lost != null) {
        state.blacklist.set(lost, now + AI.blacklistDurationMs);
        state.aggro.delete(lost);
      }
      state.targetId = null;
      state.angeredTargetId = null;
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

  // --- Aggro meters (deterministic, no RNG) ---
  // The nearest edible prey loitering inside AGGRO.radius ramps its meter; every other entry
  // decays and is pruned. Nibble damage adds to meters out-of-band via addAggro() (world.ts).
  const aggroR2 = AGGRO.radius * AGGRO.radius;
  let rampId: EntityId | null = null;
  if (chosenPrey) {
    const pdx = chosenPrey.x - fish.x;
    const pdy = chosenPrey.y - fish.y;
    if (pdx * pdx + pdy * pdy <= aggroR2) rampId = chosenPrey.id;
  }
  const aggroDecay = AGGRO.decayPerSec * dt;
  for (const [id, v] of state.aggro) {
    if (id === rampId) continue;
    const nv = v - aggroDecay;
    if (nv <= 0) state.aggro.delete(id);
    else state.aggro.set(id, nv);
  }
  if (rampId !== null) {
    state.aggro.set(rampId, Math.min(AGGRO.maxMeter, (state.aggro.get(rampId) ?? 0) + AGGRO.rampPerSec * dt));
  }

  // Feeding frenzy: nearest dropped XP ball within screen range (FRENZY). Computed before the mode
  // chain so it can slot in as a branch below flee but above chase/wander. Guarded by chunks.size
  // so the common (no drops on the map) case does zero work.
  const feedChunk = world.chunks.size > 0 ? nearestFeedChunk(world, fish, state) : null;

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
  } else if (feedChunk) {
    // --- Feeding frenzy: rush the nearest dropped XP ball (FRENZY). Sits below flee (a predator
    // in sight already took the branches above, so small fish never suicide for food) but above
    // chase/wander, so a kill's gold shower pulls every nearby fish off whatever it was doing.
    // angeredTargetId is left intact, so the fish resumes its hunt once the balls are gone. ---
    state.mode = "feed";
    state.modeUntil = now + 1500;
    state.feedTargetId = feedChunk.id;
    const dx = feedChunk.x - fish.x;
    const dy = feedChunk.y - fish.y;
    const len = Math.hypot(dx, dy) || 1;
    tvx = dx / len;
    tvy = dy / len;
    speed = FRENZY.speed;
  } else {
    // --- Angered chase (replaces immediate prey-on-sight chase) ---
    // Fish no longer chase prey the instant it's in range. A target chases only once its aggro
    // meter (built by loitering in AGGRO.radius and/or nibble damage) crosses the per-fish
    // commit threshold; then it pursues out to AGGRO.leashRadius (well past sight) with a
    // last-known grace, so it's much harder to shake. Drops when the meter decays out or the
    // target is lost past the leash.
    const commitLevel = AGGRO.commitThreshold + state.aggroJitter * AGGRO.jitterSpan;
    const leash2 = AGGRO.leashRadius * AGGRO.leashRadius;

    // Drop a stale commitment (target gone or cooled off below dropThreshold).
    if (state.angeredTargetId !== null) {
      const t = world.fish.get(state.angeredTargetId);
      const meter = state.aggro.get(state.angeredTargetId) ?? 0;
      if (!t || !t.alive || meter < AGGRO.dropThreshold) state.angeredTargetId = null;
    }
    // Commit to the highest-meter target that has crossed the (jittered) threshold and is in leash.
    if (state.angeredTargetId === null) {
      let bestId: EntityId | null = null;
      let bestMeter = commitLevel;
      for (const [id, v] of state.aggro) {
        if (v < bestMeter) continue;
        if (state.blacklist.has(id)) continue; // don't re-anger at a blacklisted (stuck-recovery) target
        const t = world.fish.get(id);
        if (!t || !t.alive) continue;
        const ddx = t.x - fish.x;
        const ddy = t.y - fish.y;
        if (ddx * ddx + ddy * ddy > leash2) continue;
        bestMeter = v;
        bestId = id;
      }
      if (bestId !== null) {
        state.angeredTargetId = bestId;
        state.chaseCommitUntil = now + AGGRO.loseMemoryMs;
      }
    }

    if (state.angeredTargetId !== null) {
      const t = world.fish.get(state.angeredTargetId);
      if (t && t.alive) {
        const ddx = t.x - fish.x;
        const ddy = t.y - fish.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 <= leash2) {
          // In leash: chase the target directly, refresh last-known + grace.
          if (state.targetId !== t.id) { state.targetId = t.id; state.targetSince = now; }
          state.mode = "chase";
          state.modeUntil = now + 1500;
          state.chaseLastKnownX = t.x;
          state.chaseLastKnownY = t.y;
          state.chaseCommitUntil = now + AGGRO.loseMemoryMs;
          const len = Math.hypot(ddx, ddy) || 1;
          tvx = ddx / len;
          tvy = ddy / len;
          speed = AI.chaseSpeed;
          // Keep the meter hot while actively engaging up close (if not already the ramp target).
          if (d2 <= aggroR2 && rampId !== t.id) {
            state.aggro.set(t.id, Math.min(AGGRO.maxMeter, (state.aggro.get(t.id) ?? 0) + AGGRO.rampPerSec * dt));
          }
        } else if (now < state.chaseCommitUntil) {
          // Slipped past the leash but still within the grace window — pursue last-known.
          state.mode = "chase";
          state.modeUntil = now + 1500;
          const dx = state.chaseLastKnownX - fish.x;
          const dy = state.chaseLastKnownY - fish.y;
          const len = Math.hypot(dx, dy) || 1;
          tvx = dx / len;
          tvy = dy / len;
          speed = AI.chaseSpeed;
        } else {
          // Lost it — give up and return to wandering.
          state.angeredTargetId = null;
          if (state.targetId !== null) { state.targetId = null; state.targetSince = now; }
        }
      } else {
        state.angeredTargetId = null;
        if (state.targetId !== null) { state.targetId = null; state.targetSince = now; }
      }
    } else if (state.targetId !== null) {
      state.targetId = null;
      state.targetSince = now;
    }
  }

  // Drop the feed target whenever we're not actively feeding, so a stale id can't leak into the
  // hysteresis in nearestFeedChunk on a later frenzy.
  if (state.mode !== "feed") state.feedTargetId = null;

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
