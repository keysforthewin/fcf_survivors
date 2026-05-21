import {
  setScoresImpl,
  type ScoreDoc,
  type LeaderboardRow,
  type ScoresImpl,
} from "../../src/db/scores.ts";

export interface MockScores {
  /** Score documents passed to writeScore(), in order. */
  writes: ScoreDoc[];
  /** Replace the rows that topLeaderboard() will return. */
  setRows(rows: LeaderboardRow[]): void;
  reset(): void;
  install(): void;
  uninstall(): void;
}

export function mockScores(): MockScores {
  const writes: ScoreDoc[] = [];
  let rows: LeaderboardRow[] = [];
  const impl: ScoresImpl = {
    async writeScore(doc) {
      writes.push(doc);
    },
    async topLeaderboard(limit) {
      const sorted = [...rows].sort((a, b) => b.finalMass - a.finalMass);
      return sorted.slice(0, limit);
    },
  };
  return {
    writes,
    setRows(next) { rows = next; },
    reset() {
      writes.length = 0;
      rows = [];
    },
    install() { setScoresImpl(impl); },
    uninstall() { setScoresImpl(null); },
  };
}
