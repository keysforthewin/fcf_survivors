/**
 * Procedural sound module. Lazy-initialised on first user gesture (mandatory for
 * browser autoplay policy). All sounds are pure synth — no audio assets.
 *
 * Each play* function accepts an optional `volume` scalar in [0,1] which the caller
 * uses for distance attenuation against the camera.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;

export function initSound(): void {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.45;
    masterGain.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function setMuted(m: boolean): void {
  muted = m;
}

export function isMuted(): boolean { return muted; }

function envelope(
  freq: number,
  type: OscillatorType,
  attack: number,
  decay: number,
  peak: number,
  endFreq?: number,
  filterFreq?: number,
  filterQ?: number,
  volume = 1,
): void {
  if (!ctx || !masterGain || muted) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + attack + decay);
  }
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak * volume, now + attack);
  g.gain.exponentialRampToValueAtTime(0.001, now + attack + decay);

  let last: AudioNode = osc;
  if (filterFreq !== undefined) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(filterFreq, now);
    f.Q.value = filterQ ?? 1;
    last.connect(f);
    last = f;
  }
  last.connect(g).connect(masterGain);
  osc.start(now);
  osc.stop(now + attack + decay + 0.02);
}

function noiseBurst(duration: number, freqCenter: number, q: number, peak: number, volume = 1): void {
  if (!ctx || !masterGain || muted) return;
  const now = ctx.currentTime;
  const sampleRate = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(freqCenter, now);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak * volume, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  src.connect(f).connect(g).connect(masterGain);
  src.start(now);
  src.stop(now + duration + 0.02);
}

export function playEat(mass: number, volume = 1): void {
  // Higher pitch for smaller fish; lower for bigger.
  const pitch = Math.max(280, Math.min(820, 700 - mass * 4));
  envelope(pitch, "sine", 0.005, 0.12, 0.35, pitch * 0.6, 1600, 4, volume);
}

export function playPellet(volume = 1): void {
  envelope(880, "triangle", 0.003, 0.05, 0.12, 660, 2000, 2, volume);
}

export function playLevelUp(volume = 1): void {
  if (!ctx) return;
  const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
  notes.forEach((f, i) => {
    setTimeout(() => envelope(f, "triangle", 0.01, 0.18, 0.28, f, 2400, 1, volume), i * 75);
  });
}

export function playBoost(volume = 1): void {
  noiseBurst(0.32, 1200, 0.9, 0.18, volume);
  envelope(140, "sawtooth", 0.005, 0.28, 0.10, 60, 800, 6, volume);
}

export function playHit(volume = 1): void {
  envelope(220, "square", 0.002, 0.07, 0.18, 110, 900, 4, volume);
}

/** Punchier weapon-impact sound — short noise + bright square envelope. Used for hit markers. */
export function playWeaponHit(volume = 1): void {
  noiseBurst(0.06, 1400, 1.6, 0.16, volume);
  envelope(360, "square", 0.001, 0.05, 0.22, 180, 1600, 2, volume);
}

export function playDeath(volume = 1): void {
  if (!ctx) return;
  envelope(440, "sawtooth", 0.02, 0.5, 0.32, 80, 1200, 2, volume);
  setTimeout(() => envelope(220, "sawtooth", 0.02, 0.6, 0.22, 50, 700, 2, volume), 150);
}

export function playShatter(volume = 1): void {
  noiseBurst(0.22, 600, 1.4, 0.18, volume);
  envelope(160, "square", 0.002, 0.18, 0.12, 80, 1100, 3, volume);
}
