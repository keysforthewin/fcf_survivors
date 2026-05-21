import { startServer, type RunningServer, type StartServerOpts } from "../../src/index.ts";
import { mockScores, type MockScores } from "./mock-scores.ts";

export interface TestServer {
  url: string;
  port: number;
  running: RunningServer;
  scores: MockScores;
  close(): Promise<void>;
}

/** Boot the real Bun.serve on an ephemeral port with score persistence mocked. */
export async function startTestServer(opts: Partial<StartServerOpts> = {}): Promise<TestServer> {
  const scores = mockScores();
  scores.install();
  // Test default: deterministic clock + RNG + no auto-pellets + no AI maintenance.
  // Scenarios can override worldDeps to opt back in.
  const defaultWorldDeps = {
    autoSpawnPellets: false,
    maintainAi: false,
    ...(opts.worldDeps ?? {}),
  };
  const running = startServer({
    port: 0,
    connectMongo: false,
    periodicLeaderboard: false,
    log: false,
    ...opts,
    worldDeps: defaultWorldDeps,
  });
  const url = `ws://localhost:${running.port}/ws`;
  return {
    url,
    port: running.port,
    running,
    scores,
    async close() {
      scores.uninstall();
      await running.close();
    },
  };
}
