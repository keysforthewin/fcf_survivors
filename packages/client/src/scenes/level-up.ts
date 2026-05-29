import type { LevelUpCard, LevelUpMsg } from "@fcf/shared";
import type { NetSocket } from "../net/socket.ts";
import { iconUrl, iconIdForCard } from "../render/icons.ts";

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
  /** Live update of re-roll/banish token counts (called from snapshots as fruit is collected). */
  setCurrency: (rerolls: number, banishes: number) => void;
}

export function mountLevelUp(net: NetSocket, msg: LevelUpMsg): LevelUpMount {
  const root = document.createElement("div");
  root.className = "levelup-overlay";
  root.innerHTML = `
    <div class="levelup-banner">
      <div class="levelup-banner-label" data-banner-label>LEVEL ${msg.level}</div>
      <div class="levelup-banner-title">Choose your upgrade</div>
      <div class="levelup-banner-queued" data-banner-queued></div>
      <div class="levelup-banner-resources" data-banner-resources></div>
    </div>
    <div class="levelup-cards" data-cards></div>
    <button class="levelup-skip" type="button">Skip for now (Esc)</button>
  `;
  const cardRow = root.querySelector("[data-cards]") as HTMLElement;
  const skipBtn = root.querySelector(".levelup-skip") as HTMLButtonElement;
  const bannerLabel = root.querySelector("[data-banner-label]") as HTMLElement;
  const bannerQueued = root.querySelector("[data-banner-queued]") as HTMLElement;
  const bannerResources = root.querySelector("[data-banner-resources]") as HTMLElement;

  let rerolls = msg.rerolls;
  let banishes = msg.banishes;
  // Cleared when the next LevelUpMsg arrives (or by a safety timeout) — guards
  // against a click landing before the swapped card round-trips back.
  let actionPending = false;
  let actionTimer: ReturnType<typeof setTimeout> | null = null;

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

  // Brief guard between firing a re-roll/banish and the swapped draw round-tripping
  // back. Cleared by updateCards or a safety timeout. (Server validates by cardId,
  // so a stray double-click can't double-spend regardless — this is just for UX.)
  const beginAction = () => {
    actionPending = true;
    cardRow.classList.add("acting");
    if (actionTimer) clearTimeout(actionTimer);
    actionTimer = setTimeout(endAction, 600);
  };
  const endAction = () => {
    actionPending = false;
    cardRow.classList.remove("acting");
    if (actionTimer) { clearTimeout(actionTimer); actionTimer = null; }
  };

  const doReroll = (cardId: string) => {
    if (tornDown || dismissed || actionPending || rerolls <= 0) return;
    beginAction();
    net.rerollCard(cardId);
  };
  const doBanish = (cardId: string) => {
    if (tornDown || dismissed || actionPending || banishes <= 0) return;
    beginAction();
    net.banishCard(cardId);
  };

  // Update the banner token tally + show/hide each card's action buttons.
  const renderResources = () => {
    const parts: string[] = [];
    if (rerolls > 0) parts.push(`<span class="levelup-resource reroll">⟲ ${rerolls} re-roll${rerolls === 1 ? "" : "s"}</span>`);
    if (banishes > 0) parts.push(`<span class="levelup-resource banish">✕ ${banishes} banish${banishes === 1 ? "" : "es"}</span>`);
    bannerResources.innerHTML = parts.join("");
    for (const el of cardEls) {
      const rr = el.querySelector(".levelup-card-reroll") as HTMLElement | null;
      const bn = el.querySelector(".levelup-card-banish") as HTMLElement | null;
      const actions = el.querySelector(".levelup-card-actions") as HTMLElement | null;
      if (rr) rr.style.display = rerolls > 0 ? "" : "none";
      if (bn) bn.style.display = banishes > 0 ? "" : "none";
      if (actions) actions.style.display = (rerolls > 0 || banishes > 0) ? "" : "none";
    }
  };

  // Build one card tile. `idx` is the slot position (stable for the life of the
  // draw); `card.id` drives the re-roll/banish target. Pulled out of renderCards
  // so updateCards can rebuild a single tile in place without touching the others.
  const buildCardEl = (card: LevelUpCard, idx: number): HTMLButtonElement => {
    const el = document.createElement("button");
    el.className = `levelup-card kind-${card.kind}`;
    el.tabIndex = -1;
    el.style.setProperty("--card-accent", CARD_ACCENTS[card.kind]);
    const iconId = iconIdForCard(card.id);
    const iconHtml = iconId
      ? `<div class="levelup-card-icon" style="background-image:url('${iconUrl(iconId)}')"></div>`
      : "";
    // Action controls are <div role="button"> rather than <button> — nesting a
    // real button inside the card <button> is invalid HTML.
    el.innerHTML = `
      ${iconHtml}
      <div class="levelup-card-kind">${CARD_KIND_LABEL[card.kind]}</div>
      <div class="levelup-card-title">${escapeHtml(card.title)}</div>
      <div class="levelup-card-desc">${escapeHtml(card.description)}</div>
      <div class="levelup-card-actions">
        <div class="levelup-card-reroll" role="button" tabindex="-1">Re-roll</div>
        <div class="levelup-card-banish" role="button" tabindex="-1">Banish</div>
      </div>
    `;
    el.addEventListener("click", () => pick(idx));
    el.addEventListener("mouseenter", () => {
      if (inputMode !== "mouse") return;
      setHighlight(idx);
    });
    const rr = el.querySelector(".levelup-card-reroll") as HTMLElement;
    rr.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); doReroll(card.id); });
    const bn = el.querySelector(".levelup-card-banish") as HTMLElement;
    bn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); doBanish(card.id); });
    return el;
  };

  const renderCards = (cards: LevelUpCard[]) => {
    cardRow.innerHTML = "";
    cardEls = cards.map((card, idx) => {
      const el = buildCardEl(card, idx);
      cardRow.appendChild(el);
      return el;
    });
    highlighted = Math.floor(cards.length / 2);
    setHighlight(highlighted);
    renderResources();
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
    const prev = currentCards;
    currentCards = next.cards;
    rerolls = next.rerolls;
    banishes = next.banishes;
    awaitingResponse = false;
    endAction();
    cardRow.classList.remove("locked");

    if (next.cards.length !== prev.length) {
      // Card count changed (e.g. a fresh queued draw after a pick) — full rebuild.
      renderCards(next.cards);
    } else {
      // Same count: rebuild only the tiles whose card actually changed. A re-roll
      // swaps exactly one card, so only that tile re-renders — the cards you kept
      // stay put and don't re-animate.
      next.cards.forEach((card, i) => {
        if (prev[i]?.id === card.id) return;
        const el = buildCardEl(card, i);
        el.classList.add("rerolled");
        cardRow.replaceChild(el, cardEls[i]!);
        cardEls[i] = el;
      });
      setHighlight(Math.min(highlighted, cardEls.length - 1));
      renderResources();
    }
    setBanner(next.level, next.queued);
  };

  const setCurrency = (r: number, b: number) => {
    if (tornDown || (r === rerolls && b === banishes)) return;
    rerolls = r;
    banishes = b;
    renderResources();
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
    // The modal is non-blocking: navigation keys also steer the fish. We highlight the
    // card here but DON'T stopPropagation, so the same keydown still reaches input.ts and
    // drives movement (the menu and the swim share left/right). We only preventDefault to
    // suppress page scroll — input.ts already does the same for arrows.
    if (k === "a" || k === "A" || k === "ArrowLeft") {
      e.preventDefault();
      inputMode = "keyboard";
      setHighlight(Math.max(0, highlighted - 1));
      return;
    }
    if (k === "d" || k === "D" || k === "ArrowRight") {
      e.preventDefault();
      inputMode = "keyboard";
      setHighlight(Math.min(cardEls.length - 1, highlighted + 1));
      return;
    }
    // Space/Enter pick the highlighted card. stopPropagation keeps Space from also
    // triggering boost in input.ts while the menu is visible (boost returns once dismissed).
    if (k === " " || k === "Spacebar" || k === "Space" || k === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      pick(highlighted);
      return;
    }
    // Up/down/W/S aren't menu keys — let them fall through to drive vertical movement.
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
    if (actionTimer) clearTimeout(actionTimer);
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
    setCurrency,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[c]!));
}
