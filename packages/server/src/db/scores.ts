import { MongoClient, type Collection } from "mongodb";

/** A single completed run, handed to writeScore() when a player dies. */
export interface ScoreDoc {
  name: string;
  color: string;
  kills: number;
  /** Largest mass reached during the run (not the mass at death). */
  peakMass: number;
  hits: number;
  damage: number;
  level: number;
  durationMs: number;
  killedBy: string | null;
  startedAt: Date;
  endedAt: Date;
  ipHash: string;
  weapons: Array<{ id: string; level: number }>;
  passives: Array<{ id: string; stack: number }>;
  evolution: string | null;
}

/**
 * Stored per-name career record (one doc per nameKey). Each stat keeps the
 * player's all-time best across runs; the loadout/level come from their
 * best-kills run; color + endedAt track the latest run. This is the shape
 * persisted in Mongo.
 */
export interface StoredScore {
  name: string;
  /** Lowercased name — the dedup key. */
  nameKey: string;
  color: string;
  maxKills: number;
  maxPeakMass: number;
  maxHits: number;
  maxDamage: number;
  /** Highest level reached across all runs. */
  maxLevel: number;
  /** Longest single-run survival, in ms, across all runs. */
  maxDurationMs: number;
  level: number;
  weapons: Array<{ id: string; level: number }>;
  passives: Array<{ id: string; stack: number }>;
  evolution: string | null;
  endedAt: Date;
  // Latest-run context, retained but not shown on the board.
  durationMs: number;
  killedBy: string | null;
  startedAt: Date;
  ipHash: string;
}

export interface LeaderboardRow {
  name: string;
  color: string;
  kills: number;
  peakMass: number;
  hits: number;
  damage: number;
  /** Highest level reached. */
  level: number;
  /** Longest single-run survival, in ms. */
  durationMs: number;
  endedAt: number;
  evolution?: string | null;
}

export type LeaderboardSort = "kills" | "mass" | "hits" | "damage" | "level" | "time";

/**
 * Merge a completed run into a player's career-bests record. Every numeric
 * stat keeps its all-time max independently; the displayed loadout/level come
 * from the best-kills run (refreshed when this run ties or beats the prior kill
 * record); color + endedAt track the latest run.
 */
export function mergeRun(existing: StoredScore | null, run: ScoreDoc): StoredScore {
  const takeLoadout = run.kills >= (existing?.maxKills ?? -1);
  return {
    name: run.name,
    nameKey: run.name.toLowerCase(),
    color: run.color,
    maxKills: Math.max(existing?.maxKills ?? 0, run.kills),
    maxPeakMass: Math.max(existing?.maxPeakMass ?? 0, run.peakMass),
    maxHits: Math.max(existing?.maxHits ?? 0, run.hits),
    maxDamage: Math.max(existing?.maxDamage ?? 0, run.damage),
    // Independent all-time maxes; fall back to legacy fields for docs that predate them.
    maxLevel: Math.max(existing?.maxLevel ?? existing?.level ?? 0, run.level),
    maxDurationMs: Math.max(existing?.maxDurationMs ?? existing?.durationMs ?? 0, run.durationMs),
    level: takeLoadout ? run.level : existing?.level ?? run.level,
    weapons: takeLoadout ? run.weapons : existing?.weapons ?? run.weapons,
    passives: takeLoadout ? run.passives : existing?.passives ?? run.passives,
    evolution: takeLoadout ? run.evolution : existing?.evolution ?? null,
    endedAt: run.endedAt,
    durationMs: run.durationMs,
    killedBy: run.killedBy,
    startedAt: run.startedAt,
    ipHash: run.ipHash,
  };
}

/** Project a stored career record onto the wire/leaderboard row shape. */
export function careerToRow(c: StoredScore): LeaderboardRow {
  return {
    name: c.name,
    color: c.color,
    kills: c.maxKills ?? 0,
    peakMass: c.maxPeakMass ?? 0,
    hits: c.maxHits ?? 0,
    damage: c.maxDamage ?? 0,
    level: c.maxLevel ?? c.level ?? 0,
    durationMs: c.maxDurationMs ?? c.durationMs ?? 0,
    endedAt: c.endedAt.getTime(),
    evolution: c.evolution ?? null,
  };
}

const QUEUE_CAP = 200;
/** After a failed connect, wait this long before trying again (avoids hammering). */
const RECONNECT_BACKOFF_MS = 3000;

// Read at connect time, not module load, so a server that boots before Mongo
// (e.g. `bun run dev` racing `docker compose up -d mongo`) still picks up the
// right target on a later retry, and tests can repoint it.
const mongoUrl = (): string => process.env.MONGO_URL ?? "mongodb://localhost:27017";
const mongoDb = (): string => process.env.MONGO_DB ?? "fcf_survivors";

let client: MongoClient | null = null;
let scoresColl: Collection<StoredScore> | null = null;
/** Shared promise while a connect is in flight, so concurrent callers don't open multiple clients. */
let connectInFlight: Promise<Collection<StoredScore> | null> | null = null;
/** Epoch ms before which we won't re-attempt a connect after a recent failure. */
let nextConnectAt = 0;
const pendingWrites: ScoreDoc[] = [];

/** Test seam: when set, writeScore/topLeaderboard delegate to these instead of Mongo. */
export interface ScoresImpl {
  writeScore?: (doc: ScoreDoc) => Promise<void>;
  topLeaderboard?: (limit: number, sort?: LeaderboardSort) => Promise<LeaderboardRow[]>;
}
let _impl: ScoresImpl | null = null;
export function setScoresImpl(impl: ScoresImpl | null): void {
  _impl = impl;
}

/**
 * Lazily connect to Mongo, retrying on later calls instead of latching failure.
 * The first attempt happens at boot (fire-and-forget); if Mongo isn't up yet it
 * fails, queues writes, and backs off — then the next writeScore / leaderboard
 * query (or the 15s periodic broadcast) reconnects and flushes the queue. This
 * is what keeps "queues up to 200 docs and flushes on reconnect" actually true.
 */
export async function ensureMongo(): Promise<Collection<StoredScore> | null> {
  if (scoresColl) return scoresColl;
  if (connectInFlight) return connectInFlight;
  if (Date.now() < nextConnectAt) return null; // backing off after a recent failure
  connectInFlight = (async () => {
    const url = mongoUrl();
    const dbName = mongoDb();
    try {
      const c = new MongoClient(url, { serverSelectionTimeoutMS: 1500 });
      await c.connect();
      const coll = c.db(dbName).collection<StoredScore>("scores");
      await coll.createIndex({ maxKills: -1 });
      await coll.createIndex({ maxPeakMass: -1 });
      await coll.createIndex({ maxHits: -1 });
      await coll.createIndex({ maxDamage: -1 });
      await coll.createIndex({ maxLevel: -1 });
      await coll.createIndex({ maxDurationMs: -1 });
      await migrateNameKey(coll);
      await coll.createIndex({ nameKey: 1 }, { unique: true });
      await coll.createIndex({ "weapons.id": 1 });
      client = c;
      scoresColl = coll;
      console.log(`[mongo] connected to ${url}/${dbName}`);
      await flushPendingWrites();
      return coll;
    } catch (err) {
      nextConnectAt = Date.now() + RECONNECT_BACKOFF_MS;
      console.warn(`[mongo] connection failed — queuing scores, will retry: ${(err as Error).message}`);
      return null;
    } finally {
      connectInFlight = null;
    }
  })();
  return connectInFlight;
}

/**
 * Idempotent migration for the unique nameKey index. Backfills nameKey on docs
 * that predate it, drops nameless docs, then collapses duplicates by keeping
 * the highest-scoring doc per nameKey (best-effort across legacy `finalMass`
 * and current `maxKills` schemas). Safe to run on every boot.
 */
async function migrateNameKey(coll: Collection<StoredScore>): Promise<void> {
  const missing = coll.find({
    $or: [{ nameKey: { $exists: false } }, { nameKey: { $eq: null as any } }],
  });
  let backfilled = 0;
  let dropped = 0;
  for await (const doc of missing) {
    const name = typeof doc.name === "string" ? doc.name : "";
    if (name.length === 0) {
      await coll.deleteOne({ _id: (doc as any)._id });
      dropped++;
      continue;
    }
    await coll.updateOne({ _id: (doc as any)._id }, { $set: { nameKey: name.toLowerCase() } });
    backfilled++;
  }

  const groups = await coll
    .aggregate<{ _id: string; ids: Array<{ id: unknown; score: number }> }>([
      { $match: { nameKey: { $type: "string" } } },
      {
        $group: {
          _id: "$nameKey",
          ids: { $push: { id: "$_id", score: { $ifNull: ["$maxKills", { $ifNull: ["$finalMass", 0] }] } } },
        },
      },
      { $match: { $expr: { $gt: [{ $size: "$ids" }, 1] } } },
    ])
    .toArray();
  let deduped = 0;
  for (const g of groups) {
    const sorted = [...g.ids].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const toDelete = sorted.slice(1).map((d) => d.id);
    if (toDelete.length > 0) {
      const r = await coll.deleteMany({ _id: { $in: toDelete as any } });
      deduped += r.deletedCount ?? 0;
    }
  }

  if (backfilled || dropped || deduped) {
    console.log(`[mongo] migrate nameKey: backfilled=${backfilled} dropped=${dropped} deduped=${deduped}`);
  }
}

/**
 * Upsert a run into the player's career record keyed by nameKey. Read-modify-
 * write through mergeRun: low write volume (one per death) on a single-process
 * server makes this safe enough; the unique nameKey index plus the writeScore
 * retry queue cover the rare concurrent-write-for-same-name case.
 */
async function upsertScore(coll: Collection<StoredScore>, run: ScoreDoc): Promise<void> {
  const nameKey = run.name.toLowerCase();
  const existing = await coll.findOne({ nameKey });
  const merged = mergeRun(existing ?? null, run);
  await coll.replaceOne({ nameKey }, merged, { upsert: true });
}

async function flushPendingWrites(): Promise<void> {
  if (!scoresColl) return;
  if (pendingWrites.length === 0) return;
  const batch = pendingWrites.splice(0, pendingWrites.length);
  let flushed = 0;
  const failed: ScoreDoc[] = [];
  for (const doc of batch) {
    try {
      await upsertScore(scoresColl, doc);
      flushed++;
    } catch (err) {
      console.warn(`[mongo] flush upsert failed: ${(err as Error).message}`);
      failed.push(doc);
    }
  }
  if (flushed > 0) console.log(`[mongo] flushed ${flushed} queued score(s) on reconnect`);
  if (failed.length > 0) {
    for (const d of failed) {
      if (pendingWrites.length < QUEUE_CAP) pendingWrites.push(d);
    }
  }
}

export async function writeScore(doc: ScoreDoc): Promise<void> {
  if (_impl?.writeScore) return _impl.writeScore(doc);
  const coll = await ensureMongo();
  if (!coll) {
    if (pendingWrites.length < QUEUE_CAP) pendingWrites.push(doc);
    return;
  }
  try {
    await upsertScore(coll, doc);
  } catch (err) {
    console.warn(`[mongo] writeScore failed, queuing: ${(err as Error).message}`);
    if (pendingWrites.length < QUEUE_CAP) pendingWrites.push(doc);
  }
}

const SORT_FIELDS: Record<LeaderboardSort, Record<string, 1 | -1>> = {
  kills: { maxKills: -1 },
  mass: { maxPeakMass: -1 },
  hits: { maxHits: -1 },
  damage: { maxDamage: -1 },
  level: { maxLevel: -1 },
  time: { maxDurationMs: -1 },
};

export async function topLeaderboard(limit = 10, sort: LeaderboardSort = "kills"): Promise<LeaderboardRow[]> {
  if (_impl?.topLeaderboard) return _impl.topLeaderboard(limit, sort);
  const coll = await ensureMongo();
  if (!coll) return [];
  try {
    const docs = await coll
      .find(
        {},
        {
          projection: {
            name: 1, color: 1, maxKills: 1, maxPeakMass: 1,
            maxHits: 1, maxDamage: 1, maxLevel: 1, maxDurationMs: 1,
            level: 1, durationMs: 1, endedAt: 1, evolution: 1,
          },
        },
      )
      .sort(SORT_FIELDS[sort])
      .limit(limit)
      .toArray();
    return docs.map((d) => careerToRow(d as StoredScore));
  } catch (err) {
    console.warn(`[mongo] leaderboard query failed: ${(err as Error).message}`);
    return [];
  }
}

export async function closeMongo(): Promise<void> {
  if (client) await client.close();
  client = null;
  scoresColl = null;
  connectInFlight = null;
  nextConnectAt = 0;
}
