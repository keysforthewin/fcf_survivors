/**
 * Lightweight perf instrumentation for the arena.
 *
 * Usage:
 *   const span = perf.begin("snapshot");
 *   ...work...
 *   span.end();
 *
 *   perf.setCount("fish", N);
 *   perf.frame(); // call once per rendered frame
 *
 * Press F3 in the browser to toggle the overlay. Window globals
 * `__perf` and `__perfLog()` are exposed for ad-hoc inspection.
 *
 * The overlay shows rolling averages over the last `windowFrames` frames so
 * single-frame spikes don't dominate the reading.
 */

const WINDOW_FRAMES = 60;

interface PhaseStats {
  samples: number[];
  index: number;
  filled: number;
  lastMs: number;
}

interface CountStats {
  value: number;
}

interface GaugeStats {
  value: number;
  unit: string;
}

class Perf {
  private phases = new Map<string, PhaseStats>();
  private counts = new Map<string, CountStats>();
  private gauges = new Map<string, GaugeStats>();
  private frameTimes: number[] = new Array(WINDOW_FRAMES).fill(0);
  private frameIndex = 0;
  private frameFilled = 0;
  private lastFrameAt = performance.now();
  private overlayEl: HTMLElement | null = null;
  private overlayVisible = false;
  private lastRenderAt = 0;
  /** Frames since last render of the overlay text (limit redraw cost). */
  private rendersSkipped = 0;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", (e) => {
        if (e.key === "F3") {
          e.preventDefault();
          this.toggle();
        }
      });
      (window as unknown as { __perf: Perf }).__perf = this;
      (window as unknown as { __perfLog: () => void }).__perfLog = () => {
        // eslint-disable-next-line no-console
        console.log(this.snapshot());
      };
    }
  }

  begin(name: string): { end: () => void } {
    const start = performance.now();
    return {
      end: () => {
        const dur = performance.now() - start;
        this.record(name, dur);
      },
    };
  }

  /** Record a duration directly (alternative to begin/end). */
  record(name: string, ms: number): void {
    let s = this.phases.get(name);
    if (!s) {
      s = { samples: new Array(WINDOW_FRAMES).fill(0), index: 0, filled: 0, lastMs: 0 };
      this.phases.set(name, s);
    }
    s.samples[s.index] = ms;
    s.index = (s.index + 1) % WINDOW_FRAMES;
    if (s.filled < WINDOW_FRAMES) s.filled++;
    s.lastMs = ms;
  }

  setCount(name: string, value: number): void {
    let c = this.counts.get(name);
    if (!c) {
      c = { value: 0 };
      this.counts.set(name, c);
    }
    c.value = value;
  }

  /**
   * Set a named network/timing gauge (latest value + unit). Rendered in the overlay's
   * "network" block in insertion order, so the first setGauge call per name fixes its row.
   */
  setGauge(name: string, value: number, unit = ""): void {
    let g = this.gauges.get(name);
    if (!g) {
      g = { value: 0, unit };
      this.gauges.set(name, g);
    }
    g.value = value;
    g.unit = unit;
  }

  frame(): void {
    const now = performance.now();
    const dt = now - this.lastFrameAt;
    this.lastFrameAt = now;
    this.frameTimes[this.frameIndex] = dt;
    this.frameIndex = (this.frameIndex + 1) % WINDOW_FRAMES;
    if (this.frameFilled < WINDOW_FRAMES) this.frameFilled++;
    if (this.overlayVisible) {
      // Throttle DOM writes to ~5 Hz to avoid making our own perf overlay
      // measurably slow.
      if (now - this.lastRenderAt > 200) {
        this.lastRenderAt = now;
        this.renderOverlay();
      }
    }
  }

  toggle(force?: boolean): void {
    const next = typeof force === "boolean" ? force : !this.overlayVisible;
    this.overlayVisible = next;
    if (next) {
      if (!this.overlayEl) this.overlayEl = this.mountOverlay();
      this.overlayEl.style.display = "block";
      this.renderOverlay();
    } else if (this.overlayEl) {
      this.overlayEl.style.display = "none";
    }
  }

  snapshot(): {
    fps: number;
    frameMs: number;
    phases: Array<{ name: string; avgMs: number; lastMs: number }>;
    counts: Array<{ name: string; value: number }>;
    gauges: Array<{ name: string; value: number; unit: string }>;
  } {
    const frameMs = avg(this.frameTimes, this.frameFilled);
    return {
      fps: frameMs > 0 ? 1000 / frameMs : 0,
      frameMs,
      phases: Array.from(this.phases.entries())
        .map(([name, s]) => ({ name, avgMs: avg(s.samples, s.filled), lastMs: s.lastMs }))
        .sort((a, b) => b.avgMs - a.avgMs),
      counts: Array.from(this.counts.entries()).map(([name, c]) => ({ name, value: c.value })),
      // Insertion order (no sort) so the network rows stay in their designed order.
      gauges: Array.from(this.gauges.entries()).map(([name, g]) => ({ name, value: g.value, unit: g.unit })),
    };
  }

  private mountOverlay(): HTMLElement {
    const el = document.createElement("div");
    el.setAttribute("data-perf-overlay", "");
    Object.assign(el.style, {
      position: "fixed",
      top: "10px",
      left: "10px",
      zIndex: "10000",
      padding: "8px 10px",
      background: "rgba(6, 14, 24, 0.78)",
      border: "1px solid rgba(127, 207, 255, 0.4)",
      borderRadius: "6px",
      color: "#cfeaff",
      font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
      whiteSpace: "pre",
      pointerEvents: "none",
      letterSpacing: "0.02em",
      textShadow: "0 1px 0 rgba(0,0,0,0.5)",
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    return el;
  }

  private renderOverlay(): void {
    if (!this.overlayEl) return;
    const snap = this.snapshot();
    const lines: string[] = [];
    lines.push(`PERF  ${snap.fps.toFixed(0).padStart(3)} fps  ${snap.frameMs.toFixed(2).padStart(5)} ms/frame`);
    lines.push("─ phases (rolling avg) ────────────");
    for (const p of snap.phases) {
      const pct = snap.frameMs > 0 ? (p.avgMs / snap.frameMs) * 100 : 0;
      lines.push(
        `${p.name.padEnd(14)} ${p.avgMs.toFixed(2).padStart(5)} ms  (${pct.toFixed(0).padStart(2)}%)  last ${p.lastMs.toFixed(2)}`
      );
    }
    lines.push("─ entities ────────────────────────");
    for (const c of snap.counts) {
      lines.push(`${c.name.padEnd(14)} ${String(c.value).padStart(5)}`);
    }
    if (snap.gauges.length > 0) {
      lines.push("─ network ─────────────────────────");
      for (const g of snap.gauges) {
        // "#" / "B/s" gauges read as integers; ms/offset gauges keep one decimal.
        const intLike = g.unit === "#" || g.unit === "B/s";
        const val = intLike ? String(Math.round(g.value)) : g.value.toFixed(1);
        lines.push(`${g.name.padEnd(14)} ${val.padStart(7)} ${g.unit}`);
      }
    }
    lines.push("");
    lines.push("F3 to toggle · __perfLog() in console");
    this.overlayEl.textContent = lines.join("\n");
  }
}

function avg(arr: number[], filled: number): number {
  if (filled <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < filled; i++) sum += arr[i]!;
  return sum / filled;
}

export const perf = new Perf();
