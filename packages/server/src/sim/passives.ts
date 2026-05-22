import { FISH, PASSIVES, fishHp, massSpeedMult, stackedMult } from "@fcf/shared";
import type { PassiveId } from "@fcf/shared";
import type { Fish } from "./entity.ts";

function stack(fish: Fish, id: PassiveId): number {
  return fish.passives.get(id) ?? 0;
}

function effectMult(fish: Fish, id: PassiveId): number {
  return stackedMult(PASSIVES[id].perStack, stack(fish, id));
}

export function getMoveSpeed(fish: Fish): number {
  return FISH.baseSpeed * effectMult(fish, "fin") * massSpeedMult(fish.mass);
}

export function getBoostCooldown(fish: Fish): number {
  return FISH.boostCooldownMs * effectMult(fish, "recovery");
}

export function getMaxHp(fish: Fish): number {
  return fishHp(fish.mass) * effectMult(fish, "scales");
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

export function getWeaponDamageMult(fish: Fish): number {
  return effectMult(fish, "teeth");
}

export function getWeaponCooldownMult(fish: Fish): number {
  return effectMult(fish, "reflex");
}
