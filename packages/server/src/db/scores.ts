import { MongoClient, type Collection } from "mongodb";

export interface ScoreDoc {
  name: string;
  color: string;
  finalMass: number;
  level: number;
  kills: number;
  durationMs: number;
  killedBy: string | null;
  startedAt: Date;
  endedAt: Date;
  ipHash: string;
  weapons: Array<{ id: string; level: number }>;
  passives: Array<{ id: string; stack: number }>;
  evolution: string | null;
}

export interface LeaderboardRow {
  name: string;
  color: string;
  finalMass: number;
  level: number;
  endedAt: number;
  evolution?: string | null;
}

export type LeaderboardSort = "mass" | "recent" | "kills";

const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB ?? "fcf_survivors";
const QUEUE_CAP = 200;

let client: MongoClient | null = null;
let scoresColl: Collection<ScoreDoc> | null = null;
let connectAttempted = false;
let connectFailed = false;
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

export async function ensureMongo(): Promise<Collection<ScoreDoc> | null> {
  if (scoresColl) return scoresColl;
  if (connectAttempted && connectFailed) return null;
  if (connectAttempted) return scoresColl;
  connectAttempted = true;
  try {
    const c = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 1500 });
    await c.connect();
    const db = c.db(DB_NAME);
    const coll = db.collection<ScoreDoc>("scores");
    await coll.createIndex({ finalMass: -1 });
    await coll.createIndex({ endedAt: -1 });
    await coll.createIndex({ kills: -1 });
    await coll.createIndex({ name: 1, endedAt: -1 });
    await coll.createIndex({ "weapons.id": 1 });
    client = c;
    scoresColl = coll;
    console.log(`[mongo] connected to ${MONGO_URL}/${DB_NAME}`);
    await flushPendingWrites();
    return coll;
  } catch (err) {
    connectFailed = true;
    console.warn(`[mongo] connection failed — scores will be ephemeral: ${(err as Error).message}`);
    return null;
  }
}

async function flushPendingWrites(): Promise<void> {
  if (!scoresColl) return;
  if (pendingWrites.length === 0) return;
  const batch = pendingWrites.splice(0, pendingWrites.length);
  try {
    await scoresColl.insertMany(batch);
    console.log(`[mongo] flushed ${batch.length} queued score(s) on reconnect`);
  } catch (err) {
    console.warn(`[mongo] flush failed; re-queueing ${batch.length} scores: ${(err as Error).message}`);
    // re-queue (cap respected)
    for (const d of batch) {
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
    await coll.insertOne(doc);
  } catch (err) {
    console.warn(`[mongo] writeScore failed, queuing: ${(err as Error).message}`);
    if (pendingWrites.length < QUEUE_CAP) pendingWrites.push(doc);
  }
}

const SORT_FIELDS: Record<LeaderboardSort, Record<string, 1 | -1>> = {
  mass: { finalMass: -1 },
  recent: { endedAt: -1 },
  kills: { kills: -1 },
};

export async function topLeaderboard(limit = 10, sort: LeaderboardSort = "mass"): Promise<LeaderboardRow[]> {
  if (_impl?.topLeaderboard) return _impl.topLeaderboard(limit, sort);
  const coll = await ensureMongo();
  if (!coll) return [];
  try {
    const docs = await coll
      .find({}, { projection: { name: 1, color: 1, finalMass: 1, level: 1, endedAt: 1, evolution: 1 } })
      .sort(SORT_FIELDS[sort])
      .limit(limit)
      .toArray();
    return docs.map((d) => ({
      name: d.name,
      color: d.color,
      finalMass: d.finalMass,
      level: d.level,
      endedAt: d.endedAt.getTime(),
      evolution: (d as any).evolution ?? null,
    }));
  } catch (err) {
    console.warn(`[mongo] leaderboard query failed: ${(err as Error).message}`);
    return [];
  }
}

export async function closeMongo(): Promise<void> {
  if (client) await client.close();
}
