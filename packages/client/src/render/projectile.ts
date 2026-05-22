import { Container, Graphics } from "pixi.js";

export type RenderableWeaponId =
  | "bubble" | "spine" | "pulse" | "ink" | "piranha"
  | "tidal" | "puffer" | "eel" | "kraken" | "school";

export class ProjectileSprite {
  container = new Container();
  private g = new Graphics();
  private weaponId: RenderableWeaponId;
  private radius: number;
  private spawnTime: number;
  private currentAlpha = 1;

  constructor(weaponId: string, radius: number, spawnTime: number) {
    this.weaponId = (weaponId as RenderableWeaponId) ?? "bubble";
    this.radius = Math.max(2, radius);
    this.spawnTime = spawnTime;
    this.container.addChild(this.g);
    this.draw();
  }

  setTransform(x: number, y: number, vx: number, vy: number): void {
    this.container.x = x;
    this.container.y = y;
    if (vx * vx + vy * vy > 1) {
      this.container.rotation = Math.atan2(vy, vx);
    }
  }

  /** Per-frame: handles pulse alpha fade-out. Returns false if sprite should be removed early. */
  tickAge(now: number, lifetimeMs: number | null): boolean {
    if (this.weaponId === "pulse" || this.weaponId === "eel") {
      const age = lifetimeMs ? Math.max(0, Math.min(1, (now - this.spawnTime) / lifetimeMs)) : 0;
      const a = 1 - age;
      if (Math.abs(a - this.currentAlpha) > 0.05) {
        this.currentAlpha = a;
        this.g.alpha = Math.max(0.0, a);
      }
    }
    return true;
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const r = this.radius;
    switch (this.weaponId) {
      case "bubble": {
        g.circle(0, 0, r).fill({ color: 0xb6ecff, alpha: 0.75 }).stroke({ color: 0xffffff, width: 2, alpha: 0.8 });
        g.circle(-r * 0.3, -r * 0.3, r * 0.35).fill({ color: 0xffffff, alpha: 0.55 });
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
      case "pulse": {
        g.circle(0, 0, r).fill({ color: 0x7fcfff, alpha: 0.15 });
        g.circle(0, 0, r).stroke({ color: 0xb8e8ff, width: 4, alpha: 0.8 });
        g.circle(0, 0, r * 0.7).stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
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
      case "eel": {
        g.circle(0, 0, r).fill({ color: 0xb088ff, alpha: 0.18 });
        g.circle(0, 0, r).stroke({ color: 0xe2c8ff, width: 5, alpha: 0.9 });
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
