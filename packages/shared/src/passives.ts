export type PassiveId =
  | "fin" | "gulp" | "scales" | "teeth" | "reflex" | "magnet" | "recovery" | "hungry" | "closeEncounters" | "comms" | "sybex";

export type PassiveEffect =
  | "moveSpeedMult"
  | "pelletXpMult"
  | "damageTakenMult"
  | "weaponDmgMult"
  | "weaponCdMult"
  | "pickupMult"
  | "boostCdMult"
  | "fishEatMassMult"
  | "fishEatRangeMult"
  | "enemySlowOnHit"
  | "proximitySlow";

export interface PassiveDef {
  id: PassiveId;
  name: string;
  description: string;
  maxStack: number;
  /**
   * Multiplicative passives: per-stack multiplier (1.10 = +10%, 0.92 = −8%).
   * Flat passives (`flat: true`): signed integer delta per stack (+1, −1) — not a multiplier.
   */
  perStack: number;
  /** True = additive integer per stack (perStack is a flat delta applied via + rather than ×). */
  flat?: boolean;
  effect: PassiveEffect;
}

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  fin: {
    id: "fin",      name: "Rae's Horses",    description: "+10% move speed per stack.",
    maxStack: 5, perStack: 1.10, effect: "moveSpeedMult",
  },
  gulp: {
    id: "gulp",     name: "Zunneh Base",     description: "+15% XP from pellets.",
    maxStack: 5, perStack: 1.15, effect: "pelletXpMult",
  },
  scales: {
    id: "scales",   name: "Full Metal",      description: "−1 damage taken per stack (always at least 1).",
    maxStack: 5, perStack: -1, flat: true, effect: "damageTakenMult",
  },
  teeth: {
    id: "teeth",    name: "Mmiguel's Aim",   description: "+1 weapon damage per stack.",
    maxStack: 5, perStack: 1, flat: true, effect: "weaponDmgMult",
  },
  reflex: {
    id: "reflex",   name: "Trillian's Soul", description: "−8% weapon cooldown per stack.",
    maxStack: 5, perStack: 0.92, effect: "weaponCdMult",
  },
  magnet: {
    id: "magnet",   name: "Morning Raids",   description: "+50% pellet pickup radius per stack.",
    maxStack: 3, perStack: 1.50, effect: "pickupMult",
  },
  recovery: {
    id: "recovery", name: "Diesel Tax",      description: "−20% boost cooldown per stack (max −80%).",
    maxStack: 4, perStack: 0.80, effect: "boostCdMult",
  },
  hungry: {
    id: "hungry",   name: "Pumpkin Farm",    description: "+5% mass per fish eaten per stack.",
    maxStack: 4, perStack: 1.05, effect: "fishEatMassMult",
  },
  closeEncounters: {
    id: "closeEncounters", name: "Close Encounters", description: "+20% eating range in front of you per stack.",
    maxStack: 5, perStack: 1.20, effect: "fishEatRangeMult",
  },
  comms: {
    id: "comms", name: "Battle Comms", description: "Fish you damage are slowed to 50% speed — 0.2s, +0.1s per stack.",
    maxStack: 5, perStack: 1, effect: "enemySlowOnHit",
  },
  sybex: {
    id: "sybex", name: "Subversive Sybex", description: "Fish within 100px per stack are slowed 10% per stack — drag them down so you can catch and eat them.",
    // perStack is unused: the radius + slow magnitude are computed from the stack directly (see sybexRadius/sybexSlowMult).
    maxStack: 5, perStack: 1, effect: "proximitySlow",
  },
};

export const PASSIVE_IDS: PassiveId[] = ["fin", "gulp", "scales", "teeth", "reflex", "magnet", "recovery", "hungry", "closeEncounters", "comms", "sybex"];

/** Multiply base by passive's per-stack factor `stack` times. Stack 0 = 1.0. */
export function stackedMult(perStack: number, stack: number): number {
  return Math.pow(perStack, stack);
}

/**
 * Close Encounters eating-range multiplier for a given stack count. Single source of truth so the
 * server (getEatRangeMult) and the client (own-fish bite prediction) scale eat reach identically.
 * Stack 0 = 1.0 (base reach), scaling up by +20% per stack.
 */
export function eatRangeMultForStack(stack: number): number {
  return stackedMult(PASSIVES.closeEncounters.perStack, stack);
}
