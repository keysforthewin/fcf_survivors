import { ARENA, FISH, PELLET, TICK, canEat, fishHp, fishRadius } from "@fcf/shared";
import type { WeaponId } from "@fcf/shared";
import type { Fish, Pellet, Chunk, Projectile, ProjectileBehavior } from "./entity.ts";
import { SpatialHash } from "./spatial.ts";
import { maintainAiPopulation, updateAi } from "./ai.ts";
import { tryFireWeapons, applyProjectileDamage } from "./weapon.ts";
import { getMoveSpeed, getBoostCooldown, getMaxHp, getPickupRadius, getPelletXp, getFishEatMass } from "./passives.ts";

const MAX_PROJECTILES = 400;

const PELLET_PALETTE = [
  "#ff85a1", "#ffdf80", "#80ffa1", "#80d8ff", "#c8a0ff", "#fffa80",
];

export interface WorldDeps {
  /** Injected wall-clock source. Defaults to Date.now. */
  now?: () => number;
  /** Injected RNG returning [0, 1). Defaults to Math.random. */
  rng?: () => number;
  /** Auto-spawn pellets up to PELLET.targetCount each tick. Default true. */
  autoSpawnPellets?: boolean;
  /** Maintain AI population at AI.minPopulation each tick. Default true. */
  maintainAi?: boolean;
}

export class World {
  fish = new Map<number, Fish>();
  pellets = new Map<number, Pellet>();
  chunks = new Map<number, Chunk>();
  projectiles = new Map<number, Projectile>();
  removedIds: number[] = [];

  private idCounter = 1;
  tick = 0;
  lastTickAt = 0;

  /** Test seams: replace these via the constructor to make sim deterministic. */
  now: () => number;
  rng: () => number;
  autoSpawnPellets: boolean;
  maintainAi: boolean;

  // spatial hash for collision queries (rebuilt each tick)
  fishHash = new SpatialHash<Fish>(256);
  pelletHash = new SpatialHash<Pellet>(128);
  chunkHash = new SpatialHash<Chunk>(128);
  projectileHash = new SpatialHash<Projectile>(128);

  constructor(deps: WorldDeps = {}) {
    this.now = deps.now ?? Date.now;
    this.rng = deps.rng ?? Math.random;
    this.autoSpawnPellets = deps.autoSpawnPellets ?? true;
    this.maintainAi = deps.maintainAi ?? true;
  }

  nextId(): number {
    return this.idCounter++;
  }

  spawnPlayer(name: string, color: string, socketId: string): Fish {
    const fish: Fish = {
      id: this.nextId(),
      kind: "fish",
      x: ARENA.width * 0.1 + this.rng() * ARENA.width * 0.8,
      y: ARENA.height * 0.1 + this.rng() * ARENA.height * 0.8,
      vx: 0,
      vy: 0,
      targetVx: 0,
      targetVy: 0,
      headingX: 1,
      headingY: 0,
      mass: FISH.startMass,
      hp: fishHp(FISH.startMass),
      maxHp: fishHp(FISH.startMass),
      color,
      name,
      isAi: false,
      boost: false,
      boostUntil: 0,
      boostReadyAt: 0,
      level: 1,
      xp: 0,
      kills: 0,
      spawnedAt: this.now(),
      socketId,
      alive: true,
      weapons: [
        { id: "bubble", level: 1, cooldownReadyAt: this.now() + 600 },
      ],
      passives: new Map(),
      pendingLevelUp: [],
    };
    this.fish.set(fish.id, fish);
    return fish;
  }

  removeFish(id: number): void {
    if (this.fish.delete(id)) this.removedIds.push(id);
  }

  removePellet(id: number): void {
    if (this.pellets.delete(id)) this.removedIds.push(id);
  }

  removeChunk(id: number): void {
    if (this.chunks.delete(id)) this.removedIds.push(id);
  }

  removeProjectile(id: number): void {
    if (this.projectiles.delete(id)) this.removedIds.push(id);
  }

  spawnProjectile(opts: {
    ownerId: number;
    weaponId: WeaponId;
    x: number;
    y: number;
    vx: number;
    vy: number;
    damage: number;
    radius: number;
    expiresAt: number;
    behavior: ProjectileBehavior;
    reHitMs: number;
    orbitPhase?: number;
    orbitRadius?: number;
  }): Projectile {
    if (this.projectiles.size >= MAX_PROJECTILES) {
      // Silent drop on cap. Reuse the requested id so callers don't crash.
      const dummy: Projectile = {
        id: -1,
        kind: "projectile",
        x: opts.x, y: opts.y, vx: opts.vx, vy: opts.vy,
        ownerId: opts.ownerId, weaponId: opts.weaponId,
        damage: 0, radius: opts.radius,
        expiresAt: 0,
        behavior: opts.behavior,
        hits: new Map(),
        reHitMs: opts.reHitMs,
        orbitPhase: opts.orbitPhase,
        orbitRadius: opts.orbitRadius,
      };
      return dummy;
    }
    const proj: Projectile = {
      id: this.nextId(),
      kind: "projectile",
      x: opts.x, y: opts.y, vx: opts.vx, vy: opts.vy,
      ownerId: opts.ownerId,
      weaponId: opts.weaponId,
      damage: opts.damage,
      radius: opts.radius,
      expiresAt: opts.expiresAt,
      behavior: opts.behavior,
      hits: new Map(),
      reHitMs: opts.reHitMs,
      orbitPhase: opts.orbitPhase,
      orbitRadius: opts.orbitRadius,
    };
    this.projectiles.set(proj.id, proj);
    return proj;
  }

  spawnPellet(): Pellet {
    const p: Pellet = {
      id: this.nextId(),
      kind: "pellet",
      x: this.rng() * ARENA.width,
      y: this.rng() * ARENA.height,
      color: PELLET_PALETTE[Math.floor(this.rng() * PELLET_PALETTE.length)]!,
    };
    this.pellets.set(p.id, p);
    return p;
  }

  spawnChunk(x: number, y: number, mass: number, color: string, now: number): Chunk {
    const angle = this.rng() * Math.PI * 2;
    const speed = 80 + this.rng() * 60;
    const c: Chunk = {
      id: this.nextId(),
      kind: "chunk",
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      mass,
      color,
      expiresAt: now + 15_000,
    };
    this.chunks.set(c.id, c);
    return c;
  }

  /** Apply input to a player fish. While a level-up modal is open the fish brakes to zero. */
  applyInput(fish: Fish, vx: number, vy: number, boost: boolean, now: number): void {
    if (fish.pendingLevelUp.length > 0) {
      fish.targetVx = 0;
      fish.targetVy = 0;
      return;
    }
    fish.targetVx = vx;
    fish.targetVy = vy;
    if (boost && now >= fish.boostReadyAt) {
      fish.boost = true;
      fish.boostUntil = now + FISH.boostDurationMs;
      fish.boostReadyAt = now + getBoostCooldown(fish);
    }
  }

  step(dtSec: number, now: number): void {
    this.tick++;

    // spawn pellets up to target count
    if (this.autoSpawnPellets) {
      let toSpawn = Math.min(
        PELLET.spawnPerTick,
        PELLET.targetCount - this.pellets.size,
      );
      while (toSpawn-- > 0) this.spawnPellet();
    }

    if (this.maintainAi) maintainAiPopulation(this);

    // update AI behavior
    for (const f of this.fish.values()) {
      if (f.isAi) updateAi(f, this, now, dtSec);
    }

    // integrate movement for players
    for (const f of this.fish.values()) {
      if (!f.alive) continue;
      if (!f.isAi) {
        if (f.boost && now >= f.boostUntil) f.boost = false;
        const baseSpeed = getMoveSpeed(f);
        const speed = baseSpeed * (f.boost ? FISH.boostMultiplier : 1);
        const desiredVx = f.targetVx * speed;
        const desiredVy = f.targetVy * speed;
        const accel = 10 * dtSec;
        f.vx += (desiredVx - f.vx) * accel;
        f.vy += (desiredVy - f.vy) * accel;
      }
      f.x += f.vx * dtSec;
      f.y += f.vy * dtSec;
      // update remembered heading from velocity when moving — used to aim weapons when idle
      const vmag = Math.hypot(f.vx, f.vy);
      if (vmag > 5) {
        f.headingX = f.vx / vmag;
        f.headingY = f.vy / vmag;
      }
      // clamp to arena
      const r = fishRadius(f.mass);
      if (f.x < r) { f.x = r; f.vx = 0; }
      if (f.x > ARENA.width - r) { f.x = ARENA.width - r; f.vx = 0; }
      if (f.y < r) { f.y = r; f.vy = 0; }
      if (f.y > ARENA.height - r) { f.y = ARENA.height - r; f.vy = 0; }
    }

    // integrate chunks (drift + decay)
    for (const c of this.chunks.values()) {
      c.x += c.vx * dtSec;
      c.y += c.vy * dtSec;
      c.vx *= 0.94;
      c.vy *= 0.94;
      if (now >= c.expiresAt) this.removeChunk(c.id);
    }

    // integrate projectiles (linear move + expiry). orbital positions are refreshed inside tickOrbital.
    for (const p of this.projectiles.values()) {
      if (p.behavior === "linear") {
        p.x += p.vx * dtSec;
        p.y += p.vy * dtSec;
      }
      if (now >= p.expiresAt) this.removeProjectile(p.id);
    }

    // rebuild spatial hashes for collision
    this.fishHash.clear();
    this.pelletHash.clear();
    this.chunkHash.clear();
    this.projectileHash.clear();
    for (const f of this.fish.values()) if (f.alive) this.fishHash.insert(f.x, f.y, f);
    for (const p of this.pellets.values()) this.pelletHash.insert(p.x, p.y, p);
    for (const c of this.chunks.values()) this.chunkHash.insert(c.x, c.y, c);
    for (const p of this.projectiles.values()) this.projectileHash.insert(p.x, p.y, p);

    // fire weapons for each living non-AI fish (also ticks orbital/trail)
    for (const f of this.fish.values()) {
      tryFireWeapons(this, f, now);
    }

    // apply projectile damage to bigger-than-owner targets
    applyProjectileDamage(this, now);

    // collisions: fish eat pellets
    const scratch: any[] = [];
    for (const f of this.fish.values()) {
      if (!f.alive) continue;
      const baseR = fishRadius(f.mass);
      const pickupR = f.isAi ? baseR : getPickupRadius(baseR, f);
      scratch.length = 0;
      this.pelletHash.query(f.x, f.y, pickupR + PELLET.radius, scratch);
      for (const p of scratch as Pellet[]) {
        const dx = f.x - p.x;
        const dy = f.y - p.y;
        if (dx * dx + dy * dy <= pickupR * pickupR) {
          this.removePellet(p.id);
          f.mass += PELLET.massGain;
          f.xp += f.isAi ? 1 : getPelletXp(1, f);
          f.maxHp = f.isAi ? fishHp(f.mass) : getMaxHp(f);
          f.hp = Math.min(f.maxHp, f.hp + 1);
        }
      }
    }

    // collisions: fish eat chunks
    for (const f of this.fish.values()) {
      if (!f.alive) continue;
      const r = fishRadius(f.mass);
      scratch.length = 0;
      this.chunkHash.query(f.x, f.y, r + 14, scratch);
      for (const c of scratch as Chunk[]) {
        const dx = f.x - c.x;
        const dy = f.y - c.y;
        if (dx * dx + dy * dy <= r * r) {
          this.removeChunk(c.id);
          f.mass += c.mass * (1 - FISH.massTaxOnEat);
          f.xp += Math.max(1, Math.floor(c.mass * 0.5));
          f.maxHp = f.isAi ? fishHp(f.mass) : getMaxHp(f);
          f.hp = Math.min(f.maxHp, f.hp + c.mass);
        }
      }
    }

    // (level-ups are applied by processLevelUps; see sim/levelup.ts)

    // collisions: fish eat smaller fish
    const fishList = [...this.fish.values()];
    for (const a of fishList) {
      if (!a.alive) continue;
      const rA = fishRadius(a.mass);
      scratch.length = 0;
      this.fishHash.query(a.x, a.y, rA + 80, scratch);
      for (const b of scratch as Fish[]) {
        if (b.id === a.id || !b.alive) continue;
        if (!canEat(a.mass, b.mass)) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy;
        const rB = fishRadius(b.mass);
        // require overlap of at least 50% of prey radius
        const threshold = rA - rB * 0.5;
        if (dist2 <= threshold * threshold) {
          // a eats b
          const baseGain = b.mass * (1 - FISH.massTaxOnEat);
          a.mass += a.isAi ? baseGain : getFishEatMass(baseGain, a);
          a.maxHp = a.isAi ? fishHp(a.mass) : getMaxHp(a);
          a.hp = Math.min(a.maxHp, a.hp + b.mass * 0.5);
          a.kills += 1;
          a.xp += Math.max(5, Math.floor(b.mass * 1.5));
          b.alive = false;
          // mark b for removal at end of tick (handled by caller)
        }
      }
    }
  }
}
