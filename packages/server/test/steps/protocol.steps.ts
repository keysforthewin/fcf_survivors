import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { TestWorld } from "../support/world.ts";
import { startTestServer } from "../support/server-harness.ts";
import { testClient } from "../support/ws-client.ts";

Given("the server is running", { timeout: 10_000 }, async function (this: TestWorld) {
  this.server = await startTestServer();
});

Given(
  "client {string} is connected",
  { timeout: 10_000 },
  async function (this: TestWorld, label: string) {
    const server = this.requireServer();
    const c = testClient(server.url);
    await c.connect();
    this.clients.set(label, c);
  }
);

When(
  "client {string} sends hello as {string} with color {string}",
  function (this: TestWorld, label: string, name: string, color: string) {
    this.requireClient(label).hello(name, color);
  }
);

When(
  "client {string} sends a raw payload {string}",
  function (this: TestWorld, label: string, raw: string) {
    this.requireClient(label).sendRaw(raw);
  }
);

When(
  "client {string} sends input seq {int} \\({float}, {float}\\)",
  function (this: TestWorld, label: string, seq: number, vx: number, vy: number) {
    this.requireClient(label).input(seq, vx, vy, false);
  }
);

When(
  "client {string} sends pickCard {string}",
  function (this: TestWorld, label: string, cardId: string) {
    this.requireClient(label).pickCard(cardId);
  }
);

When(
  "client {string} sends a malformed input with vx {int}",
  function (this: TestWorld, label: string, vx: number) {
    this.requireClient(label).send({ t: "input", seq: 1, vx, vy: 0, boost: false });
  }
);

When(
  "client {string} sends an unknown message",
  function (this: TestWorld, label: string) {
    this.requireClient(label).send({ t: "definitely-not-a-real-type" });
  }
);

Then(
  "client {string} receives a welcome",
  { timeout: 5_000 },
  async function (this: TestWorld, label: string) {
    const c = this.requireClient(label);
    const msg = await c.wait((m) => m.t === "welcome");
    assert.ok(msg.selfId > 0, "welcome missing selfId");
    assert.ok(msg.arena?.width > 0, "welcome missing arena dims");
    assert.ok(msg.tickHz > 0, "welcome missing tickHz");
    this.data.set(`${label}.selfId`, msg.selfId);
  }
);

Then(
  "client {string} receives a snapshot within {int}ms",
  async function (this: TestWorld, label: string, ms: number) {
    const c = this.requireClient(label);
    const msg = await c.wait((m) => m.t === "snapshot", ms);
    assert.equal(msg.t, "snapshot");
  }
);

Then(
  "client {string} does not receive a snapshot within {int}ms",
  async function (this: TestWorld, label: string, ms: number) {
    const c = this.requireClient(label);
    let saw = false;
    try {
      await c.wait((m) => m.t === "snapshot", ms);
      saw = true;
    } catch {}
    assert.ok(!saw, `Did not expect a snapshot but one arrived`);
  }
);

Then(
  "client {string} stays connected",
  async function (this: TestWorld, label: string) {
    const c = this.requireClient(label);
    // We won't get a close event in time if everything is fine. Briefly wait.
    await new Promise((r) => setTimeout(r, 100));
    // If a close happened, the client's underlying ws.readyState would be CLOSED.
    // We don't expose readyState; instead assert no "close" semantics by trying to send.
    let blew = false;
    try { c.send({ t: "input", seq: 99, vx: 0, vy: 0, boost: false }); } catch { blew = true; }
    assert.ok(!blew, "client send threw; socket may be closed");
  }
);

Then(
  "the player for client {string} stays at the spawn point",
  async function (this: TestWorld, label: string) {
    // Wait for at least 2 snapshots so we can compare positions.
    const c = this.requireClient(label);
    const a = await c.wait((m) => m.t === "snapshot");
    await new Promise((r) => setTimeout(r, 100));
    const recent = [...c.messages].reverse().find((m) => m.t === "snapshot");
    assert.ok(recent, "no recent snapshot");
    const dx = Math.abs(a.you.x - recent.you.x);
    const dy = Math.abs(a.you.y - recent.you.y);
    assert.ok(dx < 5 && dy < 5, `Expected near-still, but moved (${dx.toFixed(1)}, ${dy.toFixed(1)})`);
  }
);
