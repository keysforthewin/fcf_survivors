# Eat distance, bite-animation distance & combat toasts — design

Date: 2026-06-03

## Problem

The fish-vs-fish eat distance is "way too big" and inconsistent. A swallow currently lands when prey
is in the front cone AND within `rA + rB + contactMargin(6) + behindReach(≤140×CloseEncounters)`,
plus a front-suction zone that scales with body radius (`rA × suctionBodyFrac`), `reachBonus(80)` and
the Close Encounters `grab`. So effective reach scales with **fish size, the behind-approach bonus,
and the Close Encounters passive** — prey gets swallowed while the sprites are still visibly apart.
And the chomp animation fires *at the instant of the eat*, so there is no visible wind-up — you can't
see a fish "about to bite" you.

## Goals

1. **Eat reach** = a flat **5px gap** in front of the mouth. Consistent, does NOT scale with mass/level.
   "You have to get your mouth on top of a fish to eat it."
2. **Bite-animation reach** = **4× the eat reach** (20px). A predator that *could swallow* prey plays a
   visible chomp wind-up as it closes from 20px down to the 5px eat — so you can see the fish behind you
   biting before it actually eats you.
3. **Toasts** for combat events involving human players.

## Geometry — front-cone + body-edge gap (chosen: option B)

Rejected (A): measuring nose-point→prey distance is fragile — with big overlapping circles a predator's
nose can poke out the far side of a small prey, reading as "not on the fish."

Chosen (B): `gap = dist(centers) − rA − rB` (negative = overlapping). Prey is "in front" when
`stationary || dot(heading, dir-to-prey) ≥ MOUTH.coneCos`. This means "your front edge / mouth is within
Npx of their body, and you're facing them." Robust, intuitive, and the px tolerance is flat regardless of
size.

### Reaches

- `eatReach = MOUTH.eatReach(5) × (isAi ? 1 : getEatRangeMult(fish))`.
  Close Encounters still extends it (×1.2/stack → ~12.4px at stack 5) — a chosen upgrade, not size/level
  scaling. AI = flat 5px. (CE passive description stays accurate.)
- `biteReach = eatReach × MOUTH.biteReachMult(4)` (20px base; ~50px at CE5; AI 20px).

### Rules (predator `a`, prey `b`)

- **Swallow** (`canSwallow(a,b)`): front && `gap ≤ eatReach` → eat whole. Sets `bitingTick` (final chomp),
  AI eat-lunge, burp. (Skip spawn-protected `b`.)
- **Bite wind-up animation** (`canSwallow(a,b)`): front && `eatReach < gap ≤ biteReach` → set `bitingTick`
  (animation only, no eat/damage), gated by `BITE.cooldownMs` per attacker (`lastBiteAnimAt`) so it pulses.
- **Nibble** (`b.mass > a.mass`): any-angle && `gap ≤ eatReach` → chip damage (cooldown). Sets `nibblingTick`.
- **Between-zone bite** (`a` bigger but can't swallow, or equal): front && `gap ≤ eatReach` → chip damage
  (own cooldown). Sets `nibblingTick`.

### Removed (the bloat)

`MOUTH.suctionExtraRadius`, `suctionPullPerTick`, `suctionBodyFrac`, `reachBonus`, `contactMargin`,
`behindCos`, `behindReachBonus`, and the entire front-suction sub-block + behind-approach reach. Chasing
now means closing your mouth to within 5px (pure skill catch). `getEatRangeMult` / `eatRangeMultForStack`
stay (CE multiplies `eatReach`).

## Toasts

Scope (chosen): **human-player events only** (AI excluded so the 4-slot, 3s toast stack never floods).

- **Eaten (human victim):** unchanged — the existing `playerDied` broadcast → `"X was eaten by Y"` toast.
- **Your own eat:** client-derived from the snapshot `swallowed[]` — when `by === selfId` and the victim is
  **AI** (`isAi`), toast `"Ate <victimName>"`. Human victims are already covered by the `playerDied`
  broadcast (avoids a double toast).
- **Bitten (human victim):** new `PlayerBittenMsg { t:"playerBitten", name, color, byName }`, broadcast to
  everyone like `playerDied`, → toast `"X was bitten by Y"`. Fires once per **engagement**: emitted when a
  nibble/between-bite damages a non-AI `b`, gated per-victim by `lastBittenBy`/`lastBittenAt` — re-emits only
  if the attacker differs or no bite from that attacker for `BITE.toastEngagementMs(1500)`.

### Wiring

- `world.bittenEvents: Array<{ victimId, byId }>` populated in the eat loop; drained in `index.ts` →
  `PlayerBittenMsg` broadcast (resolve victim + attacker names; attacker may be AI).
- Client `arena.ts`: `net.on("playerBitten", …)` → toast; your-own-eat toast inside the `swallowed[]` handler;
  guard the remote `biting`/`nibbling` sprite trigger to **skip the self fish** (own-fish animation stays
  `detectBites`-driven so it's instant, not RTT-delayed).

## Files

- `shared/balance.ts` — `MOUTH` reshape; `BITE.toastEngagementMs`; comment updates.
- `shared/protocol.ts` — `PlayerBittenMsg` + `ServerMsg` union; `EntityDelta.biting` comment (now wind-up too).
- `server/sim/entity.ts` — `lastBiteAnimAt?`, `lastBittenBy?`, `lastBittenAt?`.
- `server/sim/world.ts` — rewrite eat loop (gap model); `bittenEvents`; simplify `burpXp`.
- `server/index.ts` — drain `bittenEvents` → broadcast.
- `client/net/socket.ts` — register `playerBitten`.
- `client/scenes/arena.ts` — `detectBites` gap model; self-fish bite guard; bitten + own-eat toasts; fix
  inert mouth-indicator constant ref.

## Tests

- Rewrite `mouth-eating.feature` (drop suction + behind-chase scenarios; retitle to the 5px rule),
  `close-encounters.feature` (reposition to gap ~10px to isolate CE; drop the two behind-reach scenarios),
  `nibbling.feature` (drop behind-reach nibble).
- `eating.feature` + `biting.feature` already pass under the gap model (hand-verified) — keep.
- New: swallowable prey at `gap` just >5px is NOT eaten but IS within bite range (wind-up); a new
  `Then "{name} is biting"` step asserting the wind-up flag fires without eating; a bitten-toast scenario
  asserting `world.bittenEvents` populates once per engagement.
- `bun run typecheck` + full server cucumber + client playwright-bdd.

## Post-review adjustments (after adversarial review)

- **Bitten-toast throttle fix (was a bug):** a single per-victim `lastBittenBy/At` slot let two attackers
  alternating on one victim each read as "fresh" → toast spam. Replaced with a per-attacker
  `biteToastAt: Map<attackerId, ms>` on the victim (pruned to the engagement window). Pinned by a
  multi-attacker scenario in `bite-toast.feature`.
- **AI hunting (chosen by user):** with mouth-on eating + no behind-reach, AI (chase speed < flee
  speed) can't catch fleeing prey. Decision: *accept* the weaker AI but raise `AI.chaseSpeed` 220 → 235
  — still **below** `fleeSpeed` 240, so a clean flee (plus the panic burst) always escapes, but a stall /
  bad turn / corner gets punished. No behind-reach restored.
- **Added coverage:** client self-eat "Ate <name>" toast scenario (`presence.feature`).
- **Known/accepted:** Close Encounters is now ~+1px reach/stack (the intended consequence of the flat
  5px base — may warrant a later buff or repurpose); the client mispredicts a chomp on spawn-protected
  prey (pre-existing, not introduced here); the victim sees a third-person "X was bitten by Y" toast
  about themselves (consistent with the existing "eaten" toast). Pre-existing unrelated failure:
  `danger.feature` (BigBob mass 60 vs 50 at committed `eatRatio 1.25`).
