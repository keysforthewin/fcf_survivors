export type PassiveId =
  | "fin" | "gulp" | "scales" | "teeth" | "reflex" | "magnet" | "recovery" | "hungry";

export type PassiveEffect =
  | "moveSpeedMult"
  | "pelletXpMult"
  | "maxHpMult"
  | "weaponDmgMult"
  | "weaponCdMult"
  | "pickupMult"
  | "boostCdMult"
  | "fishEatMassMult";

export interface PassiveDef {
  id: PassiveId;
  name: string;
  description: string;
  maxStack: number;
  /** Multiplier per stack: 1.10 = +10% per stack; 0.92 = -8% per stack. */
  perStack: number;
  effect: PassiveEffect;
}

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  fin: {
    id: "fin",      name: "Fin Tuning",      description: "+10% move speed per stack.",
    maxStack: 5, perStack: 1.10, effect: "moveSpeedMult",
  },
  gulp: {
    id: "gulp",     name: "Big Gulp",        description: "+15% XP from pellets.",
    maxStack: 5, perStack: 1.15, effect: "pelletXpMult",
  },
  scales: {
    id: "scales",   name: "Hearty Scales",   description: "+20% max HP per stack.",
    maxStack: 5, perStack: 1.20, effect: "maxHpMult",
  },
  teeth: {
    id: "teeth",    name: "Sharp Teeth",     description: "+15% weapon damage per stack.",
    maxStack: 5, perStack: 1.15, effect: "weaponDmgMult",
  },
  reflex: {
    id: "reflex",   name: "Quick Reflex",    description: "−8% weapon cooldown per stack.",
    maxStack: 5, perStack: 0.92, effect: "weaponCdMult",
  },
  magnet: {
    id: "magnet",   name: "Magnet Belly",    description: "+50% pellet pickup radius per stack.",
    maxStack: 3, perStack: 1.50, effect: "pickupMult",
  },
  recovery: {
    id: "recovery", name: "Boost Recovery",  description: "−10% boost cooldown per stack.",
    maxStack: 4, perStack: 0.90, effect: "boostCdMult",
  },
  hungry: {
    id: "hungry",   name: "Hungry Hungry",   description: "+5% mass per fish eaten per stack.",
    maxStack: 4, perStack: 1.05, effect: "fishEatMassMult",
  },
};

export const PASSIVE_IDS: PassiveId[] = ["fin", "gulp", "scales", "teeth", "reflex", "magnet", "recovery", "hungry"];

/** Multiply base by passive's per-stack factor `stack` times. Stack 0 = 1.0. */
export function stackedMult(perStack: number, stack: number): number {
  return Math.pow(perStack, stack);
}
