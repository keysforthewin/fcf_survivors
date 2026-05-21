const COLOR_PALETTE = [
  "#ffd97f", "#ff85a1", "#7fcfff", "#9affcf",
  "#caa8ff", "#ff9fa4", "#8fffd8", "#ffa07f",
  "#ffcf6b", "#9cd2ff", "#a0ffcc", "#ff7fbf",
  "#7fffd4", "#ffb37f", "#b07fff", "#7fffa1",
];

export interface TitleResult {
  name: string;
  color: string;
}

export function showTitle(prefill?: Partial<TitleResult>): Promise<TitleResult> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "title-overlay";
    overlay.innerHTML = `
      <div class="title-card">
        <h1>FRUIT CUP SURVIVORS</h1>
        <p class="subtitle">Eat. Grow. Survive the deep.</p>
        <div class="field">
          <label for="name-input">Fish name</label>
          <input id="name-input" type="text" maxlength="16" placeholder="Bloop" autocomplete="off" />
        </div>
        <div class="field">
          <label>Color</label>
          <div class="color-row">
            ${COLOR_PALETTE.map((c, i) => `
              <div class="color-swatch${i === 0 ? " selected" : ""}" data-color="${c}" style="background:${c}"></div>
            `).join("")}
          </div>
        </div>
        <button class="play" type="button">DIVE IN</button>
        <p class="help">Arrow keys / WASD to swim &middot; Space to boost (30s cooldown)</p>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector("#name-input") as HTMLInputElement;
    input.value = prefill?.name ?? "";
    let color = prefill?.color ?? COLOR_PALETTE[0]!;

    const swatches = overlay.querySelectorAll(".color-swatch");
    if (prefill?.color) {
      swatches.forEach((el) => {
        const s = el as HTMLElement;
        s.classList.toggle("selected", s.dataset.color === prefill.color);
      });
    }
    swatches.forEach((el) => {
      el.addEventListener("click", () => {
        swatches.forEach((other) => other.classList.remove("selected"));
        el.classList.add("selected");
        color = (el as HTMLElement).dataset.color!;
      });
    });

    const submit = () => {
      const name = (input.value.trim() || "Fish").slice(0, 16);
      overlay.remove();
      resolve({ name, color });
    };

    overlay.querySelector(".play")!.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });

    setTimeout(() => input.focus(), 50);
  });
}
