import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { fishRadius } from "@fcf/shared";

export class FishSprite {
  container = new Container();
  private body = new Graphics();
  private tail = new Graphics();
  private eye = new Graphics();
  private label: Text;
  private hpBar = new Graphics();
  private color: number;
  private isAi: boolean;
  private currentRadius = 0;
  private currentHpPct = 1;
  private swimPhase = Math.random() * Math.PI * 2;
  private headingX = 1;
  private headingY = 0;

  constructor(name: string, color: string, isAi: boolean) {
    this.color = parseColor(color);
    this.isAi = isAi;
    this.container.addChild(this.tail);
    this.container.addChild(this.body);
    this.container.addChild(this.eye);
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
    if (speed > 5) {
      this.headingX = vx / speed;
      this.headingY = vy / speed;
    }
    // rotate container to face heading
    this.container.rotation = Math.atan2(this.headingY, this.headingX);
  }

  update(mass: number, hp: number, maxHp: number, dt: number): void {
    const r = fishRadius(mass);
    const hpPct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    if (Math.abs(r - this.currentRadius) > 0.5 || Math.abs(hpPct - this.currentHpPct) > 0.01) {
      this.draw(r, hpPct);
    }
    // tail wiggle
    this.swimPhase += dt * 8;
    const wiggle = Math.sin(this.swimPhase) * 0.25;
    this.tail.rotation = wiggle;
  }

  private draw(radius: number, hpPct: number): void {
    this.currentRadius = radius;
    this.currentHpPct = hpPct;

    const c = this.color;
    const darker = darken(c, 0.6);
    const lighter = lighten(c, 0.3);

    this.body.clear();
    this.body
      .ellipse(0, 0, radius, radius * 0.78)
      .fill(c)
      .stroke({ color: darker, width: 2, alpha: 0.9 });

    // belly highlight
    this.body
      .ellipse(0, radius * 0.18, radius * 0.7, radius * 0.4)
      .fill({ color: lighter, alpha: 0.35 });

    // tail (positioned behind the fish, pivots on body edge)
    this.tail.clear();
    const tailBase = -radius * 0.85;
    this.tail.position.set(tailBase, 0);
    this.tail
      .moveTo(0, 0)
      .lineTo(-radius * 0.55, -radius * 0.55)
      .lineTo(-radius * 0.4, 0)
      .lineTo(-radius * 0.55, radius * 0.55)
      .closePath()
      .fill(c)
      .stroke({ color: darker, width: 2, alpha: 0.9 });

    // eye
    this.eye.clear();
    const eyeR = Math.max(2, radius * 0.13);
    this.eye
      .circle(radius * 0.5, -radius * 0.18, eyeR)
      .fill(0xffffff)
      .circle(radius * 0.56, -radius * 0.18, eyeR * 0.55)
      .fill(0x111111);

    // label
    this.label.position.set(0, -radius - 14);
    this.label.rotation = -this.container.rotation;
    this.label.alpha = this.isAi ? 0.65 : 1;

    // hp bar (only show if damaged)
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

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

export function parseColor(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

function lighten(c: number, amt: number): number {
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  const rr = Math.min(255, Math.round(r + (255 - r) * amt));
  const gg = Math.min(255, Math.round(g + (255 - g) * amt));
  const bb = Math.min(255, Math.round(b + (255 - b) * amt));
  return (rr << 16) | (gg << 8) | bb;
}

function darken(c: number, amt: number): number {
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  const rr = Math.max(0, Math.round(r * amt));
  const gg = Math.max(0, Math.round(g * amt));
  const bb = Math.max(0, Math.round(b * amt));
  return (rr << 16) | (gg << 8) | bb;
}
