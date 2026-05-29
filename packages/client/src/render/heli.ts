import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { getHeliTexture } from "./heli-textures.ts";

/**
 * Renders a heli body (Mortal's Heli / Sky King's Apache). Owns only the look — the arena
 * render loop positions it via setTransform, like SaucerSprite/ProjectileSprite. The sprite
 * texture is authored nose-facing +x, so rotation = atan2(vy, vx). A faint rotor-blur ellipse
 * animates over it.
 *
 * Exposes the same `container` / `setTransform` / `destroy` surface as SaucerSprite so it can
 * live in the same projectile map.
 */
export class HeliSprite {
  container = new Container();
  private body: Sprite;
  private rotor = new Graphics();
  private weaponId: string;
  private radius: number;

  constructor(weaponId: string, radius: number, _spawnTime: number) {
    this.weaponId = weaponId;
    this.radius = radius;

    const tex = getHeliTexture(weaponId) ?? Texture.WHITE;
    this.body = new Sprite(tex);
    this.body.anchor.set(0.5);
    this.applyScale();

    this.container.addChild(this.body);
    this.container.addChild(this.rotor);
  }

  /** Scale the sprite so its width spans the hitbox diameter (2·radius); aspect preserved. */
  private applyScale(): void {
    const texW = this.body.texture.width || 1;
    const s = (this.radius * 2) / texW;
    this.body.scale.set(s);
  }

  setTransform(x: number, y: number, vx: number, vy: number): void {
    this.container.x = x;
    this.container.y = y;

    // Re-bind the real texture if it loaded after construction (replaces Texture.WHITE).
    const tex = getHeliTexture(this.weaponId);
    if (tex && this.body.texture !== tex) {
      this.body.texture = tex;
      this.applyScale();
    }

    if (vx * vx + vy * vy > 1) this.container.rotation = Math.atan2(vy, vx);

    // Rotor blur: a thin semi-transparent ellipse whose phase shifts each frame.
    const t = performance.now() / 1000;
    const r = this.radius;
    this.rotor.clear();
    this.rotor
      .ellipse(0, 0, r * 1.1 + Math.sin(t * 18) * r * 0.08, r * 0.22)
      .fill({ color: 0xcccccc, alpha: 0.18 });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
