import {
  WEAPONS, MAX_WEAPON_LEVEL, MAX_SLOTS,
  PASSIVES, PASSIVE_IDS,
  EVOLUTIONS, BASE_WEAPONS,
  xpForLevel, serializeCardId,
} from "@fcf/shared";
import type { LevelUpCard, ParsedCardId, WeaponId, PassiveId } from "@fcf/shared";
import type { Fish, WeaponSlot } from "./entity.ts";
import type { World } from "./world.ts";

/**
 * For each living player fish, keep promoting while XP threshold is reached.
 * The FIRST level-up populates `pendingLevelUp` with a fresh draw; subsequent
 * levels reached while a pick is already active accumulate on `queuedLevelUps`
 * and get drawn on demand when the active pick is applied. Levels still tick
 * up continuously — there is no longer a global gate that stalls promotion
 * because the player hasn't responded to the modal.
 */
export function processLevelUps(world: World): void {
  for (const fish of world.fish.values()) {
    if (!fish.alive || fish.isAi) continue;
    while (fish.xp >= xpForLevel(fish.level)) {
      fish.xp -= xpForLevel(fish.level);
      fish.level += 1;
      // Suppress card draw when every slot is full and fully upgraded — level
      // still ticks up, just no pick is offered.
      if (!canOfferAnyCard(fish)) continue;
      if (fish.pendingLevelUp.length === 0) {
        fish.pendingLevelUp = drawCards(fish, world.rng);
        fish.pendingLevelUpDrawId += 1;
        // A first-from-empty draw opens the modal; if the player had dismissed
        // a prior pick that was already consumed, this gives them a fresh chance.
        fish.levelUpDismissed = false;
      } else {
        // Already have an active pick — queue this one. Cards are drawn JIT in
        // applyCard so they reflect the post-pick loadout, avoiding stale options.
        fish.queuedLevelUps += 1;
      }
    }
  }
}

/** True if drawCards would have anything to offer this fish. */
export function canOfferAnyCard(fish: Fish): boolean {
  // upgradeable owned weapon
  for (const slot of fish.weapons) {
    if (slot.level >= MAX_WEAPON_LEVEL) continue;
    if (BASE_WEAPONS.includes(slot.id) || EVOLUTIONS[slot.id] !== undefined) return true;
  }
  const slotsUsed = fish.weapons.length + fish.passives.size;
  const hasFreeSlot = slotsUsed < MAX_SLOTS;
  // unowned base weapon with room
  if (hasFreeSlot) {
    for (const id of BASE_WEAPONS) {
      if (!fish.weapons.some((s) => s.id === id)) return true;
    }
  }
  // stack an existing passive
  for (const [id, stack] of fish.passives) {
    if (stack < PASSIVES[id].maxStack) return true;
  }
  // start a new passive (slot available + at least one untaken passive)
  if (hasFreeSlot) {
    for (const id of PASSIVE_IDS) {
      if (!fish.passives.has(id)) return true;
    }
  }
  // an evolution is unlockable right now
  for (const slot of fish.weapons) {
    if (slot.level < MAX_WEAPON_LEVEL) continue;
    const evo = EVOLUTIONS[slot.id];
    if (!evo) continue;
    if ((fish.passives.get(evo.passive) ?? 0) < PASSIVES[evo.passive].maxStack) continue;
    if (fish.weapons.some((s) => s.id === evo.evolutionId)) continue;
    return true;
  }
  return false;
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

  // Add unowned base weapons if there's a free slot (shared with passives).
  const hasFreeSlot = fish.weapons.length + fish.passives.size < MAX_SLOTS;
  if (hasFreeSlot) {
    for (const id of BASE_WEAPONS) {
      if (fish.weapons.some((s) => s.id === id)) continue;
      pool.push({ card: makeAddCard(id), weight: 3 });
    }
  }

  // Stack passives — owned ones can always level. New passives only if a slot is free.
  for (const id of PASSIVE_IDS) {
    const owned = fish.passives.has(id);
    const current = fish.passives.get(id) ?? 0;
    if (current >= PASSIVES[id].maxStack) continue;
    if (!owned && !hasFreeSlot) continue;
    pool.push({ card: makeStackCard(id, current + 1), weight: 1 });
  }

  // 3. Assemble the draw: up to 3 distinct cards. Every eligible evolution is
  //    offered first (they take priority over the random pool); slice guards the
  //    3-card cap. The pool fill never adds a card already present, so the draw
  //    is always duplicate-free — even with two evolutions ready it shows both,
  //    never the same card twice.
  const result: LevelUpCard[] = forced.slice(0, 3);

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

  // If the pool ran dry we return fewer than 3 cards rather than padding with
  // duplicates — there is genuinely nothing distinct left to offer. (drawCards
  // only runs when canOfferAnyCard is true, so result always has ≥1 card.)
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
      if (fish.weapons.length + fish.passives.size >= MAX_SLOTS) return false;
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
      const owned = fish.passives.has(parsed.passiveId);
      const current = fish.passives.get(parsed.passiveId) ?? 0;
      if (current >= max) return false;
      if (!owned && fish.weapons.length + fish.passives.size >= MAX_SLOTS) return false;
      fish.passives.set(parsed.passiveId, parsed.stack);
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
  // Draw the next queued pick (if any) with cards based on the just-updated
  // loadout. Preserves levelUpDismissed so the player isn't yanked back into
  // the modal mid-game; they can ESC to see the next set whenever they choose.
  if (fish.queuedLevelUps > 0) {
    fish.queuedLevelUps -= 1;
    if (canOfferAnyCard(fish)) {
      fish.pendingLevelUp = drawCards(fish, world.rng);
      fish.pendingLevelUpDrawId += 1;
    }
  } else {
    fish.levelUpDismissed = false;
  }
  return true;
}

export function cleanupSlotOrbitalProjectiles(world: World, slot: WeaponSlot): void {
  if (!slot.state || slot.state.kind !== "orbital") return;
  for (const pid of slot.state.projectileIds) {
    if (world.projectiles.has(pid)) world.removeProjectile(pid);
  }
  slot.state.projectileIds = [];
}
