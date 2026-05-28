import { Container, Graphics } from "pixi.js";
import { GlowFilter } from "pixi-filters/glow";

/**
 * A friendly UFO summoned by Alien Friends / Alien Overlord. It rides the normal
 * linear-projectile pipeline (the arena dead-reckons it like any bullet via
 * `setTransform`), so this only owns the look: a glowing saucer that banks toward
 * its travel direction, bobs gently, and runs a rotating ring of under-lights.
 * Exposes the same `container` / `setTransform` / `destroy` surface as
 * ProjectileSprite so it can live in the same projectile map.
 */
export class SaucerSprite {
  container = new Container();
  private g = new Graphics();
  private lights = new Graphics();
  private radius: number;

  constructor(weaponId: string, _radius: number, _spawnTime: number) {
    // Overlord's fleet reads a hotter cyan; base Alien Friends is green.
    const overlord = weaponId === "overlord";
    this.radius = overlord ? 46 : 40;
    this.container.addChild(this.g);
    this.container.addChild(this.lights);
    const glow = new GlowFilter({
      distance: 16,
      outerStrength: 2.2,
      innerStrength: 0.2,
      color: overlord ? 0x66ffff : 0x66ff88,
      quality: 0.2,
    });
    glow.padding = 20;
    this.container.filters = [glow];
    this.draw(overlord);
  }

  private draw(overlord: boolean): void {
    const r = this.radius;
    const hull = overlord ? 0x9fdfff : 0x9fffc0;
    const dome = overlord ? 0xddffff : 0xeaffee;
    const rim = overlord ? 0x2a6f8f : 0x2a8f5a;
    const g = this.g;
    g.clear();
    // Saucer hull (wide ellipse) + dark rim underline for depth.
    g.ellipse(0, r * 0.18, r * 1.25, r * 0.5).fill({ color: rim, alpha: 0.9 });
    g.ellipse(0, 0, r * 1.25, r * 0.5).fill({ color: hull, alpha: 0.95 });
    // Glass dome on top.
    g.ellipse(0, -r * 0.28, r * 0.62, r * 0.42).fill({ color: dome, alpha: 0.85 });
    // Central emitter glow (where the laser comes from).
    g.circle(0, r * 0.1, r * 0.22).fill({ color: 0xffffff, alpha: 0.9 });
  }

  setTransform(x: number, y: number, vx: number, vy: number): void {
    this.container.x = x;
    this.container.y = y;
    // Bank slightly toward travel direction without spinning the whole hull upside down.
    if (vx * vx + vy * vy > 1) {
      const heading = Math.atan2(vy, vx);
      this.container.rotation = Math.sin(heading) * 0.18;
    }
    // Animate the rotating ring of under-lights using the frame clock (setTransform
    // is called every render frame).
    const t = performance.now() / 1000;
    const r = this.radius;
    const lg = this.lights;
    lg.clear();
    const count = 5;
    for (let i = 0; i < count; i++) {
      const a = t * 2.2 + (i / count) * Math.PI * 2;
      const lx = Math.cos(a) * r * 0.95;
      const ly = r * 0.2 + Math.sin(a) * r * 0.22; // squashed onto the hull underside
      const blink = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 6 + i));
      lg.circle(lx, ly, r * 0.12).fill({ color: 0xffff66, alpha: blink });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
