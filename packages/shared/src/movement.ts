import { ARENA, fishRadius } from "./balance.js";

/** Velocity smoothing rate: vx converges toward the desired velocity at `ACCEL * dt` per step. */
const ACCEL = 10;

/** Pin a fish inside the arena, killing the velocity component that runs into a wall. */
export function clampToArena(s: { x: number; y: number; vx: number; vy: number }, mass: number): void {
  const r = fishRadius(mass);
  if (s.x < r) { s.x = r; s.vx = 0; }
  if (s.x > ARENA.width - r) { s.x = ARENA.width - r; s.vx = 0; }
  if (s.y < r) { s.y = r; s.vy = 0; }
  if (s.y > ARENA.height - r) { s.y = ARENA.height - r; s.vy = 0; }
}

/**
 * Deterministic fish movement integration — the single source of truth shared by the
 * authoritative server sim (`server/src/sim/world.ts`) and the client predictor
 * (`client/src/scenes/arena.ts`). Mutates `s` in place. Heading is intentionally NOT
 * handled here: it's visual-only, rate-limited, and differs for AI fish.
 *
 * The caller decides whether boost is active (server checks `now >= boostUntil`; the
 * client checks `estServerNow < boostUntil`) and passes the resulting multiplier.
 *
 * NOTE: the smoothing is an explicit-Euler step and is NOT substep-invariant — callers
 * must step at the server tick cadence (`TICK.ms`) for the result to match the server.
 */
export function stepFishMovement(
  s: { x: number; y: number; vx: number; vy: number },
  targetVx: number,
  targetVy: number,
  moveSpeed: number,
  boostMult: number,
  mass: number,
  dtSec: number,
): void {
  const speed = moveSpeed * boostMult;
  const accel = ACCEL * dtSec;
  s.vx += (targetVx * speed - s.vx) * accel;
  s.vy += (targetVy * speed - s.vy) * accel;
  s.x += s.vx * dtSec;
  s.y += s.vy * dtSec;
  clampToArena(s, mass);
}
