import { Container, Graphics, MeshRope, Point, Texture, type Filter } from "pixi.js";
import { GlowFilter } from "pixi-filters/glow";

export type RenderableWeaponId =
  | "bubble" | "spine" | "pulse" | "ink" | "piranha"
  | "tidal" | "puffer" | "eel" | "kraken" | "school";

// Per-weapon ribbon trail color (only weapons that actually travel get a trail).
const TRAIL_COLORS: Record<string, { rgb: [number, number, number]; alpha: number; len: number }> = {
  bubble: { rgb: [0.71, 0.93, 1.00], alpha: 0.28, len: 4 },
  tidal:  { rgb: [0.50, 0.87, 1.00], alpha: 0.55, len: 6 },
  spine:  { rgb: [1.00, 0.91, 0.52], alpha: 0.55, len: 5 },
  piranha:{ rgb: [1.00, 0.56, 0.44], alpha: 0.55, len: 6 },
  school: { rgb: [1.00, 0.50, 0.19], alpha: 0.60, len: 6 },
};

// Visual radius is decoupled from collision radius — projectiles that read as
// too bulky (the default bubble) can render smaller without changing damage.
const VISUAL_RADIUS_SCALE: Record<string, number> = {
  bubble: 0.55,
};

export class ProjectileSprite {
  container = new Container();
  private g = new Graphics();
  private weaponId: RenderableWeaponId;
  private radius: number;
  private spawnTime: number;
  private trailPoints: Point[] = [];
  private trailRope: MeshRope | null = null;

  constructor(weaponId: string, radius: number, spawnTime: number) {
    this.weaponId = (weaponId as RenderableWeaponId) ?? "bubble";
    const visualScale = VISUAL_RADIUS_SCALE[this.weaponId] ?? 1;
    this.radius = Math.max(2, radius * visualScale);
    this.spawnTime = spawnTime;
    this.container.addChild(this.g);
    this.applyKindFilters();
    this.setupTrail();
    this.draw();
  }

  private applyKindFilters(): void {
    const filters: Filter[] = [];
    let glow: GlowFilter | null = null;
    if (this.weaponId === "piranha" || this.weaponId === "school") {
      glow = new GlowFilter({
        distance: 12,
        outerStrength: 2.2,
        innerStrength: 0.0,
        color: this.weaponId === "piranha" ? 0xff9070 : 0xff7030,
        quality: 0.18,
      });
    } else if (this.weaponId === "spine" || this.weaponId === "puffer") {
      glow = new GlowFilter({
        distance: 8,
        outerStrength: 1.6,
        innerStrength: 0.4,
        color: 0xffe884,
        quality: 0.18,
      });
    } else if (this.weaponId === "bubble" || this.weaponId === "tidal") {
      glow = new GlowFilter({
        distance: this.weaponId === "bubble" ? 4 : 6,
        outerStrength: this.weaponId === "bubble" ? 0.6 : 1.2,
        innerStrength: 0.0,
        color: 0xb6ecff,
        quality: 0.18,
      });
    } else if (this.weaponId === "ink" || this.weaponId === "kraken") {
      glow = new GlowFilter({
        distance: 10,
        outerStrength: 1.4,
        innerStrength: 0.0,
        color: this.weaponId === "kraken" ? 0x9a5fff : 0x60347e,
        quality: 0.18,
      });
    }
    if (glow) {
      // Explicit padding so the glow halo is included in the filter's render
      // texture — otherwise it can be clipped, leaving visible flat edges.
      glow.padding = Math.max(glow.padding ?? 0, (glow as unknown as { distance: number }).distance + 4);
      filters.push(glow);
    }
    if (filters.length > 0) this.container.filters = filters;
  }

  private setupTrail(): void {
    const cfg = TRAIL_COLORS[this.weaponId];
    if (!cfg) return;
    const tex = makeRibbonTexture(cfg.rgb, cfg.alpha);
    const segments = 12;
    // Container is rotated to face velocity, so trail extends along local -X.
    const len = this.radius * cfg.len;
    this.trailPoints = Array.from({ length: segments }, (_v, i) => {
      const t = i / (segments - 1);
      return new Point(-len * t, 0);
    });
    this.trailRope = new MeshRope({ texture: tex, points: this.trailPoints, textureScale: 0 });
    this.trailRope.blendMode = "add";
    this.container.addChildAt(this.trailRope, 0);
  }

  setTransform(x: number, y: number, vx: number, vy: number): void {
    this.container.x = x;
    this.container.y = y;
    if (vx * vx + vy * vy > 1) {
      this.container.rotation = Math.atan2(vy, vx);
    }
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const r = this.radius;
    switch (this.weaponId) {
      case "bubble": {
        g.circle(0, 0, r).fill({ color: 0x7fc8ee, alpha: 0.45 }).stroke({ color: 0xb6ecff, width: 1, alpha: 0.55 });
        g.circle(-r * 0.32, -r * 0.32, r * 0.28).fill({ color: 0xffffff, alpha: 0.28 });
        break;
      }
      case "spine": {
        g.moveTo(r * 1.2, 0)
          .lineTo(-r * 0.6, r * 0.5)
          .lineTo(-r * 0.6, -r * 0.5)
          .closePath()
          .fill({ color: 0xffe884, alpha: 0.95 })
          .stroke({ color: 0xffb347, width: 1.5, alpha: 0.9 });
        break;
      }
      case "ink": {
        g.circle(0, 0, r).fill({ color: 0x1d0a2c, alpha: 0.7 }).stroke({ color: 0x60347e, width: 1.5, alpha: 0.6 });
        // few small dark dots for texture
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          g.circle(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.18)
            .fill({ color: 0x0a0414, alpha: 0.7 });
        }
        break;
      }
      case "piranha": {
        // small fish silhouette
        g.ellipse(0, 0, r, r * 0.7).fill({ color: 0xf08070, alpha: 0.95 }).stroke({ color: 0x701818, width: 1.5 });
        g.moveTo(-r, 0).lineTo(-r * 1.6, -r * 0.6).lineTo(-r * 1.6, r * 0.6).closePath()
          .fill({ color: 0xf08070, alpha: 0.95 }).stroke({ color: 0x701818, width: 1.5 });
        g.circle(r * 0.5, -r * 0.2, r * 0.18).fill(0xffffff).circle(r * 0.55, -r * 0.2, r * 0.09).fill(0x111111);
        break;
      }
      // Evolutions — placeholder visuals; M4 will refine.
      case "tidal": {
        g.circle(0, 0, r).fill({ color: 0x7fdfff, alpha: 0.85 }).stroke({ color: 0xffffff, width: 3, alpha: 0.9 });
        break;
      }
      case "puffer": {
        g.moveTo(r * 1.3, 0).lineTo(-r * 0.6, r * 0.55).lineTo(-r * 0.6, -r * 0.55).closePath()
          .fill({ color: 0xffe884, alpha: 0.95 }).stroke({ color: 0xff9020, width: 2, alpha: 0.95 });
        break;
      }
      case "kraken": {
        g.circle(0, 0, r).fill({ color: 0x180626, alpha: 0.78 }).stroke({ color: 0x6e2aa0, width: 2, alpha: 0.7 });
        break;
      }
      case "school": {
        g.ellipse(0, 0, r, r * 0.7).fill({ color: 0xff8040, alpha: 0.95 }).stroke({ color: 0x781200, width: 2 });
        break;
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

const RIBBON_TEX_CACHE = new Map<string, Texture>();
function makeRibbonTexture(rgb: [number, number, number], alpha: number): Texture {
  const key = `${rgb[0]},${rgb[1]},${rgb[2]},${alpha}`;
  const cached = RIBBON_TEX_CACHE.get(key);
  if (cached) return cached;
  const w = 64;
  const h = 8;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  // gradient: bright opaque at tail (left, "head" of rope path origin), fading to transparent
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0.0, `rgba(${r},${g},${b},${alpha})`);
  grad.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Soft vertical falloff (squash alpha at top/bottom edges).
  const vgrad = ctx.createLinearGradient(0, 0, 0, h);
  vgrad.addColorStop(0.0, "rgba(0,0,0,1)");
  vgrad.addColorStop(0.5, "rgba(0,0,0,0)");
  vgrad.addColorStop(1.0, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = vgrad;
  ctx.fillRect(0, 0, w, h);
  const tex = Texture.from(canvas);
  RIBBON_TEX_CACHE.set(key, tex);
  return tex;
}
