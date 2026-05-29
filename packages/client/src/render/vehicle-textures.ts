import { Assets, Texture } from "pixi.js";

/**
 * Car body sprites for the vehicle weapons (Nitro's Customs / Dealership), under
 * public/weapons/<skin>.png (transparent, nose facing +x). Each weapon has a SET of distinct skins;
 * a projectile picks one by its entity id so a wave shows a row of different cars. Warmed once at
 * boot by preloadVehicleTextures; VehicleSprite looks them up synchronously via getVehicleTexture
 * and falls back to null (caller draws Texture.WHITE) until a texture loads (or if it 404s).
 */
const TEX = new Map<string, Texture>();

/** How many distinct skins each vehicle weapon has. Skin index = projectile id % count. */
const SKIN_COUNT: Record<string, number> = { nitros: 3, dealership: 7 };

function skinKeys(): string[] {
  const keys: string[] = [];
  for (const [weaponId, count] of Object.entries(SKIN_COUNT)) {
    for (let i = 0; i < count; i++) keys.push(`${weaponId}-${i}`);
  }
  return keys;
}

function weaponUrl(skin: string): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");
  return `${base}/weapons/${skin}.png`;
}

/** Warm every car skin at boot. Failures are swallowed (caller draws a fallback). */
export async function preloadVehicleTextures(): Promise<void> {
  await Promise.all(
    skinKeys().map(async (skin) => {
      try {
        TEX.set(skin, await Assets.load(weaponUrl(skin)));
      } catch {
        /* leave unset → getVehicleTexture returns null */
      }
    }),
  );
}

/** The car texture for a vehicle weapon, chosen by entity id (so a wave shows distinct skins). Null until loaded. */
export function getVehicleTexture(weaponId: string, entId: number): Texture | null {
  const count = SKIN_COUNT[weaponId] ?? 1;
  const idx = ((entId % count) + count) % count;
  return TEX.get(`${weaponId}-${idx}`) ?? null;
}
