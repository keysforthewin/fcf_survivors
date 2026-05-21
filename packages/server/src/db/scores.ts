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
}

export interface LeaderboardRow {
  name: string;
  color: string;
  finalMass: number;
  level: number;
  endedAt: number;
}

const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB ?? "fcf_survivors";

let client: MongoClient | null = null;
let scoresColl: Collection<ScoreDoc> | null = null;
let connectAttempted = false;
let connectFailed = false;

/** Test seam: when set, writeScore/topLeaderboard delegate to these instead of Mongo. */
export interface ScoresImpl {
  writeScore?: (doc: ScoreDoc) => Promise<void>;
  topLeaderboard?: (limit: number) => Promise<LeaderboardRow[]>;
}
let _impl: ScoresImpl | null = null;
export function setScoresImpl(impl: ScoresImpl | null): void {
  _impl = impl;
}

export async function ensureMongo(): Promise<Collection<ScoreDoc> | null> {
  if (scoresColl) return scoresColl;
  if (connectFailed) return null;
  if (connectAttempted) return scoresColl;
  connectAttempted = true;
  try {
    const c = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 1500 });
    await c.connect();
    const db = c.db(DB_NAME);
    const coll = db.collection<ScoreDoc>("scores");
    await coll.createIndex({ finalMass: -1 });
    await coll.createIndex({ endedAt: -1 });
    await coll.createIndex({ name: 1, endedAt: -1 });
    client = c;
    scoresColl = coll;
    console.log(`[mongo] connected to ${MONGO_URL}/${DB_NAME}`);
    return coll;
  } catch (err) {
    connectFailed = true;
    console.warn(`[mongo] connection failed — scores will be ephemeral: ${(err as Error).message}`);
    return null;
  }
}

export async function writeScore(doc: ScoreDoc): Promise<void> {
  if (_impl?.writeScore) return _impl.writeScore(doc);
  const coll = await ensureMongo();
  if (!coll) return;
  try {
    await coll.insertOne(doc);
  } catch (err) {
    console.warn(`[mongo] writeScore failed: ${(err as Error).message}`);
  }
}

export async function topLeaderboard(limit = 10): Promise<LeaderboardRow[]> {
  if (_impl?.topLeaderboard) return _impl.topLeaderboard(limit);
  const coll = await ensureMongo();
  if (!coll) return [];
  try {
    const docs = await coll
      .find({}, { projection: { name: 1, color: 1, finalMass: 1, level: 1, endedAt: 1 } })
      .sort({ finalMass: -1 })
      .limit(limit)
      .toArray();
    return docs.map((d) => ({
      name: d.name,
      color: d.color,
      finalMass: d.finalMass,
      level: d.level,
      endedAt: d.endedAt.getTime(),
    }));
  } catch (err) {
    console.warn(`[mongo] leaderboard query failed: ${(err as Error).message}`);
    return [];
  }
}

export async function closeMongo(): Promise<void> {
  if (client) await client.close();
}
