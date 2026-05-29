import { FISH, PASSIVES, SLOW, massSpeedMult, stackedMult } from "@fcf/shared";
import type { PassiveId } from "@fcf/shared";
import type { Fish } from "./entity.ts";

function stack(fish: Fish, id: PassiveId): number {
  return fish.passives.get(id) ?? 0;
}

function effectMult(fish: Fish, id: PassiveId): number {
  return stackedMult(PASSIVES[id].perStack, stack(fish, id));
}

/** Signed flat total for an additive passive: perStack (+1 / −1) × current stack. */
function flatEffect(fish: Fish, id: PassiveId): number {
  return PASSIVES[id].perStack * stack(fish, id);
}

export function getMoveSpeed(fish: Fish): number {
  return FISH.baseSpeed * effectMult(fish, "fin") * massSpeedMult(fish.mass);
}

/** getMoveSpeed with the Battle Comms slow applied when active. Server movement uses this. */
export function getEffectiveMoveSpeed(fish: Fish, now: number): number {
  const base = getMoveSpeed(fish);
  return (fish.slowUntil ?? 0) > now ? base * SLOW.mult : base;
}

export function getBoostCooldown(fish: Fish): number {
  // Recovery is additive (unlike the other passives' multiplicative stacking):
  // each stack subtracts 20 percentage points off base cooldown, so maxStack=4
  // bottoms out at 20% of base. Floored at 5% so future maxStack bumps stay sane.
  const stacks = fish.passives.get("recovery") ?? 0;
  const mult = Math.max(0.05, 1 - 0.20 * stacks);
  return FISH.boostCooldownMs * mult;
}

/** Flat damage subtracted from each incoming hit (Full Metal, −1/stack). Positive number. */
export function getDamageTakenReduction(fish: Fish): number {
  return -flatEffect(fish, "scales"); // scales.perStack is −1, so this returns +stack
}

export function getPickupRadius(baseRadius: number, fish: Fish): number {
  return baseRadius * effectMult(fish, "magnet");
}

export function getPelletXp(baseXp: number, fish: Fish): number {
  return baseXp * effectMult(fish, "gulp");
}

export function getFishEatMass(baseGain: number, fish: Fish): number {
  return baseGain * effectMult(fish, "hungry");
}

/** Multiplier on the forward eating reach (Close Encounters). >1 lets you grab prey from farther. */
export function getEatRangeMult(fish: Fish): number {
  return effectMult(fish, "closeEncounters");
}

/** Flat weapon-damage bonus added to each hit (Mmiguel's Aim, +1/stack). */
export function getWeaponDamageBonus(fish: Fish): number {
  return flatEffect(fish, "teeth");
}

export function getWeaponCooldownMult(fish: Fish): number {
  return effectMult(fish, "reflex");
}
