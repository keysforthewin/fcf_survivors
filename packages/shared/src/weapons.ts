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
  /** radial-pulse only: true = chain lightning (a path threaded through fish) instead of bolts radiating from the owner. */
  chain?: boolean;
  /** Index 0 = level 1; we look up via `levels[level - 1]`. */
  levels: [WeaponLevel, WeaponLevel, WeaponLevel, WeaponLevel, WeaponLevel];
}

export const MAX_WEAPON_LEVEL = 5;
/** Total weapons + passives a fish can hold at once. */
export const MAX_SLOTS = 5;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  bubble: {
    id: "bubble",
    name: "Bubble Shot",
    description: "Lobs bubbles in the direction you're swimming — reaches farther at higher levels.",
    kind: "projectile",
    levels: [
      { damage: 1, cooldownMs: 1500, count: 1, range: 800,  speed: 380, lifetimeMs: 2200, radius: 20 },
      { damage: 3, cooldownMs: 1400, count: 1, range: 920,  speed: 410, lifetimeMs: 2550, radius: 20 },
      { damage: 5, cooldownMs: 1300, count: 2, range: 1050, speed: 440, lifetimeMs: 2900, radius: 20, spread: 0.22 },
      { damage: 7, cooldownMs: 1200, count: 2, range: 1200, speed: 470, lifetimeMs: 3250, radius: 22, spread: 0.20 },
      { damage: 9, cooldownMs: 1100, count: 3, range: 1400, speed: 500, lifetimeMs: 3600, radius: 22, spread: 0.28 },
    ],
  },
  spine: {
    id: "spine",
    name: "Spine Burst",
    description: "Fires a ring of spines outward.",
    kind: "radial-burst",
    levels: [
      { damage: 1,  cooldownMs: 4000, count: 8,  range: 400, speed: 360, lifetimeMs: 1200, radius: 6 },
      { damage: 4,  cooldownMs: 3800, count: 10, range: 440, speed: 370, lifetimeMs: 1240, radius: 6 },
      { damage: 7,  cooldownMs: 3600, count: 12, range: 480, speed: 380, lifetimeMs: 1280, radius: 6 },
      { damage: 10, cooldownMs: 3400, count: 14, range: 520, speed: 390, lifetimeMs: 1320, radius: 6 },
      { damage: 13, cooldownMs: 3200, count: 16, range: 560, speed: 400, lifetimeMs: 1360, radius: 7 },
    ],
  },
  pulse: {
    id: "pulse",
    name: "Electric Pulse",
    description: "Releases a shockwave around you.",
    kind: "radial-pulse",
    levels: [
      { damage: 1, cooldownMs: 5000, range: 250, pulseRadius: 250, lifetimeMs: 220, radius: 250 },
      { damage: 3, cooldownMs: 4800, range: 280, pulseRadius: 280, lifetimeMs: 220, radius: 280 },
      { damage: 5, cooldownMs: 4600, range: 310, pulseRadius: 310, lifetimeMs: 240, radius: 310 },
      { damage: 7, cooldownMs: 4400, range: 340, pulseRadius: 340, lifetimeMs: 260, radius: 340 },
      { damage: 9, cooldownMs: 4200, range: 380, pulseRadius: 380, lifetimeMs: 280, radius: 380 },
    ],
  },
  ink: {
    id: "ink",
    name: "Ink Trail",
    description: "Drops a damaging cloud behind you.",
    kind: "trail",
    levels: [
      { damage: 1, cooldownMs: 0, intervalMs: 280, range: 30, lifetimeMs: 3000, radius: 30, reHitMs: 350 },
      { damage: 2, cooldownMs: 0, intervalMs: 260, range: 34, lifetimeMs: 3000, radius: 34, reHitMs: 340 },
      { damage: 3, cooldownMs: 0, intervalMs: 240, range: 38, lifetimeMs: 3200, radius: 38, reHitMs: 320 },
      { damage: 4, cooldownMs: 0, intervalMs: 220, range: 42, lifetimeMs: 3400, radius: 42, reHitMs: 300 },
      { damage: 5, cooldownMs: 0, intervalMs: 220, range: 46, lifetimeMs: 3600, radius: 46, reHitMs: 280 },
    ],
  },
  piranha: {
    id: "piranha",
    name: "Piranha Pals",
    description: "Two mini fish orbit you and bite passers-by.",
    kind: "orbital",
    levels: [
      { damage: 1,  cooldownMs: 0, count: 2, range: 120, intervalMs: 3.0, radius: 28, reHitMs: 500 },
      { damage: 4,  cooldownMs: 0, count: 2, range: 140, intervalMs: 3.2, radius: 30, reHitMs: 480 },
      { damage: 7,  cooldownMs: 0, count: 3, range: 150, intervalMs: 3.4, radius: 30, reHitMs: 460 },
      { damage: 10, cooldownMs: 0, count: 3, range: 160, intervalMs: 3.6, radius: 32, reHitMs: 440 },
      { damage: 13, cooldownMs: 0, count: 4, range: 180, intervalMs: 3.8, radius: 32, reHitMs: 420 },
    ],
  },
  // Evolutions — defined here so the dispatcher and renderer can branch on them.
  // Granted only via M4 evolution cards; never fire in M3.
  tidal: {
    id: "tidal", name: "Tidal Wave", description: "A sweeping arc of bubbles.",
    kind: "projectile", evolutionOf: "bubble",
    levels: [
      { damage: 12, cooldownMs: 1000, count: 7, range: 600, speed: 1320, lifetimeMs: 1200, radius: 14, spread: 0.9 },
      { damage: 12, cooldownMs: 1000, count: 7, range: 600, speed: 1320, lifetimeMs: 1200, radius: 14, spread: 0.9 },
      { damage: 12, cooldownMs: 1000, count: 7, range: 600, speed: 1320, lifetimeMs: 1200, radius: 14, spread: 0.9 },
      { damage: 12, cooldownMs: 1000, count: 7, range: 600, speed: 1320, lifetimeMs: 1200, radius: 14, spread: 0.9 },
      { damage: 12, cooldownMs: 1000, count: 7, range: 600, speed: 1320, lifetimeMs: 1200, radius: 14, spread: 0.9 },
    ],
  },
  puffer: {
    id: "puffer", name: "Pufferfish Aura", description: "Permanent ring of spines.",
    kind: "orbital", evolutionOf: "spine",
    levels: [
      { damage: 20, cooldownMs: 0, count: 14, range: 80, intervalMs: 1.6, radius: 7, reHitMs: 350 },
      { damage: 20, cooldownMs: 0, count: 14, range: 80, intervalMs: 1.6, radius: 7, reHitMs: 350 },
      { damage: 20, cooldownMs: 0, count: 14, range: 80, intervalMs: 1.6, radius: 7, reHitMs: 350 },
      { damage: 20, cooldownMs: 0, count: 14, range: 80, intervalMs: 1.6, radius: 7, reHitMs: 350 },
      { damage: 20, cooldownMs: 0, count: 14, range: 80, intervalMs: 1.6, radius: 7, reHitMs: 350 },
    ],
  },
  eel: {
    id: "eel", name: "Eel Storm", description: "Chain lightning to nearby fish.",
    kind: "radial-pulse", evolutionOf: "pulse", chain: true,
    levels: [
      { damage: 15, cooldownMs: 3000, range: 500, pulseRadius: 500, lifetimeMs: 320, radius: 500 },
      { damage: 15, cooldownMs: 3000, range: 500, pulseRadius: 500, lifetimeMs: 320, radius: 500 },
      { damage: 15, cooldownMs: 3000, range: 500, pulseRadius: 500, lifetimeMs: 320, radius: 500 },
      { damage: 15, cooldownMs: 3000, range: 500, pulseRadius: 500, lifetimeMs: 320, radius: 500 },
      { damage: 15, cooldownMs: 3000, range: 500, pulseRadius: 500, lifetimeMs: 320, radius: 500 },
    ],
  },
  kraken: {
    id: "kraken", name: "Kraken Bloom", description: "Massive lingering ink cloud.",
    kind: "trail", evolutionOf: "ink",
    levels: [
      { damage: 12, cooldownMs: 0, intervalMs: 280, range: 90, lifetimeMs: 4500, radius: 90, reHitMs: 240 },
      { damage: 12, cooldownMs: 0, intervalMs: 280, range: 90, lifetimeMs: 4500, radius: 90, reHitMs: 240 },
      { damage: 12, cooldownMs: 0, intervalMs: 280, range: 90, lifetimeMs: 4500, radius: 90, reHitMs: 240 },
      { damage: 12, cooldownMs: 0, intervalMs: 280, range: 90, lifetimeMs: 4500, radius: 90, reHitMs: 240 },
      { damage: 12, cooldownMs: 0, intervalMs: 280, range: 90, lifetimeMs: 4500, radius: 90, reHitMs: 240 },
    ],
  },
  school: {
    id: "school", name: "Piranha School", description: "Six piranhas, faster bites.",
    kind: "orbital", evolutionOf: "piranha",
    levels: [
      { damage: 20, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
      { damage: 20, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
      { damage: 20, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
      { damage: 20, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
      { damage: 20, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
    ],
  },
};

export function getWeaponLevel(id: WeaponId, level: number): WeaponLevel {
  const def = WEAPONS[id];
  const idx = Math.max(0, Math.min(MAX_WEAPON_LEVEL - 1, level - 1));
  return def.levels[idx]!;
}
