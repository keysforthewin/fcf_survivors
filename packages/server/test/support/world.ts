import { setWorldConstructor, World as CucumberWorld, type IWorldOptions } from "@cucumber/cucumber";
import type { TestSim } from "./world-factory.ts";
import type { TestServer } from "./server-harness.ts";
import type { TestClient } from "./ws-client.ts";

/** Per-scenario shared state. Step defs receive this as `this`. */
export class TestWorld extends CucumberWorld {
  sim?: TestSim;
  server?: TestServer;
  clients = new Map<string, TestClient>();
  /** Free-form bag for scenario-local data. */
  data = new Map<string, unknown>();
  /** Snapshot of the world between steps for delta assertions. */
  snapshots: unknown[] = [];

  constructor(opts: IWorldOptions) {
    super(opts);
  }

  /** Get a sim, throwing a clear error if no Given step initialised it. */
  requireSim(): TestSim {
    if (!this.sim) throw new Error("No sim — start with a Given that calls makeWorld() (e.g. 'Given a fresh world').");
    return this.sim;
  }

  requireServer(): TestServer {
    if (!this.server) throw new Error("No test server running — start scenario with 'Given the server is running'.");
    return this.server;
  }

  requireClient(label: string): TestClient {
    const c = this.clients.get(label);
    if (!c) throw new Error(`No client labelled '${label}'. Known: ${[...this.clients.keys()].join(", ") || "<none>"}`);
    return c;
  }

  async teardown(): Promise<void> {
    for (const c of this.clients.values()) c.close();
    this.clients.clear();
    if (this.server) {
      await this.server.close();
      this.server = undefined;
    }
    this.sim = undefined;
    this.data.clear();
    this.snapshots = [];
  }
}

setWorldConstructor(TestWorld);
