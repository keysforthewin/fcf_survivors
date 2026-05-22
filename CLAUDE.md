# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Fruit Cup Survivors — a real-time multiplayer browser game combining agar.io-style fish-eating with Vampire Survivors auto-attacking weapons and level-up cards. Bun + TypeScript monorepo with three workspaces under `packages/`: `shared` (wire protocol, balance constants), `server` (authoritative sim), `client` (PixiJS renderer).

## Commands

```sh
# Local dev — runs mongo (docker), bun server, and vite client concurrently
bun run dev

# Or full docker stack (mongo + server + client)
docker compose up

# Type-check the whole workspace
bun run typecheck

# All tests (cucumber on server + playwright-bdd on client)
bun run test

# Server-only cucumber (faster iteration)
bun --cwd=packages/server run test
bun --cwd=packages/server x cucumber-js features/leveling.feature                 # single feature
bun --cwd=packages/server x cucumber-js --name "100 XP promotes"                   # single scenario by name

# Client-only playwright-bdd (auto-boots test-server on :4000 + vite on :5173)
bun --cwd=packages/client run test
bun --cwd=packages/client x playwright test arena-hud                              # filter by feature name

# Ad-hoc smoke + level-up scripts (need a running server on :4000)
bun run scripts/smoke.ts
bun run scripts/levelup-test.ts

# Production deploy (rsync + remote docker compose; reads .env)
./deploy.sh
./deploy.sh --print-nginx        # render nginx vhost from deploy/nginx.survivors.conf
```

The client dev server proxies `/leaderboard` → `http://${SERVER_HOST:-localhost}:4000` (see `packages/client/vite.config.ts`). In dev the websocket connects directly to `:4000/ws`; in prod it uses `location.host + BASE_URL + ws`, which is why `BASE_PATH` matters in `.env`.

## Architecture

### Authoritative server, dumb client

The server runs the entire game simulation at 20Hz (`TICK.hz` in `packages/shared/src/balance.ts`) and ships interest-filtered snapshots over websockets. Clients only render and forward input — they never simulate physics, collisions, weapons, or level-ups locally. This means: when behavior is wrong, look in `packages/server/src/sim/`. The client just trusts what arrives.

The tick loop in `packages/server/src/index.ts` runs in a fixed order each tick:
1. `world.step(dt, now)` — movement, pellets/chunks/projectiles integration, spatial-hash rebuild, weapon firing (`tryFireWeapons`), projectile damage (`applyProjectileDamage`), eating collisions.
2. Collect dead fish → spawn chunks → remove fish → notify+persist dead players.
3. `processLevelUps(world)` — eligible players get `pendingLevelUp` populated.
4. Push `LevelUpMsg` to any player whose modal isn't already open.
5. Build per-socket snapshot via `ClientView` (delta-encoded against last-sent state).

### Wire protocol (`packages/shared/src/protocol.ts`)

Client → server messages (`hello`, `input`, `pickCard`) are zod-validated discriminated unions; server → client messages (`welcome`, `snapshot`, `levelUp`, `eaten`, `leaderboard`) are plain TS types. Card IDs are opaque strings serialized/parsed via `serializeCardId`/`parseCardId` in `packages/shared/src/cards.ts` — never hand-construct them.

`SnapshotMsg.entities` is a delta against `ClientView.prevSent`: only changed fields are included on subsequent ticks. `SnapshotMsg.removed` plus an entity not appearing means "gone." When adding new fields to an entity, both `buildSnapshot` (server) and the client's apply-delta path need to handle "first-seen vs. update."

### Weapons, passives, evolutions

Weapon definitions live in `packages/shared/src/weapons.ts` (`WEAPONS` record keyed by `WeaponId`, with 5 levels each). Five `WeaponKind`s — `projectile`, `radial-burst`, `radial-pulse`, `trail`, `orbital` — are each implemented as a branch in `tryFireWeapons` in `packages/server/src/sim/weapon.ts`. Trail and orbital are **continuous** (`cooldownReadyAt` is just for HUD display; they always tick). Adding a new kind means: extend the union in `weapons.ts`, add a case in `tryFireWeapons`, add per-tick logic, decide if `WeaponSlot.state` needs a new variant (`TrailState | OrbitalState`).

Passives are pure multipliers — `packages/server/src/sim/passives.ts` exports getters (`getMoveSpeed`, `getMaxHp`, `getWeaponDamageMult`, ...) that the sim and `levelup.ts` consult instead of reading `FISH.*` constants directly. AI fish skip all passive effects.

Evolutions (`packages/shared/src/evolutions.ts`) gate an evolved weapon behind `base weapon at Lv5 + paired passive at maxStack + not already owned`. `drawCards` in `packages/server/src/sim/levelup.ts` forces them into the level-up draw when eligible.

### Level-up flow

Players don't level up implicitly — `processLevelUps` populates `fish.pendingLevelUp` with 3 cards, the server pushes a `LevelUpMsg` exactly once per level (gated by `levelUpSentForLevel` per-socket), and the player must respond with a `pickCard` message. While `pendingLevelUp.length > 0`: input is clamped to zero (`applyInput`) and weapons stop firing (`tryFireWeapons`). `applyCard` validates the card was actually offered.

### Test seams (the important ones)

The sim is built to be deterministic in tests via dependency injection. Whenever you write a test or reproduce a bug, prefer these over real clocks/Mongo/networking:

- `new World({ now, rng, autoSpawnPellets: false, maintainAi: false })` — inject clock/rng, disable background spawners. `packages/server/test/support/world-factory.ts` wraps this with `makeWorld({ fish, pellets, seed, ... })` for cucumber.
- `startServer({ port: 0, connectMongo: false, periodicLeaderboard: false, log: false, worldDeps })` — ephemeral-port server with no Mongo/leaderboard timers. Used by `packages/server/test/support/server-harness.ts`.
- `setScoresImpl({ writeScore, topLeaderboard })` in `packages/server/src/db/scores.ts` — swap out Mongo with an in-memory mock. Used by `packages/server/test/bin/test-server.ts` (the test server that client BDD scenarios spin up) and by `mockScores()` for cucumber.
- Cucumber's `TestWorld` (`packages/server/test/support/world.ts`) holds `sim`, `server`, `clients`, and a free-form `data` bag for inter-step state.

Mongo connect is fire-and-forget: if it fails at boot, `writeScore` queues up to 200 docs and flushes on reconnect — production keeps running even without DB. Don't add startup gates that block on Mongo.

### Client structure

`packages/client/src/main.ts` runs a `title → arena → death` loop. `ArenaScene` (`packages/client/src/scenes/arena.ts`) is the big one: it owns the PixiJS world container, interpolates entity positions with a 100ms delay (`INTERP_DELAY_MS`), and renders weapons via `render/projectile.ts` + `render/particles.ts`. Level-up modal is an HTML overlay (`scenes/level-up.ts`) layered over the canvas, not a Pixi container.

There is no client-side prediction or rollback. Inputs are sent at ~20Hz with a monotonic `seq`; the server echoes the last-applied `seq` in `SnapshotMsg.ackSeq` (currently informational only).
