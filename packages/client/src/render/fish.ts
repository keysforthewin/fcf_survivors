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
  private hpBar = new Graphics();
  private color: number;
  private isAi: boolean;
  private currentRadius = 0;
  private currentHpPct = 1;
  private currentMass = 0;
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
    // Layer order (back → front): glow, [bodyGroup: tail, body, dorsal, eye], hpBar, label.
    // bodyGroup is the squash-stretch carrier — glow/hpBar/label stay un-distorted.
    this.container.addChild(this.glow);
    this.container.addChild(this.bodyGroup);
    this.bodyGroup.addChild(this.tail);
    this.bodyGroup.addChild(this.body);
    this.bodyGroup.addChild(this.dorsal);
    this.bodyGroup.addChild(this.eye);
    this.container.addChild(this.hpBar);
    const style = new TextStyle({
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 13,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 3, alpha: 0.6 },
      align: "center",
    });
    this.label = new Text({ text: name, style });
    this.label.anchor.set(0.5);
    this.container.addChild(this.label);
    this.draw(fishRadius(10), 1);
  }

  setTransform(x: number, y: number, vx: number, vy: number): void {
    this.container.x = x;
    this.container.y = y;
    const speed = Math.hypot(vx, vy);
    this.speed = speed;
    if (speed > 5) {
      this.headingX = vx / speed;
      this.headingY = vy / speed;
    }
    this.container.rotation = Math.atan2(this.headingY, this.headingX);
  }

  update(mass: number, hp: number, maxHp: number, dt: number): void {
    const r = fishRadius(mass);
    const hpPct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    const wantsGlow = mass > 50 && !this.isAi;
    if (
      Math.abs(r - this.currentRadius) > 0.5 ||
      Math.abs(hpPct - this.currentHpPct) > 0.01 ||
      Math.abs(mass - this.currentMass) > 5 ||
      wantsGlow !== this.hasGlow
    ) {
      this.currentMass = mass;
      this.hasGlow = wantsGlow;
      this.draw(r, hpPct);
    }
    // tail wiggle (slightly faster when bigger to read as "swimming hard")
    this.swimPhase += dt * (8 + Math.min(4, mass / 50));
    const wiggle = Math.sin(this.swimPhase) * 0.28;
    this.tail.rotation = wiggle;
    this.dorsal.rotation = -wiggle * 0.4;
    // Velocity-driven squash-stretch: faster fish stretch forward and squash vertically.
    // Speed is in world units / second; ~200 is a brisk swim.
    const target = Math.max(0, Math.min(0.22, this.speed / 900));
    const ease = 1 - Math.pow(0.001, dt);
    this.stretchX += (1 + target - this.stretchX) * ease;
    this.stretchY += (1 - target * 0.5 - this.stretchY) * ease;
    this.bodyGroup.scale.set(this.stretchX, this.stretchY);
  }

  private draw(radius: number, hpPct: number): void {
    this.currentRadius = radius;
    this.currentHpPct = hpPct;

    const c = this.color;
    const darker = darken(c, 0.55);
    const lighter = lighten(c, 0.32);
    const spineColor = darken(c, 0.4);

    this.body.clear();
    // outline (slightly larger ellipse for separation against background)
    this.body
      .ellipse(0, 0, radius + 1, radius * 0.78 + 1)
      .fill({ color: 0x000000, alpha: 0.25 });
    // base body
    this.body
      .ellipse(0, 0, radius, radius * 0.78)
      .fill(c)
      .stroke({ color: darker, width: 2, alpha: 0.95 });
    // spine line
    this.body
      .moveTo(-radius * 0.7, -radius * 0.1)
      .lineTo(radius * 0.7, -radius * 0.1)
      .stroke({ color: spineColor, width: Math.max(1, radius * 0.06), alpha: 0.35 });
    // belly highlight
    this.body
      .ellipse(0, radius * 0.22, radius * 0.72, radius * 0.42)
      .fill({ color: lighter, alpha: 0.4 });

    // tail (positioned behind body)
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

    // dorsal fin (small triangle on top)
    this.dorsal.clear();
    this.dorsal.position.set(-radius * 0.05, -radius * 0.6);
    this.dorsal
      .moveTo(0, 0)
      .lineTo(radius * 0.5, 0)
      .lineTo(radius * 0.2, -radius * 0.45)
      .closePath()
      .fill({ color: darker, alpha: 0.92 })
      .stroke({ color: darken(c, 0.3), width: 1.2, alpha: 0.85 });

    // eye (white sclera; pupil drifts forward via container.x in update())
    this.eye.clear();
    const eyeR = Math.max(2, radius * 0.14);
    this.eye
      .circle(radius * 0.5, -radius * 0.18, eyeR)
      .fill(0xffffff)
      .circle(radius * 0.55, -radius * 0.18, eyeR * 0.58)
      .fill(0x111111);

    // big-fish glow ring
    this.glow.clear();
    if (this.hasGlow) {
      const gr = radius * 1.4;
      this.glow
        .circle(0, 0, gr).fill({ color: lighter, alpha: 0.04 })
        .circle(0, 0, gr * 0.85).fill({ color: lighter, alpha: 0.08 });
    }

    // label
    this.label.position.set(0, -radius - 14);
    this.label.rotation = -this.container.rotation;
    this.label.alpha = this.isAi ? 0.65 : 1;

    // hp bar
    this.hpBar.clear();
    if (hpPct < 0.999) {
      const barW = Math.max(40, radius * 1.4);
      const barH = 4;
      const barY = -radius - 6;
      this.hpBar
        .rect(-barW / 2, barY, barW, barH)
        .fill({ color: 0x000000, alpha: 0.5 })
        .rect(-barW / 2, barY, barW * hpPct, barH)
        .fill(hpPct > 0.5 ? 0x7fffa1 : hpPct > 0.25 ? 0xffd97f : 0xff6f7f);
      this.hpBar.rotation = -this.container.rotation;
    }
  }

  setIdentity(name: string, color: string): void {
    this.label.text = name;
    this.color = parseColor(color);
    this.draw(this.currentRadius, this.currentHpPct);
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
