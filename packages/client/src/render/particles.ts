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
