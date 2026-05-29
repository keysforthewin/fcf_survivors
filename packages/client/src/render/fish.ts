import { Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import { BITE, fishRadius } from "@fcf/shared";
import { getFishTexture, hasFishTexture } from "./species-textures.ts";

/** Heading cosine past which we commit to a facing direction. A deadband around vertical
 *  (|cos| <= this) holds the last flip so a fish swimming straight up/down doesn't strobe. */
const FLIP_DEADBAND = 0.08;

/**
 * A fish rendered as a photo-real sprite (public/fish/<id>.png, authored facing +x). The
 * sprite lives inside `bodyGroup`, which carries the velocity squash-stretch, the bite "gulp"
 * and the facing flip; `glow` (big fish) sits behind it, and the name `label` rides on the outer
 * container so it never inherits the flip/squash.
 */
export class FishSprite {
  container = new Container();
  private bodyGroup = new Container();
  private sprite: Sprite;
  private glow = new Graphics();
  private label: Text;
  /** The fish's name without any prefix; the rendered label may show "💀 " + this. */
  private baseName: string;
  /** Whether this fish can currently eat the local player (drives the 💀 nameplate prefix). */
  private dangerous = false;
  private color: number;
  private isAi: boolean;
  private species: string;
  private currentRadius = 0;
  private currentMass = 0;
  /** Sprite radius the geometry was last decorated at — lerps toward the mass-derived target. */
  private renderRadius = 0;
  private swimPhase = Math.random() * Math.PI * 2;
  private headingX = 1;
  private headingY = 0;
  private hasGlow = false;
  private speed = 0;
  private stretchX = 1;
  private stretchY = 1;
  /** +1 facing right, -1 facing left (vertical mirror keeps the side profile belly-down). */
  private flipSign = 1;
  /** Bite chomp animation: active while biteAge < the kind's envelope, advanced by dt in update(). */
  private biteActive = false;
  private biteAge = 0;
  /** Which chomp to play: a big "eat" gulp+lurch when swallowing prey, or a quick "nibble" nip. */
  private biteKind: "eat" | "nibble" = "eat";
  /** Whether the sprite is currently showing the tintable fallback silhouette (vs the real photo). */
  private usingFallback = true;

  constructor(name: string, color: string, isAi: boolean, species: string, _isSelf = false) {
    this.color = parseColor(color);
    this.isAi = isAi;
    this.species = species;
    this.baseName = name;
    this.sprite = new Sprite(getFishTexture(species));
    this.sprite.anchor.set(0.5);
    this.bodyGroup.addChild(this.sprite);
    // Layer order (back → front): glow, [bodyGroup: sprite], label.
    this.container.addChild(this.glow);
    this.container.addChild(this.bodyGroup);
    const style = new TextStyle({
      fontFamily: "Outfit, Inter, system-ui, sans-serif",
      fontSize: 14,
      fontWeight: "600",
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 3, alpha: 0.6 },
      align: "center",
    });
    this.label = new Text({ text: name, style });
    this.label.anchor.set(0.5);
    this.container.addChild(this.label);
    this.renderRadius = fishRadius(10);
    this.refreshTexture();
    this.applySpriteScale();
    this.decorate(this.renderRadius);
  }

  /**
   * Update position and orientation. When `serverHeading` is provided, the sprite slerps toward
   * it (authoritative source); otherwise heading is derived from velocity direction. Also resolves
   * the facing flip (with a deadband near vertical so it doesn't strobe).
   */
  setTransform(
    x: number, y: number, vx: number, vy: number,
    serverHeading?: { hx: number; hy: number },
    dt: number = 1 / 60,
  ): void {
    this.container.x = x;
    this.container.y = y;
    const speed = Math.hypot(vx, vy);
    this.speed = speed;
    let tx = this.headingX;
    let ty = this.headingY;
    if (serverHeading) {
      const m = Math.hypot(serverHeading.hx, serverHeading.hy);
      if (m > 0.01) { tx = serverHeading.hx / m; ty = serverHeading.hy / m; }
    } else if (speed > 5) {
      tx = vx / speed;
      ty = vy / speed;
    }
    // Slerp current heading toward target (14 rad/sec) to mask the 50ms snapshot cadence.
    const cur = Math.atan2(this.headingY, this.headingX);
    const tgt = Math.atan2(ty, tx);
    let delta = tgt - cur;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxStep = 14 * dt;
    const step = Math.max(-maxStep, Math.min(maxStep, delta));
    const next = cur + step;
    this.headingX = Math.cos(next);
    this.headingY = Math.sin(next);
    this.container.rotation = next;
    // Facing flip: a side-profile sprite rotated past vertical goes belly-up. Mirror it
    // vertically when facing left so the belly stays down. Deadband holds the flip near
    // vertical headings (cos ≈ 0) to avoid strobing.
    const c = this.headingX;
    if (c > FLIP_DEADBAND) this.flipSign = 1;
    else if (c < -FLIP_DEADBAND) this.flipSign = -1;
    // else: keep current flipSign (hysteresis zone)
  }

  update(mass: number, dt: number): void {
    // Lerp the rendered radius toward the mass-derived target so mass changes animate.
    const targetR = fishRadius(mass);
    const ease = 1 - Math.pow(0.001, dt);
    this.renderRadius += (targetR - this.renderRadius) * ease;
    // Swap in the real photo texture once it has loaded (covers fish created during preload).
    this.refreshTexture();
    this.applySpriteScale();

    const wantsGlow = mass > 50 && !this.isAi;
    if (
      Math.abs(this.renderRadius - this.currentRadius) > 0.5 ||
      Math.abs(mass - this.currentMass) > 5 ||
      wantsGlow !== this.hasGlow
    ) {
      this.currentMass = mass;
      this.hasGlow = wantsGlow;
      this.decorate(this.renderRadius);
    }

    // Faked swim: a subtle sinusoidal shear (the tail is part of the photo now). Amplitude
    // shrinks for bigger fish so whales don't shimmy.
    this.swimPhase += dt * (8 + Math.min(4, mass / 50));
    const swimAmp = 0.04 * Math.max(0.4, Math.min(1, 40 / Math.max(1, this.renderRadius)));
    this.bodyGroup.skew.x = Math.sin(this.swimPhase) * swimAmp;

    // Velocity-driven squash-stretch.
    const target = Math.max(0, Math.min(0.22, this.speed / 900));
    this.stretchX += (1 + target - this.stretchX) * ease;
    this.stretchY += (1 - target * 0.5 - this.stretchY) * ease;
    // Bite chomp: a brief "gulp" (stretch forward, squash vertically). A swallow ("eat") is a big,
    // longer gulp; a "nibble" is a quick small nip.
    let gulp = 0;
    if (this.biteActive) {
      this.biteAge += dt;
      const isEat = this.biteKind === "eat";
      const dur = (isEat ? BITE.eatAnimMs : BITE.nibbleAnimMs) / 1000;
      const amp = isEat ? BITE.eatGulp : BITE.nibbleGulp;
      const t = this.biteAge / dur;
      if (t >= 1) this.biteActive = false;
      else gulp = Math.sin(Math.PI * t) * amp;
    }
    // Compose squash-stretch + gulp + facing-flip into the single bodyGroup scale.
    this.bodyGroup.scale.set(
      this.stretchX * (1 + gulp),
      this.stretchY * (1 - gulp * 0.5) * this.flipSign,
    );

    this.label.position.set(0, -this.renderRadius - 14);
    this.label.rotation = -this.container.rotation;
    this.label.alpha = this.isAi ? 0.65 : 1;
  }

  /** Scale the sprite so its width spans the hitbox diameter (2·radius); aspect preserved. */
  private applySpriteScale(): void {
    const texW = this.sprite.texture.width || 1;
    const s = (2 * this.renderRadius) / texW;
    this.sprite.scale.set(s);
  }

  /** Point the sprite at the real photo texture once available; tint white (photo) vs accent (fallback). */
  private refreshTexture(): void {
    const ready = hasFishTexture(this.species);
    const tex = getFishTexture(this.species);
    if (this.sprite.texture !== tex) this.sprite.texture = tex;
    if (ready === this.usingFallback) {
      this.usingFallback = !ready;
    }
    this.sprite.tint = ready ? 0xffffff : this.color;
  }

  /** Redraw the (cheap, change-gated) decoration: the big-fish glow. */
  private decorate(radius: number): void {
    this.currentRadius = radius;

    this.glow.clear();
    if (this.hasGlow) {
      const lighter = lighten(this.color, 0.32);
      const gr = radius * 1.5;
      this.glow
        .circle(0, 0, gr).fill({ color: lighter, alpha: 0.05 })
        .circle(0, 0, gr * 0.82).fill({ color: lighter, alpha: 0.08 });
    }
  }

  /** Counter-scale the name label so it never renders smaller than `minPx` on-screen. */
  setLabelMinPxScale(worldScale: number, minPx = 14, baseFontSize = 14): void {
    const effective = baseFontSize * worldScale;
    const s = effective >= minPx ? 1 : minPx / effective;
    this.label.scale.set(s);
  }

  setIdentity(name: string, color: string): void {
    this.baseName = name;
    this.renderLabel();
    this.color = parseColor(color);
    this.decorate(this.currentRadius);
    this.refreshTexture();
  }

  /**
   * Mark whether this fish can eat the local player. When true, a 💀 is prefixed to the
   * nameplate so the player sees at a glance which neighbours are deadly. No-op if unchanged.
   */
  setDanger(dangerous: boolean): void {
    if (dangerous === this.dangerous) return;
    this.dangerous = dangerous;
    this.renderLabel();
  }

  /** Compose the nameplate from the base name plus the danger prefix. */
  private renderLabel(): void {
    this.label.text = this.dangerous ? `💀 ${this.baseName}` : this.baseName;
  }

  /** The nameplate text currently shown, including any 💀 prefix. For tests/debug. */
  getLabelText(): string {
    return this.label.text;
  }

  /** Swap the fish to a different species; the texture re-binds on the next update/refresh. */
  setSpecies(species: string): void {
    if (species === this.species) return;
    this.species = species;
    this.refreshTexture();
    this.applySpriteScale();
  }

  /** Start (or restart) the chomp animation. `eat` = big swallow gulp+lurch; `nibble` = quick nip. */
  triggerBite(kind: "eat" | "nibble" = "eat"): void {
    this.biteActive = true;
    this.biteAge = 0;
    this.biteKind = kind;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

export function parseColor(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

export function lighten(c: number, amt: number): number {
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  const rr = Math.min(255, Math.round(r + (255 - r) * amt));
  const gg = Math.min(255, Math.round(g + (255 - g) * amt));
  const bb = Math.min(255, Math.round(b + (255 - b) * amt));
  return (rr << 16) | (gg << 8) | bb;
}

export function darken(c: number, amt: number): number {
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  const rr = Math.max(0, Math.round(r * amt));
  const gg = Math.max(0, Math.round(g * amt));
  const bb = Math.max(0, Math.round(b * amt));
  return (rr << 16) | (gg << 8) | bb;
}
