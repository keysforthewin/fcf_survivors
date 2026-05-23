import { Container, Graphics } from "pixi.js";
import { GlowFilter } from "pixi-filters/glow";
import type { ZapEvent } from "@fcf/shared";

// A zap is a short, bright flash. It lives ~200ms, fading out, while its jagged
// geometry is re-randomized a few times so it crackles.
const LIFETIME_MS = 200;
const FLICKER_MS = 45; // cadence at which the jagged shape is regenerated
const SEGMENTS = 7; // subdivisions per bolt (more = jaggier)
const MAX_AMPLITUDE = 26; // px; perpendicular jitter cap at a bolt's midpoint
const AMPLITUDE_FRAC = 0.12; // jitter scales with bolt length, up to MAX_AMPLITUDE
const BRANCH_CHANCE = 0.45;

interface ColorSet {
  glow: number;
  core: number;
}

const COLORS: Record<string, ColorSet> = {
  pulse: { glow: 0x7fcfff, core: 0xffffff },
  eel: { glow: 0xc89bff, core: 0xffffff },
};

export interface Vec {
  x: number;
  y: number;
}

/** Resolves a node id to its current render position (live sprite, else the carried fallback). */
export type NodeResolver = (id: number, fallback: Vec) => Vec;

/** Per-bolt randomness, regenerated on the flicker cadence so the bolt strobes. */
interface BoltSeed {
  /** Perpendicular offset multipliers in [-1, 1] for each interior vertex. */
  offs: number[];
  /** Optional forked offshoot. */
  fork: { t: number; offs: number[]; angle: number; lenFrac: number } | null;
}

export class ZapEffect {
  readonly container = new Container();
  private g = new Graphics();
  private spawnTime: number;
  private nodes: { id: number; x: number; y: number }[];
  private chain: boolean;
  private colors: ColorSet;
  private seeds: BoltSeed[] = [];
  private lastFlicker = -Infinity;

  constructor(zap: ZapEvent, spawnTime: number) {
    this.spawnTime = spawnTime;
    this.nodes = zap.nodes;
    this.chain = zap.chain;
    this.colors = COLORS[zap.weaponId] ?? COLORS.pulse!;
    this.container.addChild(this.g);
    const glow = new GlowFilter({
      distance: 12,
      outerStrength: 2.0,
      innerStrength: 0.3,
      color: this.colors.glow,
      quality: 0.2,
    });
    glow.padding = 16;
    this.container.filters = [glow];
    this.regenSeeds();
  }

  /** Number of bolts: radial = one per target; chain = one per consecutive segment. */
  private boltCount(): number {
    return Math.max(0, this.nodes.length - 1);
  }

  private regenSeeds(): void {
    const n = this.boltCount();
    this.seeds = [];
    for (let i = 0; i < n; i++) {
      const offs: number[] = [];
      for (let j = 1; j < SEGMENTS; j++) offs.push(Math.random() * 2 - 1);
      const fork =
        Math.random() < BRANCH_CHANCE
          ? {
              t: 0.3 + Math.random() * 0.4,
              offs: [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1],
              angle: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.7),
              lenFrac: 0.25 + Math.random() * 0.25,
            }
          : null;
      this.seeds.push({ offs, fork });
    }
  }

  expired(now: number): boolean {
    return now - this.spawnTime >= LIFETIME_MS;
  }

  /** Resolve the [from, to] endpoints for bolt index i to current positions. */
  private endpoints(i: number, resolve: NodeResolver): [Vec, Vec] {
    if (this.chain) {
      const a = this.nodes[i]!;
      const b = this.nodes[i + 1]!;
      return [resolve(a.id, a), resolve(b.id, b)];
    }
    const origin = this.nodes[0]!;
    const target = this.nodes[i + 1]!;
    return [resolve(origin.id, origin), resolve(target.id, target)];
  }

  update(now: number, resolve: NodeResolver): void {
    const age = Math.max(0, Math.min(1, (now - this.spawnTime) / LIFETIME_MS));
    // Ease-out fade plus a per-frame flicker so the bolt shimmers as it dies.
    const fade = (1 - age) * (1 - age);
    const flicker = 0.7 + Math.random() * 0.3;
    this.container.alpha = fade * flicker;

    if (now - this.lastFlicker >= FLICKER_MS) {
      this.regenSeeds();
      this.lastFlicker = now;
    }

    const g = this.g;
    g.clear();
    const n = this.boltCount();
    for (let i = 0; i < n; i++) {
      const [from, to] = this.endpoints(i, resolve);
      this.drawBolt(g, from, to, this.seeds[i]!);
    }
  }

  private drawBolt(g: Graphics, from: Vec, to: Vec, seed: BoltSeed): void {
    const main = jaggedPath(from, to, seed.offs);
    this.strokePath(g, main);

    if (seed.fork) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      // Branch base: a point along the main line at fraction t.
      const bx = from.x + dx * seed.fork.t;
      const by = from.y + dy * seed.fork.t;
      const ca = Math.cos(seed.fork.angle);
      const sa = Math.sin(seed.fork.angle);
      const fLen = len * seed.fork.lenFrac;
      const ex = bx + (ux * ca - uy * sa) * fLen;
      const ey = by + (ux * sa + uy * ca) * fLen;
      const branch = jaggedPath({ x: bx, y: by }, { x: ex, y: ey }, seed.fork.offs);
      this.strokePath(g, branch, 0.6);
    }
  }

  /** Trace the path twice: a wide dim glow stroke, then a thin bright core. */
  private strokePath(g: Graphics, pts: Vec[], scale = 1): void {
    if (pts.length < 2) return;
    trace(g, pts);
    g.stroke({ color: this.colors.glow, width: 6 * scale, alpha: 0.3, cap: "round", join: "round" });
    trace(g, pts);
    g.stroke({ color: this.colors.core, width: 2 * scale, alpha: 0.95, cap: "round", join: "round" });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

function trace(g: Graphics, pts: Vec[]): void {
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
}

/**
 * Build a jagged polyline between two points. Interior vertices are displaced
 * perpendicular to the line by a seeded amount that tapers to zero at both ends,
 * so the bolt connects cleanly to the player and the struck fish.
 */
function jaggedPath(from: Vec, to: Vec, offs: number[]): Vec[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len; // unit perpendicular
  const py = dx / len;
  const amp = Math.min(len * AMPLITUDE_FRAC, MAX_AMPLITUDE);
  const pts: Vec[] = [from];
  for (let j = 1; j < SEGMENTS; j++) {
    const f = j / SEGMENTS;
    const taper = Math.sin(f * Math.PI); // 0 at ends, 1 at midpoint
    const o = (offs[j - 1] ?? 0) * amp * taper;
    pts.push({ x: from.x + dx * f + px * o, y: from.y + dy * f + py * o });
  }
  pts.push(to);
  return pts;
}
