import { WEAPONS, PASSIVE_IDS, parseCardId, EVOLUTIONS } from "@fcf/shared";

/**
 * Generated weapon/passive ability icons, one PNG per id under public/icons/<id>.png
 * (gpt-image-1, glossy 3D game-icon style, transparent background). Rendered as plain
 * CSS background-images on the HUD skill pips and level-up cards — these are DOM overlays,
 * not Pixi, so no texture loading is involved. iconUrl mirrors render/species-textures.ts'
 * BASE_URL handling so it works under a sub-path deploy (BASE_PATH in prod).
 */
function assetBase(): string {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");
}

/** URL of the ability icon for a weapon id or passive id (they never collide). */
export function iconUrl(id: string): string {
  return `${assetBase()}/icons/${id}.png`;
}

/**
 * Warm the browser cache for every weapon + passive icon at boot so the skill pips
 * don't flash in. Cheap: 21 small PNGs, fire-and-forget <img> loads.
 */
export function preloadIcons(): void {
  const ids = [...Object.keys(WEAPONS), ...PASSIVE_IDS];
  for (const id of ids) {
    const img = new Image();
    img.src = iconUrl(id);
  }
}

/**
 * The icon id a level-up card should display. Weapon/upgrade cards show the weapon;
 * passive cards show the passive; an evolution card shows the *evolved* weapon (e.g. an
 * evolution of `bubble` shows `tidal`), since that's the reward. Returns null for an
 * unparseable card id.
 */
export function iconIdForCard(cardId: string): string | null {
  const parsed = parseCardId(cardId);
  if (!parsed) return null;
  switch (parsed.kind) {
    case "weapon-add":
    case "weapon-upgrade": return parsed.weaponId;
    case "passive-stack":  return parsed.passiveId;
    case "evolution":      return EVOLUTIONS[parsed.baseId]?.evolutionId ?? parsed.baseId;
  }
}

/**
 * Settings gear, used by the HUD + death-screen "edit fish" buttons. A Tabler Icons
 * (MIT) settings glyph — stroke uses currentColor so it inherits the button's hover
 * color transitions. Inlined rather than pulling an icon dependency into this
 * framework-less client for a single glyph.
 */
export const GEAR_SVG =
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />` +
  `<path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />` +
  `</svg>`;
