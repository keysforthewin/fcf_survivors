/**
 * Playable fish species. These replace the old free color choice: a player picks a
 * real-fish "skin" and the client renders the matching photo sprite (public/fish/<id>.png,
 * authored as a side profile facing +x).
 *
 * `accentColor` is the seam that keeps every existing color-driven path working without
 * change — roster dots, kill toasts, eat/chomp particles, damage numbers, the big-fish
 * glow, and the own-fish ring. The client sends `color = colorForSpecies(species)`, so the
 * wire protocol's `color` field still carries a meaningful per-fish hue.
 *
 * Shared between client (picker + texture lookup + accent) and server (validation + AI
 * assignment). Keep `id`s stable: they are the texture filenames and persist in localStorage.
 */
export interface SpeciesDef {
  id: string;
  label: string;
  /** Representative hue ("#rrggbb"), used everywhere the old per-fish color was. */
  accentColor: string;
}

export const SPECIES: readonly SpeciesDef[] = [
  { id: "clownfish", label: "Clownfish", accentColor: "#ff7a33" },
  { id: "blue-tang", label: "Blue Tang", accentColor: "#2f8fe0" },
  { id: "koi", label: "Koi", accentColor: "#f4a72a" },
  { id: "betta", label: "Betta", accentColor: "#c44bd0" },
  { id: "pufferfish", label: "Pufferfish", accentColor: "#e7c75f" },
  { id: "angelfish", label: "Angelfish", accentColor: "#36c2b0" },
  { id: "piranha", label: "Piranha", accentColor: "#b3505f" },
  { id: "lionfish", label: "Lionfish", accentColor: "#e2532f" },
  { id: "barracuda", label: "Barracuda", accentColor: "#86b2c7" },
  { id: "mahi-mahi", label: "Mahi-Mahi", accentColor: "#57c277" },
  { id: "reef-shark", label: "Reef Shark", accentColor: "#92a7b4" },
  { id: "swordfish", label: "Swordfish", accentColor: "#4358a8" },
  { id: "blobfish", label: "Blobfish", accentColor: "#d98f8a" },
  { id: "anglerfish", label: "Anglerfish", accentColor: "#5fd0ff" },
  { id: "goblin-shark", label: "Goblin Shark", accentColor: "#e6a8b0" },
  { id: "barreleye", label: "Barreleye", accentColor: "#46d6a0" },
  { id: "leafy-sea-dragon", label: "Leafy Sea Dragon", accentColor: "#c8c24e" },
  { id: "mantis-shrimp", label: "Mantis Shrimp", accentColor: "#19c98a" },
  { id: "bluefin-tuna", label: "Bluefin Tuna", accentColor: "#3566b0" },
  { id: "triggerfish", label: "Triggerfish", accentColor: "#e8c33a" },
  { id: "humphead-parrotfish", label: "Humphead Parrotfish", accentColor: "#4f9e86" },
  { id: "giant-grouper", label: "Giant Grouper", accentColor: "#8a7350" },
  { id: "frogfish", label: "Frogfish", accentColor: "#ef8a2e" },
  { id: "hammerhead-shark", label: "Hammerhead Shark", accentColor: "#5f7385" },
] as const;

export const DEFAULT_SPECIES_ID = SPECIES[0]!.id;

const BY_ID = new Map<string, SpeciesDef>(SPECIES.map((s) => [s.id, s]));

/** Look up a species, falling back to the default for unknown/missing ids. */
export function speciesById(id: string | undefined): SpeciesDef {
  return (id !== undefined ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_SPECIES_ID)!;
}

/** Representative color for a species — the replacement for the old chosen swatch. */
export function colorForSpecies(id: string | undefined): string {
  return speciesById(id).accentColor;
}

/** Server-side validation: true only for a known species id. */
export function isSpeciesId(id: string): boolean {
  return BY_ID.has(id);
}
