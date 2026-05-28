import { isSpeciesId } from "@fcf/shared";

const STORAGE_KEY = "fcf-identity";

export interface Identity {
  name?: string;
  color?: string;
  species?: string;
}

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
    if (typeof parsed.species === "string" && isSpeciesId(parsed.species)) {
      out.species = parsed.species;
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
