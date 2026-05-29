# Mortal's Heli + Battle Comms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Rust-themed minicopter weapon (Mortal's Heli) that tracks the player and fires lead-aimed AK bullets, a Battle Comms passive that slows fish you damage, and an Attack Helicopter evolution.

**Architecture:** The heli reuses the projectile pipeline as a steered, damage-0 `linear` body (mirroring the `flyby` UFO) that fires real lead-aimed bullets. Battle Comms is the game's first enemy debuff — applied in the single damage funnel `applyHit`, propagated to AI via server movement and to players via a `you.slowUntil` snapshot field the client honors in `stepSelf`.

**Tech Stack:** Bun + TypeScript monorepo (`packages/shared`, `packages/server`, `packages/client`), PixiJS renderer, Cucumber (server) / playwright-bdd (client). Spec: `docs/superpowers/specs/2026-05-29-mortals-heli-design.md`.

---

## Conventions for this plan

- **Typecheck command:** `bun run typecheck` (from repo root). Expected: no errors.
- **Server tests:** `bun --cwd=packages/server run test` (all) or `bun --cwd=packages/server x cucumber-js features/<name>.feature` (one feature).
- Pure data / wire / client-render tasks are gated by `bun run typecheck` (the codebase has no shared/client unit-test runner; behavior is validated by the Cucumber tasks). Sim-logic tasks use TDD via Cucumber.
- Commit after each task with the shown message. A repo commit hook may rewrite the subject prefix — that's expected.

---

## File structure

**Shared (`packages/shared/src/`)**
- `weapons.ts` — add `heli`/`gunship` to `WeaponId`, `heli` to `WeaponKind`, `WEAPONS.heli` + `WEAPONS.gunship`.
- `passives.ts` — add `comms` to `PassiveId`, `PASSIVE_IDS`, `PASSIVES`, and a `PassiveEffect` variant.
- `evolutions.ts` — `EVOLUTIONS.heli`, `BASE_WEAPONS`, `EVOLUTION_WEAPONS`.
- `balance.ts` — `SLOW` constants + `battleCommsSlowMs`.
- `protocol.ts` — `EntityDelta.body`, `SnapshotMsg.you.slowUntil`.

**Server (`packages/server/src/`)**
- `sim/entity.ts` — `Fish.slowUntil`, `Projectile.isBody`, `HeliState`, `WeaponSlot.state` union, `PassiveId` sync.
- `sim/weapon.ts` — `tickHeli` + heli fire/lead-aim, `applyHit` slow trigger + `now` threading.
- `sim/passives.ts` — `getEffectiveMoveSpeed`.
- `sim/world.ts` — use `getEffectiveMoveSpeed` for server-integrated fish.
- `net/snapshot.ts` — `you.slowUntil`, projectile `body` flag.

**Client (`packages/client/src/`)**
- `scenes/arena.ts` — consume `you.slowUntil` in `stepSelf`; heli render hook.
- `render/heli.ts` — new `HeliSprite`.
- `render/heli-textures.ts` — texture preload/lookup (mirrors `species-textures.ts`).

**Assets (`packages/client/public/`)**
- `weapons/heli.png`, `weapons/gunship.png` — body sprites (transparent, nose facing +x).
- `icons/heli.png`, `icons/gunship.png`, `icons/comms.png` — card icons.

**Tests (`packages/server/`)**
- `features/heli.feature`, `features/battle-comms.feature` — new Cucumber features.
- `test/steps/heli.steps.ts` — new step definitions.

---

## Task 1: Shared weapon data — Heli + Attack Helicopter + slow constants

**Files:**
- Modify: `packages/shared/src/weapons.ts`
- Modify: `packages/shared/src/balance.ts`

- [ ] **Step 1: Add `SLOW` constants + helper to balance.ts**

Append to `packages/shared/src/balance.ts`:

```ts
/** Battle Comms: the slow debuff applied to any fish you damage. */
export const SLOW = {
  /** Move-speed multiplier while slowed. */
  mult: 0.5,
  /** Slow duration (ms) at Battle Comms stack 1. */
  baseMs: 200,
  /** Added slow duration (ms) per Battle Comms stack beyond the first. */
  perStackMs: 100,
} as const;

/** Slow duration (ms) for a Battle Comms stack count. Stack 0 (no passive) = no slow. */
export function battleCommsSlowMs(stack: number): number {
  return stack <= 0 ? 0 : SLOW.baseMs + SLOW.perStackMs * (stack - 1);
}
```

- [ ] **Step 2: Extend `WeaponId` and `WeaponKind`**

In `packages/shared/src/weapons.ts`, add to the `WeaponId` union (after `"overlord"`):

```ts
  | "overlord"
  | "heli"
  | "gunship";
```

Add to the `WeaponKind` union (after the `flyby` line):

```ts
  | "flyby"          // N summoned ships cross the screen, pulsing AoE lasers along the way
  | "heli";          // a summoned minicopter that loiters around the player and fires lead-aimed bullets
```

- [ ] **Step 3: Add `WEAPONS.heli` and `WEAPONS.gunship`**

In the `WEAPONS` record, after the `overlord` entry (before the closing `};`):

```ts
  heli: {
    id: "heli",
    name: "Mortal's Heli",
    description: "A minicopter circles you and snipes fish with a lead-aimed AK — twice the fire rate of the AK. Appears for 8s every 20s.",
    kind: "heli",
    levels: [
      // cooldownMs = summon interval (20s); lifetimeMs = uptime (8s); intervalMs = ms/shot
      // (~2x the AK's 1500→1100); range is HUD-only. speed/radius mirror the AK bullet.
      { damage: 1, cooldownMs: 20000, count: 1, range: 2400, intervalMs: 700, lifetimeMs: 8000, speed: 420, radius: 18 },
      { damage: 2, cooldownMs: 20000, count: 1, range: 2400, intervalMs: 660, lifetimeMs: 8000, speed: 445, radius: 18 },
      { damage: 3, cooldownMs: 20000, count: 1, range: 2400, intervalMs: 620, lifetimeMs: 8000, speed: 470, radius: 18 },
      { damage: 4, cooldownMs: 20000, count: 1, range: 2400, intervalMs: 580, lifetimeMs: 8000, speed: 495, radius: 18 },
      { damage: 5, cooldownMs: 20000, count: 1, range: 2400, intervalMs: 550, lifetimeMs: 8000, speed: 520, radius: 18 },
    ],
  },
  gunship: {
    id: "gunship", name: "Attack Helicopter", description: "Rust's patrol heli — dual miniguns, rapid fire, longer patrols.",
    kind: "heli", evolutionOf: "heli",
    levels: [
      // Dual-minigun: 2 bullets/burst with a slight spread; rapid 300ms cadence; 10s uptime, 16s cooldown.
      { damage: 7, cooldownMs: 16000, count: 2, range: 2400, intervalMs: 300, lifetimeMs: 10000, speed: 560, radius: 18, spread: 0.18 },
      { damage: 7, cooldownMs: 16000, count: 2, range: 2400, intervalMs: 300, lifetimeMs: 10000, speed: 560, radius: 18, spread: 0.18 },
      { damage: 7, cooldownMs: 16000, count: 2, range: 2400, intervalMs: 300, lifetimeMs: 10000, speed: 560, radius: 18, spread: 0.18 },
      { damage: 7, cooldownMs: 16000, count: 2, range: 2400, intervalMs: 300, lifetimeMs: 10000, speed: 560, radius: 18, spread: 0.18 },
      { damage: 7, cooldownMs: 16000, count: 2, range: 2400, intervalMs: 300, lifetimeMs: 10000, speed: 560, radius: 18, spread: 0.18 },
    ],
  },
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no errors). The `getWeaponLevel`/`MAX_PROJECTILE_RADIUS` helpers handle the new entries automatically; the heli's level `radius` (18) is the bullet radius and is well under the existing max (500).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/weapons.ts packages/shared/src/balance.ts
git commit -m "feat(shared): add Mortal's Heli + Attack Helicopter weapon data and SLOW constants"
```

---

## Task 2: Shared passive data — Battle Comms

**Files:**
- Modify: `packages/shared/src/passives.ts`
- Modify: `packages/server/src/sim/entity.ts` (the duplicated `PassiveId` union)

- [ ] **Step 1: Add `comms` to `PassiveId`, `PassiveEffect`, `PASSIVES`, `PASSIVE_IDS`**

In `packages/shared/src/passives.ts`, extend the `PassiveId` union:

```ts
export type PassiveId =
  | "fin" | "gulp" | "scales" | "teeth" | "reflex" | "magnet" | "recovery" | "hungry" | "closeEncounters" | "comms";
```

Add a `PassiveEffect` variant (after `"fishEatRangeMult"`):

```ts
  | "fishEatRangeMult"
  | "enemySlowOnHit";
```

Add the `PASSIVES.comms` entry (after `closeEncounters`, before the closing `};`):

```ts
  comms: {
    id: "comms", name: "Battle Comms", description: "Fish you damage are slowed to 50% speed — 0.2s, +0.1s per stack.",
    maxStack: 5, perStack: 1, effect: "enemySlowOnHit",
  },
```

Extend `PASSIVE_IDS`:

```ts
export const PASSIVE_IDS: PassiveId[] = ["fin", "gulp", "scales", "teeth", "reflex", "magnet", "recovery", "hungry", "closeEncounters", "comms"];
```

- [ ] **Step 2: Sync the duplicated `PassiveId` in the server entity module**

In `packages/server/src/sim/entity.ts`, update the local `PassiveId` (around line 50):

```ts
export type PassiveId =
  | "fin" | "gulp" | "scales" | "teeth" | "reflex" | "magnet" | "recovery" | "hungry" | "closeEncounters" | "comms";
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS. (Card generation iterates `PASSIVE_IDS`, so the Battle Comms card now appears automatically.)

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/passives.ts packages/server/src/sim/entity.ts
git commit -m "feat(shared): add Battle Comms passive"
```

---

## Task 3: Evolution wiring — Heli → Attack Helicopter

**Files:**
- Modify: `packages/shared/src/evolutions.ts`

- [ ] **Step 1: Add the evolution entry + lists**

In `packages/shared/src/evolutions.ts`, add to `EVOLUTIONS` (after the `alien` line):

```ts
  alien:   { base: "alien",   passive: "closeEncounters", evolutionId: "overlord" },
  heli:    { base: "heli",    passive: "comms",           evolutionId: "gunship"  },
```

Extend the two arrays:

```ts
export const BASE_WEAPONS: WeaponId[] = ["bubble", "spine", "pulse", "ink", "piranha", "alien", "heli"];
export const EVOLUTION_WEAPONS: WeaponId[] = ["tidal", "puffer", "eel", "kraken", "school", "overlord", "gunship"];
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/evolutions.ts
git commit -m "feat(shared): wire Heli+Battle Comms → Attack Helicopter evolution"
```

---

## Task 4: Wire protocol — body flag + you.slowUntil

**Files:**
- Modify: `packages/shared/src/protocol.ts`

- [ ] **Step 1: Add `body` to `EntityDelta`**

In `packages/shared/src/protocol.ts`, in the `EntityDelta` interface (near `biting`), add:

```ts
  /** Projectile only (first-seen): true for a heli BODY (vs. its bullets) so the client renders a heli sprite. */
  body?: boolean;
```

- [ ] **Step 2: Add `slowUntil` to the `you` block**

In the `SnapshotMsg` interface's `you` object (near `boostUntil`), add:

```ts
    /** Wall-time until which the player's own fish is slowed (Battle Comms). 0 = not slowed. The client applies the SLOW.mult itself in stepSelf. */
    slowUntil: number;
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: FAIL — `snapshot.ts` does not yet populate the now-required `you.slowUntil`. That's expected; Task 8 fills it. (If you prefer a green tree per task, temporarily it's acceptable; the next dependent tasks resolve it. Proceed.)

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/protocol.ts
git commit -m "feat(shared): add EntityDelta.body and you.slowUntil to wire protocol"
```

---

## Task 5: Server entity types — slowUntil, isBody, HeliState

**Files:**
- Modify: `packages/server/src/sim/entity.ts`

- [ ] **Step 1: Add `HeliState` and extend `WeaponSlot.state`**

In `packages/server/src/sim/entity.ts`, add a `HeliState` interface (next to `FlybyState`):

```ts
/**
 * Tracks the single minicopter a heli weapon currently has in the air. The body is a
 * damage-0 linear projectile steered toward a loiter waypoint around the player; it
 * auto-expires after the weapon's lifetimeMs. Bullets are fired off `lastFireAt`.
 * Re-summons once `ship` clears and the cooldown has elapsed.
 */
export interface HeliState {
  kind: "heli";
  ship: {
    projId: number;
    lastFireAt: number;
    waypointX: number;
    waypointY: number;
    nextWaypointAt: number;
  } | null;
}
```

Update the `WeaponSlot.state` union to include it:

```ts
  state?: TrailState | OrbitalState | BurstSweepState | FlybyState | HeliState;
```

- [ ] **Step 2: Add `Fish.slowUntil`**

In the `Fish` interface, add (near `spawnProtectedUntil`):

```ts
  /** Wall-time until which this fish moves at SLOW.mult speed (Battle Comms debuff). 0/undefined = not slowed. */
  slowUntil?: number;
```

- [ ] **Step 3: Add `Projectile.isBody`**

In the `Projectile` interface, add (near `behavior`):

```ts
  /** Heli weapons only: true for the minicopter BODY (damage 0), false/undefined for its bullets. Drives client sprite choice. */
  isBody?: boolean;
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: FAIL only on the pre-existing `you.slowUntil` gap from Task 4 (snapshot.ts). No new errors from this task. Proceed.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/sim/entity.ts
git commit -m "feat(server): add Fish.slowUntil, Projectile.isBody, HeliState"
```

---

## Task 6: Heli summon + lifetime (TDD)

**Files:**
- Create: `packages/server/features/heli.feature`
- Create: `packages/server/test/steps/heli.steps.ts`
- Modify: `packages/server/src/sim/weapon.ts`

- [ ] **Step 1: Write the failing feature — summon, lifetime, re-summon**

Create `packages/server/features/heli.feature`:

```gherkin
Feature: Mortal's Heli (minicopter weapon)
  Mortal's Heli summons a minicopter that loiters around the player for 8s, then
  flies off. It fires a lead-aimed AK at on-screen fish at ~2x the AK's rate. The
  body is a zero-damage projectile (harmless to touch); only its bullets deal damage.
  After the heli expires the next one only summons once the 20s cooldown has elapsed.

  Background:
    Given a fresh world

  Scenario: A minicopter is summoned on the first tick
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 1
    When the world advances 1 tick
    Then 1 heli bodies owned by "Pilot" are in flight

  Scenario: The minicopter flies off after its 8s uptime
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 1
    When the world advances 1 tick
    Then 1 heli bodies owned by "Pilot" are in flight
    When the world advances 8 seconds
    Then 0 heli bodies owned by "Pilot" are in flight

  Scenario: The next heli only summons after the cooldown
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 1
    When the world advances 1 tick
    Then 1 heli bodies owned by "Pilot" are in flight
    # 9s: past the 8s uptime but inside the 20s cooldown → still none.
    When the world advances 9 seconds
    Then 0 heli bodies owned by "Pilot" are in flight
    # ~21s total: cooldown elapsed → a fresh heli summons.
    When the world advances 12 seconds
    Then 1 heli bodies owned by "Pilot" are in flight
```

Create `packages/server/test/steps/heli.steps.ts`:

```ts
import { Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { WEAPONS } from "@fcf/shared";
import type { WeaponId } from "@fcf/shared";
import { TestWorld } from "../support/world.ts";
import { getFish } from "../support/world-factory.ts";
import type { World } from "../../src/sim/world.ts";

/** Count in-flight heli BODY projectiles owned by a fish (excludes its bullets). */
function heliBodyCount(world: World, ownerId: number): number {
  let n = 0;
  for (const p of world.projectiles.values()) {
    if (p.ownerId === ownerId && WEAPONS[p.weaponId as WeaponId]?.kind === "heli" && p.isBody) n++;
  }
  return n;
}

Then(
  "{int} heli bodies owned by {string} are in flight",
  function (this: TestWorld, expected: number, name: string) {
    const sim = this.requireSim();
    const f = getFish(sim, name);
    assert.equal(heliBodyCount(sim.world, f.id), expected, `expected ${expected} heli bodies`);
  },
);
```

> NOTE: granting a passive uses the EXISTING step `"{string} has passive {string} at stack {int}"` (in `loadout.steps.ts`) — do NOT add a new passive-granting step.

- [ ] **Step 2: Run it to verify it fails**

Run: `bun --cwd=packages/server x cucumber-js features/heli.feature`
Expected: FAIL — "expected 1 heli bodies, got 0" (no `tickHeli` yet).

- [ ] **Step 3: Implement `tickHeli` summon + lifetime + steering**

In `packages/server/src/sim/weapon.ts`:

Add `HeliState` to the type import from `./entity.ts`:

```ts
import type { Fish, Projectile, WeaponSlot, OrbitalState, TrailState, BurstSweepState, FlybyState, HeliState } from "./entity.ts";
```

Add the heli tuning constants near the top (after `MIN_HIT_DAMAGE`):

```ts
/** Heli body sprite/collision radius (it deals no damage; this is just its size). */
const HELI_BODY_RADIUS = 48;
/** Speed (units/sec) the heli body cruises toward its loiter waypoint. */
const HELI_CRUISE_SPEED = 320;
/** Loiter ring (min/max radius) the heli picks waypoints within, around the player. */
const HELI_WAYPOINT_MIN_R = 180;
const HELI_WAYPOINT_MAX_R = 420;
/** Re-pick a loiter waypoint at least this often (ms). */
const HELI_REPICK_MS = 1500;
/** Re-pick once the body gets within this distance of its waypoint. */
const HELI_ARRIVE_DIST = 60;
/** Heli AK bullet lifetime (ms) — separate from the heli's own uptime. */
const HELI_BULLET_LIFETIME_MS = 2500;
```

Add the `"heli"` case in `tryFireWeapons`'s switch (after the `flyby` case):

```ts
      case "heli":
        tickHeli(world, fish, slot, lvl, dmg, now, cdMult);
        break;
```

Add the implementation (place it after `tickFlyby`/`fireLaser`, before `ensureFlybyState`):

```ts
function ensureHeliState(slot: WeaponSlot): HeliState {
  if (slot.state && slot.state.kind === "heli") return slot.state;
  const s: HeliState = { kind: "heli", ship: null };
  slot.state = s;
  return s;
}

function pickHeliWaypoint(world: World, fish: Fish): { x: number; y: number } {
  const ang = world.rng() * Math.PI * 2;
  const r = HELI_WAYPOINT_MIN_R + world.rng() * (HELI_WAYPOINT_MAX_R - HELI_WAYPOINT_MIN_R);
  return { x: fish.x + Math.cos(ang) * r, y: fish.y + Math.sin(ang) * r };
}

/**
 * Mortal's Heli: summon a minicopter (a damage-0 linear projectile) that loiters around the
 * player, then fires a lead-aimed AK bullet at the nearest on-screen fish every intervalMs.
 * Sets its own cooldownReadyAt (like tickFlyby) so the HUD shows the real next-summon countdown.
 */
function tickHeli(world: World, fish: Fish, slot: WeaponSlot, lvl: WeaponLevel, damage: number, now: number, cdMult: number): void {
  const state = ensureHeliState(slot);
  // Drop the ship once its body projectile has expired/been removed.
  if (state.ship && !world.projectiles.has(state.ship.projId)) state.ship = null;

  // Summon when none is up and the cooldown has elapsed.
  if (!state.ship && now >= slot.cooldownReadyAt) {
    const lifetimeMs = lvl.lifetimeMs ?? 8000;
    const start = pickHeliWaypoint(world, fish);
    const proj = world.spawnProjectile({
      ownerId: fish.id,
      weaponId: slot.id,
      x: start.x,
      y: start.y,
      vx: 0,
      vy: 0,
      damage: 0,                 // the body is harmless; its bullets deal the damage
      radius: HELI_BODY_RADIUS,
      expiresAt: now + lifetimeMs,
      behavior: "linear",
      reHitMs: 0,
      isBody: true,
    });
    if (proj.id >= 0) {
      state.ship = { projId: proj.id, lastFireAt: now, waypointX: start.x, waypointY: start.y, nextWaypointAt: now + HELI_REPICK_MS };
    }
    slot.cooldownReadyAt = now + (lvl.cooldownMs ?? 20000) * cdMult;
  }

  const ship = state.ship;
  if (!ship) return;
  const proj = world.projectiles.get(ship.projId);
  if (!proj) { state.ship = null; return; }

  // Re-pick a loiter waypoint periodically or on arrival, so the heli keeps tracking the player.
  const dwx = proj.x - ship.waypointX;
  const dwy = proj.y - ship.waypointY;
  if (now >= ship.nextWaypointAt || dwx * dwx + dwy * dwy < HELI_ARRIVE_DIST * HELI_ARRIVE_DIST) {
    const wp = pickHeliWaypoint(world, fish);
    ship.waypointX = wp.x;
    ship.waypointY = wp.y;
    ship.nextWaypointAt = now + HELI_REPICK_MS;
  }

  // Steer the body toward the waypoint (it integrates via vx/vy next tick).
  const tx = ship.waypointX - proj.x;
  const ty = ship.waypointY - proj.y;
  const tmag = Math.hypot(tx, ty) || 1;
  proj.vx = (tx / tmag) * HELI_CRUISE_SPEED;
  proj.vy = (ty / tmag) * HELI_CRUISE_SPEED;

  // Fire on the level cadence (filled in Task 7's predecessor — Step below adds fireHeliBullet).
  const interval = lvl.intervalMs ?? 700;
  if (now - ship.lastFireAt >= interval) {
    ship.lastFireAt = now;
    fireHeliBullet(world, fish, proj, lvl, damage, now);
  }
}
```

Add a temporary stub for `fireHeliBullet` directly below `tickHeli` (the real lead-aim version lands in Task 7 — but define it now so this compiles and the summon/lifetime scenarios pass):

```ts
function fireHeliBullet(world: World, fish: Fish, ship: Projectile, lvl: WeaponLevel, damage: number, now: number): void {
  // Implemented in the next task (lead-aim). Stub: fire straight at the nearest on-screen fish.
  void world; void fish; void ship; void lvl; void damage; void now;
}
```

- [ ] **Step 4: Run the feature to verify summon/lifetime pass**

Run: `bun --cwd=packages/server x cucumber-js features/heli.feature`
Expected: PASS (3 scenarios). `bun run typecheck` — only the pre-existing `you.slowUntil` gap remains.

- [ ] **Step 5: Commit**

```bash
git add packages/server/features/heli.feature packages/server/test/steps/heli.steps.ts packages/server/src/sim/weapon.ts
git commit -m "feat(server): heli summon, loiter steering, lifetime + cooldown"
```

---

## Task 7: Heli lead-aimed AK fire (TDD)

**Files:**
- Modify: `packages/server/features/heli.feature`
- Modify: `packages/server/src/sim/weapon.ts`

- [ ] **Step 1: Add failing fire scenarios**

Append to `packages/server/features/heli.feature`:

```gherkin
  Scenario: The heli's AK damages a straight-swimming fish
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 5
    And an AI fish "Prey" at (4300, 4000) with mass 20
    When the world advances 40 ticks
    Then "Pilot" has at least 1 weapon hit
    And "Pilot" has dealt at least 1 damage

  Scenario: The heli ignores fish far off the player's screen
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 5
    And an AI fish "Far" at (9000, 4000) with mass 20
    When the world advances 60 ticks
    Then "Far" has mass 20
```

Check the step phrases exist: `an AI fish {string} at (...)`, `{string} has at least {int} weapon hit(s)`, `{string} has dealt at least {float} damage`, `{string} has mass {float}` are all defined in `packages/server/test/steps/world.steps.ts`. If the "AI fish" phrasing differs, use the exact existing phrase (grep `world.steps.ts` for `AI fish`).

- [ ] **Step 2: Run to verify the fire scenarios fail**

Run: `bun --cwd=packages/server x cucumber-js features/heli.feature`
Expected: FAIL — "expected at least 1 weapon hit" (the `fireHeliBullet` stub does nothing).

- [ ] **Step 3: Implement lead-aim fire**

In `packages/server/src/sim/weapon.ts`, replace the `fireHeliBullet` stub with:

```ts
/**
 * Pick the enemy fish nearest the heli that's currently on the owner's screen (mirrors
 * fireLaser's visibility gate), or null if the owner has nothing visible to shoot.
 */
function nearestOnScreenEnemy(world: World, owner: Fish, ship: Projectile): Fish | null {
  const scratch: Fish[] = [];
  const viewR = viewRadius(owner.mass);
  world.fishHash.query(owner.x, owner.y, viewR + MAX_FISH_RADIUS_PAD, scratch);
  const viewR2 = viewR * viewR;
  let best: Fish | null = null;
  let bestD2 = Infinity;
  for (const target of scratch) {
    if (target.id === owner.id || !target.alive) continue;
    if (!withinOwnerView(owner, target.x, target.y, viewR2)) continue;
    const dx = target.x - ship.x;
    const dy = target.y - ship.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = target; }
  }
  return best;
}

/**
 * Interception aim: the angle from (ox,oy) to where `target` will be, given a bullet of
 * `bulletSpeed`, by solving |R + V·t| = bulletSpeed·t for the smallest positive t. Falls
 * back to aiming at the target's current position when there is no positive solution.
 */
function leadAngle(ox: number, oy: number, target: Fish, bulletSpeed: number): number {
  const rx = target.x - ox;
  const ry = target.y - oy;
  const tvx = target.vx;
  const tvy = target.vy;
  const a = tvx * tvx + tvy * tvy - bulletSpeed * bulletSpeed;
  const b = 2 * (rx * tvx + ry * tvy);
  const c = rx * rx + ry * ry;
  let t = -1;
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) > 1e-6) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const cands = [(-b + sq) / (2 * a), (-b - sq) / (2 * a)].filter((v) => v > 1e-4);
      if (cands.length) t = Math.min(...cands);
    }
  }
  if (t > 0) return Math.atan2(ry + tvy * t, rx + tvx * t);
  return Math.atan2(ry, rx);
}

/**
 * The heli fires `count` lead-aimed AK bullets (gunship: 2 with a slight spread) at the
 * nearest on-screen fish. Bullets are normal single-hit linear projectiles attributed to
 * the heli's weapon id, so they ride applyProjectileDamage and trigger Battle Comms on hit.
 */
function fireHeliBullet(world: World, fish: Fish, ship: Projectile, lvl: WeaponLevel, damage: number, now: number): void {
  const target = nearestOnScreenEnemy(world, fish, ship);
  if (!target) return;
  const speed = lvl.speed ?? 460;
  const count = lvl.count ?? 1;
  const spread = lvl.spread ?? 0;
  const radius = lvl.radius ?? 18;
  const aim = leadAngle(ship.x, ship.y, target, speed);
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : spread * (i / (count - 1) - 0.5);
    const a = aim + offset;
    const dirX = Math.cos(a);
    const dirY = Math.sin(a);
    world.spawnProjectile({
      ownerId: fish.id,
      weaponId: ship.weaponId,
      x: ship.x + dirX * 6,
      y: ship.y + dirY * 6,
      vx: dirX * speed,
      vy: dirY * speed,
      damage,
      radius,
      expiresAt: now + HELI_BULLET_LIFETIME_MS,
      behavior: "linear",
      reHitMs: 0,
    });
  }
}
```

- [ ] **Step 4: Run to verify all heli scenarios pass**

Run: `bun --cwd=packages/server x cucumber-js features/heli.feature`
Expected: PASS (all scenarios). The straight-swimming AI gets hit (lead aim resolves to its line); the far AI off-screen is never targeted.

- [ ] **Step 5: Commit**

```bash
git add packages/server/features/heli.feature packages/server/src/sim/weapon.ts
git commit -m "feat(server): heli lead-aimed AK fire at on-screen fish"
```

---

## Task 8: Battle Comms slow trigger + propagation (TDD)

**Files:**
- Create: `packages/server/features/battle-comms.feature`
- Modify: `packages/server/test/steps/heli.steps.ts`
- Modify: `packages/server/src/sim/weapon.ts` (thread `now` into `applyHit`, trigger slow)
- Modify: `packages/server/src/sim/passives.ts` (`getEffectiveMoveSpeed`)
- Modify: `packages/server/src/sim/world.ts` (use it for server-integrated fish)
- Modify: `packages/server/src/net/snapshot.ts` (`you.slowUntil`)

- [ ] **Step 1: Write the failing feature + steps**

Create `packages/server/features/battle-comms.feature`:

```gherkin
Feature: Battle Comms (slow-on-damage passive)
  Any fish you damage with a weapon is slowed to half speed for a brief, level-scaled
  window (0.2s at stack 1, +0.1s per stack). The slow applies regardless of which weapon
  landed the hit. AI fish never apply it (they hold no passives).

  Background:
    Given a fresh world

  # Timing: stack 5 = 600ms slow (~12 ticks). Prey sits 90 units ahead; the AK fires on
  # the opening tick (~440 u/s) and connects within ~4 ticks, so at 10 ticks the slow is
  # freshly applied and still active. Keep the advance below the slow window.
  Scenario: Damaging a fish with Battle Comms slows it
    Given a player "Gunner" at (4000, 4000) with mass 80
    And "Gunner" has weapon "bubble" at level 1
    And "Gunner" has passive "comms" at stack 5
    And "Gunner" has input (1, 0)
    And an AI fish "Prey" at (4090, 4000) with mass 30
    When the world advances 10 ticks
    Then "Gunner" has at least 1 weapon hit
    And "Prey" is slowed
    And "Prey" effective move speed is halved

  Scenario: Without Battle Comms there is no slow
    Given a player "Gunner" at (4000, 4000) with mass 80
    And "Gunner" has weapon "bubble" at level 1
    And "Gunner" has input (1, 0)
    And an AI fish "Prey" at (4090, 4000) with mass 30
    When the world advances 10 ticks
    Then "Gunner" has at least 1 weapon hit
    And "Prey" is not slowed
```

Append to `packages/server/test/steps/heli.steps.ts`:

```ts
import { getMoveSpeed, getEffectiveMoveSpeed } from "../../src/sim/passives.ts";

Then("{string} is slowed", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = getFish(sim, name);
  assert.ok((f.slowUntil ?? 0) > sim.clock.now(), `expected ${name} to be slowed`);
});

Then("{string} is not slowed", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = getFish(sim, name);
  assert.ok((f.slowUntil ?? 0) <= sim.clock.now(), `expected ${name} not slowed`);
});

Then("{string} effective move speed is halved", function (this: TestWorld, name: string) {
  const sim = this.requireSim();
  const f = getFish(sim, name);
  const eff = getEffectiveMoveSpeed(f, sim.clock.now());
  const base = getMoveSpeed(f);
  assert.ok(Math.abs(eff - base * 0.5) < 1e-6, `expected halved speed, got ${eff} vs base ${base}`);
});
```

(The `Given(... input ...)`, `an AI fish`, and `"{string} has at least {int} weapon hit(s)"`
steps already exist. The `weapon hit` assertion gates the slow check on the shot actually
landing, so a miss fails as "no hit" rather than silently as "not slowed". If the shot proves
flaky under the seeded rng, move the prey closer or nudge the advance count — but keep it
strictly below the 12-tick slow window so the slow is still active at assertion time.)

- [ ] **Step 2: Run to verify it fails**

Run: `bun --cwd=packages/server x cucumber-js features/battle-comms.feature`
Expected: FAIL — `getEffectiveMoveSpeed` not exported / "Prey" not slowed.

- [ ] **Step 3: Add `getEffectiveMoveSpeed` to passives.ts**

In `packages/server/src/sim/passives.ts`, add the `SLOW` import and the function:

```ts
import { FISH, PASSIVES, SLOW, massSpeedMult, stackedMult } from "@fcf/shared";
```

```ts
/** getMoveSpeed with the Battle Comms slow applied when active. Server movement uses this. */
export function getEffectiveMoveSpeed(fish: Fish, now: number): number {
  const base = getMoveSpeed(fish);
  return (fish.slowUntil ?? 0) > now ? base * SLOW.mult : base;
}
```

- [ ] **Step 4: Thread `now` into `applyHit` and trigger the slow**

In `packages/server/src/sim/weapon.ts`:

Add `battleCommsSlowMs` to the shared import:

```ts
import { WEAPONS, getWeaponLevel, FISH, MAX_FISH_RADIUS_PAD, fishRadius, viewRadius, battleCommsSlowMs } from "@fcf/shared";
```

Change `applyHit`'s signature to take `now` and apply the slow at the end:

```ts
function applyHit(world: World, target: Fish, owner: Fish, damage: number, weaponId: WeaponId, now: number): void {
```

At the end of `applyHit` (after the lethal-hit block), add:

```ts
  // Battle Comms: any fish a player damages is slowed to half speed for a level-scaled window.
  // AI never carry passives, so this is a no-op for AI owners. The owner is the attacker, never slowed.
  if (!owner.isAi) {
    const dur = battleCommsSlowMs(owner.passives.get("comms") ?? 0);
    if (dur > 0) target.slowUntil = Math.max(target.slowUntil ?? 0, now + dur);
  }
```

Thread `now` through every `applyHit` call site (all are in `weapon.ts`):
- In `applyProjectileDamage` (has `now`): `applyHit(world, target, owner, proj.damage, proj.weaponId, now);`
- In `applyClientWeaponHit` (has `now`): `applyHit(world, target, owner, proj.damage, proj.weaponId, now);`
- In `pulseAt`: add a `now: number` parameter and pass it to `applyHit`; update both callers — `firePulse` (add `now` param) and `fireLaser` (already has access via `tickFlyby`'s `now`). Specifically:
  - `function pulseAt(world, originId, owner, x, y, radius, damage, weaponId, now, chain = false, maxTargets?)` → call `applyHit(world, target, owner, damage, weaponId, now)`.
  - `function firePulse(world, fish, slot, lvl, damage, chain, now)` → `pulseAt(world, fish.id, fish, fish.x, fish.y, radius, damage, slot.id, now, chain, lvl.maxTargets)`.
  - In `tryFireWeapons` radial-pulse case: `firePulse(world, fish, slot, lvl, dmg, def.chain ?? false, now);`
  - `function fireLaser(world, owner, ship, viewR, damage, weaponId, now)` → `applyHit(world, best, owner, damage, weaponId, now)`; update its call in `tickFlyby`: `fireLaser(world, fish, proj, viewR, damage, slot.id, now);`

(`applyNibble` is intentionally NOT changed — the slow is for weapon damage only, per the spec's "fish you damage" scoping to weapons.)

- [ ] **Step 5: Use `getEffectiveMoveSpeed` for server-integrated fish**

In `packages/server/src/sim/world.ts`:

Update the import (line 7):

```ts
import { getMoveSpeed, getEffectiveMoveSpeed, getBoostCooldown, getPickupRadius, getPelletXp, getFishEatMass, getEatRangeMult } from "./passives.ts";
```

At line ~470, change the movement call from `getMoveSpeed(f)` to `getEffectiveMoveSpeed(f, now)`:

```ts
        stepFishMovement(f, f.targetVx, f.targetVy, getEffectiveMoveSpeed(f, now), f.boost ? FISH.boostMultiplier : 1, f.mass, dtSec);
```

(This is the path AI fish and not-yet-client-reported players move on. Client-authoritative players are slowed via `you.slowUntil` in the next step — the server doesn't integrate them.)

- [ ] **Step 6: Populate `you.slowUntil` in the snapshot**

In `packages/server/src/net/snapshot.ts`, in the `you` object (near `boostUntil`), add:

```ts
      slowUntil: self.slowUntil ?? 0,
```

- [ ] **Step 7: Run the feature + typecheck**

Run: `bun --cwd=packages/server x cucumber-js features/battle-comms.feature`
Expected: PASS (both scenarios).
Run: `bun run typecheck`
Expected: PASS (the `you.slowUntil` gap from Task 4 is now resolved).

- [ ] **Step 8: Commit**

```bash
git add packages/server/features/battle-comms.feature packages/server/test/steps/heli.steps.ts packages/server/src/sim/weapon.ts packages/server/src/sim/passives.ts packages/server/src/sim/world.ts packages/server/src/net/snapshot.ts
git commit -m "feat(server): Battle Comms slow-on-damage + slowUntil propagation"
```

---

## Task 9: Snapshot — emit the heli body flag

**Files:**
- Modify: `packages/server/src/net/snapshot.ts`

- [ ] **Step 1: Emit `body: true` for heli body projectiles (first-seen)**

In `packages/server/src/net/snapshot.ts`, find `projectileDelta` (around line 44). In its first-seen branch (where `weaponId`, `ownerId`, `radius` are set when `!prev`), add:

```ts
    if (proj.isBody) delta.body = true;
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/net/snapshot.ts
git commit -m "feat(server): ship heli body flag in projectile snapshot"
```

---

## Task 10: Evolution gating test (TDD)

Reuses the EXISTING evolution-offer machinery: `processLevelUps` populates
`pendingLevelUp`, and the existing step `"{string} is offered an evolution for {string}"`
(in `leveling.steps.ts`) checks for an evolution card whose **`baseId`** matches (evolution
cards parse to `{ kind: "evolution", baseId: <base weapon id> }` — keyed by the *base* id,
i.e. `"heli"`, NOT `"gunship"`). We add one small negative step.

**Files:**
- Modify: `packages/server/features/heli.feature`
- Modify: `packages/server/test/steps/heli.steps.ts`

- [ ] **Step 1: Add the gating scenarios (mirrors the `alien`→`overlord` scenario in `leveling.feature`)**

Append to `packages/server/features/heli.feature`:

```gherkin
  Scenario: Mortal's Heli maxed with Battle Comms maxed offers the Attack Helicopter
    Given a player "Ace" at (1000, 1000) with mass 10
    And "Ace" has weapon "heli" at level 5
    And "Ace" has passive "comms" at stack 5
    And "Ace" has accumulated 10 XP
    When level-ups are processed
    Then "Ace" is offered an evolution for "heli"

  Scenario: The Attack Helicopter is not offered until Battle Comms is maxed
    Given a player "Rook" at (1000, 1000) with mass 10
    And "Rook" has weapon "heli" at level 5
    And "Rook" has passive "comms" at stack 2
    And "Rook" has accumulated 10 XP
    When level-ups are processed
    Then "Rook" is not offered an evolution for "heli"
```

All steps here already exist EXCEPT `"is not offered an evolution for"` (added next).
`has weapon ... at level`, `has passive ... at stack`, `has accumulated ... XP`,
`level-ups are processed`, and `is offered an evolution for` are all defined.

- [ ] **Step 2: Run to verify the negative step is missing**

Run: `bun --cwd=packages/server x cucumber-js features/heli.feature`
Expected: the positive scenario PASSES; the negative scenario reports the
`"is not offered an evolution for"` step as UNDEFINED.

- [ ] **Step 3: Add the negative evolution step**

Append to `packages/server/test/steps/heli.steps.ts` (mirror the positive step in
`leveling.steps.ts`, which uses `parseCardId` and checks `pendingLevelUp`):

```ts
import { parseCardId } from "@fcf/shared";

Then(
  "{string} is not offered an evolution for {string}",
  function (this: TestWorld, name: string, baseId: string) {
    const sim = this.requireSim();
    const f = getFish(sim, name);
    const found = f.pendingLevelUp.some((c) => {
      const parsed = parseCardId(c.id);
      return parsed?.kind === "evolution" && parsed.baseId === baseId;
    });
    assert.ok(!found, `expected ${name} NOT offered an evolution for ${baseId}`);
  },
);
```

- [ ] **Step 4: Run to verify both scenarios pass**

Run: `bun --cwd=packages/server x cucumber-js features/heli.feature`
Expected: PASS — Heli L5 + Comms maxed offers the `heli` evolution; Comms at stack 2 does not.

- [ ] **Step 5: Commit**

```bash
git add packages/server/features/heli.feature packages/server/test/steps/heli.steps.ts
git commit -m "test(server): Attack Helicopter evolution gating"
```

---

## Task 11: Generate Rust-themed sprites + card icons (image gen)

**Files:**
- Create: `packages/client/public/weapons/heli.png`
- Create: `packages/client/public/weapons/gunship.png`
- Create: `packages/client/public/icons/heli.png`
- Create: `packages/client/public/icons/gunship.png`
- Create: `packages/client/public/icons/comms.png`

- [ ] **Step 1: Generate the four sprites + comms icon**

Use the `mcp__fal-ai` tools (e.g. `mcp__fal-ai__run_model` with a text-to-image model like FLUX) to generate each asset. Prompts (request a plain/solid background for clean cutout; top-down, nose pointing RIGHT to match the +x facing convention):

- `weapons/heli.png`: "top-down view of a small two-seat minicopter from the video game Rust, a grungy survivor pilot sitting in the open cockpit, rusty metal frame, exposed rotor, industrial post-apocalyptic style, nose pointing to the right, centered, plain flat background, game asset sprite"
- `weapons/gunship.png`: "top-down view of a menacing military attack helicopter from the video game Rust, olive-green armored fuselage, twin side-mounted miniguns, tandem rotors, aggressive patrol gunship, nose pointing to the right, centered, plain flat background, game asset sprite"
- `icons/comms.png`: a square card icon matching the existing icon set's style (look at `packages/client/public/icons/fin.png` etc. for size/treatment) — "military field radio / headset battle communications icon, bold simple emblem, square".
- `icons/heli.png` / `icons/gunship.png`: square emblem versions of the minicopter / attack helicopter.

- [ ] **Step 2: Process to transparent PNG, correct size**

Follow the project's established sprite pipeline (see memory: nano-banana-pro → pixelcut → convert; and `packages/client/public/fish/*.png` are transparent PNGs authored facing +x). Remove the background (transparent), trim, and resize the **body sprites** (`weapons/*.png`) to a sane sprite width (match the fish sprite resolution ballpark, ~512px wide). Resize the **icons** to match existing `public/icons/*.png` dimensions exactly (inspect one with `file packages/client/public/icons/fin.png`).

Verify each file is a valid transparent PNG:

```bash
file packages/client/public/weapons/heli.png packages/client/public/weapons/gunship.png packages/client/public/icons/heli.png packages/client/public/icons/gunship.png packages/client/public/icons/comms.png
```

Expected: each reports `PNG image data` with an alpha channel.

- [ ] **Step 3: Send the body sprites to the user for a look**

Use SendUserFile to show `weapons/heli.png` and `weapons/gunship.png` so the user can confirm the art direction before they're wired in.

- [ ] **Step 4: Commit**

```bash
git add packages/client/public/weapons/heli.png packages/client/public/weapons/gunship.png packages/client/public/icons/heli.png packages/client/public/icons/gunship.png packages/client/public/icons/comms.png
git commit -m "feat(client): Rust-themed heli sprites + Battle Comms/heli card icons"
```

---

## Task 12: HeliSprite renderer + texture loader

**Files:**
- Create: `packages/client/src/render/heli-textures.ts`
- Create: `packages/client/src/render/heli.ts`

- [ ] **Step 1: Read the patterns to mirror**

Read `packages/client/src/render/saucer.ts` (the public surface a projectile sprite must expose: a `container` field, `setTransform(x, y, vx, vy)`, and `destroy()`), and `packages/client/src/render/species-textures.ts` (the `Assets.load` + `BASE_URL` texture-preload/lookup pattern). The `HeliSprite` must match `SaucerSprite`'s public surface exactly so the arena render loop can use it interchangeably.

- [ ] **Step 2: Create the texture loader**

Create `packages/client/src/render/heli-textures.ts`:

```ts
import { Assets, Texture } from "pixi.js";

/** Heli body sprites under public/weapons/<id>.png (transparent, nose facing +x). */
const TEX = new Map<string, Texture>();
const HELI_IDS = ["heli", "gunship"] as const;

function weaponUrl(id: string): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");
  return `${base}/weapons/${id}.png`;
}

/** Warm both heli textures at boot. Failures are swallowed (falls back to a tinted box). */
export async function preloadHeliTextures(): Promise<void> {
  await Promise.all(
    HELI_IDS.map(async (id) => {
      try { TEX.set(id, await Assets.load(weaponUrl(id))); } catch { /* fallback */ }
    }),
  );
}

/** The heli's texture, or null if not yet loaded (caller draws a fallback). */
export function getHeliTexture(id: string): Texture | null {
  return TEX.get(id) ?? null;
}
```

- [ ] **Step 3: Create `HeliSprite`**

Create `packages/client/src/render/heli.ts` (mirror `SaucerSprite`'s surface; rotate to face velocity, add a subtle rotor-blur ellipse). Use the real PixiJS imports the other render files use (`Container`, `Sprite`, `Graphics`):

```ts
import { Container, Sprite, Graphics } from "pixi.js";
import { getHeliTexture } from "./heli-textures.ts";

/**
 * Renders a heli body (Mortal's Heli / Attack Helicopter). Owns only the look — the arena
 * render loop positions it via setTransform, like SaucerSprite/ProjectileSprite. The sprite
 * texture is authored nose-facing +x, so rotation = atan2(vy, vx). A faint rotor-blur ellipse
 * spins over it for life.
 */
export class HeliSprite {
  container = new Container();
  private body = new Sprite();
  private rotor = new Graphics();
  private weaponId: string;

  constructor(weaponId: string, radius: number, _spawnTime: number) {
    this.weaponId = weaponId;
    this.body.anchor.set(0.5);
    const tex = getHeliTexture(weaponId);
    if (tex) {
      this.body.texture = tex;
      const scale = (radius * 2) / Math.max(tex.width, 1);
      this.body.scale.set(scale);
    } else {
      // Fallback: a tinted box until the texture loads.
      this.body.scale.set(1);
    }
    this.container.addChild(this.body);
    this.container.addChild(this.rotor);
  }

  setTransform(x: number, y: number, vx: number, vy: number): void {
    this.container.x = x;
    this.container.y = y;
    // Re-bind the texture if it loaded after construction.
    if (!this.body.texture?.width && getHeliTexture(this.weaponId)) {
      this.body.texture = getHeliTexture(this.weaponId)!;
    }
    if (vx * vx + vy * vy > 1) this.container.rotation = Math.atan2(vy, vx);
    // Rotor blur: a thin spinning ellipse over the hull.
    const t = (x + y) * 0.05; // cheap phase from position; no clock dependency needed
    this.rotor.clear();
    this.rotor.ellipse(0, 0, 30 + Math.sin(t) * 6, 8).fill({ color: 0xcccccc, alpha: 0.18 });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

> NOTE: Confirm the exact PixiJS Graphics fill/ellipse API against `render/saucer.ts` (this repo's Pixi version) and match it; if `SaucerSprite` takes additional constructor args or exposes an `update`/`tick` method the render loop calls, mirror that signature too.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/render/heli-textures.ts packages/client/src/render/heli.ts
git commit -m "feat(client): HeliSprite renderer + texture loader"
```

---

## Task 13: Wire heli rendering + own-fish slow into the arena

**Files:**
- Modify: `packages/client/src/scenes/arena.ts`

- [ ] **Step 1: Imports + texture preload**

In `packages/client/src/scenes/arena.ts`:
- Add `import { HeliSprite } from "../render/heli.ts";` (next to the `SaucerSprite` import, line ~12).
- Add `import { preloadHeliTextures } from "../render/heli-textures.ts";`.
- Add `SLOW` to the `@fcf/shared` import.
- Find where `preloadFishTextures()` is awaited at boot and add `preloadHeliTextures()` alongside it (grep `preloadFishTextures`).

- [ ] **Step 2: Heli render hook**

At the projectile-create site (around line 1028), update the sprite selection. Replace:

```ts
      const isFlyby = WEAPONS[weaponId as WeaponId]?.kind === "flyby";
      const mode = WEAPONS[weaponId as WeaponId]?.kind === "orbital" ? "orbital" : "linear";
      const sprite = isFlyby
        ? new SaucerSprite(weaponId, radius, spawnNow)
        : new ProjectileSprite(weaponId, radius, spawnNow);
```

with:

```ts
      const wkind = WEAPONS[weaponId as WeaponId]?.kind;
      const isFlyby = wkind === "flyby";
      const isHeliBody = wkind === "heli" && ent.body === true;
      const mode = wkind === "orbital" ? "orbital" : "linear";
      const sprite = isFlyby
        ? new SaucerSprite(weaponId, radius, spawnNow)
        : isHeliBody
        ? new HeliSprite(weaponId, radius, spawnNow)
        : new ProjectileSprite(weaponId, radius, spawnNow);
```

(Heli **bullets** have `wkind === "heli"` but `ent.body` falsy → they render as ordinary `ProjectileSprite` AK bullets. The heli **body** is `body === true` → `HeliSprite`.)

- [ ] **Step 3: Track + apply `you.slowUntil`**

Add a field near `youBoostReadyAt` (line ~243): `private youSlowUntil = 0;`

Where the `you` block is consumed (line ~696, near `this.youBoostReadyAt = msg.you.boostReadyAt;`): add `this.youSlowUntil = msg.you.slowUntil ?? 0;`

In `stepSelf` (line ~539, after `const boostMult = ...`), add:

```ts
    const slowMult = estServerNow < this.youSlowUntil ? SLOW.mult : 1;
```

and apply it to the movement speed at line ~560:

```ts
      stepFishMovement(this.self, ivx, ivy, this.youMoveSpeed * slowMult, boostMult, this.youMass, STEP / 1000);
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/scenes/arena.ts
git commit -m "feat(client): render heli body sprite + apply Battle Comms slow to own fish"
```

---

## Task 14: Full verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Whole-workspace typecheck**

Run: `bun run typecheck`
Expected: PASS, no errors.

- [ ] **Step 2: Full server test suite**

Run: `bun --cwd=packages/server run test`
Expected: PASS — all features including `heli.feature` and `battle-comms.feature`. Confirm no regression in `alien-weapon.feature` / `zap` / `client-authority` (the `applyHit`/`fireLaser`/`firePulse` signature changes touch those paths).

- [ ] **Step 3: Client test suite**

Run: `bun --cwd=packages/client run test`
Expected: PASS (or unchanged from baseline; the heli adds no required client BDD scenario, but nothing should break).

- [ ] **Step 4: Manual smoke (use the `/run` or `verify` skill, or `bun run dev`)**

Boot the game (`bun run dev`), spawn, and grant the heli (via the level-up flow or a dev shortcut). Confirm:
- The minicopter appears, loiters/circles near you, and flies off after ~8s, reappearing ~20s after summon.
- It fires AK bullets that lead and hit AI fish; a dodging player can sidestep them.
- With Battle Comms picked, fish you damage visibly slow for a moment.
- The heli sprite renders (not a UFO / not a bare bullet) and bullets render as normal AK rounds.

- [ ] **Step 5: Final commit (if any manual tweaks)**

```bash
git add -A
git commit -m "chore: Mortal's Heli + Battle Comms verification tweaks"
```

---

## Self-review notes (for the executor)

- **Signature ripple:** Task 8 changes `applyHit`, `pulseAt`, `firePulse`, `fireLaser` signatures (all in `weapon.ts`). The full server suite in Task 14 Step 2 is the safety net — run it.
- **Evolution test (Task 10):** reuses the existing `processLevelUps` + `"is offered an evolution for"` steps — evolution cards parse to `{ kind: "evolution", baseId }` keyed by the **base** id (`"heli"`), NOT the evolution id (`"gunship"`). Only the negative step is new.
- **Sprite facing:** body PNGs authored nose-facing **+x** so `rotation = atan2(vy, vx)` is correct (matches the fish-sprite convention).
- **Slow path summary:** server sets `victim.slowUntil`; AI/not-yet-reported fish slow via `getEffectiveMoveSpeed` (world.ts:470); every player (local or remote) slows via their own client honoring `you.slowUntil` in `stepSelf` — because client-authoritative players are not server-integrated.
