import { Assets, Texture } from "pixi.js";
import { SPECIES } from "@fcf/shared";

/**
 * Photo-real fish sprites, one PNG per species under public/fish/<id>.png (authored as a
 * side profile facing +x, transparent background). Warmed once at boot by preloadFishTextures;
 * FishSprite then looks textures up synchronously via getFishTexture. Until a species' PNG has
 * loaded (or if it 404s) callers get a neutral white silhouette they can tint, and re-bind to
 * the real texture once it arrives (see FishSprite.update).
 */
const TEX = new Map<string, Texture>();
let fallback: Texture | null = null;

function fishUrl(id: string): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");
  return `${base}/fish/${id}.png`;
}

/** Load every species texture in parallel. Failures are swallowed (that species uses the fallback). */
export async function preloadFishTextures(): Promise<void> {
  await Promise.all(
    SPECIES.map(async (s) => {
      try {
        TEX.set(s.id, await Assets.load(fishUrl(s.id)));
      } catch {
        /* leave unset → getFishTexture returns the silhouette fallback */
      }
    }),
  );
}

/** True once the real photo texture for this species has loaded. */
export function hasFishTexture(id: string | undefined): boolean {
  return id !== undefined && TEX.has(id);
}

/** The species' photo texture, or a tintable white silhouette fallback if not yet loaded. */
export function getFishTexture(id: string | undefined): Texture {
  if (id !== undefined) {
    const t = TEX.get(id);
    if (t) return t;
  }
  return getFallbackTexture();
}

/**
 * A once-built white fish silhouette (canvas texture, same pattern as render/ink.ts), used
 * before the real PNG loads. White so FishSprite can tint it with the fish's accent color.
 * Authored facing +x (head right, tail left) to match the real sprites.
 */
function getFallbackTexture(): Texture {
  if (fallback) return fallback;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 150;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  // body
  ctx.beginPath();
  ctx.ellipse(150, 75, 86, 50, 0, 0, Math.PI * 2);
  ctx.fill();
  // tail (left)
  ctx.beginPath();
  ctx.moveTo(78, 75);
  ctx.lineTo(20, 36);
  ctx.lineTo(20, 114);
  ctx.closePath();
  ctx.fill();
  fallback = Texture.from(canvas);
  return fallback;
}
