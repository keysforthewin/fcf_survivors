import type { EatenMsg, LeaderboardEntry } from "@fcf/shared";

export function showDeath(eaten: EatenMsg, leaderboard: LeaderboardEntry[]): Promise<void> {
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
        <div class="leaderboard">
          <h3>Top fish</h3>
          ${leaderboard.length === 0
            ? `<div class="leaderboard-row"><span class="leaderboard-name" style="color:var(--muted)">No runs yet.</span></div>`
            : leaderboard.slice(0, 8).map((row, i) => `
                <div class="leaderboard-row">
                  <span class="leaderboard-rank">#${i + 1}</span>
                  <span class="leaderboard-name">
                    <span class="leaderboard-dot" style="background:${row.color}"></span>
                    ${escapeHtml(row.name)}
                  </span>
                  <span class="leaderboard-mass">${Math.floor(row.finalMass)}</span>
                </div>
              `).join("")
          }
        </div>
        <button class="play" type="button">DIVE AGAIN</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector(".play")!.addEventListener("click", () => {
      overlay.remove();
      resolve();
    });
  });
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
