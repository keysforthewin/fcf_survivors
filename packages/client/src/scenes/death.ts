import type { EatenMsg, LeaderboardEntry } from "@fcf/shared";
import { WEAPONS, PASSIVES, colorForSpecies, DEFAULT_SPECIES_ID } from "@fcf/shared";
import { loadIdentity, saveIdentity } from "../identity.ts";
import { mountIdentityEditor } from "../hud/identity-editor.ts";
import { GEAR_SVG } from "../render/icons.ts";
import { type SortKey, SORT_KEYS, SORT_LABEL, renderLeaderboardRows, formatStat, formatDuration, fetchLeaderboard } from "../hud/leaderboard-view.ts";

export type DeathChoice = "dive" | "spectate";

export function showDeath(
  eaten: EatenMsg,
  initialLeaderboard: LeaderboardEntry[]
): Promise<DeathChoice> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "death-overlay death-overlay-translucent";
    overlay.innerHTML = `
      <div class="death-card">
        <button class="hud-gear death-gear" type="button" data-gear aria-label="Edit fish">${GEAR_SVG}</button>
        <h1>You were eaten by ${escapeHtml(eaten.byName)}</h1>
        <p class="subtitle">It tasted like victory. For them.</p>
        <div class="death-columns">
          <div class="death-stats">
            <div class="death-stat"><span class="label">Peak mass</span><span class="value">${Math.floor(eaten.peakMass)}</span></div>
            <div class="death-stat"><span class="label">Kills</span><span class="value">${eaten.kills}</span></div>
            <div class="death-stat"><span class="label">Hits</span><span class="value">${eaten.hits}</span></div>
            <div class="death-stat"><span class="label">Damage</span><span class="value">${formatStat(eaten.damage)}</span></div>
            <div class="death-stat"><span class="label">Level</span><span class="value">${eaten.finalLevel}</span></div>
            <div class="death-stat"><span class="label">Time</span><span class="value">${formatDuration(eaten.durationMs)}</span></div>
          </div>
          ${renderBuild(eaten)}
        </div>
        <div class="leaderboard">
          <div class="leaderboard-tabs">
            ${SORT_KEYS.map((k, i) => `
              <button type="button" class="leaderboard-tab${i === 0 ? " active" : ""}" data-sort="${k}">${SORT_LABEL[k]}</button>
            `).join("")}
          </div>
          <div class="leaderboard-list" data-leaderboard-list></div>
        </div>
        <div class="death-actions">
          <button class="play secondary" type="button" data-spectate>SPECTATE</button>
          <button class="play" type="button" data-dive>DIVE AGAIN</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let currentSort: SortKey = "kills";
    const listEl = overlay.querySelector("[data-leaderboard-list]") as HTMLElement;
    renderLeaderboardRows(listEl, initialLeaderboard, currentSort);

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
          renderLeaderboardRows(listEl, rows, sort);
        } catch {
          // best-effort
        } finally {
          listEl.classList.remove("loading");
        }
      });
    }

    overlay.querySelector("[data-dive]")!.addEventListener("click", () => {
      overlay.remove();
      resolve("dive");
    });

    overlay.querySelector("[data-spectate]")!.addEventListener("click", () => {
      overlay.remove();
      resolve("spectate");
    });

    overlay.querySelector("[data-gear]")!.addEventListener("click", () => {
      const stored = loadIdentity();
      const currentName = (window as any).__playerName ?? stored.name ?? "Fish";
      const currentSpecies = (window as any).__playerSpecies ?? stored.species ?? DEFAULT_SPECIES_ID;
      mountIdentityEditor({
        current: { name: currentName, species: currentSpecies },
        onSave: (next) => {
          const color = colorForSpecies(next.species);
          (window as any).__playerName = next.name;
          (window as any).__playerSpecies = next.species;
          (window as any).__playerColor = color;
          saveIdentity({ name: next.name, species: next.species, color });
        },
      });
    });
  });
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
