import type { PassiveId, WeaponId } from "@fcf/shared";
import { PASSIVE_IDS } from "@fcf/shared";
import type { Fish } from "./entity.ts";
import type { World } from "./world.ts";
import { cleanupSlotOrbitalProjectiles } from "./levelup.ts";

/**
 * Drop a weapon slot. Cleans up its orbital projectiles.
 * Refuses to act while a level-up modal is pending (avoids racing the picker).
 */
export function discardWeapon(world: World, fish: Fish, weaponId: WeaponId | string): boolean {
  if (!fish.alive) return false;
  if (fish.pendingLevelUp.length > 0) return false;
  const idx = fish.weapons.findIndex((s) => s.id === weaponId);
  if (idx < 0) return false;
  const slot = fish.weapons[idx]!;
  cleanupSlotOrbitalProjectiles(world, slot);
  fish.weapons.splice(idx, 1);
  return true;
}

/**
 * Drop a passive slot entirely (all stacks).
 */
export function discardPassive(fish: Fish, passiveId: PassiveId | string): boolean {
  if (!fish.alive) return false;
  if (fish.pendingLevelUp.length > 0) return false;
  if (!PASSIVE_IDS.includes(passiveId as PassiveId)) return false;
  const removed = fish.passives.delete(passiveId as PassiveId);
  if (!removed) return false;
  return true;
}
