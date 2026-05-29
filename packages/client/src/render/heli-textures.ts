import { Assets, Texture } from "pixi.js";

/**
 * Heli body sprites under public/weapons/<id>.png (transparent, nose facing +x).
 * Warmed once at boot by preloadHeliTextures; HeliSprite looks them up synchronously
 * via getHeliTexture. Until a texture loads (or if it 404s) callers get null and
 * should draw a fallback shape.
 */
const TEX = new Map<string, Texture>();
const HELI_IDS = ["heli", "gunship"] as const;

function weaponUrl(id: string): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");
  return `${base}/weapons/${id}.png`;
}

/** Warm both heli textures at boot. Failures are swallowed (caller draws a fallback). */
export async function preloadHeliTextures(): Promise<void> {
  await Promise.all(
    HELI_IDS.map(async (id) => {
      try {
        TEX.set(id, await Assets.load(weaponUrl(id)));
      } catch {
        /* leave unset → getHeliTexture returns null */
      }
    }),
  );
}

/** The heli's texture, or null if not yet loaded. */
export function getHeliTexture(id: string): Texture | null {
  return TEX.get(id) ?? null;
}
