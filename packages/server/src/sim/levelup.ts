import {
  WEAPONS, MAX_WEAPON_LEVEL, MAX_SLOTS,
  PASSIVES, PASSIVE_IDS,
  EVOLUTIONS, BASE_WEAPONS,
  xpForLevel, serializeCardId, cardSubject, parseCardId,
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

/** True if drawCards would have anything to offer this fish (ban-aware). */
export function canOfferAnyCard(fish: Fish): boolean {
  return forcedEvolutions(fish).length > 0 || buildCardPool(fish).length > 0;
}

interface WeightedCard { card: LevelUpCard; weight: number; }

/** Whether `subject` has been banished this life. */
function banned(fish: Fish, subject: string): boolean {
  return fish.banishedSubjects.has(subject);
}

/** Evolution cards the fish is eligible for right now, minus banished ones. */
function forcedEvolutions(fish: Fish): LevelUpCard[] {
  const forced: LevelUpCard[] = [];
  for (const slot of fish.weapons) {
    if (slot.level < MAX_WEAPON_LEVEL) continue;
    const evo = EVOLUTIONS[slot.id];
    if (!evo) continue;
    const stack = fish.passives.get(evo.passive) ?? 0;
    if (stack < PASSIVES[evo.passive].maxStack) continue;
    if (fish.weapons.some((s) => s.id === evo.evolutionId)) continue;
    if (banned(fish, cardSubject({ kind: "evolution", baseId: slot.id }))) continue;
    forced.push(makeEvolutionCard(slot.id));
  }
  return forced;
}

/** The weighted random pool of regular (non-forced) cards, minus banished subjects. */
function buildCardPool(fish: Fish): WeightedCard[] {
  const pool: WeightedCard[] = [];

  // Upgrades for owned weapons (level < 5)
  for (const slot of fish.weapons) {
    if (slot.level >= MAX_WEAPON_LEVEL) continue;
    if (EVOLUTIONS[slot.id] === undefined && !BASE_WEAPONS.includes(slot.id)) {
      // skip evolution-already weapons — they don't upgrade past Lv 1 in this MVP
      continue;
    }
    if (banned(fish, cardSubject({ kind: "weapon-upgrade", weaponId: slot.id, level: slot.level + 1 }))) continue;
    pool.push({ card: makeUpgradeCard(slot.id, slot.level + 1), weight: 2 });
  }

  // Add unowned base weapons if there's a free slot (shared with passives).
  const hasFreeSlot = fish.weapons.length + fish.passives.size < MAX_SLOTS;
  if (hasFreeSlot) {
    for (const id of BASE_WEAPONS) {
      if (fish.weapons.some((s) => s.id === id)) continue;
      // Owning the evolved form blocks the base — one form per weapon family.
      const evoId = EVOLUTIONS[id]?.evolutionId;
      if (evoId && fish.weapons.some((s) => s.id === evoId)) continue;
      if (banned(fish, cardSubject({ kind: "weapon-add", weaponId: id }))) continue;
      pool.push({ card: makeAddCard(id), weight: 3 });
    }
  }

  // Stack passives — owned ones can always level. New passives only if a slot is free.
  for (const id of PASSIVE_IDS) {
    const owned = fish.passives.has(id);
    const current = fish.passives.get(id) ?? 0;
    if (current >= PASSIVES[id].maxStack) continue;
    if (!owned && !hasFreeSlot) continue;
    if (banned(fish, cardSubject({ kind: "passive-stack", passiveId: id, stack: current + 1 }))) continue;
    pool.push({ card: makeStackCard(id, current + 1), weight: 1 });
  }

  return pool;
}

/** Weighted random pick from a non-empty pool. */
function weightedPick(pool: WeightedCard[], rng: () => number): WeightedCard {
  const totalW = pool.reduce((acc, w) => acc + w.weight, 0);
  let r = rng() * totalW;
  for (const w of pool) {
    r -= w.weight;
    if (r <= 0) return w;
  }
  return pool[pool.length - 1]!;
}

/** Build a 3-card draw for `fish` honoring evolution forcing. */
export function drawCards(fish: Fish, rng: () => number): LevelUpCard[] {
  // Every eligible evolution is offered first (priority over the random pool);
  // slice guards the 3-card cap. The pool fill never adds a card already present,
  // so the draw is always duplicate-free. If the pool runs dry we return fewer
  // than 3 rather than padding with duplicates — drawCards only runs when
  // canOfferAnyCard is true, so the result always has ≥1 card.
  const forced = forcedEvolutions(fish);
  const pool = buildCardPool(fish);
  const result: LevelUpCard[] = forced.slice(0, 3);

  while (result.length < 3 && pool.length > 0) {
    const remaining = pool.filter((w) => !result.some((c) => c.id === w.card.id));
    if (remaining.length === 0) break;
    result.push(weightedPick(remaining, rng).card);
  }

  return result;
}

/**
 * Draw a single replacement card (for re-roll). Picks from the same forced +
 * regular pools but excludes any card id in `excludeIds` (the cards currently
 * shown — so the swap never duplicates a visible card, including the one being
 * replaced). Returns null when nothing distinct is left to offer.
 */
export function drawSingleCard(fish: Fish, rng: () => number, excludeIds: Set<string>): LevelUpCard | null {
  const candidates: WeightedCard[] = [
    ...forcedEvolutions(fish).map((card) => ({ card, weight: 1 })),
    ...buildCardPool(fish),
  ].filter((w) => !excludeIds.has(w.card.id));
  if (candidates.length === 0) return null;
  return weightedPick(candidates, rng).card;
}

/**
 * Spend one re-roll token to replace a single offered card. The replacement
 * avoids duplicating any currently-shown card (incl. the one being replaced).
 * Returns false (and spends nothing) if out of tokens, the card isn't offered,
 * or there's no distinct alternative.
 */
export function rerollCard(world: World, fish: Fish, cardId: string): boolean {
  if (fish.rerollsRemaining <= 0) return false;
  const idx = fish.pendingLevelUp.findIndex((c) => c.id === cardId);
  if (idx < 0) return false;
  const exclude = new Set(fish.pendingLevelUp.map((c) => c.id));
  const next = drawSingleCard(fish, world.rng, exclude);
  if (!next) return false;
  fish.pendingLevelUp[idx] = next;
  fish.rerollsRemaining -= 1;
  fish.pendingLevelUpDrawId += 1;
  return true;
}

/**
 * Spend one banish token to remove an offered card. Bans the card's subject for
 * the rest of this life (never offered again), strips the matching weapon/passive
 * from the loadout if owned (hard purge), and drops every shown card with that
 * subject. If the draw empties, advances the queued pick like applyCard. Returns
 * false (spending nothing) if out of tokens or the card isn't offered.
 */
export function banishCard(world: World, fish: Fish, cardId: string): boolean {
  if (fish.banishesRemaining <= 0) return false;
  if (!fish.pendingLevelUp.some((c) => c.id === cardId)) return false;
  const parsed = parseCardId(cardId);
  if (!parsed) return false;
  const subject = cardSubject(parsed);
  fish.banishedSubjects.add(subject);
  fish.banishesRemaining -= 1;

  // Hard-purge a matching owned weapon/passive. `evo:` subjects strip nothing —
  // the still-useful Lv5 base weapon stays.
  if (subject.startsWith("weapon:")) {
    const weaponId = subject.slice("weapon:".length);
    const sidx = fish.weapons.findIndex((s) => s.id === weaponId);
    if (sidx >= 0) {
      cleanupSlotOrbitalProjectiles(world, fish.weapons[sidx]!);
      fish.weapons.splice(sidx, 1);
    }
  } else if (subject.startsWith("passive:")) {
    fish.passives.delete(subject.slice("passive:".length) as PassiveId);
  }

  // Drop every shown card matching the banished subject (robust against dupes).
  const before = fish.pendingLevelUp.length;
  fish.pendingLevelUp = fish.pendingLevelUp.filter((c) => {
    const p = parseCardId(c.id);
    return !p || cardSubject(p) !== subject;
  });

  // Refill the slot(s) the banish vacated so the player keeps a full set of
  // choices. Replacements avoid the banished subject (now in banishedSubjects),
  // any still-shown card, and the just-purged loadout — purging usually frees a
  // slot, opening up new weapon-adds/passive-stacks. Stops early if nothing
  // distinct is left to offer.
  while (fish.pendingLevelUp.length < before) {
    const exclude = new Set(fish.pendingLevelUp.map((c) => c.id));
    const next = drawSingleCard(fish, world.rng, exclude);
    if (!next) break;
    fish.pendingLevelUp.push(next);
  }

  // If there was genuinely nothing to backfill, pull the next queued pick
  // (mirrors applyCard tail) so a banish never strands the player on an empty modal.
  advanceQueueIfEmpty(world, fish);
  fish.pendingLevelUpDrawId += 1;
  return true;
}

/**
 * When the active draw is empty but picks are still queued, pull the next one so
 * the player is never stranded on an empty modal. Bumps the draw id when it draws.
 */
function advanceQueueIfEmpty(world: World, fish: Fish): void {
  if (fish.pendingLevelUp.length > 0 || fish.queuedLevelUps <= 0) return;
  fish.queuedLevelUps -= 1;
  if (canOfferAnyCard(fish)) {
    fish.pendingLevelUp = drawCards(fish, world.rng);
    fish.pendingLevelUpDrawId += 1;
  }
}

/**
 * Drop pending cards the player can no longer act on — used after a discard frees
 * a slot, so a dismissed modal isn't left holding cards referencing the gone
 * weapon/passive. If pruning empties the draw, the next queued pick is pulled.
 * No-op when there's no pending draw.
 */
export function prunePendingCards(
  world: World,
  fish: Fish,
  drop: (parsed: ParsedCardId) => boolean,
): void {
  if (fish.pendingLevelUp.length === 0) return;
  const before = fish.pendingLevelUp.length;
  fish.pendingLevelUp = fish.pendingLevelUp.filter((c) => {
    const p = parseCardId(c.id);
    return !p || !drop(p);
  });
  if (fish.pendingLevelUp.length === before) return;
  fish.pendingLevelUpDrawId += 1;
  advanceQueueIfEmpty(world, fish);
}

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
      // Reject re-adding a base over its already-owned evolved form.
      const evoId = EVOLUTIONS[parsed.weaponId]?.evolutionId;
      if (evoId && fish.weapons.some((s) => s.id === evoId)) return false;
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
