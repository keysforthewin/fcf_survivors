import type { LeaderboardEntry } from "@fcf/shared";
import { WEAPONS } from "@fcf/shared";

/** Leaderboard sort orders, in tab display order — kills is the primary metric. */
export type SortKey = "kills" | "mass" | "hits" | "damage" | "level" | "time";

export const SORT_KEYS: SortKey[] = ["kills", "mass", "hits", "damage", "level", "time"];

export const SORT_LABEL: Record<SortKey, string> = {
  kills: "MOST KILLS",
  mass: "TOP MASS",
  hits: "HITS",
  damage: "DAMAGE",
  level: "HIGHEST LEVEL",
  time: "LONGEST RUN",
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Compact number for the damage column: 4200 → "4.2k", 38000 → "38k". */
export function formatStat(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.floor(n)}`;
}

/** Survival time as "Xm YYs". */
export function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

/**
 * Fetch a leaderboard page over HTTP. The path is prefixed with the Vite base
 * (import.meta.env.BASE_URL) so it resolves correctly under a deploy sub-path
 * like /survivors/ — mirroring how the WebSocket URL is built in main.ts. A
 * bare "/leaderboard" 404s in production, where nginx only proxies
 * ${BASE_PATH}leaderboard. BASE_URL always ends in "/", so this is just
 * "/leaderboard?..." in dev.
 */
export async function fetchLeaderboard(sort: SortKey): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}leaderboard?sort=${sort}`);
  if (!res.ok) return [];
  return (await res.json()) as LeaderboardEntry[];
}

/** The big right-aligned number for the active sort. */
function primaryValue(row: LeaderboardEntry, sort: SortKey): string {
  switch (sort) {
    case "kills": return `${row.kills}`;
    case "mass": return `${Math.floor(row.peakMass)}`;
    case "hits": return `${row.hits}`;
    case "damage": return formatStat(row.damage);
    case "level": return `Lv ${row.level}`;
    case "time": return formatDuration(row.durationMs ?? 0);
  }
}

/**
 * Render the top rows into `el`. The active sort's metric is the primary number;
 * a secondary line surfaces all four stats so every tab shows the full picture.
 */
export function renderLeaderboardRows(el: HTMLElement, rows: LeaderboardEntry[], sort: SortKey): void {
  if (rows.length === 0) {
    el.innerHTML = `<div class="leaderboard-row"><span class="leaderboard-name" style="color:var(--muted)">No runs yet.</span></div>`;
    return;
  }
  el.innerHTML = rows.slice(0, 10).map((row, i) => `
    <div class="leaderboard-row">
      <span class="leaderboard-rank">#${i + 1}</span>
      <span class="leaderboard-name">
        <span class="leaderboard-dot" style="background:${escapeHtml(row.color)}"></span>
        ${escapeHtml(row.name)}
        ${row.evolution ? `<span class="leaderboard-evo">${escapeHtml(WEAPONS[row.evolution as keyof typeof WEAPONS]?.name ?? row.evolution)}</span>` : ""}
        <span class="leaderboard-sub">${row.kills} kills · ${Math.floor(row.peakMass)} mass · ${formatStat(row.damage)} dmg · ${row.hits} hits · Lv ${row.level} · ${formatDuration(row.durationMs ?? 0)}</span>
      </span>
      <span class="leaderboard-mass">${primaryValue(row, sort)}</span>
    </div>
  `).join("");
}
