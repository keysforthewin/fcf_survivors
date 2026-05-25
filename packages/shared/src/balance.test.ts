import { describe, expect, test } from "bun:test";
import { centerBiasedUnit, PELLET } from "./balance.js";

describe("centerBiasedUnit", () => {
  test("bias=1 is the identity (uniform)", () => {
    for (const u of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999]) {
      expect(centerBiasedUnit(u, 1)).toBeCloseTo(u, 10);
    }
  });

  test("stays within [0,1) and pins the endpoints", () => {
    expect(centerBiasedUnit(0, PELLET.centerBias)).toBe(0);
    expect(centerBiasedUnit(0.5, PELLET.centerBias)).toBe(0.5);
    for (const u of [0.01, 0.3, 0.7, 0.99]) {
      const v = centerBiasedUnit(u, PELLET.centerBias);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("preserves which half of the arena the sample falls in", () => {
    expect(centerBiasedUnit(0.2, PELLET.centerBias)).toBeLessThan(0.5);
    expect(centerBiasedUnit(0.8, PELLET.centerBias)).toBeGreaterThan(0.5);
  });

  test("pulls samples toward the center for bias>1", () => {
    // A sample 0.3 below center moves closer to 0.5 than it started.
    expect(centerBiasedUnit(0.2, 2)).toBeGreaterThan(0.2);
    expect(centerBiasedUnit(0.8, 2)).toBeLessThan(0.8);
  });

  test("concentrates more mass centrally as bias rises", () => {
    // Density bias means the off-center sample lands nearer center with higher exponent.
    const u = 0.15;
    const near = centerBiasedUnit(u, 2);
    const nearer = centerBiasedUnit(u, 4);
    expect(nearer).toBeGreaterThan(near);
  });
});
