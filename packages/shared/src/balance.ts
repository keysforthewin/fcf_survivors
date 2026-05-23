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
  targetCount: 600,
  spawnPerTick: 4,
  radius: 6,
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
  return Math.floor(3 * Math.pow(1.05, level));
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
