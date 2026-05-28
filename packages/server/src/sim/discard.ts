import type { PassiveId, WeaponId } from "@fcf/shared";
import { PASSIVE_IDS } from "@fcf/shared";
import type { Fish } from "./entity.ts";
import type { World } from "./world.ts";
import { cleanupSlotOrbitalProjectiles, prunePendingCards } from "./levelup.ts";

/**
 * Drop a weapon slot. Cleans up its orbital projectiles. Allowed whenever the
 * level-up modal isn't actively open (no pick, or a pick the player dismissed) —
 * mirroring the input/fire gating — and prunes any pending cards that referenced
 * the discarded weapon so a dismissed modal isn't left holding dead cards.
 */
export function discardWeapon(world: World, fish: Fish, weaponId: WeaponId | string): boolean {
  if (!fish.alive) return false;
  if (fish.pendingLevelUp.length > 0 && !fish.levelUpDismissed) return false;
  const idx = fish.weapons.findIndex((s) => s.id === weaponId);
  if (idx < 0) return false;
  const slot = fish.weapons[idx]!;
  cleanupSlotOrbitalProjectiles(world, slot);
  fish.weapons.splice(idx, 1);
  prunePendingCards(world, fish, (p) =>
    (p.kind === "weapon-upgrade" && p.weaponId === weaponId) ||
    (p.kind === "evolution" && p.baseId === weaponId),
  );
  return true;
}

/**
 * Drop a passive slot entirely (all stacks). Same gating and pruning as
 * discardWeapon.
 */
export function discardPassive(world: World, fish: Fish, passiveId: PassiveId | string): boolean {
  if (!fish.alive) return false;
  if (fish.pendingLevelUp.length > 0 && !fish.levelUpDismissed) return false;
  if (!PASSIVE_IDS.includes(passiveId as PassiveId)) return false;
  const removed = fish.passives.delete(passiveId as PassiveId);
  if (!removed) return false;
  prunePendingCards(world, fish, (p) => p.kind === "passive-stack" && p.passiveId === passiveId);
  return true;
}
