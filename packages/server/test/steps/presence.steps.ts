import { Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { TestWorld } from "../support/world.ts";

Then(
  "client {string} receives a playerJoined for {string}",
  { timeout: 5_000 },
  async function (this: TestWorld, label: string, name: string) {
    const c = this.requireClient(label);
    const msg = await c.wait((m) => m.t === "playerJoined" && m.name === name);
    assert.equal(msg.name, name);
    assert.match(msg.color, /^#[0-9a-fA-F]{6}$/);
  }
);

Then(
  "client {string} does not receive a playerJoined for {string} within {int}ms",
  async function (this: TestWorld, label: string, name: string, ms: number) {
    const c = this.requireClient(label);
    let saw = false;
    try {
      await c.wait((m) => m.t === "playerJoined" && m.name === name, ms);
      saw = true;
    } catch {}
    assert.ok(!saw, `Did not expect a playerJoined for "${name}", but one arrived`);
  }
);

Then(
  "client {string} receives a playerDied for {string}",
  { timeout: 5_000 },
  async function (this: TestWorld, label: string, name: string) {
    const c = this.requireClient(label);
    const msg = await c.wait((m) => m.t === "playerDied" && m.name === name);
    assert.equal(msg.name, name);
    assert.equal(typeof msg.byName, "string");
  }
);

Then(
  "client {string} receives a playerDied for {string} with byName {string}",
  { timeout: 5_000 },
  async function (this: TestWorld, label: string, name: string, byName: string) {
    const c = this.requireClient(label);
    const msg = await c.wait((m) => m.t === "playerDied" && m.name === name);
    assert.equal(msg.name, name);
    assert.equal(msg.byName, byName, `Expected playerDied.byName="${byName}", got "${msg.byName}"`);
  }
);

Then(
  "client {string} does not receive a playerDied within {int}ms",
  async function (this: TestWorld, label: string, ms: number) {
    const c = this.requireClient(label);
    let saw = false;
    try {
      await c.wait((m) => m.t === "playerDied", ms);
      saw = true;
    } catch {}
    assert.ok(!saw, `Did not expect a playerDied but one arrived`);
  }
);

When(
  "the fish for client {string} is killed",
  function (this: TestWorld, label: string) {
    const server = this.requireServer();
    const fishId = this.data.get(`${label}.selfId`) as number | undefined;
    assert.ok(fishId != null, `No selfId stored for ${label}. Make sure a "receives a welcome" step ran for ${label}.`);
    const fish = server.running.world.fish.get(fishId);
    assert.ok(fish, `Fish ${fishId} for client "${label}" not in world`);
    fish.alive = false;
  }
);

Then(
  "client {string} receives a roster within {int}ms",
  async function (this: TestWorld, label: string, ms: number) {
    const c = this.requireClient(label);
    const msg = await c.wait((m) => m.t === "roster", ms);
    assert.equal(msg.t, "roster");
    assert.ok(Array.isArray(msg.players), "roster missing players array");
  }
);

Then(
  "client {string}'s most recent roster contains {string} and {string}",
  { timeout: 5_000 },
  async function (this: TestWorld, label: string, nameA: string, nameB: string) {
    const c = this.requireClient(label);
    const recent = await c.wait((m) => {
      if (m.t !== "roster") return false;
      const names = m.players.map((p: any) => p.name);
      return names.includes(nameA) && names.includes(nameB);
    }, 3_000);
    const names = recent.players.map((p: any) => p.name);
    assert.ok(names.includes(nameA), `Roster missing ${nameA}. Got: ${names.join(", ")}`);
    assert.ok(names.includes(nameB), `Roster missing ${nameB}. Got: ${names.join(", ")}`);
  }
);

Then(
  "client {string}'s most recent roster marks {string} as self",
  { timeout: 5_000 },
  async function (this: TestWorld, label: string, name: string) {
    const c = this.requireClient(label);
    const recent = await c.wait((m) => {
      if (m.t !== "roster") return false;
      const row = m.players.find((p: any) => p.name === name);
      return row != null && row.isMe === true;
    }, 3_000);
    const row = recent.players.find((p: any) => p.name === name);
    assert.ok(row && row.isMe === true, `Expected ${name}.isMe=true on ${label}'s roster`);
  }
);
