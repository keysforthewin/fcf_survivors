import type { LevelUpCard, LevelUpMsg } from "@fcf/shared";
import { WEAPONS } from "@fcf/shared";
import type { NetSocket } from "../net/socket.ts";

const CARD_ACCENTS: Record<LevelUpCard["kind"], string> = {
  weapon: "#7fcfff",
  upgrade: "#ffd97f",
  passive: "#9affcf",
  evolution: "#ff85a1",
};

const CARD_KIND_LABEL: Record<LevelUpCard["kind"], string> = {
  weapon: "NEW WEAPON",
  upgrade: "UPGRADE",
  passive: "PASSIVE",
  evolution: "EVOLUTION",
};

export interface LevelUpMount {
  teardown: () => void;
}

export function mountLevelUp(net: NetSocket, msg: LevelUpMsg): LevelUpMount {
  const root = document.createElement("div");
  root.className = "levelup-overlay";
  root.innerHTML = `
    <div class="levelup-banner">
      <div class="levelup-banner-label">LEVEL ${msg.level}</div>
      <div class="levelup-banner-title">Choose your upgrade</div>
    </div>
    <div class="levelup-cards"></div>
  `;
  const cardRow = root.querySelector(".levelup-cards") as HTMLElement;

  let chosen = false;

  msg.cards.forEach((card) => {
    const el = document.createElement("button");
    el.className = `levelup-card kind-${card.kind}`;
    el.style.setProperty("--card-accent", CARD_ACCENTS[card.kind]);
    el.innerHTML = `
      <div class="levelup-card-kind">${CARD_KIND_LABEL[card.kind]}</div>
      <div class="levelup-card-title">${escapeHtml(card.title)}</div>
      <div class="levelup-card-desc">${escapeHtml(card.description)}</div>
    `;
    el.addEventListener("click", () => {
      if (chosen) return;
      chosen = true;
      net.send({ t: "pickCard", cardId: card.id });
      teardown();
    });
    cardRow.appendChild(el);
  });

  document.body.appendChild(root);

  // Disable Space (boost) and arrows from triggering scroll while open.
  const blockKeys = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLButtonElement) return;
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"," ","w","a","s","d","W","A","S","D"].includes(e.key)) {
      e.preventDefault();
    }
  };
  window.addEventListener("keydown", blockKeys, true);

  const teardown = () => {
    window.removeEventListener("keydown", blockKeys, true);
    root.classList.add("closing");
    // small fade-out before removal
    setTimeout(() => { root.remove(); }, 140);
  };

  return { teardown };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[c]!));
}
