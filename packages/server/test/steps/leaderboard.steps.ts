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
    const idxName = header.indexOf("name");
    const idxColor = header.indexOf("color");
    const idxMass = header.indexOf("finalMass");
    const idxLevel = header.indexOf("level");
    const seed: LeaderboardRow[] = rows.slice(1).map((row) => ({
      name: row[idxName]!,
      color: row[idxColor] ?? "#7fcfff",
      finalMass: Number(row[idxMass]!),
      level: Number(row[idxLevel] ?? "1"),
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
  "the most recent write has finalMass {float}",
  function (this: TestWorld, mass: number) {
    const server = this.requireServer();
    const last = server.scores.writes.at(-1);
    assert.ok(last, "no writes recorded");
    assert.equal(last.finalMass, mass);
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
  "the leaderboard records a death for {string} with finalMass {float}",
  async function (this: TestWorld, name: string, mass: number) {
    this.requireServer();
    const doc: ScoreDoc = {
      name,
      color: "#7fcfff",
      finalMass: mass,
      level: 1,
      kills: 0,
      durationMs: 1000,
      killedBy: null,
      startedAt: new Date(0),
      endedAt: new Date(),
      ipHash: "test",
      weapons: [],
      passives: [],
      evolution: null,
    };
    await writeScore(doc);
  }
);
