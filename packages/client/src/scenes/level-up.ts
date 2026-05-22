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
  const cardEls: HTMLButtonElement[] = [];
  let highlighted = Math.floor(msg.cards.length / 2);
  let inputMode: "mouse" | "keyboard" = "mouse";
  let lastMouseX = -1;
  let lastMouseY = -1;

  const setHighlight = (idx: number) => {
    if (idx < 0 || idx >= cardEls.length) return;
    highlighted = idx;
    for (let i = 0; i < cardEls.length; i++) {
      cardEls[i]!.classList.toggle("is-selected", i === idx);
    }
  };

  const pick = (idx: number) => {
    if (chosen) return;
    const card = msg.cards[idx];
    if (!card) return;
    chosen = true;
    net.send({ t: "pickCard", cardId: card.id });
    teardown();
  };

  msg.cards.forEach((card, idx) => {
    const el = document.createElement("button");
    el.className = `levelup-card kind-${card.kind}`;
    el.tabIndex = -1;
    el.style.setProperty("--card-accent", CARD_ACCENTS[card.kind]);
    el.innerHTML = `
      <div class="levelup-card-kind">${CARD_KIND_LABEL[card.kind]}</div>
      <div class="levelup-card-title">${escapeHtml(card.title)}</div>
      <div class="levelup-card-desc">${escapeHtml(card.description)}</div>
    `;
    el.addEventListener("click", () => pick(idx));
    el.addEventListener("mouseenter", () => {
      if (inputMode !== "mouse") return;
      setHighlight(idx);
    });
    cardRow.appendChild(el);
    cardEls.push(el);
  });

  document.body.appendChild(root);
  setHighlight(highlighted);

  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === "a" || k === "A" || k === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      inputMode = "keyboard";
      setHighlight(Math.max(0, highlighted - 1));
      return;
    }
    if (k === "d" || k === "D" || k === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      inputMode = "keyboard";
      setHighlight(Math.min(cardEls.length - 1, highlighted + 1));
      return;
    }
    if (k === " " || k === "Spacebar" || k === "Space" || k === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      pick(highlighted);
      return;
    }
    // Swallow other movement keys so they don't leak into the underlying game.
    if (["ArrowUp", "ArrowDown", "w", "W", "s", "S"].includes(k)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener("keydown", onKey, true);

  const onMouseMove = (e: MouseEvent) => {
    if (e.clientX === lastMouseX && e.clientY === lastMouseY) return;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    inputMode = "mouse";
  };
  window.addEventListener("mousemove", onMouseMove);

  const teardown = () => {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("mousemove", onMouseMove);
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
