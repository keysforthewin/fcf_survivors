export type WeaponId =
  | "bubble"
  | "spine"
  | "pulse"
  | "ink"
  | "piranha"
  | "alien"
  | "tidal"
  | "puffer"
  | "eel"
  | "kraken"
  | "school"
  | "overlord";

export type WeaponKind =
  | "projectile"     // linear projectile, dies on first hit
  | "radial-burst"   // N projectiles radial, each dies on first hit
  | "radial-pulse"   // instantaneous AoE around owner; spawns short vis-only static blob
  | "trail"          // drops a static damaging zone behind owner periodically
  | "orbital"        // N projectiles orbiting owner, persistent
  | "flyby";         // N summoned ships cross the screen, pulsing AoE lasers along the way

export interface WeaponLevel {
  damage: number;
  cooldownMs: number;
  /** Linear/burst: number of projectiles per fire. Orbital: number of orbiting projectiles. */
  count?: number;
  /** Linear: muzzle distance / spread arc. Pulse: AoE radius. Trail: drop radius. Orbital: orbit radius. Flyby: laser AoE radius. */
  range: number;
  /** Linear projectile speed (units/sec). */
  speed?: number;
  /** Linear/static lifetime in ms. Flyby: ship flight time. */
  lifetimeMs?: number;
  /** Visual + collision radius of an individual projectile / drop / piranha. Flyby: ship entity radius (client uses a fixed sprite size). */
  radius?: number;
  /** Pulse AoE radius (overrides range for collision in pulse). */
  pulseRadius?: number;
  /** Trail: ms between drops. Orbital: angular speed (rad/sec). Flyby: ms between laser shots. */
  intervalMs?: number;
  /** Per-target re-hit cooldown ms (orbital/trail/pulse). Defaults: orbital 500, trail 350. */
  reHitMs?: number;
  /** Spread arc (rad) for projectile/burst patterns with count > 1. */
  spread?: number;
  /** radial-pulse only: cap on fish struck per pulse (nearest first). Undefined = unlimited. */
  maxTargets?: number;
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
export const MAX_SLOTS = 4;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  bubble: {
    id: "bubble",
    name: "AK-47",
    description: "Fires bullets in the direction you're swimming — reaches farther at higher levels.",
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
    name: "Turret",
    description: "Spins a full ring of bullets, firing them one after another over a second.",
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
    name: "ESP",
    description: "Unleashes a psychic shockwave around you.",
    kind: "radial-pulse",
    levels: [
      // range/pulseRadius are the gameplay AoE (firePulse reads pulseRadius); ~10x
      // the old reach. `radius` is left small — it only feeds the HUD + the
      // MAX_PROJECTILE_RADIUS snapshot pad, and ESP draws as lightning to struck
      // fish (no fixed-radius blob), so the visual already scales with the reach.
      { damage: 1, cooldownMs: 5000, range: 2500, pulseRadius: 2500, lifetimeMs: 220, radius: 250, maxTargets: 1 },
      { damage: 3, cooldownMs: 4800, range: 2800, pulseRadius: 2800, lifetimeMs: 220, radius: 280, maxTargets: 2 },
      { damage: 5, cooldownMs: 4600, range: 3100, pulseRadius: 3100, lifetimeMs: 240, radius: 310, maxTargets: 3 },
      { damage: 7, cooldownMs: 4400, range: 3400, pulseRadius: 3400, lifetimeMs: 260, radius: 340, maxTargets: 4 },
      { damage: 9, cooldownMs: 4200, range: 3800, pulseRadius: 3800, lifetimeMs: 280, radius: 380, maxTargets: 5 },
    ],
  },
  ink: {
    id: "ink",
    name: "Radioactive Waste",
    description: "Leaves a trail of toxic waste behind you.",
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
    name: "Toxic Tuna",
    description: "Two toxic tuna orbit you and bite passers-by.",
    kind: "orbital",
    levels: [
      // `range` is the orbit-path radius (~2x the old 120–180 so the tuna ride
      // clearly off the body instead of grazing it).
      { damage: 1,  cooldownMs: 0, count: 2, range: 240, intervalMs: 3.0, radius: 28, reHitMs: 500 },
      { damage: 4,  cooldownMs: 0, count: 2, range: 280, intervalMs: 3.2, radius: 30, reHitMs: 480 },
      { damage: 7,  cooldownMs: 0, count: 3, range: 300, intervalMs: 3.4, radius: 30, reHitMs: 460 },
      { damage: 10, cooldownMs: 0, count: 3, range: 320, intervalMs: 3.6, radius: 32, reHitMs: 440 },
      { damage: 13, cooldownMs: 0, count: 4, range: 360, intervalMs: 3.8, radius: 32, reHitMs: 420 },
    ],
  },
  alien: {
    id: "alien",
    name: "Alien Friends",
    description: "A friendly UFO flies across and snipes one on-screen fish with a laser each second. Each level shortens the wait.",
    kind: "flyby",
    levels: [
      // intervalMs = ms/shot, lifetimeMs = flight time, count = ships. `range` is HUD-only;
      // the laser targets any fish on the player's screen (viewRadius), one per shot.
      // Only cooldownMs changes per level (−10% each); everything else stays flat.
      { damage: 3, cooldownMs: 10000, count: 1, range: 2400, intervalMs: 1000, lifetimeMs: 5000, radius: 24 },
      { damage: 3, cooldownMs: 9000,  count: 1, range: 2400, intervalMs: 1000, lifetimeMs: 5000, radius: 24 },
      { damage: 3, cooldownMs: 8100,  count: 1, range: 2400, intervalMs: 1000, lifetimeMs: 5000, radius: 24 },
      { damage: 3, cooldownMs: 7290,  count: 1, range: 2400, intervalMs: 1000, lifetimeMs: 5000, radius: 24 },
      { damage: 3, cooldownMs: 6561,  count: 1, range: 2400, intervalMs: 1000, lifetimeMs: 5000, radius: 24 },
    ],
  },
  // Evolutions — defined here so the dispatcher and renderer can branch on them.
  // Granted only via M4 evolution cards; never fire in M3.
  tidal: {
    id: "tidal", name: "P4uly's Gun", description: "A sweeping arc of bullets.",
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
    id: "puffer", name: "Turret Pods", description: "A permanent ring of bullets.",
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
    id: "eel", name: "Admin Help", description: "Calls down chain lightning on nearby fish.",
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
    id: "kraken", name: "Rad Zone", description: "A massive lingering radioactive zone.",
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
    id: "school", name: "Tuna Trolls", description: "Six tuna, faster bites.",
    kind: "orbital", evolutionOf: "piranha",
    levels: [
      { damage: 20, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
      { damage: 20, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
      { damage: 20, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
      { damage: 20, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
      { damage: 20, cooldownMs: 0, count: 6, range: 100, intervalMs: 4.4, radius: 18, reHitMs: 280 },
    ],
  },
  overlord: {
    id: "overlord", name: "Alien Overlord", description: "Three UFOs on their own paths, each sniping an on-screen fish with a laser twice a second.",
    kind: "flyby", evolutionOf: "alien",
    levels: [
      // 3 ships, each fires every 0.5s. `range` is HUD-only — targeting is screen-wide.
      { damage: 10, cooldownMs: 10000, count: 3, range: 2400, intervalMs: 500, lifetimeMs: 5000, radius: 24 },
      { damage: 10, cooldownMs: 9000,  count: 3, range: 2400, intervalMs: 500, lifetimeMs: 5000, radius: 24 },
      { damage: 10, cooldownMs: 8100,  count: 3, range: 2400, intervalMs: 500, lifetimeMs: 5000, radius: 24 },
      { damage: 10, cooldownMs: 7290,  count: 3, range: 2400, intervalMs: 500, lifetimeMs: 5000, radius: 24 },
      { damage: 10, cooldownMs: 6561,  count: 3, range: 2400, intervalMs: 500, lifetimeMs: 5000, radius: 24 },
    ],
  },
};

export function getWeaponLevel(id: WeaponId, level: number): WeaponLevel {
  const def = WEAPONS[id];
  const idx = Math.max(0, Math.min(MAX_WEAPON_LEVEL - 1, level - 1));
  return def.levels[idx]!;
}

/**
 * Largest collision/visual `radius` any projectile can have, across every weapon and
 * level (currently 500, eel's pulse ring). Derived so balance changes can't silently
 * outgrow a hard-coded value. Used to pad the spatial-hash interest query for projectiles
 * so a wide ring centered just outside a player's view radius — but whose body reaches in —
 * is still queried (see `buildSnapshot`).
 */
export const MAX_PROJECTILE_RADIUS = Object.values(WEAPONS).reduce(
  (max, def) => def.levels.reduce((m, lvl) => Math.max(m, lvl.radius ?? 0), max),
  0,
);
