// One-shot migration: collapse duplicate score docs to one-per-player.
//
// Idempotent. Safe to run multiple times; the second run is a no-op.
//
// Reads MONGO_URL and MONGO_DB from env (defaults match the server).
// Usage: bun run scripts/dedupe-scores.ts

import { MongoClient, ObjectId } from "mongodb";

const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB ?? "fcf_survivors";

interface DupeGroup {
  _id: string;
  keep: ObjectId;
  all: ObjectId[];
}

async function main(): Promise<void> {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  console.log(`[dedupe] connected to ${MONGO_URL}/${DB_NAME}`);

  try {
    const coll = client.db(DB_NAME).collection("scores");

    const total = await coll.countDocuments({});
    console.log(`[dedupe] ${total} score doc(s) total`);

    const backfill = await coll.updateMany(
      { nameKey: { $exists: false } },
      [{ $set: { nameKey: { $toLower: "$name" } } }],
    );
    console.log(`[dedupe] backfilled nameKey on ${backfill.modifiedCount} doc(s)`);

    const groups = (await coll
      .aggregate([
        { $sort: { finalMass: -1, endedAt: -1 } },
        {
          $group: {
            _id: "$nameKey",
            keep: { $first: "$_id" },
            all: { $push: "$_id" },
          },
        },
        { $match: { $expr: { $gt: [{ $size: "$all" }, 1] } } },
      ])
      .toArray()) as unknown as DupeGroup[];

    let deleted = 0;
    for (const g of groups) {
      const toDelete = g.all.filter((id) => !id.equals(g.keep));
      if (toDelete.length === 0) continue;
      const r = await coll.deleteMany({ _id: { $in: toDelete } });
      deleted += r.deletedCount ?? 0;
      console.log(`[dedupe] ${g._id}: kept 1, deleted ${toDelete.length}`);
    }
    console.log(`[dedupe] removed ${deleted} duplicate(s) across ${groups.length} name(s)`);

    try {
      await coll.createIndex({ nameKey: 1 }, { unique: true });
      console.log(`[dedupe] unique index on nameKey created`);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("E11000") || msg.includes("duplicate key")) {
        const remaining = await coll
          .aggregate([
            { $group: { _id: "$nameKey", n: { $sum: 1 } } },
            { $match: { n: { $gt: 1 } } },
          ])
          .toArray();
        console.error(`[dedupe] index creation failed; still duplicated: ${JSON.stringify(remaining)}`);
      } else {
        console.error(`[dedupe] index creation failed: ${msg}`);
      }
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
