# Fix four issues: evolution re-drop, discard gating, alien sound, missing icons

## Context

Four player-facing problems in Fruit Cup Survivors, surfacing now that the new
alien weapon (`alien` / `overlord` "flyby" weapon) has landed:

1. **Evolved weapons still offer their base form.** After you evolve a weapon
   (e.g. `bubble` → `tidal`), the level-up draw can still offer the base
   `bubble` again, letting you end up holding both halves of one weapon family.
   You should only ever hold one form of a family — base *or* evolved.

2. **Discard is blocked while a level-up pick is queued.** If you ESC/skip the
   level-up modal, you carry a *pending* pick while playing. The discard feature
   refuses to act in that state, so you can't free a slot until you've consumed
   every queued pick. Discard should work whenever the modal isn't actively
   open (i.e. whenever movement/firing are allowed).

3. **The alien's sound is bad.** The alien/overlord UFO snipes fish with lasers
   ~1–6×/sec across the whole screen; each laser hit triggers the generic
   weapon-hit sound, producing a constant machine-gun stutter. Remove the sound
   for alien/overlord hits only (keep the visual hit feedback, keep all other
   weapons' sounds).

4. **Missing HUD icons.** `alien` (Alien Friends), `overlord` (Alien Overlord),
   and the `closeEncounters` passive (Close Encounters) have no glyph/color
   case, so the skill HUD renders them as a white `?`.

Approach: server-sim fixes follow TDD (new/extended cucumber scenarios first);
client fixes (sound, icons) are small and verified by running the app.

---

## Fix 1 — Evolved family blocks the base weapon

**File:** `packages/server/src/sim/levelup.ts`, `buildCardPool()` (lines ~86–94).

The unowned-base-weapon loop only skips a base weapon if the player owns *that
exact id*. Add a sibling check: skip it when the player owns its **evolved
form**, using the existing forward map `EVOLUTIONS[id].evolutionId`.

```ts
for (const id of BASE_WEAPONS) {
  if (fish.weapons.some((s) => s.id === id)) continue;
  const evoId = EVOLUTIONS[id]?.evolutionId;
  if (evoId && fish.weapons.some((s) => s.id === evoId)) continue; // own evolved form → skip base
  if (banned(fish, cardSubject({ kind: "weapon-add", weaponId: id }))) continue;
  pool.push({ card: makeAddCard(id), weight: 3 });
}
```

This is the same guard pattern `forcedEvolutions()` already uses at line 64.
Because `drawSingleCard`/`rerollCard`/`banishCard` all source from
`buildCardPool`, the fix covers re-roll and banish-backfill paths too.

**Defense-in-depth:** in `applyCard()` `case "weapon-add"` (line ~275), also
reject when the evolved form is already owned, so a stale client card can't
re-add a base over an evolved family member.

---

## Fix 2 — Discard works while a pick is pending-but-dismissed

**File:** `packages/server/src/sim/discard.ts`.

Change the gate in **both** `discardWeapon` and `discardPassive` from:

```ts
if (fish.pendingLevelUp.length > 0) return false;
```
to mirror the input/fire gating used in `world.ts:293` and `weapon.ts:57`:
```ts
if (fish.pendingLevelUp.length > 0 && !fish.levelUpDismissed) return false;
```

So discard is allowed exactly when the modal is closed (no pick, or a pick the
player dismissed) and refused only while the modal is actively open.

**Avoid stranding on stale cards.** Once discard can run with a pick queued, the
queued cards may reference the just-removed item (a `weapon-upgrade`/`evolution`
for a discarded weapon becomes un-pickable; `applyCard` would silently return
false and leave the modal stuck). After a successful discard, drop the now-dead
pending cards, then advance the queue if that empties the draw:

- `discardWeapon(id)`: drop pending cards whose parsed form is `weapon-upgrade`
  with `weaponId === id` or `evolution` with `baseId === id`.
- `discardPassive(id)`: drop pending cards whose parsed form is `passive-stack`
  with `passiveId === id`.

Reuse the existing "advance queue if empty" tail from `banishCard` (levelup.ts
lines 224–228) — extract it into a small exported helper
`advanceQueueIfEmpty(world, fish)` in `levelup.ts` and call it from both
`banishCard` and the discard functions. This requires passing `world` to
`discardPassive` (currently it takes only `fish`); update its one call site in
`packages/server/src/index.ts` (line ~488). Bump `pendingLevelUpDrawId` when the
draw changes so the dispatch loop re-emits `LevelUpMsg`.

---

## Fix 3 — Remove the alien laser sound

The only alien-tied sound is the generic hit marker: alien/overlord lasers call
`applyHit` (`weapon.ts:465`, via `fireLaser`), which records a `HitEvent`; the
client plays `playWeaponHit` for every hit in `arena.ts handleHitEvent`
(line 731). `HitEvent` carries no weapon id, so the client can't currently tell
an alien laser hit from any other. Thread the weapon id through so the client
can mute just this weapon, keeping the particle burst, damage number, and camera
kick intact.

- **`packages/server/src/sim/entity.ts`** — add `weaponId: WeaponId` to
  `HitEventRecord`.
- **`packages/server/src/sim/weapon.ts`** — add a `weaponId: WeaponId` param to
  `applyHit` and set it on the pushed record. All three call sites already have
  it in scope: the radial helper (line 237, param `weaponId`), `fireLaser`
  (line 465, param `weaponId`), and `applyProjectileDamage` (line 524,
  `proj.weaponId`).
- **`packages/shared/src/protocol.ts`** — add optional `weaponId?: string` to
  `HitEvent` (per-tick event, not a delta entity — no first-seen handling
  needed).
- **`packages/server/src/net/snapshot.ts`** — in `hitEventsFor` (line ~205),
  copy `weaponId: e.weaponId` onto the emitted event.
- **`packages/client/src/scenes/arena.ts`** — widen `handleHitEvent`'s param
  type with `weaponId?: string` and skip the sound for flyby weapons:
  ```ts
  if (WEAPONS[h.weaponId as WeaponId]?.kind !== "flyby") snd.playWeaponHit(vol);
  ```
  (covers both `alien` and `overlord`; everything else unchanged.)

---

## Fix 4 — Add HUD icons (monochrome glyphs, matching existing style)

**File:** `packages/client/src/scenes/arena.ts`, the four switch helpers
(`weaponGlyph` ~1720, `passiveGlyph` ~1736, `passiveColor` ~1750,
`weaponColor` ~1764). Add cases tinted to the alien theme (green base, cyan
evolved), consistent with `saucer.ts`/`lightning.ts` colors:

- `weaponGlyph`:  `alien → "⊙"`,  `overlord → "◉"`
- `weaponColor`:  `alien → "#66ff88"`,  `overlord → "#66ffff"`
- `passiveGlyph`: `closeEncounters → "✴"`
- `passiveColor`: `closeEncounters → "#66ffff"`

---

## Tests & verification

**Server (cucumber, TDD — write scenarios first, watch them fail, then fix):**

- Evolution re-drop — extend `packages/server/features/weapons.feature` (or the
  new `close-encounters.feature`): give a fish an evolved weapon (e.g. `tidal`)
  in a free-slot loadout, repeatedly draw, assert the base (`bubble`) is never
  offered. Use `makeWorld({ fish, seed })` from
  `packages/server/test/support/world-factory.ts`. Drive draws via the existing
  level-up step defs.
- Discard while pending — new scenario in `pellets.feature`/`leveling.feature`
  or a dedicated `discard.feature`: level a fish so `pendingLevelUp` is
  populated, set `levelUpDismissed = true`, call `discardWeapon`, assert it
  returns true and the slot is gone. Add a companion asserting discard is still
  refused while `levelUpDismissed === false`. Add a stale-card case: dismiss a
  draw containing an upgrade card for a weapon, discard that weapon, assert the
  dead card is pruned from `pendingLevelUp`.

Run: `bun --cwd=packages/server run test` (and `bun run typecheck`).

**Client (manual, via `/run` or `bun run dev`):**

- Take `alien` then `overlord`; confirm the rapid laser-hit stutter is gone
  while other weapons (e.g. `bubble`, `pulse`) still play their hit sound.
- Open the skill HUD; confirm Alien Friends `⊙`, Alien Overlord `◉`, and Close
  Encounters `✴` render with their tints instead of `?`.

Full suite before finishing: `bun run test` + `bun run typecheck`.
