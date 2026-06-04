# Combat Toasts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Announce weapon kills with the weapon name, and reframe melee combat toasts to the aggressor's point of view ("You hit X" → "You ate X") while fixing the "bitten by the void" stale-lookup bug.

**Architecture:** The server stays authoritative over all toasts. It captures attacker/killer names at event time (fixing the late-lookup "the void"), attributes kills with an explicit killer id + weapon id, and sends *personal* second-person combat toasts to individual sockets. The global death feed becomes weapon-aware and excludes the killer (who gets the personal version). The client just renders what arrives.

**Tech Stack:** Bun + TypeScript monorepo (`packages/shared` wire types, `packages/server` authoritative sim, `packages/client` PixiJS). Tests: cucumber (server sim + server-harness integration), playwright-bdd (client).

**Working directory:** `/home/mulligan/code/fcf_survivors/.claude/worktrees/combat-toasts` (git worktree, branch `worktree-combat-toasts`). Run all commands from here.

**Reference spec:** `docs/superpowers/specs/2026-06-03-combat-toasts-design.md`

**Conventions in this repo:**
- Within `packages/shared`, cross-file imports use the `.js` extension (e.g. `import type { WeaponId } from "./weapons.js";`).
- Server→client messages are plain TS types in `packages/shared/src/protocol.ts`; the union is `ServerMsg` (line ~386). The client (`packages/client/src/net/socket.ts`) keeps its **own** duplicate `ServerMsg` union — both must be kept in sync.
- Commit after each task. We are on a feature branch, so the auto-push hook (which only pushes `main`) will NOT push these commits.

---

## Sequencing note (keep every commit green)

We add new types **additively** first (keeping `PlayerBittenMsg` alive) so the tree compiles at every step, build the new behavior, then delete `PlayerBittenMsg` in the final cleanup task. Each task ends with passing typecheck + tests.

---

## Task 1: Wire protocol — add `CombatToastMsg` and weapon-aware `PlayerDiedMsg`

**Files:**
- Modify: `packages/shared/src/protocol.ts` (import line 1; `PlayerDiedMsg` lines 351-357; `ServerMsg` union lines 386-395)

- [ ] **Step 1: Add the `WeaponId` import at the top of `protocol.ts`**

The file currently starts with `import { z } from "zod";`. Add the type import directly under it:

```typescript
import { z } from "zod";
import type { WeaponId } from "./weapons.js";
```

- [ ] **Step 2: Add `weaponId` to `PlayerDiedMsg` and add the new `CombatToastMsg`**

Replace the current `PlayerDiedMsg` interface (lines 351-357):

```typescript
export interface PlayerDiedMsg {
  t: "playerDied";
  name: string;
  color: string;
  /** Name of the eater. "the void" when no killer was nearby (e.g. disconnect or solo death). */
  byName: string;
}
```

with:

```typescript
export interface PlayerDiedMsg {
  t: "playerDied";
  name: string;
  color: string;
  /** Name of the killer. "the void" when no killer was attributed (e.g. disconnect or solo death). */
  byName: string;
  /** Set when a weapon landed the lethal hit → "killed by <byName> with <weapon>". Absent ⇒ "eaten by". */
  weaponId?: WeaponId;
}

/**
 * Personal (second-person) combat feed, sent ONLY to the player it is about — never broadcast.
 * Drives toasts: "You hit X" / "You ate X" / "You killed X with <weapon>" / "You were bitten by X".
 * `other` is the other fish's name; `color` accents the toast with their color; `weaponId` is set
 * only for a weapon kill (kind "kill").
 */
export interface CombatToastMsg {
  t: "combatToast";
  kind: "hit" | "ate" | "kill" | "bitten";
  other: string;
  color?: string;
  weaponId?: WeaponId;
}
```

(Leave `PlayerBittenMsg` immediately below untouched for now — removed in Task 8.)

- [ ] **Step 3: Add `CombatToastMsg` to the `ServerMsg` union**

The union (lines 386-395) currently ends with `| PlayerBittenMsg | RosterMsg;`. Add `CombatToastMsg`:

```typescript
export type ServerMsg =
  | WelcomeMsg
  | SnapshotMsg
  | LevelUpMsg
  | EatenMsg
  | LeaderboardMsg
  | PlayerJoinedMsg
  | PlayerDiedMsg
  | PlayerBittenMsg
  | CombatToastMsg
  | RosterMsg;
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: passes (`tsc -b`, no errors). Adding an optional field and a new union member breaks nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/protocol.ts
git commit -m "Add CombatToastMsg + weaponId on PlayerDiedMsg (additive)"
```

---

## Task 2: Fish attribution fields

**Files:**
- Modify: `packages/server/src/sim/entity.ts` (`biteToastAt` ~line 122; `killedByName`/`killedByMass` ~lines 198-204)

`WeaponId` is already imported in `entity.ts` (the `Projectile` interface uses it).

- [ ] **Step 1: Add the attacker-side throttle map next to `biteToastAt`**

After the `biteToastAt?: Map<number, number>;` field (line 122), add:

```typescript
  /** Per-victim wall-time of the last "You hit X" toast THIS (human) fish emitted as the attacker,
   *  keyed by victim id. Mirror of biteToastAt for the aggressor side — gates the personal "hit"
   *  toast to once per engagement. Pruned to the engagement window. */
  hitToastAt?: Map<number, number>;
```

- [ ] **Step 2: Add `killedById` and `killedByWeaponId` next to `killedByName`/`killedByMass`**

Replace the `killedByName?`/`killedByMass?` block (lines ~197-204):

```typescript
  /**
   * Set when a weapon lands the lethal hit (mass drained to zero), so the death
   * handler can credit the shooter instead of the 250-unit proximity heuristic —
   * which misses ranged kills (ESP/aliens). `undefined` ⇒ died by eating or the
   * void. Set just before removal; never reset (fish are fresh objects per life).
   */
  killedByName?: string;
  killedByMass?: number;
```

with:

```typescript
  /**
   * Set when a kill is explicitly attributed (weapon hit, melee nibble/bite, OR swallow) so the
   * death handler credits the exact killer instead of the 250-unit proximity heuristic — which
   * misses ranged kills (ESP/aliens). `undefined` ⇒ no explicit killer (e.g. starvation/decay or
   * the void) → proximity fallback. Set just before removal; never reset (fresh object per life).
   */
  killedByName?: string;
  killedByMass?: number;
  /** Fish id of the explicit killer (paired with killedByName). Lets the death handler resolve the
   *  killer's socket for the personal "You killed/ate X" toast and to exclude them from the global
   *  death line. `undefined` ⇒ no explicit killer. */
  killedById?: number;
  /** Set only when a WEAPON landed the lethal hit. Presence distinguishes a weapon kill ("killed
   *  with <weapon>") from a swallow/melee kill ("eaten by"). `undefined` ⇒ not a weapon kill. */
  killedByWeaponId?: WeaponId;
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: passes. New optional fields, no consumers yet.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/sim/entity.ts
git commit -m "Add killedById/killedByWeaponId/hitToastAt to Fish"
```

---

## Task 3: Record killer id + weapon id on weapon and nibble kills

**Files:**
- Test: `packages/server/features/weapon-kill.feature`, `packages/server/test/steps/world.steps.ts`
- Modify: `packages/server/src/sim/weapon.ts` (`applyHit` lethal block lines 93-103; `applyNibble` lethal block lines 125-133)

- [ ] **Step 1: Add assertion step definitions for kill attribution**

In `packages/server/test/steps/world.steps.ts`, after the existing "there are {int} bite toasts" step (ends ~line 405), add:

```typescript
Then(
  "{string} was killed by {string}",
  function (this: TestWorld, victim: string, killer: string) {
    const sim = this.requireSim();
    const vid = sim.byName.get(victim);
    const kid = sim.byName.get(killer);
    assert.ok(vid != null && kid != null, `Unknown fish in kill assertion (${victim}/${killer})`);
    const v = sim.world.fish.get(vid!);
    assert.equal(v?.killedById, kid, `Expected ${victim}.killedById=${killer}'s id (${kid}), got ${v?.killedById}`);
  },
);

Then(
  "{string} has killedByWeaponId {string}",
  function (this: TestWorld, victim: string, weaponId: string) {
    const sim = this.requireSim();
    const vid = sim.byName.get(victim);
    const v = vid != null ? sim.world.fish.get(vid) : undefined;
    assert.equal(v?.killedByWeaponId, weaponId, `Expected ${victim}.killedByWeaponId=${weaponId}, got ${v?.killedByWeaponId}`);
  },
);

Then(
  "{string} has no killedByWeaponId",
  function (this: TestWorld, victim: string) {
    const sim = this.requireSim();
    const vid = sim.byName.get(victim);
    const v = vid != null ? sim.world.fish.get(vid) : undefined;
    assert.equal(v?.killedByWeaponId, undefined, `Expected ${victim}.killedByWeaponId undefined, got ${v?.killedByWeaponId}`);
  },
);
```

- [ ] **Step 2: Add the failing scenarios to `weapon-kill.feature`**

Append to `packages/server/features/weapon-kill.feature`:

```gherkin
  Scenario: A weapon kill records the shooter id and the weapon
    Given a player "Sniper" at (4000, 4000) with mass 50
    And "Sniper" has weapon "pulse" at level 5
    And a player "Victim" at (4000, 4300) with mass 10
    When the world advances 200 ticks
    Then "Victim" is dead
    And "Victim" was killed by "Sniper"
    And "Victim" has killedByWeaponId "pulse"

  Scenario: A nibble kill records the nibbler but no weapon
    # Minnow (10) chips the bigger human Whale... inverted: a bigger fish bites a smaller one to
    # death in the between-zone. Biter (11) is bigger than Beta (10) but under the swallow ratio,
    # so repeated bites kill Beta from damage, not a swallow.
    Given a player "Biter" at (1000, 1000) with mass 11
    And "Biter" has heading (1, 0)
    And a player "Beta" at (1015, 1000) with mass 10
    When the world advances 400 ticks
    Then "Beta" is dead
    And "Beta" was killed by "Biter"
    And "Beta" has no killedByWeaponId
```

- [ ] **Step 3: Run the new scenarios to verify they FAIL**

Run: `bun --cwd=packages/server x cucumber-js features/weapon-kill.feature`
Expected: the two new scenarios FAIL (`killedById` / `killedByWeaponId` are `undefined`). The existing two scenarios still pass.

- [ ] **Step 4: Set `killedById` + `killedByWeaponId` in `applyHit`**

In `packages/server/src/sim/weapon.ts`, in the lethal block of `applyHit` (lines 93-103), replace:

```typescript
  if (target.alive && target.mass <= 0) {
    target.alive = false;
    target.killedByName = owner.name;
    target.killedByMass = owner.mass;
    if (!owner.isAi) {
```

with:

```typescript
  if (target.alive && target.mass <= 0) {
    target.alive = false;
    target.killedByName = owner.name;
    target.killedByMass = owner.mass;
    target.killedById = owner.id;
    target.killedByWeaponId = weaponId;
    if (!owner.isAi) {
```

- [ ] **Step 5: Set `killedById` in `applyNibble`**

In the lethal block of `applyNibble` (lines 125-133), replace:

```typescript
  if (target.alive && target.mass <= 0) {
    target.alive = false;
    target.killedByName = attacker.name;
    target.killedByMass = attacker.mass;
    if (!attacker.isAi) {
```

with:

```typescript
  if (target.alive && target.mass <= 0) {
    target.alive = false;
    target.killedByName = attacker.name;
    target.killedByMass = attacker.mass;
    target.killedById = attacker.id;
    if (!attacker.isAi) {
```

- [ ] **Step 6: Run weapon-kill.feature to verify all scenarios PASS**

Run: `bun --cwd=packages/server x cucumber-js features/weapon-kill.feature`
Expected: all scenarios pass.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/sim/weapon.ts packages/server/features/weapon-kill.feature packages/server/test/steps/world.steps.ts
git commit -m "Record killer id + weapon id on weapon/nibble kills"
```

---

## Task 4: Reframe melee bites — `combatEvents` + `recordMeleeBite` + swallow attribution

**Files:**
- Test: `packages/server/features/bite-toast.feature` (full rewrite), `packages/server/features/combat-toasts.feature` (new), `packages/server/test/steps/world.steps.ts` (rewrite bite-step defs + add hit/swallow steps)
- Modify: `packages/server/src/sim/world.ts` (`bittenEvents` decl line 41; `recordBite` lines 350-364; nibble call line 698; between-zone call line 717; swallow block lines 676-680)

- [ ] **Step 1: Rewrite the bite-toast step definitions against `combatEvents`, and add hit/swallow steps**

In `packages/server/test/steps/world.steps.ts`, replace the two existing bite-toast steps (lines 385-405, "a bite toast was emitted for…" and "there are {int} bite toasts for…") with:

```typescript
Then(
  "a bite toast was emitted for {string} by {string}",
  function (this: TestWorld, victim: string, attacker: string) {
    const sim = this.requireSim();
    const vid = sim.byName.get(victim);
    const aid = sim.byName.get(attacker);
    assert.ok(vid != null && aid != null, `Unknown fish in bite-toast assertion (${victim}/${attacker})`);
    const att = sim.world.fish.get(aid!);
    const found = sim.world.combatEvents.some(
      (e) => e.kind === "bitten" && e.recipientId === vid && e.otherName === att?.name,
    );
    assert.ok(found, `Expected a "bitten" toast for ${victim} by ${attacker}; got ${JSON.stringify(sim.world.combatEvents)}`);
  },
);

Then(
  "there are {int} bite toasts for {string}",
  function (this: TestWorld, count: number, victim: string) {
    const sim = this.requireSim();
    const vid = sim.byName.get(victim);
    const n = sim.world.combatEvents.filter((e) => e.kind === "bitten" && e.recipientId === vid).length;
    assert.equal(n, count, `Expected ${count} bitten toasts for ${victim}, got ${n}`);
  },
);

Then(
  "a hit toast was emitted for {string} hitting {string}",
  function (this: TestWorld, attacker: string, victim: string) {
    const sim = this.requireSim();
    const aid = sim.byName.get(attacker);
    const vid = sim.byName.get(victim);
    assert.ok(aid != null && vid != null, `Unknown fish in hit-toast assertion (${attacker}/${victim})`);
    const vic = sim.world.fish.get(vid!);
    const found = sim.world.combatEvents.some(
      (e) => e.kind === "hit" && e.recipientId === aid && e.otherName === vic?.name,
    );
    assert.ok(found, `Expected a "hit" toast for ${attacker} hitting ${victim}; got ${JSON.stringify(sim.world.combatEvents)}`);
  },
);

Then(
  "there are {int} hit toasts for {string}",
  function (this: TestWorld, count: number, attacker: string) {
    const sim = this.requireSim();
    const aid = sim.byName.get(attacker);
    const n = sim.world.combatEvents.filter((e) => e.kind === "hit" && e.recipientId === aid).length;
    assert.equal(n, count, `Expected ${count} hit toasts for ${attacker}, got ${n}`);
  },
);

Then(
  "{string} was swallowed whole",
  function (this: TestWorld, victim: string) {
    const sim = this.requireSim();
    const vid = sim.byName.get(victim);
    const v = vid != null ? sim.world.fish.get(vid) : undefined;
    assert.ok(v && v.eatenWhole === true && v.alive === false, `Expected ${victim} swallowed whole; got ${JSON.stringify(v && { alive: v.alive, eatenWhole: v.eatenWhole })}`);
  },
);
```

- [ ] **Step 2: Rewrite `bite-toast.feature` for the new framing**

Replace the entire contents of `packages/server/features/bite-toast.feature` with:

```gherkin
Feature: Melee combat toasts
  Melee bites drive a PERSONAL combat feed. The attacker (when human) gets a "You hit X" toast; a
  human victim gets a "You were bitten by X" warning ONLY when the attacker is a genuine threat — a
  bigger fish biting in the between-zone. A smaller fish nibbling its predator is not a threat, so
  eating prey never tells the eater it was bitten. Both sides fire once per attacker→victim
  engagement (no spam), and AI victims are never warned.

  Background:
    Given a fresh world

  Scenario: A between-zone bite on a human warns the victim AND credits the attacker
    # Alpha (11) is bigger than Beta (10) but under the swallow ratio, so it bites instead of eating.
    Given a player "Alpha" at (1000, 1000) with mass 11
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1015, 1000) with mass 10
    When the world advances 1 tick
    Then a bite toast was emitted for "Beta" by "Alpha"
    And a hit toast was emitted for "Alpha" hitting "Beta"

  Scenario: A smaller fish nibbling a human does NOT warn the victim, but credits the nibbler
    # Minnow (smaller) nibbles the human Whale from BEHIND (Whale faces +x, Minnow is at -x), so
    # Whale never swallows it. Under aggressor framing the victim is NOT warned about prey nibbles;
    # the nibbler still gets a "You hit" toast.
    Given a player "Whale" at (1000, 1000) with mass 100
    And "Whale" has heading (1, 0)
    And a player "Minnow" at (980, 1000) with mass 20
    When the world advances 1 tick
    Then there are 0 bite toasts for "Whale"
    And a hit toast was emitted for "Minnow" hitting "Whale"

  Scenario: Sustained biting warns the victim only once per engagement
    Given a player "Alpha" at (1000, 1000) with mass 100
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1130, 1000) with mass 95
    When the world advances 20 ticks
    Then there are 1 bite toasts for "Beta"

  Scenario: Two bigger attackers ganging up each warn the victim once
    Given a player "Beta" at (1000, 1000) with mass 200
    And a player "Alpha" at (1203, 1000) with mass 220
    And "Alpha" has heading (-1, 0)
    And a player "Gamma" at (797, 1000) with mass 220
    And "Gamma" has heading (1, 0)
    When the world advances 20 ticks
    Then there are 2 bite toasts for "Beta"

  Scenario: Biting an AI fish warns no one
    Given a player "Alpha" at (1000, 1000) with mass 11
    And "Alpha" has heading (1, 0)
    And an AI fish "Beta" at (1015, 1000) with mass 10
    When the world advances 1 tick
    Then there are 0 bite toasts for "Beta"
```

- [ ] **Step 3: Create `combat-toasts.feature` for swallow attribution + the "void" regression**

Create `packages/server/features/combat-toasts.feature`:

```gherkin
Feature: Eating attribution and the "bitten by the void" regression
  Swallowing prey credits the eater explicitly (so the personal "You ate X" toast and the global
  "X was eaten by <exact eater>" line are accurate), and — the bug this guards — eating prey must
  never enqueue a "bitten" warning for the EATER, even though the prey nibbles it on the way in.

  Background:
    Given a fresh world

  Scenario: Swallowing prey credits the eater and never warns the eater it was bitten
    # Prey (10) overlaps Pred (100): Pred swallows it (100 >= 10 x 1.15) and Prey, being smaller,
    # also nibbles Pred. The eater must get ZERO "bitten" warnings.
    Given a player "Pred" at (1000, 1000) with mass 100
    And "Pred" has heading (1, 0)
    And a player "Prey" at (1000, 1000) with mass 10
    When the world advances 1 tick
    Then "Prey" was swallowed whole
    And "Prey" was killed by "Pred"
    And there are 0 bite toasts for "Pred"
```

- [ ] **Step 4: Run the sim features to verify they FAIL**

Run: `bun --cwd=packages/server x cucumber-js features/bite-toast.feature features/combat-toasts.feature`
Expected: FAIL — `sim.world.combatEvents` does not exist yet (TS error / undefined), and swallow does not set `killedById`.

- [ ] **Step 5: Rename `bittenEvents` → `combatEvents` with the richer shape**

In `packages/server/src/sim/world.ts`, replace line 41:

```typescript
  bittenEvents: Array<{ id: number; by: number }> = [];
```

with:

```typescript
  /** Personal melee combat toasts queued this tick: "hit" goes to the attacker ("You hit X"),
   *  "bitten" goes to the victim ("You were bitten by X"). Names are captured at enqueue time so a
   *  fish removed later this tick still resolves. Drained by the tick loop → per-socket combatToast. */
  combatEvents: Array<{ recipientId: number; kind: "hit" | "bitten"; otherName: string; otherColor: string }> = [];
```

- [ ] **Step 6: Replace `recordBite` with `recordMeleeBite` + a `freshEngagement` helper**

Replace the entire `recordBite` method (lines 350-364) with:

```typescript
  /**
   * Once-per-engagement gate for a combat toast between two fish. Records `now` for `otherId`,
   * prunes stale entries, and returns whether this contact starts a FRESH engagement (no contact
   * from the same pair within BITE.toastEngagementMs).
   */
  private freshEngagement(seen: Map<number, number>, otherId: number, now: number): boolean {
    const fresh = now - (seen.get(otherId) ?? -Infinity) > BITE.toastEngagementMs;
    seen.set(otherId, now);
    for (const [k, t] of seen) if (now - t > BITE.toastEngagementMs) seen.delete(k);
    return fresh;
  }

  /**
   * Record a melee bite/nibble from `attacker` on `victim`. Enqueues up to two PERSONAL combat
   * toasts, capturing names now (so a fish removed later this tick still resolves):
   *   • attacker-side "You hit X" — human attacker, victim survived the blow, once per engagement.
   *   • victim-side "You were bitten by X" — human victim, only when `attackerIsThreat` (a bigger
   *     between-zone biter), victim survived, once per engagement. A smaller fish nibbling its
   *     predator is NOT a threat, so eating prey never tells the eater it was bitten.
   */
  private recordMeleeBite(victim: Fish, attacker: Fish, attackerIsThreat: boolean, now: number): void {
    if (!attacker.isAi && victim.alive) {
      const seen = (attacker.hitToastAt ??= new Map());
      if (this.freshEngagement(seen, victim.id, now)) {
        this.combatEvents.push({ recipientId: attacker.id, kind: "hit", otherName: victim.name, otherColor: victim.color });
      }
    }
    if (!victim.isAi && attackerIsThreat && victim.alive) {
      const seen = (victim.biteToastAt ??= new Map());
      if (this.freshEngagement(seen, attacker.id, now)) {
        this.combatEvents.push({ recipientId: victim.id, kind: "bitten", otherName: attacker.name, otherColor: attacker.color });
      }
    }
  }
```

- [ ] **Step 7: Update the two call sites and add swallow attribution**

In the eat loop, the **nibble** branch currently calls `this.recordBite(b, a, now);` (line 698). Replace with:

```typescript
          this.recordMeleeBite(b, a, false, now);
```

The **between-zone bite** branch currently calls `this.recordBite(b, a, now);` (line 717). Replace with:

```typescript
          this.recordMeleeBite(b, a, true, now);
```

In the **swallow** block, add the rest of the explicit attribution. Task 3 already added `b.killedById = a.id;` here, so the block currently reads:

```typescript
          b.alive = false; // marked for removal at end of tick (handled by caller)
          b.killedById = a.id; // swallow counts as a kill (no weapon)
          b.eatenWhole = true;
          a.bitingTick = this.tick;
```

Add `killedByName`/`killedByMass` next to the existing `killedById` line so the death handler's `killedByName !== undefined` branch credits the EXACT eater (instead of the 250px proximity guess). Result:

```typescript
          b.alive = false; // marked for removal at end of tick (handled by caller)
          b.killedById = a.id; // swallow counts as a kill (no weapon)
          b.killedByName = a.name;
          b.killedByMass = a.mass;
          b.eatenWhole = true;
          a.bitingTick = this.tick;
```

- [ ] **Step 8: Run the sim features to verify they PASS**

Run: `bun --cwd=packages/server x cucumber-js features/bite-toast.feature features/combat-toasts.feature`
Expected: all scenarios pass.

- [ ] **Step 9: Run the whole server suite (index.ts still references `bittenEvents` → expected breakage)**

Run: `bun run typecheck`
Expected: FAIL in `packages/server/src/index.ts` — it still reads `world.bittenEvents`. That is fixed in Task 5. **Do not commit yet** if you want a green tree; instead proceed directly to Task 5 and commit them together. (If you prefer a checkpoint commit, commit now with a note that index.ts is updated next.)

> Decision: commit Task 4 + Task 5 together at the end of Task 5 so the tree is green. Skip the commit here.

---

## Task 5: Server dispatch — personal toasts + weapon-aware global death + killer exclusion

**Files:**
- Test: `packages/server/features/combat-wire.feature` (new), `packages/server/test/steps/presence.steps.ts` (add steps)
- Modify: `packages/server/src/index.ts` (import line 1; `broadcast` lines 94-99; `DeadPlayer` interface lines ~170-184; dead-fish loop 188-237; after removal ~249; deadPlayers notify loop 252-316; bitten broadcast 318-329)

- [ ] **Step 1: Swap the import to use `CombatToastMsg` and `WeaponId`, drop `PlayerBittenMsg`**

In `packages/server/src/index.ts` line 1, the import currently includes `type PlayerBittenMsg`. Replace that import line so it no longer imports `PlayerBittenMsg` and adds `CombatToastMsg` and `WeaponId`:

```typescript
import { ClientMsg, type ServerMsg, type EatenMsg, type LeaderboardMsg, type LevelUpMsg, type PlayerJoinedMsg, type PlayerDiedMsg, type CombatToastMsg, type WeaponId, type RosterEntry, type RosterMsg, parseCardId } from "@fcf/shared";
```

- [ ] **Step 2: Extend `broadcast` to accept a Set of excluded sockets**

Replace `broadcast` (lines 94-99):

```typescript
  function broadcast(msg: ServerMsg, exclude?: Bun.ServerWebSocket<SocketData>): void {
    for (const ws of sockets.values()) {
      if (ws === exclude) continue;
      send(ws, msg);
    }
  }
```

with:

```typescript
  function broadcast(
    msg: ServerMsg,
    exclude?: Bun.ServerWebSocket<SocketData> | Set<Bun.ServerWebSocket<SocketData>>,
  ): void {
    const excludeSet = exclude instanceof Set ? exclude : undefined;
    for (const ws of sockets.values()) {
      if (excludeSet ? excludeSet.has(ws) : ws === exclude) continue;
      send(ws, msg);
    }
  }
```

- [ ] **Step 3: Add `killerId`/`weaponId` to the `DeadPlayer` interface**

In the `DeadPlayer` interface (lines ~170-184), it currently ends with `killerName: string; killerMass: number; weapons: ...`. Add two optional fields after `killerMass`:

```typescript
      killerName: string;
      killerMass: number;
      killerId?: number;
      weaponId?: WeaponId;
      weapons: Array<{ id: string; level: number }>;
```

- [ ] **Step 4: Declare a `killToasts` accumulator and collect personal kill/ate toasts for ALL dead fish**

In the dead-fish handling block, the locals `deadPlayers` and `allDead` are declared at lines 185-186. Add a third accumulator right after them:

```typescript
    const deadPlayers: DeadPlayer[] = [];
    const allDead: Array<{ x: number; y: number; mass: number; color: string; level: number; eatenWhole: boolean }> = [];
    // Personal "you ate/killed X" toasts for the (human) killer of any dead fish — AI victims too.
    const killToasts: Array<{ killerId: number; kind: "ate" | "kill"; other: string; color: string; weaponId?: WeaponId }> = [];
```

Then inside the `for (const f of world.fish.values())` loop, immediately after the existing `allDead.push({...})` (line 190), add:

```typescript
      if (f.killedById !== undefined) {
        // eatenWhole ⇒ "You ate X"; a recorded weapon ⇒ "You killed X with <weapon>"; else "You killed X".
        killToasts.push({
          killerId: f.killedById,
          kind: f.eatenWhole ? "ate" : "kill",
          other: f.name,
          color: f.color,
          weaponId: f.killedByWeaponId,
        });
      }
```

- [ ] **Step 5: Carry `killerId`/`weaponId` into the human-victim `DeadPlayer`**

In the same loop, the `deadPlayers.push({...})` block (lines 217-235) sets `killerName`/`killerMass`. Add the two new fields right after `killerMass`:

```typescript
          killerName: killer?.name ?? "the void",
          killerMass: killer?.mass ?? 0,
          killerId: f.killedById,
          weaponId: f.killedByWeaponId,
```

- [ ] **Step 6: Build the `fishId → socket` map after the removal loop**

The removal loop ends at line 249 (`for (const [id, f] of world.fish) { if (!f.alive) world.removeFish(id); }`). Immediately after it, before the `// notify dead players` loop, add:

```typescript
    // fishId → socket for this tick (alive players only). Killers are alive, so this resolves them
    // for the personal "You ate/killed X" toast and to exclude them from their own kill's death line.
    const wsByFish = new Map<number, Bun.ServerWebSocket<SocketData>>();
    for (const s of sockets.values()) if (s.data.fishId !== null) wsByFish.set(s.data.fishId, s);
```

- [ ] **Step 7: Make the global `playerDied` weapon-aware and exclude the killer**

In the `for (const dp of deadPlayers)` loop, replace the current broadcast (lines 259-262):

```typescript
      broadcast(
        { t: "playerDied", name: dp.name, color: dp.color, byName: dp.killerName } satisfies PlayerDiedMsg,
        ws,
      );
```

with:

```typescript
      // The killer (if a connected human) gets the personal "You killed/ate X" toast instead of the
      // third-person death line, so exclude them here as well as the dying socket.
      const killerWs = dp.killerId !== undefined ? wsByFish.get(dp.killerId) : undefined;
      const deathExclude = new Set<Bun.ServerWebSocket<SocketData>>();
      if (ws) deathExclude.add(ws);
      if (killerWs) deathExclude.add(killerWs);
      broadcast(
        {
          t: "playerDied",
          name: dp.name,
          color: dp.color,
          byName: dp.killerName,
          ...(dp.weaponId !== undefined ? { weaponId: dp.weaponId } : {}),
        } satisfies PlayerDiedMsg,
        deathExclude,
      );
```

- [ ] **Step 8: Dispatch the personal kill/ate toasts after the deadPlayers loop**

The deadPlayers loop ends at line 316 (closing `}` after the `broadcastLeaderboard` calls). Immediately after it, add:

```typescript
    // Personal kill/ate toasts to each (alive, human) killer.
    for (const kt of killToasts) {
      const kws = wsByFish.get(kt.killerId);
      if (!kws || kws.data.fishId !== kt.killerId) continue;
      send(kws, {
        t: "combatToast",
        kind: kt.kind,
        other: kt.other,
        color: kt.color,
        ...(kt.weaponId !== undefined ? { weaponId: kt.weaponId } : {}),
      } satisfies CombatToastMsg);
    }
```

- [ ] **Step 9: Replace the old `bittenEvents` broadcast with the `combatEvents` personal dispatch**

Replace the entire bitten-toast block (lines 318-329):

```typescript
    // "Bitten" toasts: a human player took a bite this tick (new engagement). Broadcast to everyone
    // (including the victim — they're alive, unlike a death). Skip any victim already removed this
    // tick (a bite that killed them is covered by playerDied). The attacker may be an AI fish.
    for (const ev of world.bittenEvents) {
      const victim = world.fish.get(ev.id);
      if (!victim) continue;
      const attacker = world.fish.get(ev.by);
      broadcast(
        { t: "playerBitten", name: victim.name, color: victim.color, byName: attacker?.name ?? "the void" } satisfies PlayerBittenMsg,
      );
    }
    world.bittenEvents.length = 0;
```

with:

```typescript
    // Personal melee combat toasts: "You hit X" (attacker) / "You were bitten by X" (victim warning
    // from a genuine threat). Sent only to the player they're about; a recipient that died this tick
    // has a null fishId now and is skipped (their death is covered by playerDied).
    for (const ev of world.combatEvents) {
      const cws = wsByFish.get(ev.recipientId);
      if (!cws || cws.data.fishId !== ev.recipientId) continue;
      send(cws, {
        t: "combatToast",
        kind: ev.kind,
        other: ev.otherName,
        color: ev.otherColor,
      } satisfies CombatToastMsg);
    }
    world.combatEvents.length = 0;
```

- [ ] **Step 10: Typecheck (the whole tree should be green now)**

Run: `bun run typecheck`
Expected: passes. (Task 4 + Task 5 together remove all `bittenEvents`/`PlayerBittenMsg` server usage.)

- [ ] **Step 11: Add server-harness integration step definitions**

In `packages/server/test/steps/presence.steps.ts`, add at the top a type import for `WeaponId` (after the existing imports):

```typescript
import type { WeaponId } from "@fcf/shared";
```

Then add these steps (after the existing "the fish for client {string} is killed" step, ~line 74):

```typescript
When(
  "the fish for client {string} is killed by client {string} with weapon {string}",
  function (this: TestWorld, victimLabel: string, killerLabel: string, weaponId: string) {
    const server = this.requireServer();
    const victimId = this.data.get(`${victimLabel}.selfId`) as number | undefined;
    const killerId = this.data.get(`${killerLabel}.selfId`) as number | undefined;
    assert.ok(victimId != null && killerId != null, `Missing selfId for ${victimLabel}/${killerLabel}`);
    const victim = server.running.world.fish.get(victimId!);
    const killer = server.running.world.fish.get(killerId!);
    assert.ok(victim && killer, `victim/killer fish not in world`);
    victim!.killedById = killerId!;
    victim!.killedByName = killer!.name;
    victim!.killedByMass = killer!.mass;
    victim!.killedByWeaponId = weaponId as WeaponId;
    victim!.alive = false;
  },
);

Then(
  "client {string} receives a playerDied for {string} with weapon {string}",
  { timeout: 5_000 },
  async function (this: TestWorld, label: string, name: string, weaponId: string) {
    const c = this.requireClient(label);
    const msg = await c.wait((m) => m.t === "playerDied" && m.name === name);
    assert.equal((msg as any).weaponId, weaponId, `Expected playerDied.weaponId=${weaponId}, got ${(msg as any).weaponId}`);
  },
);

Then(
  "client {string} does not receive a playerDied for {string} within {int}ms",
  async function (this: TestWorld, label: string, name: string, ms: number) {
    const c = this.requireClient(label);
    let saw = false;
    try { await c.wait((m) => m.t === "playerDied" && m.name === name, ms); saw = true; } catch {}
    assert.ok(!saw, `Did not expect a playerDied for ${name} but one arrived`);
  },
);

Then(
  "client {string} receives a combatToast {string} for {string} with weapon {string}",
  { timeout: 5_000 },
  async function (this: TestWorld, label: string, kind: string, other: string, weaponId: string) {
    const c = this.requireClient(label);
    const msg = await c.wait((m) => m.t === "combatToast" && (m as any).kind === kind && (m as any).other === other);
    assert.equal((msg as any).weaponId, weaponId, `Expected combatToast.weaponId=${weaponId}, got ${(msg as any).weaponId}`);
  },
);

Then(
  "client {string} does not receive a combatToast within {int}ms",
  async function (this: TestWorld, label: string, ms: number) {
    const c = this.requireClient(label);
    let saw = false;
    try { await c.wait((m) => m.t === "combatToast", ms); saw = true; } catch {}
    assert.ok(!saw, `Did not expect a combatToast but one arrived`);
  },
);
```

> Note: `c.wait` returns the broad message union; the `as any` casts read the narrowed fields. This mirrors how the existing steps access `msg.byName`.

- [ ] **Step 12: Add the integration feature `combat-wire.feature`**

Create `packages/server/features/combat-wire.feature`:

```gherkin
Feature: Combat toasts over the wire
  A weapon kill sends the killer a personal "You killed X with <weapon>" combatToast, broadcasts a
  weapon-aware playerDied to bystanders, and EXCLUDES the killer from that global line so they don't
  see it twice.

  Background:
    Given the server is running
    And client "killer" is connected
    And client "victim" is connected
    And client "bystander" is connected

  Scenario: A weapon kill is announced to the right audiences
    When client "killer" sends hello as "Killer" with color "#ff85a1"
    Then client "killer" receives a welcome
    When client "victim" sends hello as "Victim" with color "#7fcfff"
    Then client "victim" receives a welcome
    When client "bystander" sends hello as "Bystander" with color "#9affcf"
    Then client "bystander" receives a welcome
    When the fish for client "victim" is killed by client "killer" with weapon "bubble"
    Then client "killer" receives a combatToast "kill" for "Victim" with weapon "bubble"
    And client "bystander" receives a playerDied for "Victim" with weapon "bubble"
    And client "killer" does not receive a playerDied for "Victim" within 300ms
```

- [ ] **Step 13: Run the server suite**

Run: `bun --cwd=packages/server run test`
Expected: all scenarios pass (the original 234 + new ones).

- [ ] **Step 14: Commit Tasks 4 + 5 together**

```bash
git add packages/server/src/sim/world.ts packages/server/src/index.ts packages/server/features/bite-toast.feature packages/server/features/combat-toasts.feature packages/server/features/combat-wire.feature packages/server/test/steps/world.steps.ts packages/server/test/steps/presence.steps.ts
git commit -m "Server: personal combat feed + weapon-aware death line + void fix"
```

---

## Task 6: Client — render the combat feed and weapon-aware deaths

**Files:**
- Test: `packages/client/features/presence.feature`, `packages/client/test/fixtures/mock-ws.ts`, `packages/client/test/steps/presence.steps.ts`
- Modify: `packages/client/src/net/socket.ts` (imports lines 1-13; `ServerMsg` union lines 15-24), `packages/client/src/scenes/arena.ts` (import line 1; handlers lines 469-477; swallowed toast lines 771-781)

- [ ] **Step 1: Update the client `ServerMsg` union — drop `PlayerBittenMsg`, add `CombatToastMsg`**

In `packages/client/src/net/socket.ts`, replace the import block (lines 1-13) and the union (lines 15-24):

```typescript
import type {
  EatenMsg,
  HelloMsg,
  InputMsg,
  LeaderboardMsg,
  LevelUpMsg,
  PlayerJoinedMsg,
  PlayerDiedMsg,
  CombatToastMsg,
  RosterMsg,
  SnapshotMsg,
  WelcomeMsg,
} from "@fcf/shared";

type ServerMsg =
  | WelcomeMsg
  | SnapshotMsg
  | LevelUpMsg
  | EatenMsg
  | LeaderboardMsg
  | PlayerJoinedMsg
  | PlayerDiedMsg
  | CombatToastMsg
  | RosterMsg;
```

(`HelloMsg`/`InputMsg` remain in the import even though they were already there — keep them; they are used elsewhere in the file.)

- [ ] **Step 2: Confirm `arena.ts` needs NO import changes**

`arena.ts` does **not** import the player/combat message types by name — its `net.on("playerDied", …)` / `net.on("combatToast", …)` handlers infer `msg` from the `ServerMsg` union in `socket.ts` (updated in Step 1). And `WEAPONS` (value, line 5) and `WeaponId` (type, line 6) are **already imported** from `@fcf/shared`. So no import edits are required here.

Verify quickly:

Run: `grep -n "WEAPONS\|WeaponId\|PlayerBittenMsg\|CombatToastMsg" packages/client/src/scenes/arena.ts`
Expected: `WEAPONS` (line 5) and `WeaponId` (line 6) present; `PlayerBittenMsg`/`CombatToastMsg` absent (correct — not needed). If `WEAPONS` is somehow missing, add it to the line-5 value import from `@fcf/shared`.

- [ ] **Step 3: Make `playerDied` weapon-aware and replace `playerBitten` with `combatToast`**

Replace the two handlers (lines 469-477):

```typescript
    this.net.on("playerDied", (msg) => {
      const text = msg.byName === "the void"
        ? `${msg.name} left`
        : `${msg.name} was eaten by ${msg.byName}`;
      this.toastHud.show(text, msg.color);
    });
    this.net.on("playerBitten", (msg) => {
      this.toastHud.show(`${msg.name} was bitten by ${msg.byName}`, msg.color);
    });
```

with:

```typescript
    this.net.on("playerDied", (msg) => {
      let text: string;
      if (msg.byName === "the void") text = `${msg.name} left`;
      else if (msg.weaponId) text = `${msg.name} was killed by ${msg.byName} with ${WEAPONS[msg.weaponId].name}`;
      else text = `${msg.name} was eaten by ${msg.byName}`;
      this.toastHud.show(text, msg.color);
    });
    this.net.on("combatToast", (msg) => {
      let text: string;
      switch (msg.kind) {
        case "hit": text = `You hit ${msg.other}`; break;
        case "ate": text = `You ate ${msg.other}`; break;
        case "kill": text = msg.weaponId ? `You killed ${msg.other} with ${WEAPONS[msg.weaponId].name}` : `You killed ${msg.other}`; break;
        case "bitten": text = `You were bitten by ${msg.other}`; break;
      }
      this.toastHud.show(text, msg.color);
    });
```

- [ ] **Step 4: Remove the client-derived "Ate X" toast (keep the swallow animation)**

In the `swallowed` block (lines 771-781), replace:

```typescript
    if (msg.swallowed && msg.swallowed.length > 0) {
      for (const s of msg.swallowed) {
        // "Ate X" toast when WE swallowed an AI fish. Human victims are already covered by the
        // broadcast playerDied "X was eaten by <me>" toast, so don't double up on those.
        if (s.by === this.selfId) {
          const victim = this.fishes.get(s.id);
          if (victim && victim.isAi) this.toastHud.show(`Ate ${victim.name}`, victim.color);
        }
        this.beginSwallow(s.id, s.by);
      }
    }
```

with:

```typescript
    if (msg.swallowed && msg.swallowed.length > 0) {
      // The "You ate X" toast is now server-authoritative (combatToast); this only drives the
      // suck-in animation handing the victim's sprite to the eater before the `removed` teardown.
      for (const s of msg.swallowed) this.beginSwallow(s.id, s.by);
    }
```

- [ ] **Step 5: Update the client test fixture — drop `playerBitten`, add `combatToast`**

In `packages/client/test/fixtures/mock-ws.ts`, replace the `__test.playerBitten` helper (lines 120-122):

```typescript
    __test.playerBitten = (name: string, byName: string, color = "#7fcfff"): void => {
      __test.emitAll({ t: "playerBitten", name, color, byName });
    };
```

with:

```typescript
    __test.combatToast = (kind: string, other: string, weaponId?: string, color = "#7fcfff"): void => {
      __test.emitAll({ t: "combatToast", kind, other, color, ...(weaponId ? { weaponId } : {}) });
    };
```

If `__test` is a typed interface in this file, add `combatToast` to it and remove `playerBitten`; if it is `any`, no further change is needed. (Search the file for `playerBitten:` to update any type declaration.)

- [ ] **Step 6: Update the client step definitions**

In `packages/client/test/steps/presence.steps.ts`, replace the `playerBitten` step (lines 26-36):

```typescript
When(
  "the server sends a playerBitten for {string} by {string}",
  async ({ page }, name: string, byName: string) => {
    await page.evaluate(
      ([n, by]: string[]) => {
        (window as any).__test.playerBitten(n, by);
      },
      [name, byName]
    );
  }
);
```

with these (a generic combatToast sender + a weapon-kill death sender):

```typescript
When(
  "the server sends a combatToast {string} for {string}",
  async ({ page }, kind: string, other: string) => {
    await page.evaluate(
      ([k, o]: string[]) => {
        (window as any).__test.combatToast(k, o);
      },
      [kind, other]
    );
  }
);

When(
  "the server sends a combatToast {string} for {string} with weapon {string}",
  async ({ page }, kind: string, other: string, weaponId: string) => {
    await page.evaluate(
      ([k, o, w]: string[]) => {
        (window as any).__test.combatToast(k, o, w);
      },
      [kind, other, weaponId]
    );
  }
);

When(
  "the server sends a playerDied for {string} killed by {string} with weapon {string}",
  async ({ page }, name: string, byName: string, weaponId: string) => {
    await page.evaluate(
      ([n, by, w]: string[]) => {
        (window as any).__test.playerDied(n, by, undefined, w);
      },
      [name, byName, weaponId]
    );
  }
);
```

Also extend the `playerDied` mock helper to accept a weapon. In `mock-ws.ts`, replace the `__test.playerDied` helper (lines 117-119):

```typescript
    __test.playerDied = (name: string, byName = "the void", color = "#7fcfff"): void => {
      __test.emitAll({ t: "playerDied", name, color, byName });
    };
```

with:

```typescript
    __test.playerDied = (name: string, byName = "the void", color = "#7fcfff", weaponId?: string): void => {
      __test.emitAll({ t: "playerDied", name, color, byName, ...(weaponId ? { weaponId } : {}) });
    };
```

- [ ] **Step 7: Rewrite the affected `presence.feature` scenarios**

In `packages/client/features/presence.feature`, replace the `playerBitten` scenario (lines 20-23) and the swallow scenario (lines 25-28) and add a weapon-kill death scenario:

```gherkin
  Scenario: A combatToast "bitten" shows a second-person warning
    When the server sends a combatToast "bitten" for "Charlie"
    Then a toast containing "You were bitten by Charlie" is visible

  Scenario: A combatToast "ate" shows a second-person toast
    When the server sends a combatToast "ate" for "Snacky"
    Then a toast containing "You ate Snacky" is visible

  Scenario: A combatToast "kill" names the weapon
    When the server sends a combatToast "kill" for "Charlie" with weapon "bubble"
    Then a toast containing "You killed Charlie with AK-47" is visible

  Scenario: A weapon kill shows the weapon in the global death feed
    When the server sends a playerDied for "Bob" killed by "Charlie" with weapon "bubble"
    Then a toast containing "Bob was killed by Charlie with AK-47" is visible
```

(Keep the existing "playerDied … eaten by Charlie" scenario at lines 15-18 — it still validates the melee/eaten path. Remove the old "playerBitten … was bitten by Charlie" scenario and the old "Swallowing an AI fish shows an Ate toast" scenario, both replaced above. "AK-47" is `WEAPONS["bubble"].name`.)

- [ ] **Step 8: Typecheck**

Run: `bun run typecheck`
Expected: passes.

- [ ] **Step 9: Run the client BDD suite**

Run: `bun --cwd=packages/client run test`
Expected: all scenarios pass. (If Playwright browsers are missing, run `bunx playwright install chromium` first.)

- [ ] **Step 10: Commit**

```bash
git add packages/client/src/net/socket.ts packages/client/src/scenes/arena.ts packages/client/features/presence.feature packages/client/test/fixtures/mock-ws.ts packages/client/test/steps/presence.steps.ts
git commit -m "Client: render personal combat feed + weapon-aware deaths"
```

---

## Task 7: Manual smoke verification

**Files:** none (runtime check)

- [ ] **Step 1: Boot the dev stack and eyeball the toasts**

Run (from the worktree root): `bun run dev`
Then open the client, spawn, and verify against the spec:
- Eating an AI fish shows **"You ate <name>"** and **no** "bitten by the void".
- Getting bitten by a clearly bigger fish shows **"You were bitten by <name>"** (real name).
- A weapon kill shows **"You killed <name> with <weapon>"** to you and **"<victim> was killed by <you> with <weapon>"** to others.

If `bun run dev` requires Mongo/Docker and that is unavailable, instead run the headless server (`bun run scripts/smoke.ts` against a server on :4000) or rely on the BDD coverage. Note any deviation.

- [ ] **Step 2: No commit** (verification only).

---

## Task 8: Remove `PlayerBittenMsg` (cleanup)

**Files:**
- Modify: `packages/shared/src/protocol.ts` (`PlayerBittenMsg` interface ~lines 359-370; `ServerMsg` union)

By now nothing emits or handles `playerBitten`. Confirm and delete the dead type.

- [ ] **Step 1: Confirm there are no remaining references**

Run: `grep -rn "PlayerBittenMsg\|playerBitten" packages/ --include=*.ts --include=*.feature`
Expected: zero matches (all server/client/test references were removed in Tasks 5 and 6). If any remain, remove them before deleting the type.

- [ ] **Step 2: Delete the `PlayerBittenMsg` interface**

In `packages/shared/src/protocol.ts`, remove the entire `PlayerBittenMsg` doc-comment + interface (the block starting with `/**` above `export interface PlayerBittenMsg {` through its closing `}`).

- [ ] **Step 3: Remove `PlayerBittenMsg` from the `ServerMsg` union**

Delete the `| PlayerBittenMsg` line from the `ServerMsg` union so it reads:

```typescript
export type ServerMsg =
  | WelcomeMsg
  | SnapshotMsg
  | LevelUpMsg
  | EatenMsg
  | LeaderboardMsg
  | PlayerJoinedMsg
  | PlayerDiedMsg
  | CombatToastMsg
  | RosterMsg;
```

- [ ] **Step 4: Typecheck + full test suite**

Run: `bun run typecheck`
Expected: passes.

Run: `bun run test`
Expected: server cucumber + client playwright-bdd all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/protocol.ts
git commit -m "Remove obsolete PlayerBittenMsg"
```

---

## Task 9: Final verification + finish

- [ ] **Step 1: Full typecheck + test**

Run: `bun run typecheck && bun run test`
Expected: green.

- [ ] **Step 2: Review the diff against the spec**

Run: `git diff main...HEAD --stat`
Confirm every spec section maps to a change: protocol types, server attribution + dispatch, client rendering, test rework.

- [ ] **Step 3: Hand off**

Use superpowers:finishing-a-development-branch to choose merge / PR / cleanup.

---

## Self-review against the spec

- **Weapon kills: global + personal** → Task 5 (weapon-aware `playerDied`, killer-excluded) + personal `combatToast` kind `"kill"`; client renders both (Task 6). ✓
- **Aggressor feed "You hit X" → "You ate X"** → `recordMeleeBite` "hit" (Task 4) + `killToasts` "ate" (Task 5) + client render (Task 6). ✓
- **Smart victim warning (threat-only)** → `attackerIsThreat` flag: `false` on the nibble branch, `true` on the between-zone branch (Task 4); covered by `bite-toast.feature` scenarios 1–2. ✓
- **"the void" fix** → names captured at enqueue time in `recordMeleeBite`; `combat-toasts.feature` regression scenario asserts the eater gets 0 bitten toasts. ✓
- **Remove global "X was bitten by Y"** → old broadcast replaced with per-socket `combatEvents` dispatch (Task 5); `PlayerBittenMsg` deleted (Task 8). ✓
- **Authoritative server / dumb client** → client-derived "Ate X" removed; all toasts server-emitted (Task 6). ✓
- **Edge cases** → "hit" gated on victim survival (no double with kill); AI killer ⇒ no socket ⇒ skipped; per-engagement throttle reused via `freshEngagement`. ✓
- **Type consistency** → `combatEvents` shape `{ recipientId, kind, otherName, otherColor }` used identically in `world.ts` (Task 4) and `index.ts` (Task 5); `killToasts` shape consistent; `CombatToastMsg` fields (`kind`/`other`/`color`/`weaponId`) consistent across protocol, server send sites, and client handler. ✓

**Placeholder scan:** none — every code step contains complete code.
