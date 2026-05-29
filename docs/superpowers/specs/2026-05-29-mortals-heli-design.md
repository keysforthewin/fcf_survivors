# Mortal's Heli + Battle Comms — Design

Date: 2026-05-29
Status: Approved (pending spec review)

## Summary

Add a new weapon, **Mortal's Heli**, a Rust-themed minicopter (with a pilot) that
appears periodically, loiters and tracks the player, and fires an AK-47 at on-screen
enemy fish using interception (lead) aiming. Add a new passive, **Battle Comms**,
that slows any fish you damage to half speed for a brief, level-scaled duration. The
two form a 7th weapon+passive **evolution** pair → the **Attack Helicopter** (Rust's
scripted patrol heli).

This introduces the game's first **enemy debuff** (every existing passive is a
self-buff multiplier) and the first **player-tracking summon** (the existing `flyby`
weapon crosses straight through and exits).

## Goals

- A minicopter summon that follows/loiters around the player for a fixed window, then leaves.
- AK fire at ~2× the base AK's rate, lead-aimed so straight-swimming AI gets hit and a juking player can dodge.
- A global on-hit slow debuff (Battle Comms) that scales its duration with passive stacks.
- A 7th evolution (Attack Helicopter) gated on Heli Lv5 + Battle Comms maxed.
- Rust-themed image-gen sprites + card icons.

## Non-goals

- Heli rockets / splash damage (the Attack Helicopter is dual-minigun rapid AK only; rockets are a possible future).
- Anti-cheat hardening of the slow (own-fish remains client-authoritative; consistent with the rest of the game).
- A standalone "passwords/secret codes" system — "battle comms" was confirmed to mean the paired **passive**, not a cheat code.

## Background: relevant existing systems

- **`flyby` weapon kind** (`Alien Friends`/`Alien Overlord`): `tickFlyby` summons a
  damage-0 `linear` projectile (the UFO body) that auto-expires after `lifetimeMs`,
  and snipes the nearest on-screen fish every `intervalMs` via an instant laser
  (a zap event, not a projectile). The heli reuses this shape, with two differences:
  the body is **steered toward the player** instead of crossing straight, and it
  fires **real lead-aimed bullets** instead of instant lasers.
- **Authoritative server / dumb client**: sim runs at 20Hz in `packages/server/src/sim`.
  Projectiles ride a snapshot-delta pipeline; the client interpolates/dead-reckons them.
- **Client-authoritative own fish**: the server does not integrate the player's own
  fish movement. The snapshot's `you` block ships `moveSpeed`/`boostUntil` for it, and
  the client's `stepSelf` (in `scenes/arena.ts`) runs the shared movement integrator
  locally. Boost is applied client-side from `you.boostReadyAt`/`boostUntil`.
- **Passives** are pure self-multipliers, read via getters in
  `server/src/sim/passives.ts`. Battle Comms does NOT fit that mold — it debuffs the
  *target*, so it lives in the damage path, not a getter.
- **`applyHit`** (`server/src/sim/weapon.ts`) is the single funnel for all weapon
  damage (linear/burst/pulse/laser/orbital/trail and the client-reported hit path).
  It is the one place to trigger the slow.

## Design

### 1. Weapon: Mortal's Heli (`heli`, base weapon)

`packages/shared/src/weapons.ts`:

- Add `"heli"` and `"gunship"` to the `WeaponId` union.
- Add `"heli"` to the `WeaponKind` union.
- `WEAPONS.heli`:
  - `kind: "heli"`, `name: "Mortal's Heli"`.
  - Per-level fields (index 0 = Lv1):
    - `damage`: 1, 2, 3, 4, 5
    - `cooldownMs`: 20000 (summon every 20s)
    - `lifetimeMs`: 8000 (flies off after 8s)
    - `intervalMs` (fire cadence): 700, 660, 620, 580, 550 (≈2× the AK's 1500→1100)
    - `count`: 1 (one heli body)
    - `speed`: 420 → 520 (AK-class bullet speed), `radius`: 18 (bullet collision/visual)
    - `range`: HUD-only (e.g. 2400), like `alien`.

`packages/server/src/sim/weapon.ts`:

- New `tickHeli` branch in `tryFireWeapons` (it manages its own `cooldownReadyAt`
  like `tickFlyby`, so the HUD shows the real next-summon countdown).
- New `HeliState` (in `entity.ts`): `{ kind: "heli"; ship: { projId; lastFireAt;
  waypointX; waypointY; nextWaypointAt } | null }`.
- `tickHeli` logic:
  1. If no live ship and `now >= cooldownReadyAt`: summon a damage-0 `linear`
     projectile (the body) at a random offset around the player, `expiresAt = now +
     lifetimeMs`, `radius` = a body size (~48, large enough to read as a heli; does
     **not** gate damage since `damage: 0`). Mark it as the heli body for the client
     (see §6). Set `cooldownReadyAt = now + cooldownMs * cdMult`. Pick an initial waypoint.
  2. Each tick while the ship lives: steer its velocity toward the current waypoint
     (a point at a random radius/angle offset from the player), clamped to a heli
     cruise speed; re-pick the waypoint every ~1.5s or on arrival. The body keeps
     `behavior: "linear"` and is moved by its `vx/vy` (the world integrator), so the
     client dead-reckons it smoothly between snapshots; `tickHeli` only nudges `vx/vy`.
  3. Drop the ship when its projectile expires/is removed (mirrors `tickFlyby`'s filter).
  4. Every `intervalMs`, fire one AK bullet (see §1a).
- Reuse `cleanupOwnerProjectiles`/expiry — body is `linear`, so it expires naturally;
  no orbital/static cleanup needed.

#### 1a. Lead-aimed AK fire

- Gather on-screen enemy fish (reuse `world.fishHash` query + `withinOwnerView`,
  same as `fireLaser`). Pick the nearest to the heli.
- Compute an intercept: solve for time `t` where `|target.pos + target.vel·t -
  heli.pos| = bulletSpeed·t` (quadratic; take the smallest positive root). Aim the
  bullet at the predicted point. If no positive solution (e.g. target faster than
  bullet), aim at the target's current position.
- Spawn a normal single-hit `linear` projectile (`behavior: "linear"`, `reHitMs: 0`,
  `damage` = level damage + the owner's weapon-damage bonus) toward the intercept,
  `weaponId` = the heli's id (`heli`/`gunship`). This rides the standard
  `applyProjectileDamage` + client-reported-hit pipeline → so Battle Comms fires on hit.
- Fire silently when nothing is on-screen.

### 2. Passive: Battle Comms (`comms`)

`packages/shared/src/passives.ts`:

- Add `"comms"` to the `PassiveId` union, to `PASSIVE_IDS`, and a `PASSIVES.comms` entry:
  - `name: "Battle Comms"`, `maxStack: 5`.
  - `description`: "Fish you damage are slowed to 50% speed — 0.2s, +0.1s per stack."
  - New `PassiveEffect` variant `"enemySlowOnHit"` (marker; the logic lives in the
    damage path, not a getter — `perStack` is unused for the multiplier math, set to 1).

`packages/server/src/sim/entity.ts`:

- The `PassiveId` union is **duplicated** here — add `"comms"` to it too (kept in sync
  with shared).

`packages/shared/src/balance.ts`:

- Add a `SLOW` block: `{ mult: 0.5, baseMs: 200, perStackMs: 100 }`.
- Battle Comms duration at stack `n` = `baseMs + perStackMs * (n - 1)` → 200/300/400/500/600ms.

Card generation already iterates `PASSIVE_IDS`, so the Battle Comms card appears
automatically once the id is added.

### 3. The slow mechanic

`packages/server/src/sim/entity.ts`:

- Add `slowUntil?: number` to `Fish` (wall-time; absent/0 = not slowed).

`packages/server/src/sim/weapon.ts` (`applyHit`):

- `applyHit` gains a `now` parameter (threaded from its callers — `applyProjectileDamage`
  already has `now`; `pulseAt`/`firePulse`/`fireLaser`/`applyClientWeaponHit` get `now`
  threaded in).
- After applying damage: if `!owner.isAi` and `owner.passives.get("comms")` > 0, set
  `target.slowUntil = max(target.slowUntil ?? 0, now + duration(stack))`. Refresh-only,
  never compounds the 0.5× multiplier. The owner is never slowed (it's the target that's hit).

`packages/server/src/sim/passives.ts` + movement:

- Add `getEffectiveMoveSpeed(fish, now)` = `getMoveSpeed(fish) * (now < (fish.slowUntil ?? 0) ? SLOW.mult : 1)`.
- The server movement integration (for AI + remote fish in `world.step`) uses
  `getEffectiveMoveSpeed`. Their snapshot positions then already reflect the slow —
  no client work needed for them.
- `getMoveSpeed` itself is unchanged; the `you.moveSpeed` snapshot value stays the
  **unslowed base** (the client applies the slow itself, mirroring how it applies boost).

Own (client-authoritative) fish:

- `packages/shared/src/protocol.ts`: add `slowUntil: number` to `SnapshotMsg.you`
  (0 when not slowed).
- `packages/server/src/net/snapshot.ts`: populate `you.slowUntil` from the fish.
- `packages/client/src/scenes/arena.ts` (`stepSelf`): track `youSlowUntil`; compute
  `slowMult = estServerNow < youSlowUntil ? SLOW.mult : 1` and pass
  `this.youMoveSpeed * slowMult` into `stepFishMovement` (alongside `boostMult`).

### 4. Evolution: Attack Helicopter (`gunship`)

`packages/shared/src/evolutions.ts`:

- `EVOLUTIONS.heli = { base: "heli", passive: "comms", evolutionId: "gunship" }`.
- Add `"heli"` to `BASE_WEAPONS` and `"gunship"` to `EVOLUTION_WEAPONS`.

`packages/shared/src/weapons.ts` `WEAPONS.gunship`:

- `kind: "heli"`, `name: "Attack Helicopter"`, `evolutionOf: "heli"`.
- Stronger tier (flat across levels like other evolutions): `damage: 7`,
  `cooldownMs: 16000`, `lifetimeMs: 10000`, `intervalMs: 300` (rapid dual-minigun),
  fires **2 bullets per burst** (slight spread), `speed: 560`, `radius: 18`, larger
  body radius.

`drawCards` (`server/src/sim/levelup.ts`) already forces eligible evolutions into the
draw — no change beyond the `EVOLUTIONS` entry.

### 5. Graphics (image-gen, Rust theme)

- `packages/client/public/weapons/heli.png` — top-down minicopter with a Rust
  survivor pilot; grungy industrial palette. Transparent PNG, nose facing +x
  (matches the fish "facing +x" convention so velocity-rotation is simple).
- `packages/client/public/weapons/gunship.png` — the menacing green Rust Attack Helicopter.
- `packages/client/public/icons/heli.png`, `gunship.png`, `comms.png` — card icons
  matching the existing icon set (icons are keyed by weapon/passive id).
- `packages/client/src/render/heli.ts` — a `HeliSprite` (textured Sprite, rotates to
  face velocity, rotor-blur + a muzzle flash flicker when firing). Loaded like the
  fish species textures.
- `packages/client/src/scenes/arena.ts` projectile-create hook (~line 1028): when the
  projectile's weapon kind is `"heli"` **and** it is flagged as the body (see §6),
  build a `HeliSprite`; otherwise a normal `ProjectileSprite` (the AK bullets render
  as ordinary bullets). The `mode` is `"linear"` for both.

### 6. Body vs. bullet discriminator (wire)

The heli **body** and its **AK bullets** share the same `weaponId`, so the client
needs to tell them apart. Add an optional first-seen boolean to the projectile delta:

- `packages/shared/src/protocol.ts` `EntityDelta`: add `body?: boolean`.
- `packages/server/src/net/snapshot.ts` `projectileDelta`: emit `body: true`
  (first-seen only) for the heli body projectile. The server marks the body — e.g. a
  `isBody?: boolean` on `Projectile` set at summon, or inferred from `damage === 0 &&
  kind === "heli"`. Prefer an explicit `isBody` flag on the projectile for clarity.
- Client render hook keys on `kind === "heli" && ent.body` → `HeliSprite`.

`MAX_PROJECTILE_RADIUS` auto-derives from `WEAPONS`, so the larger heli body radius is
covered for the snapshot interest pad as long as it's a level `radius` — note the body
radius is set at spawn, not from the level `radius` (which is the bullet radius), so
ensure the body radius ≤ the existing max (500, eel) OR add it to the derivation.
Chosen body radius (~48) is well under 500, so no change needed.

## Edge cases & decisions

- **AI never trigger the slow** (they don't fire weapons / hold passives). Guarded by `!owner.isAi`.
- **Slow refresh, not stack**: multiple hits refresh `slowUntil` to the latest; the 0.5× multiplier never compounds.
- **Heli targets only on-screen fish** (reuse `withinOwnerView`), so it never shoots at fish the owner can't see — consistent with `flyby`/pulse.
- **Lead-aim fallback**: no positive intercept root → aim at current position.
- **Heli body is harmless** (`damage: 0`) — touching it does nothing, like the UFO.
- **Heli during level-up freeze**: `tryFireWeapons` already early-returns while a
  modal is open and undismissed, so the heli neither summons nor fires then — consistent
  with all weapons.
- **Owner death**: body is `linear` and expires on its own; bullets in flight still
  land (matches existing linear behavior).

## Testing

**Server (cucumber)** — `makeWorld({ now, rng, autoSpawnPellets: false, maintainAi: false })`:

- Heli summons when its cooldown elapses; a body projectile exists; it expires at `summon + lifetimeMs`.
- Heli does not re-summon while a body is still alive.
- Heli fires a bullet roughly every `intervalMs` (~2× AK), and a bullet placed on a
  straight-swimming AI's path damages it (mass drops).
- Lead aim: an AI moving perpendicular gets a bullet aimed ahead of it (assert the
  bullet's velocity vector leads the target, or that the AI is hit).
- Battle Comms: a player with `comms` who damages a fish sets `target.slowUntil`, and
  `getEffectiveMoveSpeed(target, now)` is half of `getMoveSpeed(target)` while active,
  reverting after the duration. Duration scales with stack count.
- Evolution gating: Heli at Lv5 + Battle Comms at maxStack causes `drawCards` to offer
  the Attack Helicopter (`gunship`); not offered before both conditions hold.

**Client (playwright-bdd)** — light:

- With the heli weapon owned, a heli sprite renders (body present on screen).

## Files touched (summary)

- `packages/shared/src/weapons.ts` — `WeaponId`/`WeaponKind` unions, `WEAPONS.heli`, `WEAPONS.gunship`.
- `packages/shared/src/passives.ts` — `PassiveId`, `PASSIVE_IDS`, `PASSIVES.comms`, `PassiveEffect`.
- `packages/shared/src/evolutions.ts` — `EVOLUTIONS.heli`, `BASE_WEAPONS`, `EVOLUTION_WEAPONS`.
- `packages/shared/src/balance.ts` — `SLOW` constants.
- `packages/shared/src/protocol.ts` — `EntityDelta.body`, `SnapshotMsg.you.slowUntil`.
- `packages/server/src/sim/entity.ts` — `Fish.slowUntil`, `Projectile.isBody`, `HeliState`, `PassiveId` sync, `WeaponSlot.state` union.
- `packages/server/src/sim/weapon.ts` — `tickHeli` + lead-aim fire, `applyHit` slow trigger + `now` threading.
- `packages/server/src/sim/passives.ts` — `getEffectiveMoveSpeed`.
- `packages/server/src/sim/world.ts` — use `getEffectiveMoveSpeed` for AI/remote movement.
- `packages/server/src/net/snapshot.ts` — `you.slowUntil`, projectile `body` flag.
- `packages/client/src/scenes/arena.ts` — `stepSelf` slow, heli render hook, `youSlowUntil`.
- `packages/client/src/render/heli.ts` — new `HeliSprite`.
- `packages/client/public/weapons/heli.png`, `gunship.png`; `public/icons/heli.png`, `gunship.png`, `comms.png`.
- Tests: new cucumber feature(s) under `packages/server/features/`, light client feature.
