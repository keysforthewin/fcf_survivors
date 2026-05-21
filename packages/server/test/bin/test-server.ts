#!/usr/bin/env bun
/**
 * Standalone test server used by client BDD scenarios (Playwright webServer).
 *
 * Boots a real Bun.serve + WebSocket on port 4000 (or $PORT) with score
 * persistence mocked in-memory, so client tests can hit a working server
 * without docker/mongo.
 */

import { startServer } from "../../src/index.ts";
import { setScoresImpl, type ScoreDoc } from "../../src/db/scores.ts";

const writes: ScoreDoc[] = [];
setScoresImpl({
  async writeScore(doc) {
    writes.push(doc);
  },
  async topLeaderboard() {
    // Empty leaderboard by default. Client tests that need data can pre-seed
    // via the /test/seed-leaderboard endpoint (future) or by faking the WS.
    return [];
  },
});

const running = startServer({
  port: Number(process.env.PORT ?? 4000),
  connectMongo: false,
  periodicLeaderboard: true,
  log: false,
});

console.log(`[test-server] listening on ws://localhost:${running.port}/ws`);

const shutdown = async (sig: string): Promise<void> => {
  console.log(`[test-server] ${sig} — shutting down`);
  await running.close();
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
