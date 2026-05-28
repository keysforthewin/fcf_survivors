import { describe, expect, test } from "bun:test";
import { ARENA, PELLET, centerGaussianPoint } from "./balance.js";

/** Deterministic PRNG so distribution assertions are stable across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("centerGaussianPoint", () => {
  const cx = ARENA.width / 2;
  const cy = ARENA.height / 2;

  test("every sample lands inside the arena", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 5000; i++) {
      const { x, y } = centerGaussianPoint(rng, PELLET.centerSpread);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(ARENA.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(ARENA.height);
    }
  });

  test("is centered on the arena (mean ≈ center)", () => {
    const rng = mulberry32(2);
    let sx = 0;
    let sy = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const { x, y } = centerGaussianPoint(rng, PELLET.centerSpread);
      sx += x;
      sy += y;
    }
    expect(Math.abs(sx / n - cx)).toBeLessThan(150);
    expect(Math.abs(sy / n - cy)).toBeLessThan(150);
  });

  test("is radially symmetric — no crosshair (axis ≈ diagonal density)", () => {
    // Within an annulus fully inside the arena, an isotropic distribution spreads
    // points uniformly over angle, so the four axis-aligned 45° sectors hold about
    // as many points as the four diagonal sectors. The old per-axis power-law
    // piled points onto the axes, which would blow this ratio way past tolerance.
    const rng = mulberry32(3);
    const rMin = 0.15 * ARENA.width;
    const rMax = 0.35 * ARENA.width;
    let onAxis = 0;
    let onDiagonal = 0;
    for (let i = 0; i < 40000; i++) {
      const { x, y } = centerGaussianPoint(rng, PELLET.centerSpread);
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      if (r < rMin || r > rMax) continue;
      // Fold the angle into [0,90) and measure distance to the nearest axis (0/90).
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const folded = ((deg % 90) + 90) % 90;
      const toAxis = Math.min(folded, 90 - folded);
      if (toAxis < 22.5) onAxis++;
      else onDiagonal++;
    }
    const ratio = onAxis / onDiagonal;
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.18);
  });

  test("concentrates centrally and thins toward the edges", () => {
    const rng = mulberry32(4);
    const n = 20000;
    let withinHalfRadius = 0; // disc of radius = quarter of the arena width
    let nearEdge = 0; // outside the inscribed circle (corners/edges)
    for (let i = 0; i < n; i++) {
      const { x, y } = centerGaussianPoint(rng, PELLET.centerSpread);
      const r = Math.hypot(x - cx, y - cy);
      if (r <= 0.25 * ARENA.width) withinHalfRadius++;
      if (r > 0.5 * ARENA.width) nearEdge++;
    }
    // Dense core: most pellets sit well inside the middle.
    expect(withinHalfRadius / n).toBeGreaterThan(0.5);
    // Sparse rim: only a sliver reaches the outer arena.
    expect(nearEdge / n).toBeLessThan(0.1);
  });
});
