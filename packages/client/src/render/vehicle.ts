import { Container, Sprite, Texture } from "pixi.js";
import { getVehicleTexture } from "./vehicle-textures.ts";

/** Heading cosine past which we commit to a facing direction; a deadband near vertical holds the
 *  last flip so a car driving straight up/down doesn't strobe. Mirrors FishSprite's FLIP_DEADBAND. */
const FLIP_DEADBAND = 0.08;

/**
 * Renders one Nitro's Customs / Dealership car: a large sprite (public/weapons/<skin>.png, authored
 * nose facing +x) positioned by the arena render loop via setTransform — same container/setTransform/
 * destroy surface as HeliSprite/SaucerSprite so it lives in the same projectile map. Rotates to its
 * travel direction and mirrors VERTICALLY when driving left so it keeps its wheels down (a plain
 * rotation past vertical would flip a side-profile car belly-up). The skin is chosen from the weapon's
 * set by entity id, so a wave of cars shows a row of distinct rides.
 */
export class VehicleSprite {
  container = new Container();
  /** Inner group carries the facing flip so it composes with the sprite's size scale. */
  private body = new Container();
  private sprite: Sprite;
  private weaponId: string;
  private entId: number;
  private radius: number;
  /** +1 facing right, -1 facing left (vertical mirror keeps the side profile wheels-down). */
  private flipSign = 1;

  constructor(weaponId: string, entId: number, radius: number, _spawnTime: number) {
    this.weaponId = weaponId;
    this.entId = entId;
    this.radius = radius;

    const tex = getVehicleTexture(weaponId, entId) ?? Texture.WHITE;
    this.sprite = new Sprite(tex);
    this.sprite.anchor.set(0.5);
    this.body.addChild(this.sprite);
    this.container.addChild(this.body);
    this.applyScale();
  }

  /** Scale the sprite so its width spans the hitbox diameter (2·radius); aspect preserved. */
  private applyScale(): void {
    const texW = this.sprite.texture.width || 1;
    this.sprite.scale.set((this.radius * 2) / texW);
  }

  setTransform(x: number, y: number, vx: number, vy: number): void {
    this.container.x = x;
    this.container.y = y;

    // Re-bind the real texture if it loaded after construction (replaces Texture.WHITE).
    const tex = getVehicleTexture(this.weaponId, this.entId);
    if (tex && this.sprite.texture !== tex) {
      this.sprite.texture = tex;
      this.applyScale();
    }

    const sp2 = vx * vx + vy * vy;
    if (sp2 > 1) {
      this.container.rotation = Math.atan2(vy, vx);
      // Facing flip across the travel axis: mirror vertically when heading left so the car stays
      // wheels-down (deadband near vertical holds the flip to avoid strobing). Mirrors FishSprite.
      const c = vx / Math.sqrt(sp2);
      if (c > FLIP_DEADBAND) this.flipSign = 1;
      else if (c < -FLIP_DEADBAND) this.flipSign = -1;
      this.body.scale.set(1, this.flipSign);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
