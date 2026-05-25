import { describe, expect, test } from "bun:test";
import { ARENA, FISH, fishRadius } from "./balance.js";
import { stepFishMovement } from "./movement.js";

type State = { x: number; y: number; vx: number; vy: number };

/**
 * Reference implementation mirroring the authoritative server loop
 * (`server/src/sim/world.ts` step(), !isAi branch) minus heading. The parity
 * test below pins stepFishMovement to this so the two can never silently drift.
 */
function refStep(
  s: State,
  tvx: number,
  tvy: number,
  moveSpeed: number,
  boostMult: number,
  mass: number,
  dt: number,
): void {
  const speed = moveSpeed * boostMult;
  const accel = 10 * dt;
  s.vx += (tvx * speed - s.vx) * accel;
  s.vy += (tvy * speed - s.vy) * accel;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  const r = fishRadius(mass);
  if (s.x < r) { s.x = r; s.vx = 0; }
  if (s.x > ARENA.width - r) { s.x = ARENA.width - r; s.vx = 0; }
  if (s.y < r) { s.y = r; s.vy = 0; }
  if (s.y > ARENA.height - r) { s.y = ARENA.height - r; s.vy = 0; }
}

describe("stepFishMovement", () => {
  test("single step matches hand-computed integration", () => {
    const s: State = { x: 1000, y: 1000, vx: 0, vy: 0 };
    // accel = 10*0.05 = 0.5; vx += (320-0)*0.5 = 160; x += 160*0.05 = 8
    stepFishMovement(s, 1, 0, 320, 1, 10, 0.05);
    expect(s.vx).toBeCloseTo(160, 9);
    expect(s.vy).toBeCloseTo(0, 9);
    expect(s.x).toBeCloseTo(1008, 9);
    expect(s.y).toBeCloseTo(1000, 9);
  });

  test("boost multiplier scales the target speed", () => {
    const plain: State = { x: 1000, y: 1000, vx: 0, vy: 0 };
    const boosted: State = { x: 1000, y: 1000, vx: 0, vy: 0 };
    stepFishMovement(plain, 1, 0, 320, 1, 10, 0.05);
    stepFishMovement(boosted, 1, 0, 320, FISH.boostMultiplier, 10, 0.05);
    expect(boosted.vx).toBeCloseTo(plain.vx * FISH.boostMultiplier, 9);
  });

  test("arena clamp pins position to the wall and zeroes that velocity axis", () => {
    const r = fishRadius(10);
    const s: State = { x: r + 4, y: 1000, vx: -1000, vy: 0 };
    stepFishMovement(s, -1, 0, 320, 1, 10, 0.05);
    expect(s.x).toBeCloseTo(r, 9); // clamped to the left wall
    expect(s.vx).toBe(0); // velocity into the wall is killed
    expect(s.vy).toBe(0); // untouched axis stays put
  });

  test("is deterministic for identical inputs", () => {
    const a: State = { x: 500, y: 600, vx: 30, vy: -10 };
    const b: State = { x: 500, y: 600, vx: 30, vy: -10 };
    for (let i = 0; i < 10; i++) {
      stepFishMovement(a, 0.6, -0.8, 412, 1, 47, 0.05);
      stepFishMovement(b, 0.6, -0.8, 412, 1, 47, 0.05);
    }
    expect(a).toEqual(b);
  });

  test("20-step trajectory matches the server reference loop exactly", () => {
    const got: State = { x: 4000, y: 4000, vx: 0, vy: 0 };
    const ref: State = { x: 4000, y: 4000, vx: 0, vy: 0 };
    const moveSpeed = 512;
    for (let i = 0; i < 20; i++) {
      stepFishMovement(got, 0.7071, 0.7071, moveSpeed, 1, 120, 0.05);
      refStep(ref, 0.7071, 0.7071, moveSpeed, 1, 120, 0.05);
    }
    expect(got.x).toBeCloseTo(ref.x, 9);
    expect(got.y).toBeCloseTo(ref.y, 9);
    expect(got.vx).toBeCloseTo(ref.vx, 9);
    expect(got.vy).toBeCloseTo(ref.vy, 9);
  });
});
