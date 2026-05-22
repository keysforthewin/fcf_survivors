const STORAGE_KEY = "fcf-identity";

export interface Identity {
  name?: string;
  color?: string;
}

export const COLOR_PALETTE = [
  "#ffd97f", "#ff85a1", "#7fcfff", "#9affcf",
  "#caa8ff", "#ff9fa4", "#8fffd8", "#ffa07f",
  "#ffcf6b", "#9cd2ff", "#a0ffcc", "#ff7fbf",
  "#7fffd4", "#ffb37f", "#b07fff", "#7fffa1",
];

export function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Identity>;
    const out: Identity = {};
    if (typeof parsed.name === "string" && parsed.name.trim().length > 0) {
      out.name = parsed.name.trim().slice(0, 16);
    }
    if (typeof parsed.color === "string" && /^#[0-9a-fA-F]{6}$/.test(parsed.color)) {
      out.color = parsed.color;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveIdentity(patch: Identity): void {
  try {
    const merged: Identity = { ...loadIdentity(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // localStorage may be unavailable (private mode etc.) — ignore.
  }
}
