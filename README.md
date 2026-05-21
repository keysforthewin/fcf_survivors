# Fruit Cup Survivors

Real-time multiplayer browser game: agar.io-style fish eating + Vampire Survivors auto-attacking weapons and level-up cards.

## Stack
- **Client:** TypeScript + Vite + PixiJS v8
- **Server:** Bun (`Bun.serve` websockets) + MongoDB
- **Shared:** zod-validated wire protocol + balance constants

## Quick start

Everything runs in docker — mongo, server, and client:

```sh
docker compose up
```

Then open http://localhost:5173.

First boot installs deps inside the containers (named volumes keep them around for subsequent runs). To rebuild deps from scratch:

```sh
docker compose down -v
docker compose up
```

### Native (no docker)

```sh
bun install
docker compose up -d mongo
bun run dev
```

## Layout

```
packages/
  shared/   protocol, balance, entity types
  server/   authoritative simulation + websocket
  client/   PixiJS renderer + input
```

See `/home/mulligan/.claude/plans/help-me-plan-out-soft-honey.md` for the design doc.
