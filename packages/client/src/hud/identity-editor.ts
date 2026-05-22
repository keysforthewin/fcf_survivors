import { COLOR_PALETTE } from "../identity.ts";

export interface IdentityEditorOpts {
  current: { name: string; color: string };
  /** Called with the chosen identity if the user saves. Not called on cancel. */
  onSave(next: { name: string; color: string }): void;
  /** Optional callback fired when the editor closes (save or cancel). */
  onClose?(): void;
}

export interface IdentityEditorMount {
  teardown(): void;
}

export function mountIdentityEditor(opts: IdentityEditorOpts): IdentityEditorMount {
  const overlay = document.createElement("div");
  overlay.className = "identity-overlay";
  overlay.innerHTML = `
    <div class="identity-card">
      <h2>Edit fish</h2>
      <div class="field">
        <label for="identity-name">Name</label>
        <input id="identity-name" type="text" maxlength="16" autocomplete="off" />
      </div>
      <div class="field">
        <label>Color</label>
        <div class="color-row">
          ${COLOR_PALETTE.map((c) => `
            <div class="color-swatch" data-color="${c}" style="background:${c}"></div>
          `).join("")}
        </div>
      </div>
      <div class="identity-actions">
        <button type="button" class="identity-cancel">Cancel</button>
        <button type="button" class="identity-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector("#identity-name") as HTMLInputElement;
  input.value = opts.current.name;

  let color = opts.current.color;
  const swatches = overlay.querySelectorAll(".color-swatch");
  swatches.forEach((el) => {
    const s = el as HTMLElement;
    if (s.dataset.color === color) s.classList.add("selected");
    s.addEventListener("click", () => {
      swatches.forEach((other) => other.classList.remove("selected"));
      s.classList.add("selected");
      color = s.dataset.color!;
    });
  });

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    opts.onClose?.();
  };

  const save = () => {
    const name = (input.value.trim() || "Fish").slice(0, 16);
    opts.onSave({ name, color });
    close();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter" && document.activeElement === input) {
      e.preventDefault();
      save();
    }
  };
  document.addEventListener("keydown", onKey);

  overlay.querySelector(".identity-save")!.addEventListener("click", save);
  overlay.querySelector(".identity-cancel")!.addEventListener("click", close);
  // Click on backdrop closes without saving.
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  setTimeout(() => {
    input.focus();
    input.select();
  }, 30);

  return {
    teardown() {
      if (overlay.isConnected) overlay.remove();
      document.removeEventListener("keydown", onKey);
    },
  };
}
