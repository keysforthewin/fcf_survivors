import { Sprite, Texture } from "pixi.js";

// Trail weapons (Radioactive Waste + its evolution Rad Zone) drop a static cloud
// behind the player every few hundred ms. Each drop is a soft radial-gradient blob;
// rendered together on a blurred layer they fuse into one continuous mass that's
// densest at the player and dissipates (fades by age) toward the tail — toxic
// waste spreading through the water.

// `fadeMs` is set just below the server's minimum lifetime for the weapon so the blob is
// already ~invisible by the time the server removes the entity (no visible pop).
// Toxic green reads clearly against the dark navy water; Rad Zone is a brighter,
// more saturated green so the evolution stays visually distinct.
const INK_CONFIG: Record<string, { rgb: [number, number, number]; fadeMs: number }> = {
  ink: { rgb: [120, 220, 60], fadeMs: 2900 }, // server lifetime 3000–3600ms
  kraken: { rgb: [150, 245, 80], fadeMs: 4300 }, // brighter toxic green; server lifetime 4500ms
};

const TEX_SIZE = 128;
const BASE_ALPHA = 0.8;
const VISUAL_SCALE = 2.3; // blob renders well past its collision radius so consecutive drops overlap and fuse even at speed
const SPREAD = 0.18; // blob grows ~18% over its life, selling ink spreading in water

export class InkBlob {
  readonly sprite: Sprite;
  private spawnTime: number;
  private fadeMs: number;
  private baseScale: number;

  constructor(weaponId: string, radius: number, spawnTime: number, x: number, y: number) {
    const cfg = INK_CONFIG[weaponId] ?? INK_CONFIG.ink!;
    this.spawnTime = spawnTime;
    this.fadeMs = cfg.fadeMs;

    this.sprite = new Sprite(blobTexture(weaponId, cfg.rgb));
    this.sprite.anchor.set(0.5);
    this.sprite.x = x;
    this.sprite.y = y;
    // Random rotation + slight scale jitter so the merged mass looks organic, not stamped.
    this.sprite.rotation = Math.random() * Math.PI * 2;
    const jitter = 0.85 + Math.random() * 0.3; // ±15%
    this.baseScale = ((radius * 2 * VISUAL_SCALE) / TEX_SIZE) * jitter;
    this.sprite.scale.set(this.baseScale);
    this.sprite.alpha = BASE_ALPHA;
  }

  update(now: number): void {
    const frac = Math.max(0, Math.min(1, (now - this.spawnTime) / this.fadeMs));
    this.sprite.alpha = BASE_ALPHA * (1 - frac);
    this.sprite.scale.set(this.baseScale * (1 + SPREAD * frac));
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

const TEX_CACHE = new Map<string, Texture>();
function blobTexture(key: string, rgb: [number, number, number]): Texture {
  const cached = TEX_CACHE.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d")!;
  const [r, g, b] = rgb;
  const c = TEX_SIZE / 2;
  // Flat, dense core with a soft transparent rim: overlapping drops merge into one solid
  // mass, and the blur fuses their edges without leaving hard rings.
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0.0, `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.82)`);
  grad.addColorStop(0.85, `rgba(${r},${g},${b},0.4)`);
  grad.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  const tex = Texture.from(canvas);
  TEX_CACHE.set(key, tex);
  return tex;
}
