# Leaderboard redesign: kills primary, peak mass, hits & damage

**Date:** 2026-05-23
**Status:** Approved (design)

## Context & goal

The permanent leaderboard currently ranks players by **final mass**. Mass is no
longer a meaningful score: it decays over a life and is lost entirely at death.
We're making **kills** the primary metric, keeping mass only as flavor (recorded
as the *largest* mass reached, not the mass at death), and adding two new
all-weapon combat stats — **hits** and **damage dealt**. We also need an
operator command to wipe all scores (local or prod) so the board can be reset.

Accuracy was considered and **dropped**: "shots fired" has no honest meaning for
continuous/AoE weapons (orbital piranhas re-hit forever, pulses are area bursts),
so hits + damage — both well-defined for every weapon — replace it.

## Metrics tracked per run

| Stat | Meaning | Source |
|------|---------|--------|
| `kills` | fish eaten (unchanged) | existing eating loop in `world.ts` |
| `peakMass` | **max** mass reached during the life | new per-tick high-water mark |
| `hits` | times any of your weapons damaged a fish | `applyHit()` |
| `damageDealt` | sum of raw weapon damage you dealt | `applyHit()` |

- `hits`/`damageDealt` are incremented at the single `applyHit()` choke point
  (`packages/server/src/sim/weapon.ts`) that every weapon kind — projectile,
  radial-burst, radial-pulse, trail, orbital — routes through. Guarded to
  players (`if (!owner.isAi)`); AI never fire weapons regardless.
- "Damage" is the **raw weapon damage** value (the `damage` arg to `applyHit`),
  not the mass actually shaved off the target.
- Hits/damage accrue against **any** fish struck (AI or player), keeping the
  numbers lively. `kills` likewise already counts AI eaten.
- `peakMass = max(peakMass, mass)` updated each tick in `world.step`.

## Data model — independent career bests

The board keeps **one row per player name**. Today that row is the single
highest-mass run; it becomes a **career-bests** record holding the all-time max
of each stat (merged on every death via Mongo `$max`):

```
maxKills    = max(stored, run.kills)
maxPeakMass = max(stored, run.peakMass)
maxHits     = max(stored, run.hits)
maxDamage   = max(stored, run.damageDealt)
```

Flavor fields that only make sense for one run — `weapons`, `evolution`,
`level`, `color` — are taken from the player's **best-kills run** (kills is
primary) and refreshed when a new run beats `maxKills`. `endedAt` updates on
every run so the "Recent" sort still works. The conditional loadout update is
done with a Mongo aggregation-pipeline update (Mongo 7) or read-modify-write in
`upsertScore`.

**Migration:** old docs have only `finalMass`/`kills`. We ship the new schema
and run `--reset-scores` once after deploy (requested feature). Reads treat
missing `max*` fields as `0` so nothing breaks before the reset.

## Sorts & wire protocol

- `LeaderboardSort` = `kills | mass | hits | damage | recent`, mapping to
  `maxKills / maxPeakMass / maxHits / maxDamage / endedAt` (all descending).
- **Default sort flips to `kills`** in the WS broadcast (`broadcastLeaderboard`)
  and the HTTP `/leaderboard` endpoint (`packages/server/src/index.ts`).
- `LeaderboardEntry` / `LeaderboardRow` gain `kills`, `peakMass`, `hits`,
  `damage`; `finalMass` is renamed to `peakMass`. Keeps `name`, `color`,
  `level`, `evolution`, `endedAt`.

## Client display

Both surfaces — death screen (`scenes/death.ts`) and the F2 panel
(`hud/scoreboard.ts`) — already share a tab bar + render function.

- Tabs: **Most Kills (default)** · Top Mass · Hits · Damage · Recent.
- Each row shows the active sort metric as the primary number plus a compact
  secondary line surfacing the rest, e.g. `· 14 kills · 38k dmg · 612 hits`,
  so all four stats are visible on every tab. Layout stays compact.

## Deploy reset commands

Following the existing `--reset-map` flag pattern in `deploy.sh`:

- `./deploy.sh --reset-scores` — clears the **prod** `scores` collection on the
  remote host via `docker compose -f docker-compose.prod.yml exec -T mongo
  mongosh --port "$MONGO_PORT" fcf_survivors --eval 'db.scores.deleteMany({})'`,
  behind a typed **y/N confirmation** (destructive prod data).
- `./deploy.sh --reset-scores-local` — same `deleteMany` against the local dev
  mongo container (`fcf-mongo`), no prompt.

`deleteMany({})` (not `drop()`) so indexes survive. DB `fcf_survivors`,
collection `scores`. Exact container/compose invocation verified against
`docker-compose.yml` / `deploy/docker-compose.prod.yml` during implementation.

## Testing (TDD, server cucumber)

- `applyHit` increments owner `hits` and `damageDealt`; accumulates over
  multiple hits; AI owner is not credited.
- `peakMass` records the high-water mark and is unaffected by later decay/shrink.
- On death, the written score run-doc carries `kills`, `peakMass`, `hits`,
  `damage`.
- Independent-bests upsert keeps the per-stat max across two runs by the same
  name (e.g. run A high kills/low mass, run B low kills/high mass → row shows
  both maxes).
- Default `topLeaderboard` sort is `kills`; `hits`/`damage` sorts order
  correctly.

Deploy-script changes are verified manually (shell, against local mongo).

## Touched files

- `packages/shared/src/protocol.ts` — `LeaderboardEntry` fields.
- `packages/server/src/sim/entity.ts` — `Fish` gains `peakMass`, `hits`, `damageDealt`.
- `packages/server/src/sim/weapon.ts` — `applyHit` counter increments.
- `packages/server/src/sim/world.ts` — init new fields in `spawnPlayer`; per-tick `peakMass`.
- `packages/server/src/sim/ai.ts` + test factories — init new fields.
- `packages/server/src/db/scores.ts` — schema, `LeaderboardSort`, `SORT_FIELDS`, `upsertScore` (independent bests), `topLeaderboard` default, indices.
- `packages/server/src/index.ts` — dead-player snapshot, run-doc build, `/leaderboard` + broadcast defaults, entry mapping.
- `packages/client/src/scenes/death.ts`, `packages/client/src/hud/scoreboard.ts` — tabs + row layout.
- `deploy.sh` — `--reset-scores`, `--reset-scores-local`.
- Server features/steps — new scenarios per the test list above.
