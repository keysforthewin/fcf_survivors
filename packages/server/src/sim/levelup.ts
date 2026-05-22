import {
  WEAPONS, MAX_WEAPONS, MAX_WEAPON_LEVEL,
  PASSIVES, PASSIVE_IDS,
  EVOLUTIONS, BASE_WEAPONS,
  xpForLevel, serializeCardId,
} from "@fcf/shared";
import type { LevelUpCard, ParsedCardId, WeaponId, PassiveId } from "@fcf/shared";
import type { Fish, WeaponSlot } from "./entity.ts";
import type { World } from "./world.ts";
import { getMaxHp } from "./passives.ts";

/**
 * For each living player fish with no modal pending and enough XP, queue a level-up
 * (spend xp, increment level, refresh hp). Card pickup happens via `applyCard` when
 * the client returns a `pickCard` message.
 */
export function processLevelUps(world: World): void {
  for (const fish of world.fish.values()) {
    if (!fish.alive || fish.isAi) continue;
    if (fish.pendingLevelUp.length > 0) continue;
    if (fish.xp < xpForLevel(fish.level)) continue;

    fish.xp -= xpForLevel(fish.level);
    fish.level += 1;
    fish.maxHp = getMaxHp(fish);
    fish.hp = fish.maxHp;
    fish.pendingLevelUp = drawCards(fish, world.rng);
  }
}

/** Build a 3-card draw for `fish` honoring evolution forcing. */
export function drawCards(fish: Fish, rng: () => number): LevelUpCard[] {
  // 1. Forced evolution(s): owned weapon at lv5 + paired passive at max + evolution not yet owned.
  const forced: LevelUpCard[] = [];
  for (const slot of fish.weapons) {
    if (slot.level < MAX_WEAPON_LEVEL) continue;
    const evo = EVOLUTIONS[slot.id];
    if (!evo) continue;
    const stack = fish.passives.get(evo.passive) ?? 0;
    if (stack < PASSIVES[evo.passive].maxStack) continue;
    if (fish.weapons.some((s) => s.id === evo.evolutionId)) continue;
    forced.push(makeEvolutionCard(slot.id));
  }

  // 2. Build the regular pool.
  const pool: WeightedCard[] = [];

  // Upgrades for owned weapons (level < 5)
  for (const slot of fish.weapons) {
    if (slot.level >= MAX_WEAPON_LEVEL) continue;
    if (EVOLUTIONS[slot.id] === undefined && !BASE_WEAPONS.includes(slot.id)) {
      // skip evolution-already weapons — they don't upgrade past Lv 1 in this MVP
      continue;
    }
    pool.push({ card: makeUpgradeCard(slot.id, slot.level + 1), weight: 2 });
  }

  // Add unowned base weapons if room
  if (fish.weapons.length < MAX_WEAPONS) {
    for (const id of BASE_WEAPONS) {
      if (fish.weapons.some((s) => s.id === id)) continue;
      pool.push({ card: makeAddCard(id), weight: 3 });
    }
  }

  // Stack passives
  for (const id of PASSIVE_IDS) {
    const current = fish.passives.get(id) ?? 0;
    if (current >= PASSIVES[id].maxStack) continue;
    pool.push({ card: makeStackCard(id, current + 1), weight: 1 });
  }

  // 3. Assemble the 3-card result.
  const result: LevelUpCard[] = [];
  if (forced.length > 0) result.push(forced[0]!);

  while (result.length < 3 && pool.length > 0) {
    const remaining = pool.filter((w) => !result.some((c) => c.id === w.card.id));
    if (remaining.length === 0) break;
    const totalW = remaining.reduce((acc, w) => acc + w.weight, 0);
    let r = rng() * totalW;
    let picked: WeightedCard | null = null;
    for (const w of remaining) {
      r -= w.weight;
      if (r <= 0) { picked = w; break; }
    }
    if (!picked) picked = remaining[remaining.length - 1]!;
    result.push(picked.card);
  }

  // Safety: pad if pool ran dry (e.g. nothing left to learn) — repeat first card.
  while (result.length < 3 && result.length > 0) {
    result.push(result[0]!);
  }

  return result;
}

interface WeightedCard { card: LevelUpCard; weight: number; }

function makeAddCard(id: WeaponId): LevelUpCard {
  return {
    id: serializeCardId({ kind: "weapon-add", weaponId: id }),
    title: WEAPONS[id].name,
    description: `New weapon · ${WEAPONS[id].description}`,
    kind: "weapon",
  };
}

function makeUpgradeCard(id: WeaponId, level: number): LevelUpCard {
  return {
    id: serializeCardId({ kind: "weapon-upgrade", weaponId: id, level }),
    title: `${WEAPONS[id].name} → Lv ${level}`,
    description: `Sharper. Faster. Bigger.`,
    kind: "upgrade",
  };
}

function makeStackCard(id: PassiveId, stack: number): LevelUpCard {
  return {
    id: serializeCardId({ kind: "passive-stack", passiveId: id, stack }),
    title: `${PASSIVES[id].name} · ${stack}/${PASSIVES[id].maxStack}`,
    description: PASSIVES[id].description,
    kind: "passive",
  };
}

function makeEvolutionCard(baseId: WeaponId): LevelUpCard {
  const evo = EVOLUTIONS[baseId]!;
  return {
    id: serializeCardId({ kind: "evolution", baseId }),
    title: `EVOLVE: ${WEAPONS[evo.evolutionId].name}`,
    description: WEAPONS[evo.evolutionId].description,
    kind: "evolution",
  };
}

/** Apply a card the player picked. Returns true on success, false on invalid/unknown. */
export function applyCard(world: World, fish: Fish, cardId: string, parsed: ParsedCardId): boolean {
  // Validate card was actually offered.
  if (!fish.pendingLevelUp.some((c) => c.id === cardId)) return false;

  switch (parsed.kind) {
    case "weapon-add": {
      if (fish.weapons.length >= MAX_WEAPONS) return false;
      if (fish.weapons.some((s) => s.id === parsed.weaponId)) return false;
      fish.weapons.push({ id: parsed.weaponId, level: 1, cooldownReadyAt: world.now() + 400 });
      break;
    }
    case "weapon-upgrade": {
      const slot = fish.weapons.find((s) => s.id === parsed.weaponId);
      if (!slot) return false;
      if (slot.level >= MAX_WEAPON_LEVEL) return false;
      slot.level = parsed.level;
      // refresh orbital projectile damage so upgrades take effect immediately
      break;
    }
    case "passive-stack": {
      const max = PASSIVES[parsed.passiveId].maxStack;
      const current = fish.passives.get(parsed.passiveId) ?? 0;
      if (current >= max) return false;
      fish.passives.set(parsed.passiveId, parsed.stack);
      // Hearty Scales / Recovery may have changed maxHp; refresh.
      fish.maxHp = getMaxHp(fish);
      if (fish.hp > fish.maxHp) fish.hp = fish.maxHp;
      break;
    }
    case "evolution": {
      const evo = EVOLUTIONS[parsed.baseId];
      if (!evo) return false;
      const idx = fish.weapons.findIndex((s) => s.id === parsed.baseId);
      if (idx < 0) return false;
      // Cleanup orbital projectiles tied to the old base weapon.
      const oldSlot = fish.weapons[idx]!;
      cleanupSlotOrbitalProjectiles(world, oldSlot);
      fish.weapons[idx] = { id: evo.evolutionId, level: 1, cooldownReadyAt: world.now() + 400 };
      break;
    }
  }

  fish.pendingLevelUp = [];
  return true;
}

function cleanupSlotOrbitalProjectiles(world: World, slot: WeaponSlot): void {
  if (!slot.state || slot.state.kind !== "orbital") return;
  for (const pid of slot.state.projectileIds) {
    if (world.projectiles.has(pid)) world.removeProjectile(pid);
  }
  slot.state.projectileIds = [];
}
