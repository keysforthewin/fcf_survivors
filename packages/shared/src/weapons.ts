export type WeaponId =
  | "bubble"
  | "spine"
  | "pulse"
  | "ink"
  | "piranha"
  | "tidal"
  | "puffer"
  | "eel"
  | "kraken"
  | "school";

export type WeaponKind =
  | "projectile"     // linear projectile, dies on first hit
  | "radial-burst"   // N projectiles radial, each dies on first hit
  | "radial-pulse"   // instantaneous AoE around owner; spawns short vis-only static blob
  | "trail"          // drops a static damaging zone behind owner periodically
  | "orbital";       // N projectiles orbiting owner, persistent

export interface WeaponLevel {
  damage: number;
  cooldownMs: number;
  /** Linear/burst: number of projectiles per fire. Orbital: number of orbiting projectiles. */
  count?: number;
  /** Linear: muzzle distance / spread arc. Pulse: AoE radius. Trail: drop radius. Orbital: orbit radius. */
  range: number;
  /** Linear projectile speed (units/sec). */
  speed?: number;
  /** Linear/static lifetime in ms. */
  lifetimeMs?: number;
  /** Visual + collision radius of an individual projectile / drop / piranha. */
  radius?: number;
  /** Pulse AoE radius (overrides range for collision in pulse). */
  pulseRadius?: number;
  /** Trail: ms between drops. Orbital: angular speed (rad/sec). */
  intervalMs?: number;
  /** Per-target re-hit cooldown ms (orbital/trail/pulse). Defaults: orbital 500, trail 350. */
  reHitMs?: number;
  /** Spread arc (rad) for projectile/burst patterns with count > 1. */
  spread?: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  description: string;
  kind: WeaponKind;
  /** Filled in only for evolution weapons. */
  evolutionOf?: WeaponId;
  /** Index 0 = level 1; we look up via `levels[level - 1]`. */
  levels: [WeaponLevel, WeaponLevel, WeaponLevel, WeaponLevel, WeaponLevel];
}

export const MAX_WEAPONS = 4;
export const MAX_WEAPON_LEVEL = 5;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  bubble: {
    id: "bubble",
    name: "Bubble Shot",
    description: "Lobs bubbles in the direction you're swimming.",
    kind: "projectile",
    levels: [
      { damage: 8,  cooldownMs: 1500, count: 1, range: 400, speed: 380, lifetimeMs: 1100, radius: 10 },
      { damage: 11, cooldownMs: 1400, count: 1, range: 420, speed: 400, lifetimeMs: 1100, radius: 10 },
      { damage: 14, cooldownMs: 1300, count: 2, range: 440, speed: 400, lifetimeMs: 1100, radius: 10, spread: 0.22 },
      { damage: 18, cooldownMs: 1200, count: 2, range: 460, speed: 420, lifetimeMs: 1100, radius: 11, spread: 0.20 },
      { damage: 22, cooldownMs: 1100, count: 3, range: 480, speed: 440, lifetimeMs: 1100, radius: 11, spread: 0.28 },
    ],
  },
  spine: {
    id: "spine",
    name: "Spine Burst",
    description: "Fires a ring of spines outward.",
    kind: "radial-burst",
    levels: [
      { damage: 5, cooldownMs: 4000, count: 8,  range: 200, speed: 360, lifetimeMs: 600, radius: 6 },
      { damage: 6, cooldownMs: 3800, count: 10, range: 220, speed: 370, lifetimeMs: 620, radius: 6 },
      { damage: 7, cooldownMs: 3600, count: 12, range: 240, speed: 380, lifetimeMs: 640, radius: 6 },
      { damage: 8, cooldownMs: 3400, count: 14, range: 260, speed: 390, lifetimeMs: 660, radius: 6 },
      { damage: 9, cooldownMs: 3200, count: 16, range: 280, speed: 400, lifetimeMs: 680, radius: 7 },
    ],
  },
  pulse: {
    id: "pulse",
    name: "Electric Pulse",
    description: "Releases a shockwave around you.",
    kind: "radial-pulse",
    levels: [
      { damage: 12, cooldownMs: 5000, range: 250, pulseRadius: 250, lifetimeMs: 220, radius: 250 },
      { damage: 16, cooldownMs: 4800, range: 280, pulseRadius: 280, lifetimeMs: 220, radius: 280 },
      { damage: 20, cooldownMs: 4600, range: 310, pulseRadius: 310, lifetimeMs: 240, radius: 310 },
      { damage: 24, cooldownMs: 4400, range: 340, pulseRadius: 340, lifetimeMs: 260, radius: 340 },
      { damage: 30, cooldownMs: 4200, range: 380, pulseRadius: 380, lifetimeMs: 280, radius: 380 },
    ],
  },
  ink: {
    id: "ink",
    name: "Ink Trail",
    description: "Drops a damaging cloud behind you.",
    kind: "trail",
    levels: [
      { damage: 2, cooldownMs: 0, intervalMs: 280, range: 30, lifetimeMs: 3000, radius: 30, reHitMs: 350 },
      { damage: 2, cooldownMs: 0, intervalMs: 260, range: 34, lifetimeMs: 3000, radius: 34, reHitMs: 340 },
      { damage: 3, cooldownMs: 0, intervalMs: 240, range: 38, lifetimeMs: 3200, radius: 38, reHitMs: 320 },
      { damage: 3, cooldownMs: 0, intervalMs: 220, range: 42, lifetimeMs: 3400, radius: 42, reHitMs: 300 },
      { damage: 4, cooldownMs: 0, intervalMs: 220, range: 46, lifetimeMs: 3600, radius: 46, reHitMs: 280 },
    ],
  },
  piranha: {
    id: "piranha",
    name: "Piranha Pals",
    description: "Two mini fish orbit you and bite passers-by.",
    kind: "orbital",
    levels: [
      { damage: 3, cooldownMs: 0, count: 2, range: 60, intervalMs: 3.0, radius: 14, reHitMs: 500 },
      { damage: 4, cooldownMs: 0, count: 2, range: 70, intervalMs: 3.2, radius: 15, reHitMs: 480 },
      { damage: 5, cooldownMs: 0, count: 3, range: 75, intervalMs: 3.4, radius: 15, reHitMs: 460 },
      { damage: 5, cooldownMs: 0, count: 3, range: 80, intervalMs: 3.6, radius: 16, reHitMs: 440 },
      { damage: 6, cooldownMs: 0, count: 4, range: 90, intervalMs: 3.8, radius: 16, reHitMs: 420 },
    ],
  },
  // Evolutions — defined here so the dispatcher and renderer can branch on them.
  // Granted only via M4 evolution cards; never fire in M3.
  tidal: {
    id: "tidal", name: "Tidal Wave", description: "A sweeping arc of bubbles.",
    kind: "projectile", evolutionOf: "bubble",
    levels: [
      { damage: 30, cooldownMs: 1000, count: 7, range: 600, speed: 440, lifetimeMs: 1200, radius: 14, spread: 0.9 },
      { damage: 30, cooldownMs: 1000, count: 7, range: 600, speed: 440, lifetimeMs: 1200, radius: 14, spread: 0.9 },
      { damage: 30, cooldownMs: 1000, count: 7, range: 600, speed: 440, lifetimeMs: 1200, radius: 14, spread: 0.9 },
      { damage: 30, cooldownMs: 1000, count: 7, range: 600, speed: 440, lifetimeMs: 1200, radius: 14, spread: 0.9 },
      { damage: 30, cooldownMs: 1000, count: 7, range: 600, speed: 440, lifetimeMs: 1200, radius: 14, spread: 0.9 },
    ],
  },
  puffer: {
    id: "puffer", name: "Pufferfish Aura", description: "Permanent ring of spines.",
    kind: "orbital", evolutionOf: "spine",
    levels: [
      { damage: 8, cooldownMs: 0, count: 14, range: 80, intervalMs: 1.6, radius: 7, reHitMs: 350 },
      { damage: 8, cooldownMs: 0, count: 14, range: 80, intervalMs: 1.6, radius: 7, reHitMs: 350 },
      { damage: 8, cooldownMs: 0, count: 14, range: 80, intervalMs: 1.6, radius: 7, reHitMs: 350 },
      { damage: 8, cooldownMs: 0, count: 14, range: 80, intervalMs: 1.6, radius: 7, reHitMs: 350 },
      { damage: 8, cooldownMs: 0, count: 14, range: 80, intervalMs: 1.6, radius: 7, reHitMs: 350 },
    ],
  },
  eel: {
    id: "eel", name: "Eel Storm", description: "Chain lightning to nearby fish.",
    kind: "radial-pulse", evolutionOf: "pulse",
    levels: [
      { damage: 40, cooldownMs: 3000, range: 500, pulseRadius: 500, lifetimeMs: 320, radius: 500 },
      { damage: 40, cooldownMs: 3000, range: 500, pulseRadius: 500, lifetimeMs: 320, radius: 500 },
      { damage: 40, cooldownMs: 3000, range: 500, pulseRadius: 500, lifetimeMs: 320, radius: 500 },
      { damage: 40, cooldownMs: 3000, range: 500, pulseRadius: 500, lifetimeMs: 320, radius: 500 },
      { damage: 40, cooldownMs: 3000, range: 500, pulseRadius: 500, lifetimeMs: 320, radius: 500 },
    ],
  },
  kraken: {
    id: "kraken", name: "Kraken Bloom", description: "Massive lingering ink cloud.",
    kind: "trail", evolutionOf: "ink",
    levels: [
      { damage: 7, cooldownMs: 0, intervalMs: 280, range: 90, lifetimeMs: 4500, radius: 90, reHitMs: 240 },
      { damage: 7, cooldownMs: 0, intervalMs: 280, range: 90, lifetimeMs: 4500, radius: 90, reHitMs: 240 },
      { damage: 7, cooldownMs: 0, intervalMs: 280, range: 90, lifetimeMs: 4500, radius: 90, reHitMs: 240 },
      { damage: 7, cooldownMs: 0, intervalMs: 280, range: 90, lifetimeMs: 4500, radius: 90, reHitMs: 240 },
      { damage: 7, cooldownMs: 0, intervalMs: 280, range: 90, lifetimeMs: 4500, radius: 90, reHitMs: 240 },
    ],
  },
  school: {
    id: "school", name: "Piranha School", description: "Six piranhas, faster bites.",
    kind: "orbital", evolutionOf: "piranha",
    levels: [
      { damage: 18, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
      { damage: 18, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
      { damage: 18, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
      { damage: 18, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
      { damage: 18, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
    ],
  },
};

export function getWeaponLevel(id: WeaponId, level: number): WeaponLevel {
  const def = WEAPONS[id];
  const idx = Math.max(0, Math.min(MAX_WEAPON_LEVEL - 1, level - 1));
  return def.levels[idx]!;
}
