import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { fishRadius } from "@fcf/shared";

export class FishSprite {
  container = new Container();
  private bodyGroup = new Container();
  private body = new Graphics();
  private tail = new Graphics();
  private dorsal = new Graphics();
  private eye = new Graphics();
  private glow = new Graphics();
  private label: Text;
  private color: number;
  private isAi: boolean;
  private currentRadius = 0;
  private currentMass = 0;
  /** Sprite radius the geometry was last drawn at — lerps toward the mass-derived target so mass changes are visibly animated. */
  private renderRadius = 0;
  private swimPhase = Math.random() * Math.PI * 2;
  private headingX = 1;
  private headingY = 0;
  private hasGlow = false;
  private speed = 0;
  private stretchX = 1;
  private stretchY = 1;

  constructor(name: string, color: string, isAi: boolean) {
    this.color = parseColor(color);
    this.isAi = isAi;
    // Layer order (back → front): glow, [bodyGroup: tail, body, dorsal, eye], label.
    // bodyGroup is the squash-stretch carrier — glow/label stay un-distorted.
    this.container.addChild(this.glow);
    this.container.addChild(this.bodyGroup);
    this.bodyGroup.addChild(this.tail);
    this.bodyGroup.addChild(this.body);
    this.bodyGroup.addChild(this.dorsal);
    this.bodyGroup.addChild(this.eye);
    const style = new TextStyle({
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 14,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 3, alpha: 0.6 },
      align: "center",
    });
    this.label = new Text({ text: name, style });
    this.label.anchor.set(0.5);
    this.container.addChild(this.label);
    this.renderRadius = fishRadius(10);
    this.draw(this.renderRadius);
  }

  /**
   * Update position and orientation. When `serverHeading` is provided, the sprite
   * slerps toward it (authoritative source). Otherwise the heading is derived from
   * velocity direction. Server heading is always preferred when available.
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
    // Target heading: server-sent (authoritative) if present, else velocity-derived.
    let tx = this.headingX;
    let ty = this.headingY;
    if (serverHeading) {
      const m = Math.hypot(serverHeading.hx, serverHeading.hy);
      if (m > 0.01) {
        tx = serverHeading.hx / m;
        ty = serverHeading.hy / m;
      }
    } else if (speed > 5) {
      tx = vx / speed;
      ty = vy / speed;
    }
    // Slerp current heading toward target — masks 50ms server snapshot cadence.
    // 14 rad/sec catch-up is fast enough to feel responsive without snapping.
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
  }

  update(mass: number, dt: number): void {
    // Target render radius from current mass; lerp toward it so mass changes are
    // visibly animated (a big hit shrinks the fish over ~0.3s rather than popping).
    const targetR = fishRadius(mass);
    const ease = 1 - Math.pow(0.001, dt);
    this.renderRadius += (targetR - this.renderRadius) * ease;
    const wantsGlow = mass > 50 && !this.isAi;
    if (
      Math.abs(this.renderRadius - this.currentRadius) > 0.4 ||
      Math.abs(mass - this.currentMass) > 5 ||
      wantsGlow !== this.hasGlow
    ) {
      this.currentMass = mass;
      this.hasGlow = wantsGlow;
      this.draw(this.renderRadius);
    }
    // tail wiggle (slightly faster when bigger to read as "swimming hard")
    this.swimPhase += dt * (8 + Math.min(4, mass / 50));
    const wiggle = Math.sin(this.swimPhase) * 0.28;
    this.tail.rotation = wiggle;
    this.dorsal.rotation = -wiggle * 0.4;
    // Velocity-driven squash-stretch.
    const target = Math.max(0, Math.min(0.22, this.speed / 900));
    this.stretchX += (1 + target - this.stretchX) * ease;
    this.stretchY += (1 - target * 0.5 - this.stretchY) * ease;
    this.bodyGroup.scale.set(this.stretchX, this.stretchY);
  }

  private draw(radius: number): void {
    this.currentRadius = radius;

    const c = this.color;
    const darker = darken(c, 0.55);
    const lighter = lighten(c, 0.32);
    const spineColor = darken(c, 0.4);

    this.body.clear();
    this.body
      .ellipse(0, 0, radius + 1, radius * 0.78 + 1)
      .fill({ color: 0x000000, alpha: 0.25 });
    this.body
      .ellipse(0, 0, radius, radius * 0.78)
      .fill(c)
      .stroke({ color: darker, width: 2, alpha: 0.95 });
    this.body
      .moveTo(-radius * 0.7, -radius * 0.1)
      .lineTo(radius * 0.7, -radius * 0.1)
      .stroke({ color: spineColor, width: Math.max(1, radius * 0.06), alpha: 0.35 });
    this.body
      .ellipse(0, radius * 0.22, radius * 0.72, radius * 0.42)
      .fill({ color: lighter, alpha: 0.4 });

    this.tail.clear();
    const tailBase = -radius * 0.85;
    this.tail.position.set(tailBase, 0);
    this.tail
      .moveTo(0, 0)
      .lineTo(-radius * 0.6, -radius * 0.6)
      .lineTo(-radius * 0.42, 0)
      .lineTo(-radius * 0.6, radius * 0.6)
      .closePath()
      .fill(c)
      .stroke({ color: darker, width: 2, alpha: 0.95 });

    this.dorsal.clear();
    this.dorsal.position.set(-radius * 0.05, -radius * 0.6);
    this.dorsal
      .moveTo(0, 0)
      .lineTo(radius * 0.5, 0)
      .lineTo(radius * 0.2, -radius * 0.45)
      .closePath()
      .fill({ color: darker, alpha: 0.92 })
      .stroke({ color: darken(c, 0.3), width: 1.2, alpha: 0.85 });

    this.eye.clear();
    const eyeR = Math.max(2, radius * 0.14);
    this.eye
      .circle(radius * 0.5, -radius * 0.18, eyeR)
      .fill(0xffffff)
      .circle(radius * 0.55, -radius * 0.18, eyeR * 0.58)
      .fill(0x111111);

    this.glow.clear();
    if (this.hasGlow) {
      const gr = radius * 1.4;
      this.glow
        .circle(0, 0, gr).fill({ color: lighter, alpha: 0.04 })
        .circle(0, 0, gr * 0.85).fill({ color: lighter, alpha: 0.08 });
    }

    this.label.position.set(0, -radius - 14);
    this.label.rotation = -this.container.rotation;
    this.label.alpha = this.isAi ? 0.65 : 1;
  }

  /** Counter-scale the name label so it never renders smaller than `minPx` on-screen. */
  setLabelMinPxScale(worldScale: number, minPx = 14, baseFontSize = 14): void {
    const effective = baseFontSize * worldScale;
    const s = effective >= minPx ? 1 : minPx / effective;
    this.label.scale.set(s);
  }

  setIdentity(name: string, color: string): void {
    this.label.text = name;
    this.color = parseColor(color);
    this.draw(this.currentRadius);
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
