import type { RosterEntry } from "@fcf/shared";

export interface RosterHud {
  update(players: RosterEntry[]): void;
  teardown(): void;
}

export function mountRosterHud(): RosterHud {
  const root = document.createElement("div");
  root.className = "roster";
  root.innerHTML = `<div class="roster-header">PLAYERS</div><div class="roster-body"></div>`;
  document.body.appendChild(root);
  const body = root.querySelector(".roster-body") as HTMLElement;

  return {
    update(players) {
      body.innerHTML = players
        .map((p) => `
          <div class="roster-row${p.isMe ? " is-me" : ""}">
            <span class="roster-color" style="background:${escape(p.color)}"></span>
            <span class="roster-name">${escape(p.name)}</span>
            <span class="roster-mass">${Math.floor(p.mass)}</span>
          </div>
        `)
        .join("");
    },
    teardown() {
      root.remove();
    },
  };
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
