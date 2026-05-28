import { SPECIES, speciesById } from "@fcf/shared";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");
const fishSrc = (id: string) => `${BASE}/fish/${id}.png`;

export interface IdentityEditorOpts {
  current: { name: string; species: string };
  /** Called with the chosen identity if the user saves. Not called on cancel. */
  onSave(next: { name: string; species: string }): void;
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
        <label>Species</label>
        <div class="species-grid">
          ${SPECIES.map(
            (s) => `
            <button type="button" class="species-tile" data-species="${s.id}" title="${s.label}" style="--tile-accent:${s.accentColor}">
              <img src="${fishSrc(s.id)}" alt="${s.label}" loading="lazy" draggable="false" />
            </button>`,
          ).join("")}
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

  let species = speciesById(opts.current.species).id;
  const tiles = [...overlay.querySelectorAll<HTMLButtonElement>(".species-tile")];
  for (const t of tiles) {
    if (t.dataset.species === species) t.classList.add("selected");
    t.addEventListener("click", () => {
      for (const o of tiles) o.classList.remove("selected");
      t.classList.add("selected");
      species = t.dataset.species!;
    });
  }

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    opts.onClose?.();
  };

  const save = () => {
    const name = (input.value.trim() || "Fish").slice(0, 16);
    opts.onSave({ name, species });
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
