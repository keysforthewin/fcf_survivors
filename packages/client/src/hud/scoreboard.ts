import type { LeaderboardEntry } from "@fcf/shared";
import { type SortKey, SORT_KEYS, SORT_LABEL, renderLeaderboardRows, fetchLeaderboard } from "./leaderboard-view.ts";

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
        ${SORT_KEYS.map((k, i) => `
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
  let currentSort: SortKey = "kills";
  let cache: { sort: SortKey; rows: LeaderboardEntry[]; at: number } | null = null;
  let inFlight: { sort: SortKey; promise: Promise<LeaderboardEntry[]> } | null = null;

  async function load(sort: SortKey, force = false): Promise<void> {
    const now = performance.now();
    if (!force && cache && cache.sort === sort && now - cache.at < CACHE_TTL_MS) {
      renderLeaderboardRows(listEl, cache.rows, sort);
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
      if (visible && currentSort === sort) renderLeaderboardRows(listEl, rows, sort);
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

