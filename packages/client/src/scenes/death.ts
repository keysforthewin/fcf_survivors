import type { EatenMsg, LeaderboardEntry } from "@fcf/shared";
import { WEAPONS, PASSIVES } from "@fcf/shared";

type SortKey = "mass" | "recent" | "kills";
const SORT_LABEL: Record<SortKey, string> = {
  mass: "TOP MASS",
  recent: "RECENT",
  kills: "MOST KILLS",
};

export function showDeath(eaten: EatenMsg, initialLeaderboard: LeaderboardEntry[]): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "death-overlay";
    overlay.innerHTML = `
      <div class="death-card">
        <h1>You were eaten by ${escapeHtml(eaten.byName)}</h1>
        <p class="subtitle">It tasted like victory. For them.</p>
        <div class="death-stats">
          <div class="death-stat"><span class="label">Final mass</span><span class="value">${Math.floor(eaten.finalMass)}</span></div>
          <div class="death-stat"><span class="label">Level</span><span class="value">${eaten.finalLevel}</span></div>
          <div class="death-stat"><span class="label">Kills</span><span class="value">${eaten.kills}</span></div>
          <div class="death-stat"><span class="label">Time</span><span class="value">${formatDuration(eaten.durationMs)}</span></div>
        </div>
        ${renderBuild(eaten)}
        <div class="leaderboard">
          <div class="leaderboard-tabs">
            ${(["mass","recent","kills"] as SortKey[]).map((k, i) => `
              <button type="button" class="leaderboard-tab${i === 0 ? " active" : ""}" data-sort="${k}">${SORT_LABEL[k]}</button>
            `).join("")}
          </div>
          <div class="leaderboard-list" data-leaderboard-list></div>
        </div>
        <button class="play" type="button">DIVE AGAIN</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const listEl = overlay.querySelector("[data-leaderboard-list]") as HTMLElement;
    renderLeaderboard(listEl, initialLeaderboard);

    let currentSort: SortKey = "mass";
    const tabs = Array.from(overlay.querySelectorAll(".leaderboard-tab")) as HTMLElement[];
    for (const tab of tabs) {
      tab.addEventListener("click", async () => {
        const sort = tab.dataset.sort as SortKey;
        if (sort === currentSort) return;
        currentSort = sort;
        for (const t of tabs) t.classList.toggle("active", t === tab);
        listEl.classList.add("loading");
        try {
          const rows = await fetchLeaderboard(sort);
          renderLeaderboard(listEl, rows);
        } catch {
          // best-effort
        } finally {
          listEl.classList.remove("loading");
        }
      });
    }

    overlay.querySelector(".play")!.addEventListener("click", () => {
      overlay.remove();
      resolve();
    });
  });
}

async function fetchLeaderboard(sort: SortKey): Promise<LeaderboardEntry[]> {
  const url = `/leaderboard?sort=${sort}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return await res.json();
}

function renderLeaderboard(el: HTMLElement, rows: LeaderboardEntry[]): void {
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

function renderBuild(eaten: EatenMsg): string {
  const hasBuild = eaten.weapons.length > 0 || eaten.passives.length > 0 || !!eaten.evolution;
  if (!hasBuild) return "";

  const evoTag = eaten.evolution
    ? `<div class="death-evolution">EVOLVED: ${escapeHtml(WEAPONS[eaten.evolution as keyof typeof WEAPONS]?.name ?? eaten.evolution)}</div>`
    : "";

  const wpnRow = eaten.weapons.length === 0
    ? ""
    : `<div class="death-build-row">
         <span class="label">Arsenal</span>
         <span class="death-build-list">
           ${eaten.weapons.map((w) => `
             <span class="death-build-pill">
               ${escapeHtml(WEAPONS[w.id as keyof typeof WEAPONS]?.name ?? w.id)}
               <span class="death-build-pill-tier">L${w.level}</span>
             </span>`).join("")}
         </span>
       </div>`;

  const psvRow = eaten.passives.length === 0
    ? ""
    : `<div class="death-build-row">
         <span class="label">Passives</span>
         <span class="death-build-list">
           ${eaten.passives.map((p) => `
             <span class="death-build-pill subtle">
               ${escapeHtml(PASSIVES[p.id as keyof typeof PASSIVES]?.name ?? p.id)}
               <span class="death-build-pill-tier">×${p.stack}</span>
             </span>`).join("")}
         </span>
       </div>`;

  return `<div class="death-build">${evoTag}${wpnRow}${psvRow}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
