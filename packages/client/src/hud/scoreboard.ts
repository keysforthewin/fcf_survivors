import type { LeaderboardEntry } from "@fcf/shared";
import { WEAPONS } from "@fcf/shared";

type SortKey = "mass" | "recent" | "kills";
const SORT_LABEL: Record<SortKey, string> = {
  mass: "TOP MASS",
  recent: "RECENT",
  kills: "MOST KILLS",
};

const CACHE_TTL_MS = 5000;

export interface ScoreboardHud {
  /** Force-show (used for testing). The user toggles via F2. */
  show(): void;
  hide(): void;
  toggle(): void;
  teardown(): void;
}

export function mountScoreboardHud(): ScoreboardHud {
  const root = document.createElement("div");
  root.className = "scoreboard-overlay";
  root.style.display = "none";
  root.innerHTML = `
    <div class="scoreboard-panel">
      <div class="scoreboard-header">
        <span class="scoreboard-title">GLOBAL HIGH SCORES</span>
        <span class="scoreboard-hint">F2 to close</span>
      </div>
      <div class="leaderboard-tabs">
        ${(["mass","recent","kills"] as SortKey[]).map((k, i) => `
          <button type="button" class="leaderboard-tab${i === 0 ? " active" : ""}" data-sort="${k}">${SORT_LABEL[k]}</button>
        `).join("")}
      </div>
      <div class="scoreboard-list-wrap">
        <div class="leaderboard-list" data-leaderboard-list></div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const listEl = root.querySelector("[data-leaderboard-list]") as HTMLElement;
  const tabs = Array.from(root.querySelectorAll(".leaderboard-tab")) as HTMLElement[];

  let visible = false;
  let currentSort: SortKey = "mass";
  let cache: { sort: SortKey; rows: LeaderboardEntry[]; at: number } | null = null;
  let inFlight: { sort: SortKey; promise: Promise<LeaderboardEntry[]> } | null = null;

  async function load(sort: SortKey, force = false): Promise<void> {
    const now = performance.now();
    if (!force && cache && cache.sort === sort && now - cache.at < CACHE_TTL_MS) {
      renderRows(listEl, cache.rows);
      return;
    }
    if (inFlight && inFlight.sort === sort) {
      await inFlight.promise;
      return;
    }
    listEl.classList.add("loading");
    const promise = fetchLeaderboard(sort);
    inFlight = { sort, promise };
    try {
      const rows = await promise;
      cache = { sort, rows, at: performance.now() };
      if (visible && currentSort === sort) renderRows(listEl, rows);
    } catch {
      // best-effort — leave previous content
    } finally {
      if (inFlight && inFlight.sort === sort) inFlight = null;
      listEl.classList.remove("loading");
    }
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const sort = (tab.dataset.sort ?? "mass") as SortKey;
      if (sort === currentSort && cache?.sort === sort) return;
      currentSort = sort;
      for (const t of tabs) t.classList.toggle("active", t === tab);
      void load(sort);
    });
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === "F2") {
      e.preventDefault();
      api.toggle();
    } else if (e.key === "Escape" && visible) {
      api.hide();
    }
  }
  window.addEventListener("keydown", onKey);

  const api: ScoreboardHud = {
    show() {
      if (visible) return;
      visible = true;
      root.style.display = "flex";
      void load(currentSort);
    },
    hide() {
      if (!visible) return;
      visible = false;
      root.style.display = "none";
    },
    toggle() {
      if (visible) api.hide();
      else api.show();
    },
    teardown() {
      window.removeEventListener("keydown", onKey);
      root.remove();
    },
  };
  return api;
}

async function fetchLeaderboard(sort: SortKey): Promise<LeaderboardEntry[]> {
  const res = await fetch(`/leaderboard?sort=${sort}`);
  if (!res.ok) return [];
  return await res.json();
}

function renderRows(el: HTMLElement, rows: LeaderboardEntry[]): void {
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
      </span>
      <span class="leaderboard-mass">${Math.floor(row.finalMass)}</span>
    </div>
  `).join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
