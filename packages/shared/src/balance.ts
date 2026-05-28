export const ARENA = {
  width: 8000,
  height: 8000,
} as const;

export const TICK = {
  hz: 20,
  ms: 50,
} as const;

export const FISH = {
  startMass: 10,
  baseSpeed: 320,
  boostMultiplier: 3,
  boostDurationMs: 1500,
  boostCooldownMs: 15_000,
  radiusK: 1.6,
  eatRatio: 1.15,
  massTaxOnEat: 0.2,
  /** Mass lost per damage point. Weapons drain mass directly — HP no longer exists. */
  damageMassLossRatio: 0.8,
  /** Player heading rotates toward velocity direction at most this fast. */
  maxTurnRateRadPerSec: 7.5,
} as const;

export const PELLET = {
  massGain: 1,
  targetCount: 150,
  spawnPerTick: 4,
  radius: 6,
  /**
   * Std-dev of the isotropic 2D Gaussian that places pellets, as a fraction of
   * the arena's smaller side (see centerGaussianPoint). Smaller = tighter, denser
   * core; larger = more reach toward the edges. At 0.2 the bulk sits in a central
   * circle (~86% within half the arena radius) and thins out near the walls.
   */
  centerSpread: 0.2,
} as const;

/**
 * Fruit are rarer, bigger "super pellets" that also drop a reroll/banish token
 * for the level-up modal. ~3-4x a pellet in size and food value.
 */
export const FRUIT = {
  massGain: 10,       // worth 10 pellets (pellet = 1)
  xpGain: 10,         // worth 10 pellets
  targetCount: 2,     // only ever 2 on the map at once
  spawnPerTick: 1,
  radius: 36,         // pickup hitbox sized to the big fruit icon
  rerollChance: 0.5,  // P(reward = reroll); else banish
} as const;

export const AI = {
  minPopulation: 20,
  startMassMin: 5,
  startMassMax: 25,
  wanderSpeed: 140,
  fleeSpeed: 240,
  chaseSpeed: 220,
  sightRadius: 400,
  /** Switch targets only if a new candidate's distance is < this fraction of the current target's distance. */
  targetSwitchHysteresis: 0.75,
  /** Sample interval for stuck detection (ms). */
  stuckSampleIntervalMs: 500,
  /** Below this displacement per sample window, the fish is considered not moving. */
  stuckThreshold: 30,
  /** Time stuck-with-a-target before the target is blacklisted (ms). */
  stuckTriggerMs: 3000,
  /** How long a blacklisted target stays ignored (ms). */
  blacklistDurationMs: 20000,
  /** Hard cap on neighbor-separation query radius (units). Effective radius is min(this, 2 * fishRadius). */
  separationRadius: 80,
  /** Blend weight of the unit separation vector added to the steering direction. */
  separationWeight: 0.35,
  /** Distance from any wall at which the smooth repulsion field starts contributing. */
  wallRepulseRadius: 400,
  /** Strength of the repulsion field added to the steering vector (squared falloff with distance). Strong enough at close range to overpower a wander/flee pointing into the wall. */
  wallRepulseWeight: 2.5,
  /** AI fish heading rotates toward velocity direction at most this fast — slower than the player so the snap visibly resolves. */
  maxTurnRateRadPerSec: 3.5,
  /** Minimum commitment to flee once entered, regardless of predator visibility. */
  fleeMinDurationMs: 2500,
  /** Speed at the moment a flee starts — decays linearly to fleeSpeed over fleePanicDurationMs. */
  fleePanicSpeed: 380,
  /** Duration of the panic burst that decays to fleeSpeed. */
  fleePanicDurationMs: 700,
  /** After flee expires, bias wander heading away from the last-known predator for this long. */
  fleeMemoryMs: 2500,
  /**
   * Mass ratio at which a nearby fish counts as a threat. Lower than FISH.eatRatio (1.15)
   * so the AI starts running before the other fish is technically eat-eligible — eliminates
   * the "AI loiters next to a slightly-bigger player" stuck pattern.
   */
  threatRatio: 0.95,
  /** Hard cap on AI mass. AI fish never shrink (exempt from decay), so without
   * this they'd grow without bound — keep them modest relative to players. */
  maxMass: 200,
} as const;

export const VIEW = {
  baseRadius: 1500,
  perLogMass: 200,
} as const;

export const MASS_DECAY = {
  /** Hard cap on player mass — eating cannot push past this. */
  maxMass: 5000,
} as const;

/** Hard mass cap for a fish — eating cannot push it past this. AI fish stop at
 * AI.maxMass; players at MASS_DECAY.maxMass. */
export function massCapFor(isAi: boolean): number {
  return isAi ? AI.maxMass : MASS_DECAY.maxMass;
}

export const SPEED_PENALTY = {
  /** Mass at which the speed multiplier equals 1.0 — neutral point. */
  refMass: 100,
  /** Power-law exponent: mult = (refMass / mass) ^ speedExp. Higher = sharper falloff. */
  speedExp: 0.40,
  /** Cap for tiny fish — without this a mass-10 fish would reach 2.51x baseSpeed. */
  maxMult: 2.0,
  /** Floor for whales. */
  minMult: 0.10,
  // Boost-duration shrink — uses a separate t-curve (massPenaltyT) anchored to these.
  startAtMass: 100,
  fullPenaltyAtMass: 2500,
  curveExp: 2.0,
  boostShrink: 0.75,
  boostMinMs: 350,
} as const;

export const MOUTH = {
  coneCos: 0.5,
  suctionExtraRadius: 6,
  suctionPullPerTick: 0.45,
  stationaryHeadingEps: 0.05,
  // Extra grab/suction distance beyond the body before a fish can vacuum prey in.
  // Scaled by the Close Encounters passive (getEatRangeMult).
  reachBonus: 80,
  // Any-contact eating: a fish eats edible prey the moment their hitboxes overlap from
  // ANY angle (dist <= rA + rB + contactMargin). The front cone + suction below only
  // governs the *bonus reach* that vacuums prey in from in front — the eat itself is
  // omnidirectional. A few px of margin makes "just touching" feel responsive.
  contactMargin: 6,
} as const;

/**
 * Bite lurch: when a fish's hitbox contacts edible prey it lunges forward and chomps.
 * The lunge is a real one-shot velocity impulse (applied client-side in stepSelf for the
 * player's own fish, server-side for AI eaters) so it flows through the same movement
 * physics the server trusts. The animation (mouth-open "gulp" deform + chomp particles)
 * is cosmetic on top.
 */
export const SPAWN = {
  /**
   * Newly spawned / respawned players cannot be eaten for this long. With any-contact
   * eating (see MOUTH.contactMargin), a fresh mass-10 fish that spawns next to a bigger
   * one would otherwise be chomped instantly. The window gives players time to orient and
   * swim clear. AI fish are not protected.
   */
  protectMs: 3000,
} as const;

export const BITE = {
  /** One-shot forward velocity bump (px/s) added along heading on a bite. Decays via ACCEL. */
  lungeImpulse: 240,
  /** Min time between lunges per attacker so sustained contact doesn't stack into a rocket. */
  cooldownMs: 320,
  /** Extra px added to rA+rB for the client-side own-fish bite detector. */
  contactPad: 6,
  /** Mouth-open "gulp" deformation (fraction) applied to the sprite over the envelope. */
  gulp: 0.3,
  /** Bite animation envelope (ms). */
  animMs: 240,
} as const;

export function fishRadius(mass: number): number {
  return 2 * (Math.pow(Math.max(1, mass), 0.7) + 8);
}

export function viewRadius(mass: number): number {
  return VIEW.baseRadius + VIEW.perLogMass * Math.log(Math.max(1, mass));
}

export function canEat(predatorMass: number, preyMass: number): boolean {
  return predatorMass >= preyMass * FISH.eatRatio;
}

export function massPenaltyT(mass: number): number {
  const span = SPEED_PENALTY.fullPenaltyAtMass - SPEED_PENALTY.startAtMass;
  return Math.max(0, Math.min(1, (mass - SPEED_PENALTY.startAtMass) / span));
}

export function massSpeedMult(mass: number): number {
  const m = Math.max(1, mass);
  const raw = Math.pow(SPEED_PENALTY.refMass / m, SPEED_PENALTY.speedExp);
  return Math.max(SPEED_PENALTY.minMult, Math.min(SPEED_PENALTY.maxMult, raw));
}

export function boostDurationMs(mass: number): number {
  const t = massPenaltyT(mass);
  const shrink = Math.pow(t, SPEED_PENALTY.curveExp) * SPEED_PENALTY.boostShrink;
  return Math.max(SPEED_PENALTY.boostMinMs, FISH.boostDurationMs * (1 - shrink));
}

/**
 * Mass decay scales as a power-law of current mass: rate = 0.5 * (mass / 100)^1.2.
 * Calibrated so a fresh spawn at startMass barely bleeds (~0.03/s), a 100-mass
 * fish loses ~0.5/s, a 1000-mass fish ~8/s, and a 5000-mass leviathan ~55/s.
 * Returns 0 at or below startMass so a just-spawned fish stays at start mass.
 */
export function massDecayPerSec(mass: number): number {
  if (mass <= FISH.startMass) return 0;
  return 0.5 * Math.pow(mass / 100, 1.2);
}

export function xpForLevel(level: number): number {
  return Math.floor(10 * Math.pow(1.1, level - 1));
}

/**
 * Sample a pellet spawn point as an isotropic 2D Gaussian centered on the arena:
 * a dense circular core fading smoothly to sparse edges and (sparsest) corners.
 *
 * Biasing each axis independently with a power law produces a "crosshair" —
 * density piles up along the central rows and columns — because that product
 * isn't radially symmetric. A Gaussian is the one product distribution that IS
 * circular: exp(-x²/2σ²)·exp(-y²/2σ²) depends only on x²+y², so its contours are
 * circles. This matches where fish actually roam (out from the middle).
 *
 * `spread` is the standard deviation as a fraction of the arena's smaller side
 * (≈0.2 keeps ~96% of pellets inside the inscribed circle). Out-of-bounds draws
 * are rejected and re-rolled so density never piles up on the walls; after a few
 * misses we clamp the last sample (vanishingly rare at the default spread).
 */
export function centerGaussianPoint(rng: () => number, spread: number): { x: number; y: number } {
  const sigma = spread * Math.min(ARENA.width, ARENA.height);
  const cx = ARENA.width / 2;
  const cy = ARENA.height / 2;
  let x = cx;
  let y = cy;
  for (let attempt = 0; attempt < 8; attempt++) {
    // Box-Muller: two uniforms → one circularly-symmetric (x, y) sample
    // (Rayleigh-distributed radius, uniform angle).
    const u1 = Math.max(rng(), 1e-12); // guard against log(0)
    const u2 = rng();
    const mag = sigma * Math.sqrt(-2 * Math.log(u1));
    const ang = 2 * Math.PI * u2;
    x = cx + mag * Math.cos(ang);
    y = cy + mag * Math.sin(ang);
    if (x >= 0 && x <= ARENA.width && y >= 0 && y <= ARENA.height) break;
  }
  return {
    x: Math.min(ARENA.width, Math.max(0, x)),
    y: Math.min(ARENA.height, Math.max(0, y)),
  };
}

/** XP awarded to the killer when their victim dies. Higher-level victims drop more. */
export function xpDroppedOnDeath(victimLevel: number, victimMass: number): number {
  const baseFromMass = Math.max(5, Math.floor(victimMass * 1.5));
  return baseFromMass + Math.max(0, victimLevel - 1) * 25;
}

/**
 * Rotate a unit-vector heading toward a target unit-vector heading at a clamped angular rate.
 * Returns the new unit vector. Caller is responsible for handling near-zero target vectors.
 */
export function rotateHeadingToward(
  hx: number, hy: number,
  tx: number, ty: number,
  maxRad: number,
): [number, number] {
  const tmag = Math.hypot(tx, ty);
  if (tmag < 1e-6) return [hx, hy];
  const ux = tx / tmag;
  const uy = ty / tmag;
  const cur = Math.atan2(hy, hx);
  const tgt = Math.atan2(uy, ux);
  let delta = tgt - cur;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const step = Math.max(-maxRad, Math.min(maxRad, delta));
  const next = cur + step;
  return [Math.cos(next), Math.sin(next)];
}
