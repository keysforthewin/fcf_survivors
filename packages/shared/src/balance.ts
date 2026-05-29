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
  /** Center distance at which a piercing vehicle (car) triggers a panic dodge. Cars pierce every
   *  fish, so AI of any size flees them like a lethal predator regardless of relative mass. */
  carAvoidRadius: 750,
  /**
   * Mass ratio at which a nearby fish counts as a threat. Lower than FISH.eatRatio (1.15)
   * so the AI starts running before the other fish is technically eat-eligible — eliminates
   * the "AI loiters next to a slightly-bigger player" stuck pattern.
   */
  threatRatio: 0.95,
  /** Hard cap on AI mass. AI fish never shrink (exempt from decay), so without
   * this they'd grow without bound — keep them modest relative to players. */
  maxMass: 200,
  /** Prey-detection + aggro-ramp radius grows this many units per mass above startMassMax — bigger
   * fish sense prey from farther, so the player must be evasive around large AI. (Threat/flee
   * detection stays at the fixed sightRadius — this only makes hunting more aggressive.) */
  huntRadiusPerMass: 6.75,
  /** Cap on the scaled hunt radius. Sits below leashRadiusMax so a fish never detects prey it
   * can't pursue (≈ aiHuntRadius(maxMass)). */
  huntRadiusMax: 1500,
  /** Chase leash grows this many units per mass above startMassMax so a big fish can actually
   * pursue the prey it now detects out past its hunt radius (and is harder to shake). */
  leashRadiusPerMass: 4.5,
  /** Cap on the scaled leash. Kept above huntRadiusMax so any detected prey is commit-eligible. */
  leashRadiusMax: 2000,
  /** Aggro ramp/sec grows this much per mass above startMassMax — big fish lock on in fewer ticks
   * of loiter (~7 ticks at maxMass vs ~20 at the floor). */
  aggroRampPerMass: 0.0115,
  /** Cap on the scaled aggro ramp/sec. */
  aggroRampMax: 3.0,
} as const;

/**
 * AI aggro: fish no longer chase edible prey on sight. A per-target aggro meter accumulates
 * while an edible target loiters inside `radius` (rampPerSec) and from nibble damage taken
 * (perDamage); once it crosses `commitThreshold + aggroJitter*jitterSpan` (per-fish jitter so a
 * school doesn't commit in lockstep) the fish commits to an "angered" chase. An angered chase
 * has a long leash (`leashRadius`, well past sightRadius) and a refreshed `commitMs` window so
 * it's hard to shake. Aggro decays (`decayPerSec`) when the target isn't present; the chase
 * drops when the meter falls below `dropThreshold` or the target is lost past leash. Flee is
 * unaffected (predators are always fled immediately). Deterministic: no per-tick RNG.
 *
 * NOTE: `radius`, `rampPerSec`, and `leashRadius` are the *small-fish floors* of the mass-scaled
 * `aiHuntRadius` / `aiAggroRamp` / `aiLeashRadius` helpers — bigger AI fish detect, lock onto, and
 * chase prey from progressively farther (see those helpers + AI.hunt/leash/aggroRamp* constants).
 */
export const AGGRO = {
  radius: 320,
  rampPerSec: 1.0,
  decayPerSec: 0.6,
  commitThreshold: 1.0,
  jitterSpan: 1.5,
  dropThreshold: 0.3,
  perDamage: 0.25,
  /** Hard cap on a target's meter so a long engagement can't build an un-droppable grudge. */
  maxMeter: 4,
  leashRadius: 1200,
  commitMs: 5000,
  loseMemoryMs: 1500,
} as const;

export const VIEW = {
  baseRadius: 1500,
  perLogMass: 200,
} as const;

/**
 * Feeding frenzy: a kill scatters gold XP balls (DEATH_XP_DROP / BURP). Any AI fish with a
 * dropped XP ball within `radius` immediately abandons its wander/hunt and rushes the nearest
 * one at `speed` — a screen-wide scramble for the free XP. Flee always wins: a bigger fish in
 * AI.sightRadius scares the fish off first, so small fish don't suicide chasing food.
 * `radius` ≈ VIEW.baseRadius so "a ball on your screen → rush it"; it deliberately reaches
 * farther than AGGRO.leashRadius (1200) and AI.sightRadius (400) so the whole visible area
 * converges. `speed` sits just above chaseSpeed (220) / steady fleeSpeed (240) — eager, but a
 * panicking fish (fleePanicSpeed 380) still out-sprints it.
 */
export const FRENZY = {
  radius: 1500,
  speed: 260,
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
  // Behind-approach reach: when a predator is in its target's REAR arc and pointed at it
  // (i.e. chasing it from behind), the engage distance for eat/bite/nibble extends far past
  // contact. Scaled by Close Encounters for players (AI gets the base). This is what lets a
  // chase actually land — fleeing prey is, by definition, approached from behind.
  behindCos: 0.4,          // rear-arc threshold on the TARGET's heading (~133° arc). aheadDot <= -behindCos = behind.
  behindReachBonus: 140,   // base extra px (added to rA+rB+contactMargin) for a behind approach, before the passive mult.
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
  /** Stronger forward lurch when actually swallowing prey whole (vs a nibble). */
  eatLungeImpulse: 380,
  /** Min time between lunges per attacker so sustained contact doesn't stack into a rocket. */
  cooldownMs: 320,
  /**
   * Damage (per attacker level) of a BITE — a fish chomping prey it is bigger than but cannot yet
   * swallow (the "between zone": bigger but under the 1.15× ratio, or equal size). Light by design
   * so swallowing whole (15% bigger → eat + 2× XP) stays the faster, more rewarding path; repeated
   * bites just soften prey until the swallow ratio is crossed. Routed through the mass-loss model
   * like a nibble. (Nibbling a BIGGER fish still uses NIBBLE.damagePerLevel.)
   */
  biteDamagePerLevel: 2,
  /** Extra px added to rA+rB for the client-side own-fish bite detector. */
  contactPad: 6,
  /** Mouth-open "gulp" deformation (fraction) applied to the sprite over the envelope. */
  gulp: 0.3,
  /** Bite animation envelope (ms). */
  animMs: 240,
  /** Pronounced mouth-open "gulp" when swallowing prey whole — the comical chomp. */
  eatGulp: 0.62,
  /** Eat (swallow) animation envelope (ms) — a beat longer than a nibble so the chomp reads. */
  eatAnimMs: 340,
  /** Quick small nip deformation when nibbling a bigger fish. */
  nibbleGulp: 0.22,
  /** Nibble animation envelope (ms) — short and snappy. */
  nibbleAnimMs: 150,
} as const;

/**
 * Nibble: a smaller fish in contact with a bigger one takes a bite out of it for
 * damage = attacker.level * damagePerLevel, routed through the mass-loss model. Gated
 * by the same cooldown as the bite lunge so sustained contact can't machine-gun damage.
 * Nibbling does NOT eat the bigger fish; sustained nibble damage feeds AI aggro (see AGGRO).
 */
export const NIBBLE = {
  damagePerLevel: 1,
  cooldownMs: BITE.cooldownMs,
} as const;

/**
 * XP burp: when a fish swallows another whole, the kill's XP (xpDroppedOnDeath) is sprayed
 * forward out of the eater's mouth as collectable chunks (carrying `xp`, no mass — the swallow
 * already granted the eater the prey's mass). They're locked (uncollectable by anyone) for
 * `lockMs` so others get a chance to swim in, and the forward speed is sized so a stationary eater's spray lands
 * ~`landFraction` of a screen ahead (see spawnBurpChunk; travelPerSpeed = Σ 0.94^k · dt).
 */
export const BURP = {
  /** Render size of a burp orb (`mass` on the wire — purely visual; pickup grants `xp`, not mass).
   *  Big so the swallow reward reads as "a huge ball of XP". */
  visualMass: 60,
  lifetimeMs: 12_000,
  /** The gold XP ball is uncollectable by ANYONE for this long after a swallow, then it's a
   *  free-for-all — gives nearby players time to swim in and contest the eater's reward. */
  lockMs: 2_000,
  spreadRad: 0.5,
  /** Burp as a SINGLE big orb (not a fan) — one chunk carries the whole (2×) XP payload. */
  count: 1,
  /** Multiplier on the swallowed fish's XP (xpDroppedOnDeath) — eating whole is worth 4× a
   *  damage-kill, so swallowing is strictly better than chipping a fish to death. */
  eatXpMult: 4,
  /** Land the orb just ahead of the mouth so it's easy to scoop up (it's locked for lockMs first). */
  landFraction: 0.25,
  travelPerSpeed: 0.8333,
} as const;

/**
 * When a fish dies from DAMAGE (weapons/nibble — not swallowed whole) it scatters a swarm of
 * cheap gold XP balls where it fell, instead of handing the killer XP automatically. Anyone can
 * collect them, so a kill turns into a contested PvP scrum. The dead fish's whole XP value
 * (xpDroppedOnDeath) is split evenly across the balls — lots of them, each worth little.
 */
export const DEATH_XP_DROP = {
  /** Render size of each scattered ball (visual only — pickup grants xp, not mass). Small so the
   *  swarm reads as "lots of little pickups", distinct from the one big swallow ball. */
  visualMass: 10,
  /** Target XP per ball — the ball count is sized so each ball is worth roughly this. At 1 the
   *  swarm is ~3× the balls it used to be (a big, impressive gold shower) for the same total XP. */
  xpPerBall: 1,
  minBalls: 18,
  maxBalls: 120,
  /** Death balls clear a little faster than the 15s corpse-chunk default to bound how many pile up. */
  lifetimeMs: 12_000,
} as const;

/** Spatial-hash query pad covering the largest fish radius in play (~200 at mass 300). Used by
 *  weapon AoE queries and the fish-eat/nibble neighbor query so a tiny fish next to a huge one
 *  still registers contact (the eat query radius scales with the actor's own small radius). */
export const MAX_FISH_RADIUS_PAD = 200;

export function fishRadius(mass: number): number {
  return 2 * (Math.pow(Math.max(1, mass), 0.7) + 8);
}

export function viewRadius(mass: number): number {
  return VIEW.baseRadius + VIEW.perLogMass * Math.log(Math.max(1, mass));
}

/**
 * AI prey-detection + aggro-ramp radius. Scales linearly with the hunter's mass: a fish at or
 * below AI.startMassMax keeps the AGGRO.radius floor, the largest (AI.maxMass) reaches
 * AI.huntRadiusMax. Threat/flee detection deliberately stays at the fixed AI.sightRadius — this
 * only lets big fish hunt from farther, not flee more readily.
 */
export function aiHuntRadius(mass: number): number {
  return Math.min(
    AI.huntRadiusMax,
    AGGRO.radius + AI.huntRadiusPerMass * Math.max(0, mass - AI.startMassMax),
  );
}

/** AI chase leash, scaling with mass so a big fish can pursue the prey it detects out past its
 *  hunt radius. Floors at AGGRO.leashRadius; always exceeds aiHuntRadius so detected prey is
 *  commit-eligible. */
export function aiLeashRadius(mass: number): number {
  return Math.min(
    AI.leashRadiusMax,
    AGGRO.leashRadius + AI.leashRadiusPerMass * Math.max(0, mass - AI.startMassMax),
  );
}

/** AI aggro ramp-per-second, scaling with mass so big fish commit to a chase in fewer ticks of
 *  loiter. Floors at AGGRO.rampPerSec. */
export function aiAggroRamp(mass: number): number {
  return Math.min(
    AI.aggroRampMax,
    AGGRO.rampPerSec + AI.aggroRampPerMass * Math.max(0, mass - AI.startMassMax),
  );
}

export function canEat(predatorMass: number, preyMass: number): boolean {
  return predatorMass >= preyMass * FISH.eatRatio;
}

/**
 * Whether `predator` may swallow `prey` whole. Single source of truth for the fish-eat rule,
 * kept separate from `canEat` (which AI prey/threat/separation logic uses) so the eat threshold
 * can be tuned without rippling into AI decision-making. Currently the same 1.15× advantage.
 */
export function canSwallow(predatorMass: number, preyMass: number): boolean {
  return canEat(predatorMass, preyMass);
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

/** Battle Comms: the slow debuff applied to any fish you damage. */
export const SLOW = {
  /** Move-speed multiplier while slowed. */
  mult: 0.5,
  /** Slow duration (ms) at Battle Comms stack 1. */
  baseMs: 200,
  /** Added slow duration (ms) per Battle Comms stack beyond the first. */
  perStackMs: 100,
} as const;

/** Slow duration (ms) for a Battle Comms stack count. Stack 0 (no passive) = no slow. */
export function battleCommsSlowMs(stack: number): number {
  return stack <= 0 ? 0 : SLOW.baseMs + SLOW.perStackMs * (stack - 1);
}

/** Subversive Sybex: a proximity aura that slows nearby fish so the owner can catch them. */
export const SYBEX = {
  /** Aura radius (px) added per passive stack: stack N reaches N×100px. */
  radiusPerStack: 100,
  /** Move-speed reduction per stack: stack N slows fish in range by N×10%. */
  slowPerStack: 0.10,
  /** Floor on the resulting multiplier so future maxStack bumps can't freeze a fish solid. */
  minMult: 0.1,
} as const;

/** Sybex aura radius (px) for a stack count. Stack 0 = 0 (no aura). */
export function sybexRadius(stack: number): number {
  return stack <= 0 ? 0 : stack * SYBEX.radiusPerStack;
}

/** Move-speed multiplier a Sybex owner imposes on fish in range. Stack 0 = 1 (no slow); stack 5 = 0.5. */
export function sybexSlowMult(stack: number): number {
  return stack <= 0 ? 1 : Math.max(SYBEX.minMult, 1 - SYBEX.slowPerStack * stack);
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
