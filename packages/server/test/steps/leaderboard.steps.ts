import { Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { TestWorld } from "../support/world.ts";
import { writeScore, type LeaderboardRow, type ScoreDoc } from "../../src/db/scores.ts";

Given(
  "the leaderboard contains:",
  function (this: TestWorld, table: { rawTable: string[][] }) {
    const server = this.requireServer();
    const rows = table.rawTable;
    const header = rows[0]!;
    const col = (name: string) => header.indexOf(name);
    const idxName = col("name");
    const idxColor = col("color");
    const idxKills = col("kills");
    const idxMass = col("peakMass");
    const idxHits = col("hits");
    const idxDamage = col("damage");
    const idxLevel = col("level");
    const idxDuration = col("durationMs");
    const num = (row: string[], idx: number) => (idx >= 0 ? Number(row[idx]!) : 0);
    const seed: LeaderboardRow[] = rows.slice(1).map((row) => ({
      name: row[idxName]!,
      color: row[idxColor] ?? "#7fcfff",
      kills: num(row, idxKills),
      peakMass: num(row, idxMass),
      hits: num(row, idxHits),
      damage: num(row, idxDamage),
      level: idxLevel >= 0 ? Number(row[idxLevel]!) : 1,
      durationMs: num(row, idxDuration),
      endedAt: Date.now(),
    }));
    server.scores.setRows(seed);
  }
);

Then(
  "client {string} receives a leaderboard with {int} entries",
  { timeout: 5_000 },
  async function (this: TestWorld, label: string, n: number) {
    const c = this.requireClient(label);
    const msg = await c.wait((m) => m.t === "leaderboard");
    assert.equal(msg.top.length, n, `Expected ${n} entries, got ${msg.top.length}`);
  }
);

Then(
  "client {string} receives a leaderboard whose top name is {string}",
  { timeout: 5_000 },
  async function (this: TestWorld, label: string, expected: string) {
    const c = this.requireClient(label);
    const msg = await c.wait((m) => m.t === "leaderboard");
    assert.ok(msg.top.length > 0, "leaderboard empty");
    assert.equal(msg.top[0].name, expected);
  }
);

Then(
  "the leaderboard mock recorded {int} writes",
  function (this: TestWorld, expected: number) {
    const server = this.requireServer();
    assert.equal(server.scores.writes.length, expected);
  }
);

Then(
  "the leaderboard mock recorded {int} write(s) for {string}",
  function (this: TestWorld, expected: number, name: string) {
    const server = this.requireServer();
    const got = server.scores.writes.filter((w) => w.name === name).length;
    assert.equal(
      got,
      expected,
      `Expected ${expected} write(s) for "${name}", got ${got}. ` +
        `All writes: ${server.scores.writes.map((w) => w.name).join(", ") || "<none>"}`,
    );
  }
);

Then(
  "the most recent write for {string} has killedBy {string}",
  function (this: TestWorld, name: string, by: string) {
    const server = this.requireServer();
    const last = [...server.scores.writes].reverse().find((w) => w.name === name);
    assert.ok(last, `no writes recorded for "${name}"`);
    assert.equal(last.killedBy, by);
  }
);

Then(
  "the most recent write has peak mass {float}",
  function (this: TestWorld, mass: number) {
    const server = this.requireServer();
    const last = server.scores.writes.at(-1);
    assert.ok(last, "no writes recorded");
    assert.equal(last.peakMass, mass);
  }
);

Then(
  "the most recent write has killedBy {string}",
  function (this: TestWorld, by: string) {
    const server = this.requireServer();
    const last = server.scores.writes.at(-1);
    assert.ok(last, "no writes recorded");
    assert.equal(last.killedBy, by);
  }
);

When(
  "the leaderboard records a death for {string} with {int} kills and peak mass {float}",
  async function (this: TestWorld, name: string, kills: number, mass: number) {
    this.requireServer();
    await writeScore(makeRunDoc(name, { kills, peakMass: mass }));
  }
);

When(
  "the leaderboard records a death for {string} with level {int} and time {int}",
  async function (this: TestWorld, name: string, level: number, durationMs: number) {
    this.requireServer();
    await writeScore(makeRunDoc(name, { level, durationMs }));
  }
);

Then(
  "client {string} receives a leaderboard where {string} has level {int} and time {int}",
  { timeout: 5_000 },
  async function (this: TestWorld, label: string, name: string, level: number, durationMs: number) {
    const c = this.requireClient(label);
    const msg = await c.wait((m) => m.t === "leaderboard");
    const entry = msg.top.find((r: { name: string }) => r.name === name);
    assert.ok(entry, `no leaderboard entry for "${name}"`);
    assert.equal(entry.level, level, `Expected ${name} level=${level}, got ${entry.level}`);
    assert.equal(entry.durationMs, durationMs, `Expected ${name} durationMs=${durationMs}, got ${entry.durationMs}`);
  }
);

Then(
  "client {string} receives a leaderboard where {string} has {int} kills and peak mass {float}",
  { timeout: 5_000 },
  async function (this: TestWorld, label: string, name: string, kills: number, mass: number) {
    const c = this.requireClient(label);
    const msg = await c.wait((m) => m.t === "leaderboard");
    const entry = msg.top.find((r: { name: string }) => r.name === name);
    assert.ok(entry, `no leaderboard entry for "${name}"`);
    assert.equal(entry.kills, kills, `Expected ${name} kills=${kills}, got ${entry.kills}`);
    assert.ok(
      Math.abs(entry.peakMass - mass) < 0.01,
      `Expected ${name} peakMass=${mass}, got ${entry.peakMass}`,
    );
  }
);

function makeRunDoc(name: string, over: Partial<ScoreDoc>): ScoreDoc {
  return {
    name,
    color: "#7fcfff",
    kills: 0,
    peakMass: 0,
    hits: 0,
    damage: 0,
    level: 1,
    durationMs: 1000,
    killedBy: null,
    startedAt: new Date(0),
    endedAt: new Date(),
    ipHash: "test",
    weapons: [],
    passives: [],
    evolution: null,
    ...over,
  };
}
