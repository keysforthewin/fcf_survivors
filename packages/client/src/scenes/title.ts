import { initSound } from "../sound.ts";
import { SPECIES, colorForSpecies, speciesById, DEFAULT_SPECIES_ID } from "@fcf/shared";

export interface TitleResult {
  name: string;
  color: string;
  species?: string;
}

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");
const fishSrc = (id: string) => `${BASE}/fish/${id}.png`;

export function showTitle(prefill?: Partial<TitleResult>): Promise<TitleResult> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "title-overlay";
    overlay.innerHTML = `
      <div class="title-bg" style="background-image:url('${BASE}/ui/title-bg.jpg')"></div>
      <div class="title-card">
        <div class="title-brand">
          <h1 class="title-logo">Fruit Cup<span>Survivors</span></h1>
          <p class="subtitle">Eat. Grow. Survive the deep.</p>
        </div>
        <div class="field">
          <label for="name-input">Fish name</label>
          <input id="name-input" type="text" maxlength="16" placeholder="Bloop" autocomplete="off" />
        </div>
        <div class="field">
          <label>Choose your fish</label>
          <div class="species-picker">
            <div class="species-preview">
              <img class="species-preview-img" alt="" />
              <div class="species-preview-name"></div>
            </div>
            <div class="species-grid">
              ${SPECIES.map(
                (s) => `
                <button type="button" class="species-tile" data-species="${s.id}" title="${s.label}" style="--tile-accent:${s.accentColor}">
                  <img src="${fishSrc(s.id)}" alt="${s.label}" loading="lazy" draggable="false" />
                </button>`,
              ).join("")}
            </div>
          </div>
        </div>
        <button class="play" type="button">DIVE IN</button>
        <p class="help">Arrow keys / WASD to swim &middot; Space to boost</p>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector("#name-input") as HTMLInputElement;
    input.value = prefill?.name ?? "";

    let species = prefill?.species && speciesById(prefill.species).id === prefill.species
      ? prefill.species
      : DEFAULT_SPECIES_ID;

    const previewImg = overlay.querySelector(".species-preview-img") as HTMLImageElement;
    const previewName = overlay.querySelector(".species-preview-name") as HTMLDivElement;
    const tiles = [...overlay.querySelectorAll<HTMLButtonElement>(".species-tile")];
    const card = overlay.querySelector(".title-card") as HTMLElement;

    const selectSpecies = (id: string): void => {
      species = id;
      const def = speciesById(id);
      previewImg.src = fishSrc(id);
      previewName.textContent = def.label;
      card.style.setProperty("--pick-accent", def.accentColor);
      for (const t of tiles) t.classList.toggle("selected", t.dataset.species === id);
    };

    for (const t of tiles) {
      t.addEventListener("click", () => selectSpecies(t.dataset.species!));
    }
    selectSpecies(species);

    const submit = (): void => {
      // First user gesture — initialise audio (browsers require a gesture for AudioContext.start).
      initSound();
      const name = (input.value.trim() || "Fish").slice(0, 16);
      overlay.remove();
      resolve({ name, color: colorForSpecies(species), species });
    };

    overlay.querySelector(".play")!.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });

    setTimeout(() => input.focus(), 50);
  });
}
