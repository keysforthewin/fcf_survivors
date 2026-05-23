import {
  setScoresImpl,
  mergeRun,
  careerToRow,
  type ScoreDoc,
  type StoredScore,
  type LeaderboardRow,
  type LeaderboardSort,
  type ScoresImpl,
} from "../../src/db/scores.ts";

export interface MockScores {
  /** Every writeScore() call recorded in order — useful for verifying the server attempted to persist. */
  writes: ScoreDoc[];
  /** Seed an explicit set of leaderboard rows (career bests). */
  setRows(rows: LeaderboardRow[]): void;
  reset(): void;
  install(): void;
  uninstall(): void;
}

/** Adapt a seeded leaderboard row into a stored career record. */
function rowToCareer(row: LeaderboardRow): StoredScore {
  return {
    name: row.name,
    nameKey: row.name.toLowerCase(),
    color: row.color,
    maxKills: row.kills,
    maxPeakMass: row.peakMass,
    maxHits: row.hits,
    maxDamage: row.damage,
    maxLevel: row.level,
    maxDurationMs: row.durationMs ?? 0,
    level: row.level,
    weapons: [],
    passives: [],
    evolution: row.evolution ?? null,
    endedAt: new Date(row.endedAt),
    durationMs: row.durationMs ?? 0,
    killedBy: null,
    startedAt: new Date(0),
    ipHash: "seed",
  };
}

const SORTERS: Record<LeaderboardSort, (a: LeaderboardRow, b: LeaderboardRow) => number> = {
  kills: (a, b) => b.kills - a.kills,
  mass: (a, b) => b.peakMass - a.peakMass,
  hits: (a, b) => b.hits - a.hits,
  damage: (a, b) => b.damage - a.damage,
  level: (a, b) => b.level - a.level,
  time: (a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0),
};

export function mockScores(): MockScores {
  const writes: ScoreDoc[] = [];
  const byNameKey = new Map<string, StoredScore>();

  const impl: ScoresImpl = {
    async writeScore(doc) {
      writes.push(doc);
      const key = doc.name.toLowerCase();
      byNameKey.set(key, mergeRun(byNameKey.get(key) ?? null, doc));
    },
    async topLeaderboard(limit, sort = "kills") {
      return [...byNameKey.values()]
        .map(careerToRow)
        .sort(SORTERS[sort])
        .slice(0, limit);
    },
  };

  return {
    writes,
    setRows(next) {
      byNameKey.clear();
      for (const r of next) byNameKey.set(r.name.toLowerCase(), rowToCareer(r));
    },
    reset() {
      writes.length = 0;
      byNameKey.clear();
    },
    install() { setScoresImpl(impl); },
    uninstall() { setScoresImpl(null); },
  };
}
