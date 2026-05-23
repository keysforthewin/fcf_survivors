import type { LevelUpCard, LevelUpMsg } from "@fcf/shared";
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
  /** Tear down the modal entirely — no more picks coming. */
  teardown: () => void;
  /** True when the user has dismissed (modal hidden) but cards are still pending. */
  isDismissed: () => boolean;
  /** Hide the modal locally + tell server input/weapons are unblocked. */
  dismiss: () => void;
  /** Re-show the modal + tell server input/weapons are blocked again. */
  restore: () => void;
  /** Refresh the card row with a new draw (called when the server rotates to the next queued pick). */
  updateCards: (msg: LevelUpMsg) => void;
}

export function mountLevelUp(net: NetSocket, msg: LevelUpMsg): LevelUpMount {
  const root = document.createElement("div");
  root.className = "levelup-overlay";
  root.innerHTML = `
    <div class="levelup-banner">
      <div class="levelup-banner-label" data-banner-label>LEVEL ${msg.level}</div>
      <div class="levelup-banner-title">Choose your upgrade</div>
      <div class="levelup-banner-queued" data-banner-queued></div>
    </div>
    <div class="levelup-cards" data-cards></div>
    <button class="levelup-skip" type="button">Skip for now (Esc)</button>
  `;
  const cardRow = root.querySelector("[data-cards]") as HTMLElement;
  const skipBtn = root.querySelector(".levelup-skip") as HTMLButtonElement;
  const bannerLabel = root.querySelector("[data-banner-label]") as HTMLElement;
  const bannerQueued = root.querySelector("[data-banner-queued]") as HTMLElement;

  let currentCards: LevelUpCard[] = [];
  let dismissed = false;
  let tornDown = false;
  let cardEls: HTMLButtonElement[] = [];
  let highlighted = 0;
  let inputMode: "mouse" | "keyboard" = "mouse";
  let lastMouseX = -1;
  let lastMouseY = -1;
  /**
   * Set true between sending pickCard and receiving the next LevelUpMsg (or
   * the server signalling no more picks via teardown). Prevents the player
   * from double-picking on the same card set during the round-trip.
   */
  let awaitingResponse = false;

  const setHighlight = (idx: number) => {
    if (idx < 0 || idx >= cardEls.length) return;
    highlighted = idx;
    for (let i = 0; i < cardEls.length; i++) {
      cardEls[i]!.classList.toggle("is-selected", i === idx);
    }
  };

  const renderCards = (cards: LevelUpCard[]) => {
    cardRow.innerHTML = "";
    cardEls = [];
    cards.forEach((card, idx) => {
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
    highlighted = Math.floor(cards.length / 2);
    setHighlight(highlighted);
  };

  const setBanner = (level: number, queued: number) => {
    bannerLabel.textContent = `LEVEL ${level}`;
    bannerQueued.textContent = queued > 0
      ? `${queued} more pick${queued === 1 ? "" : "s"} after this one`
      : "";
  };

  const pick = (idx: number) => {
    if (tornDown || awaitingResponse) return;
    const card = currentCards[idx];
    if (!card) return;
    awaitingResponse = true;
    net.send({ t: "pickCard", cardId: card.id });
    // Don't teardown yet — wait for either the next LevelUpMsg (queue draws
    // the next pick) or a snapshot showing pendingPicks=0 (arena will call
    // teardown then). Hide the card row visually so the player sees a beat.
    cardRow.classList.add("locked");
  };

  skipBtn.addEventListener("click", () => {
    if (!dismissed) dismiss();
  });

  document.body.appendChild(root);

  // Initial render.
  currentCards = msg.cards;
  renderCards(msg.cards);
  setBanner(msg.level, msg.queued);

  const dismiss = () => {
    if (tornDown || dismissed) return;
    dismissed = true;
    net.setLevelUpDismissed(true);
    root.classList.add("dismissed");
  };

  const restore = () => {
    if (tornDown || !dismissed) return;
    dismissed = false;
    net.setLevelUpDismissed(false);
    root.classList.remove("dismissed");
  };

  const updateCards = (next: LevelUpMsg) => {
    if (tornDown) return;
    currentCards = next.cards;
    awaitingResponse = false;
    cardRow.classList.remove("locked");
    renderCards(next.cards);
    setBanner(next.level, next.queued);
  };

  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === "Escape" || k === "Esc") {
      e.preventDefault();
      e.stopPropagation();
      if (dismissed) restore();
      else dismiss();
      return;
    }
    // While dismissed, let movement keys reach the game.
    if (dismissed) return;
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
    if (tornDown) return;
    tornDown = true;
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("mousemove", onMouseMove);
    root.classList.add("closing");
    setTimeout(() => { root.remove(); }, 140);
  };

  return {
    teardown,
    isDismissed: () => dismissed,
    dismiss,
    restore,
    updateCards,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[c]!));
}
