import {
  setScoresImpl,
  type ScoreDoc,
  type LeaderboardRow,
  type ScoresImpl,
} from "../../src/db/scores.ts";

export interface MockScores {
  /** Every writeScore() call recorded in order — useful for verifying the server attempted to persist. */
  writes: ScoreDoc[];
  /** Seed an explicit set of leaderboard rows (also subject to dedup). */
  setRows(rows: LeaderboardRow[]): void;
  reset(): void;
  install(): void;
  uninstall(): void;
}

function docToRow(doc: ScoreDoc): LeaderboardRow {
  return {
    name: doc.name,
    color: doc.color,
    finalMass: doc.finalMass,
    level: doc.level,
    endedAt: doc.endedAt.getTime(),
    evolution: doc.evolution,
  };
}

export function mockScores(): MockScores {
  const writes: ScoreDoc[] = [];
  const byNameKey = new Map<string, LeaderboardRow>();

  function upsert(row: LeaderboardRow): void {
    const key = row.name.toLowerCase();
    const existing = byNameKey.get(key);
    if (!existing || row.finalMass > existing.finalMass) {
      byNameKey.set(key, row);
    }
  }

  const impl: ScoresImpl = {
    async writeScore(doc) {
      writes.push(doc);
      upsert(docToRow(doc));
    },
    async topLeaderboard(limit) {
      return [...byNameKey.values()]
        .sort((a, b) => b.finalMass - a.finalMass)
        .slice(0, limit);
    },
  };

  return {
    writes,
    setRows(next) {
      byNameKey.clear();
      for (const r of next) upsert(r);
    },
    reset() {
      writes.length = 0;
      byNameKey.clear();
    },
    install() { setScoresImpl(impl); },
    uninstall() { setScoresImpl(null); },
  };
}
