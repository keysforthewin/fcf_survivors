const TOAST_LIFETIME_MS = 3000;
const FADE_MS = 300;
const MAX_TOASTS = 4;

export interface ToastHud {
  show(text: string, accent?: string): void;
  teardown(): void;
}

export function mountToastHud(): ToastHud {
  const root = document.createElement("div");
  root.className = "toast-container";
  document.body.appendChild(root);

  const active: Array<{ el: HTMLElement; lifeTimer: ReturnType<typeof setTimeout>; removeTimer: ReturnType<typeof setTimeout> | null }> = [];

  function evict(entry: { el: HTMLElement; lifeTimer: ReturnType<typeof setTimeout>; removeTimer: ReturnType<typeof setTimeout> | null }): void {
    clearTimeout(entry.lifeTimer);
    if (entry.removeTimer) clearTimeout(entry.removeTimer);
    entry.el.remove();
    const idx = active.indexOf(entry);
    if (idx >= 0) active.splice(idx, 1);
  }

  return {
    show(text, accent) {
      const el = document.createElement("div");
      el.className = "toast";
      if (accent) el.style.setProperty("--toast-accent", accent);
      el.textContent = text;
      root.appendChild(el);

      const entry: { el: HTMLElement; lifeTimer: ReturnType<typeof setTimeout>; removeTimer: ReturnType<typeof setTimeout> | null } = {
        el,
        removeTimer: null,
        lifeTimer: setTimeout(() => {
          el.classList.add("toast-out");
          entry.removeTimer = setTimeout(() => evict(entry), FADE_MS);
        }, TOAST_LIFETIME_MS),
      };
      active.push(entry);

      while (active.length > MAX_TOASTS) evict(active[0]!);
    },
    teardown() {
      while (active.length) evict(active[0]!);
      root.remove();
    },
  };
}
