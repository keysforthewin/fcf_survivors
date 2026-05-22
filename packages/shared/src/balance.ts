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
  baseSpeed: 280,
  boostMultiplier: 3,
  boostDurationMs: 1500,
  boostCooldownMs: 30_000,
  radiusK: 1.6,
  eatRatio: 1.15,
  massTaxOnEat: 0.2,
  hpPerMass: 2,
  minHp: 20,
  damageMassLossRatio: 0.25,
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
} as const;

export const VIEW = {
  baseRadius: 1500,
  perLogMass: 200,
} as const;

export const SPEED_PENALTY = {
  startAtMass: 500,
  fullPenaltyAtMass: 5000,
  minMult: 0.15,
  curveExp: 1.5,
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
  return Math.pow(Math.max(1, mass), 0.7) + 8;
}

export function fishHp(mass: number): number {
  return Math.max(FISH.minHp, mass * FISH.hpPerMass);
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
  const t = massPenaltyT(mass);
  const drop = Math.pow(t, SPEED_PENALTY.curveExp) * (1 - SPEED_PENALTY.minMult);
  return 1 - drop;
}

export function boostDurationMs(mass: number): number {
  const t = massPenaltyT(mass);
  const shrink = Math.pow(t, SPEED_PENALTY.curveExp) * SPEED_PENALTY.boostShrink;
  return Math.max(SPEED_PENALTY.boostMinMs, FISH.boostDurationMs * (1 - shrink));
}

export function xpForLevel(level: number): number {
  return Math.floor(3 * Math.pow(1.05, level));
}
