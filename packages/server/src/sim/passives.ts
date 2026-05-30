import { FISH, PASSIVES, SLOW, MAX_FISH_RADIUS_PAD, massSpeedMult, boostCooldownForMass, stackedMult, eatRangeMultForStack, sybexRadius, sybexSlowMult } from "@fcf/shared";
import type { PassiveId } from "@fcf/shared";
import type { Fish } from "./entity.ts";
import type { World } from "./world.ts";

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

/** getMoveSpeed with the active slows applied (Battle Comms hit-slow + Subversive Sybex proximity aura). Server movement uses this. */
export function getEffectiveMoveSpeed(fish: Fish, now: number): number {
  const base = getMoveSpeed(fish);
  const commsSlow = (fish.slowUntil ?? 0) > now ? SLOW.mult : 1;
  return base * commsSlow * (fish.auraSlowMult ?? 1);
}

/**
 * Subversive Sybex: each tick, slow every fish standing inside a player's aura so they can be caught.
 * Reset all fish to unslowed first (a fish that left every aura returns to full speed), then for each
 * non-AI owner carrying the passive, drag down every OTHER fish within sybexRadius(stack). The strongest
 * overlapping aura wins (smallest multiplier). AI never carry passives, so they project nothing; the
 * owner is never slowed by its own aura. Runs at the top of world.step against last tick's fishHash.
 */
export function applySybexAuras(world: World): void {
  for (const f of world.fish.values()) f.auraSlowMult = 1;

  const scratch: Fish[] = [];
  for (const owner of world.fish.values()) {
    if (owner.isAi || !owner.alive) continue;
    const stack = owner.passives.get("sybex") ?? 0;
    if (stack <= 0) continue;
    const radius = sybexRadius(stack);
    const mult = sybexSlowMult(stack);
    const r2 = radius * radius;
    scratch.length = 0;
    world.fishHash.query(owner.x, owner.y, radius + MAX_FISH_RADIUS_PAD, scratch);
    for (const target of scratch) {
      if (target.id === owner.id || !target.alive) continue;
      const dx = target.x - owner.x;
      const dy = target.y - owner.y;
      if (dx * dx + dy * dy > r2) continue;
      if (mult < (target.auraSlowMult ?? 1)) target.auraSlowMult = mult;
    }
  }
}

export function getBoostCooldown(fish: Fish): number {
  // Base cooldown scales with mass (boostCooldownForMass): light fish dash often, heavy
  // fish rarely. Recovery then multiplies that, additively: each stack subtracts 20
  // percentage points, so maxStack=4 bottoms out at 20%. Floored at 5% so future maxStack
  // bumps stay sane.
  const stacks = fish.passives.get("recovery") ?? 0;
  const mult = Math.max(0.05, 1 - 0.20 * stacks);
  return boostCooldownForMass(fish.mass) * mult;
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
  return eatRangeMultForStack(stack(fish, "closeEncounters"));
}

/** Flat weapon-damage bonus added to each hit (Mmiguel's Aim, +1/stack). */
export function getWeaponDamageBonus(fish: Fish): number {
  return flatEffect(fish, "teeth");
}

export function getWeaponCooldownMult(fish: Fish): number {
  return effectMult(fish, "reflex");
}
