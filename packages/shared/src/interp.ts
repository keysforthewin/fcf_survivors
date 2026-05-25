/** A position sample stamped with the server wall-clock time (Date.now domain) it is valid for. */
export interface TimedSample {
  t: number;
  x: number;
  y: number;
}

/** A sampled position plus the velocity (world px/s) of the segment it was derived from. */
export interface InterpResult {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Sample a server-time-stamped position buffer at `renderTime`.
 *
 * The single source of truth for client entity interpolation (`client/src/scenes/arena.ts`).
 * `samples` must be sorted ascending by `t`; `renderTime` and `t` share one clock domain
 * (server `Date.now()`). Returns `null` only for an empty buffer.
 *
 * - before the oldest sample → clamp to the oldest position (velocity from the first segment)
 * - between two samples       → linear interpolation
 * - past the newest sample    → extrapolate along the last segment's velocity, capped at `maxExtrapMs`
 *
 * Zero/negative-width spans are guarded so a duplicate timestamp can never produce Infinity/NaN.
 */
export function sampleAt(
  samples: TimedSample[],
  renderTime: number,
  maxExtrapMs: number,
): InterpResult | null {
  const n = samples.length;
  if (n === 0) return null;
  const first = samples[0]!;
  if (n === 1) return { x: first.x, y: first.y, vx: 0, vy: 0 };
  const last = samples[n - 1]!;

  // Before the buffer starts: hold the oldest position, velocity from the first segment.
  if (renderTime <= first.t) {
    const a = samples[0]!;
    const b = samples[1]!;
    const span = Math.max(1, b.t - a.t);
    return { x: a.x, y: a.y, vx: (b.x - a.x) / (span / 1000), vy: (b.y - a.y) / (span / 1000) };
  }

  // Past the newest sample: extrapolate along the last segment's velocity, capped.
  if (renderTime >= last.t) {
    const a = samples[n - 2]!;
    const b = samples[n - 1]!;
    const span = Math.max(1, b.t - a.t);
    const vx = (b.x - a.x) / (span / 1000);
    const vy = (b.y - a.y) / (span / 1000);
    const ahead = Math.min(renderTime - last.t, maxExtrapMs);
    return { x: b.x + vx * (ahead / 1000), y: b.y + vy * (ahead / 1000), vx, vy };
  }

  // Between two samples: find the bracketing segment [a, b] and lerp.
  let i = 0;
  for (let k = n - 2; k >= 0; k--) {
    if (samples[k]!.t <= renderTime) { i = k; break; }
  }
  const a = samples[i]!;
  const b = samples[i + 1]!;
  const span = Math.max(1, b.t - a.t);
  const t = (renderTime - a.t) / span;
  const vx = (b.x - a.x) / (span / 1000);
  const vy = (b.y - a.y) / (span / 1000);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, vx, vy };
}
