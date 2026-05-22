import { Container, Graphics } from "pixi.js";

interface Particle {
  gfx: Graphics;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  drag: number;
  age: number;
  lifeMs: number;
  startSize: number;
  endSize: number;
  startAlpha: number;
}

export class ParticleSystem {
  container = new Container();
  private particles: Particle[] = [];
  private pool: Graphics[] = [];
  private poolCap = 400;

  emitShatter(x: number, y: number, color: number, mass: number): void {
    const count = Math.min(40, Math.max(12, Math.floor(mass / 2)));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 220;
      const size = 2 + Math.random() * 4;
      this.spawn({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        ax: 0, ay: 0,
        drag: 0.92,
        lifeMs: 600 + Math.random() * 600,
        startSize: size,
        endSize: 0,
        startAlpha: 0.95,
        color,
      });
    }
  }

  emitEat(x: number, y: number, color: number): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
      const r = 8 + Math.random() * 6;
      this.spawn({
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: -Math.cos(a) * 60,
        vy: -Math.sin(a) * 60,
        ax: 0, ay: 0,
        drag: 0.88,
        lifeMs: 320,
        startSize: 3,
        endSize: 0,
        startAlpha: 0.7,
        color,
      });
    }
  }

  /** A bigger, juicier eat-burst layered with a quick radial flash. Use when a fish gets chomped. */
  emitChomp(x: number, y: number, color: number, mass: number): void {
    const count = Math.min(50, Math.max(18, Math.floor(mass / 1.5)));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 280;
      const size = 2.5 + Math.random() * 5;
      this.spawn({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        ax: 0, ay: 0,
        drag: 0.9,
        lifeMs: 500 + Math.random() * 500,
        startSize: size,
        endSize: 0,
        startAlpha: 1,
        color,
      });
    }
    // Bright flash that shrinks fast — gives the moment some punch.
    this.spawn({
      x, y,
      vx: 0, vy: 0, ax: 0, ay: 0,
      drag: 1,
      lifeMs: 220,
      startSize: Math.min(80, 14 + Math.sqrt(mass) * 3),
      endSize: 0,
      startAlpha: 0.75,
      color: 0xffffff,
    });
  }

  /** Stream of particles drawn from `from` to `to` — telegraphs the suction before a chomp. */
  emitSuction(fromX: number, fromY: number, toX: number, toY: number, color: number): void {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    for (let i = 0; i < 4; i++) {
      const startT = Math.random();
      const sx = fromX + dx * startT + (Math.random() - 0.5) * 8;
      const sy = fromY + dy * startT + (Math.random() - 0.5) * 8;
      this.spawn({
        x: sx, y: sy,
        vx: nx * (180 + Math.random() * 80),
        vy: ny * (180 + Math.random() * 80),
        ax: 0, ay: 0,
        drag: 0.94,
        lifeMs: 280,
        startSize: 2.5,
        endSize: 0,
        startAlpha: 0.85,
        color,
      });
    }
  }

  emitBoostTrail(x: number, y: number, vx: number, vy: number, color: number): void {
    for (let i = 0; i < 2; i++) {
      const jx = (Math.random() - 0.5) * 6;
      const jy = (Math.random() - 0.5) * 6;
      this.spawn({
        x: x + jx,
        y: y + jy,
        vx: -vx * 0.2 + (Math.random() - 0.5) * 30,
        vy: -vy * 0.2 + (Math.random() - 0.5) * 30,
        ax: 0, ay: 0,
        drag: 0.86,
        lifeMs: 500,
        startSize: 5,
        endSize: 0,
        startAlpha: 0.55,
        color,
      });
    }
  }

  private spawn(opts: {
    x: number; y: number;
    vx: number; vy: number;
    ax: number; ay: number;
    drag: number; lifeMs: number;
    startSize: number; endSize: number;
    startAlpha: number; color: number;
  }): void {
    const gfx = this.pool.pop() ?? new Graphics();
    gfx.clear();
    gfx.circle(0, 0, opts.startSize).fill({ color: opts.color, alpha: opts.startAlpha });
    gfx.x = opts.x;
    gfx.y = opts.y;
    gfx.alpha = opts.startAlpha;
    gfx.scale.set(1);
    this.container.addChild(gfx);
    this.particles.push({
      gfx,
      vx: opts.vx, vy: opts.vy,
      ax: opts.ax, ay: opts.ay,
      drag: opts.drag,
      age: 0,
      lifeMs: opts.lifeMs,
      startSize: opts.startSize,
      endSize: opts.endSize,
      startAlpha: opts.startAlpha,
    });
  }

  update(dtSec: number): void {
    const dtMs = dtSec * 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.age += dtMs;
      if (p.age >= p.lifeMs) {
        // recycle
        this.container.removeChild(p.gfx);
        if (this.pool.length < this.poolCap) this.pool.push(p.gfx);
        else p.gfx.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.vx += p.ax * dtSec;
      p.vy += p.ay * dtSec;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.gfx.x += p.vx * dtSec;
      p.gfx.y += p.vy * dtSec;
      const t = p.age / p.lifeMs;
      p.gfx.alpha = p.startAlpha * (1 - t);
      const s = 1 - t; // shrink to 0
      p.gfx.scale.set(s);
    }
  }

  destroy(): void {
    for (const p of this.particles) p.gfx.destroy();
    for (const g of this.pool) g.destroy();
    this.particles = [];
    this.pool = [];
    this.container.destroy({ children: true });
  }
}
