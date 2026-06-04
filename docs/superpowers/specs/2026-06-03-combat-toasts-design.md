# Combat toasts: weapon-kill announcements + aggressor-framed feed

**Date:** 2026-06-03
**Status:** Approved (pending spec review)

## Problem

Two issues with how combat is announced to players:

1. **Feature gap:** When your *weapon* kills another player there is no announcement, and
   the existing death feed mislabels it ("X was eaten by Y") with no mention of the weapon.

2. **Bug + confusing framing:** When you eat a smaller fish you see "You were bitten by the
   void" immediately followed by eating them. Two root causes:
   - **Wrong framing:** As you close on prey, the *prey* nibbles *you* (the `b.mass > a.mass`
     nibble branch in `world.step`). Because you are human, that enqueues a *victim*-framed
     "bitten" toast about you — even though you are the predator.
   - **"the void":** `recordBite` stores only entity **ids**; the attacker's **name** is
     resolved later at broadcast time (`index.ts`: `world.fish.get(ev.by)?.name ?? "the void"`).
     But the tick removes dead fish *before* the bitten-broadcast runs, and you just swallowed
     that prey — so the lookup returns `undefined` → "the void". It is a stale-lookup bug; the
     `playerDied` path avoids it by capturing `killedByName` at hit-time.

## Decisions (locked with the user)

- **Weapon kills:** global feed names the weapon **and** the killer gets a personal toast.
- **Melee feed:** aggressor-framed personal feed ("You hit X" → "You ate X"), and the victim
  "you were bitten by X" warning fires **only when the attacker is a genuine threat** (a fish
  big enough to bite you in the between-zone), not when prey you are eating nibbles you.
- The global "X was bitten by Y" line is **removed**; bite warnings are personal to the victim.
- A *smaller* fish nibbling you **no longer warns you at all** (reverses an existing test's
  documented intent — see Testing).

## Toast model

Two layers, replacing today's mixed bag.

### Global announcements (third-person, everyone) — deaths only
- melee swallow → `"Minnow was eaten by Steve"`
- weapon kill → `"Minnow was killed by Steve with AK-47"`
- disconnect → `"Minnow left"` (unchanged: keyed off `byName === "the void"`)

The killer is **excluded** from the global death line for their own kill (they get the personal
version instead), so no double toast.

### Personal feed (second-person, only the relevant player) — your own combat
- `"You hit X"` — you landed a melee bite/nibble (non-lethal), throttled once per engagement
- `"You ate X"` — you swallowed someone whole
- `"You killed X with <weapon>"` — your weapon landed the kill (or `"You killed X"` for a
  melee finishing blow with no weapon)
- `"You were bitten by X"` — only when X is a genuine threat (the between-zone branch), real name

## Server changes

### Attribution (`entity.ts`, `weapon.ts`, `world.ts`)
- **`Fish` gains:** `killedById?: number`, `killedByWeaponId?: WeaponId` (presence ⇒ weapon
  kill), and `hitToastAt?: Map<number, number>` (attacker-side throttle mirroring `biteToastAt`).
- **`applyHit` / `applyNibble`** (`weapon.ts`): on the lethal blow also set
  `target.killedById = owner.id`; `applyHit` additionally sets `target.killedByWeaponId = weaponId`.
- **Swallow block** (`world.ts`): set `killedById` / `killedByName` / `killedByMass` on the
  eater at swallow time (today swallow kills carry no explicit attribution and the death
  handler guesses the killer via a 250px proximity search — this makes it exact). `killedByName`
  now means "explicitly attributed killer (swallow, weapon, or melee-damage)"; the proximity
  search remains a fallback only for unattributed deaths (e.g. starvation/decay).

### `recordBite` → `recordMeleeBite(victim, attacker, attackerIsThreat, now)`
Emits up to two events, **capturing names now** (fixes "the void"):
- attacker-side `hit` — only if `!attacker.isAi` **and** the victim survived the blow,
  throttled via `attacker.hitToastAt` keyed by `victim.id`.
- victim-side `bitten` — only if `!victim.isAi` **and** `attackerIsThreat`, throttled via
  `victim.biteToastAt` keyed by `attacker.id`.

Call sites: nibble branch (`b.mass > a.mass`) passes `attackerIsThreat = false`; between-zone
bite branch (attacker ≥ victim) passes `attackerIsThreat = true`.

The world event array (today `bittenEvents`) becomes a richer `combatEvents` carrying
`{ recipientId, kind, otherName, otherColor, weaponId? }` so `index.ts` dispatches each to the
correct socket.

### `index.ts` tick loop
- Build a `fishId → socket` map once per tick.
- Dead-fish pass (runs before removal): for **every** dead fish (AI or human) whose
  `killedById` resolves to a human socket, emit a personal `ate`/`kill` toast to the killer
  (`eatenWhole` ⇒ `ate`; `killedByWeaponId` ⇒ `kill` + weapon; else ⇒ `kill`). For human
  victims, broadcast the weapon-aware global death line excluding the killer's socket.
- Bite pass: dispatch personal `hit` / `bitten` toasts from `combatEvents` to the recipient
  sockets. Remove the old global `playerBitten` broadcast.
- Skip toasts whose recipient ended the tick dead/absent.

## Wire protocol (`shared/protocol.ts`)
- `PlayerDiedMsg` gains optional `weaponId?: WeaponId`.
- **New** `CombatToastMsg { t: "combatToast"; kind: "hit" | "ate" | "kill" | "bitten";
  other: string; color?: string; weaponId?: WeaponId }`.
- `PlayerBittenMsg` is **removed** (folded into `combatToast` kind `"bitten"`).

## Client (`net/socket.ts`, `scenes/arena.ts`)
- Add `CombatToastMsg` to the `ServerMsg` union; remove `PlayerBittenMsg`.
- `playerDied` handler: weapon-aware text via `WEAPONS[weaponId].name`.
- New `combatToast` handler renders the four second-person strings.
- Remove the client-derived "Ate X" logic from the `swallowed` path; the suck-in **animation**
  stays (server is now authoritative over the toast — consistent with "authoritative server,
  dumb client").

## Edge cases
- Lethal bite never double-toasts: "You hit X" is gated on victim survival; the death pass
  emits the finisher ("You killed/ate X").
- AI killer ⇒ no personal toast / no exclusion (AI has no socket); AI never wields weapons, so
  AI kills always read "eaten by".
- Per-engagement throttle (`BITE.toastEngagementMs`, 1.5s) reused on both sides; sustained
  chewing emits one "hit" and one "bitten" per engagement.

## Testing (TDD)
- **Rework `server/features/bite-toast.feature`:**
  - nibble-by-smaller ⇒ **no** victim warning, **and** an attacker "hit" toast
    (this reverses scenario 2's current intent — "a bite the victim should be told about").
  - between-zone (bigger attacker) ⇒ victim warning fires.
  - new scenarios: "ate" attribution, weapon-kill attribution (`killedByWeaponId`/`killedById`),
    melee finishing-blow "kill".
  - update `world.steps.ts` for the new `combatEvents` shape.
- **Check `server/features/weapon-kill.feature` and `lifecycle.feature`** for death-attribution
  assertions; `lifecycle.feature` "byName the void" on disconnect stays valid.
- **Update `client/features/presence.feature` + fixtures** (`mock-ws.ts`, `presence-page.ts`,
  `presence.steps.ts`): `playerBitten` → `combatToast` "You were bitten by Charlie";
  "Ate Snacky" → "You ate Snacky" via a server `combatToast`; add a weapon-kill `playerDied`
  variant ("killed by Charlie with <weapon>").

## Rejected alternative
Keeping toasts **client-derived** (deriving "You ate/killed" from snapshots). Rejected: cannot
cleanly dedupe against the global death line, cannot reliably know the lethal weapon, and fights
the authoritative-server model.
