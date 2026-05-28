import { describe, expect, test } from "bun:test";
import { sampleAt, deadReckon } from "./interp.js";

describe("sampleAt", () => {
  test("empty buffer returns null", () => {
    expect(sampleAt([], 100, 100)).toBeNull();
  });

  test("single sample holds position with zero velocity", () => {
    expect(sampleAt([{ t: 0, x: 5, y: 7 }], 50, 100)).toEqual({ x: 5, y: 7, vx: 0, vy: 0 });
  });

  test("interpolates the midpoint between two samples", () => {
    const s = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 100, y: 0 },
    ];
    const r = sampleAt(s, 50, 100)!;
    expect(r.x).toBeCloseTo(50, 9);
    expect(r.y).toBeCloseTo(0, 9);
    expect(r.vx).toBeCloseTo(1000, 9); // 100px over 0.1s
    expect(r.vy).toBeCloseTo(0, 9);
  });

  test("clamps to the oldest sample before the buffer starts", () => {
    const s = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 100, y: 0 },
    ];
    const r = sampleAt(s, -50, 100)!;
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.y).toBeCloseTo(0, 9);
    expect(r.vx).toBeCloseTo(1000, 9); // velocity from first segment
  });

  test("extrapolates within the cap past the newest sample", () => {
    const s = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 100, y: 0 },
    ];
    const r = sampleAt(s, 150, 100)!; // 50ms ahead, under the 100ms cap
    expect(r.x).toBeCloseTo(150, 9); // 100 + 1000px/s * 0.05s
    expect(r.vx).toBeCloseTo(1000, 9);
  });

  test("clamps extrapolation at maxExtrapMs", () => {
    const s = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 100, y: 0 },
    ];
    const r = sampleAt(s, 400, 100)!; // 300ms ahead, clamped to 100ms
    expect(r.x).toBeCloseTo(200, 9); // 100 + 1000px/s * 0.1s, NOT 400
  });

  test("scans past the first segment with 3+ samples", () => {
    const s = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 100, y: 0 },
      { t: 200, x: 300, y: 0 },
    ];
    const r = sampleAt(s, 150, 100)!;
    expect(r.x).toBeCloseTo(200, 9); // midpoint of [100,200] segment: 100 + 200*0.5
    expect(r.vx).toBeCloseTo(2000, 9); // 200px over 0.1s
  });

  test("renderTime exactly on a sample boundary lands on that sample", () => {
    const s = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 100, y: 0 },
      { t: 200, x: 300, y: 0 },
    ];
    const r = sampleAt(s, 100, 100)!;
    expect(r.x).toBeCloseTo(100, 9);
    expect(Number.isFinite(r.vx)).toBe(true);
  });

  test("duplicate timestamps never produce Infinity or NaN", () => {
    const s = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 100, y: 0 },
      { t: 100, x: 100, y: 0 }, // duplicate of newest
    ];
    const extrap = sampleAt(s, 150, 100)!;
    expect(Number.isFinite(extrap.x)).toBe(true);
    expect(Number.isFinite(extrap.vx)).toBe(true);
    const mid = sampleAt([{ t: 50, x: 10, y: 0 }, { t: 50, x: 20, y: 0 }], 50, 100)!;
    expect(Number.isFinite(mid.x)).toBe(true);
    expect(Number.isFinite(mid.vx)).toBe(true);
  });
});

describe("deadReckon", () => {
  test("zero velocity holds the baseline position", () => {
    expect(deadReckon(5, 7, 0, 0, 100, 250)).toEqual({ x: 5, y: 7 });
  });

  test("extrapolates along velocity under the cap", () => {
    const r = deadReckon(0, 0, 1000, -500, 50, 250); // 50ms at (1000,-500) px/s
    expect(r.x).toBeCloseTo(50, 9);
    expect(r.y).toBeCloseTo(-25, 9);
  });

  test("clamps aheadMs at maxAheadMs", () => {
    const r = deadReckon(0, 0, 1000, 0, 400, 250); // 400ms requested, capped to 250ms
    expect(r.x).toBeCloseTo(250, 9); // NOT 400
  });

  test("clamps negative aheadMs to zero (clock skew safety)", () => {
    expect(deadReckon(10, 10, 1000, 1000, -30, 250)).toEqual({ x: 10, y: 10 });
  });
});
