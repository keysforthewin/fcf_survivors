import { AI, ARENA, FISH, MOUTH, PELLET, TICK, boostDurationMs, canEat, fishRadius, massCapFor, massDecayPerSec, rotateHeadingToward, xpDroppedOnDeath } from "@fcf/shared";
import type { WeaponId } from "@fcf/shared";
import type { Fish, Pellet, Chunk, Projectile, ProjectileBehavior, HitEventRecord } from "./entity.ts";
import { SpatialHash } from "./spatial.ts";
import { maintainAiPopulation, updateAi } from "./ai.ts";
import { tryFireWeapons, applyProjectileDamage } from "./weapon.ts";
import { getMoveSpeed, getBoostCooldown, getPickupRadius, getPelletXp, getFishEatMass } from "./passives.ts";

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
  /** Hit events that occurred during the current tick. Drained by snapshot builder. */
  hitEvents: HitEventRecord[] = [];

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
      color,
      name,
      isAi: false,
      boost: false,
      boostUntil: 0,
      boostReadyAt: 0,
      level: 1,
      xp: 0,
      kills: 0,
      peakMass: FISH.startMass,
      hits: 0,
      damageDealt: 0,
      spawnedAt: this.now(),
      socketId,
      alive: true,
      weapons: [
        { id: "bubble", level: 1, cooldownReadyAt: this.now() + 600 },
      ],
      passives: new Map(),
      pendingLevelUp: [],
      queuedLevelUps: 0,
      levelUpDismissed: false,
      pendingLevelUpDrawId: 0,
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

  /**
   * Apply input to a player fish. While a level-up modal is open AND the player
   * has not dismissed it, the fish brakes to zero so the player can't move
   * while choosing. Dismissing the modal (ESC / skip button) lifts the freeze.
   */
  applyInput(fish: Fish, vx: number, vy: number, boost: boolean, now: number): void {
    if (fish.pendingLevelUp.length > 0 && !fish.levelUpDismissed) {
      fish.targetVx = 0;
      fish.targetVy = 0;
      return;
    }
    fish.targetVx = vx;
    fish.targetVy = vy;
    if (boost && now >= fish.boostReadyAt) {
      fish.boost = true;
      fish.boostUntil = now + boostDurationMs(fish.mass);
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
      // Rate-limited heading: rotate current heading toward the velocity direction at
      // most maxTurnRate * dt per tick. AI fish use a slower rate so they visibly arc
      // through direction changes instead of snapping.
      const vmag = Math.hypot(f.vx, f.vy);
      if (vmag > 5) {
        const maxRad = (f.isAi ? AI.maxTurnRateRadPerSec : FISH.maxTurnRateRadPerSec) * dtSec;
        const [nhx, nhy] = rotateHeadingToward(f.headingX, f.headingY, f.vx, f.vy, maxRad);
        f.headingX = nhx;
        f.headingY = nhy;
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
          f.mass = Math.min(f.mass, massCapFor(f.isAi));
          f.xp += f.isAi ? 1 : getPelletXp(1, f);
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
          f.mass = Math.min(f.mass, massCapFor(f.isAi));
          f.xp += Math.max(1, Math.floor(c.mass * 0.5));
        }
      }
    }

    // (level-ups are applied by processLevelUps; see sim/levelup.ts)

    // collisions: fish eat smaller fish.
    // Predators only eat prey within a front mouth cone (heading-aligned).
    // Prey outside the cone can swim alongside / behind without being chomped —
    // this is the "smaller fish nibbles the giant" loop. Stationary fish have
    // no defined cone, so they get a 360° fallback (still get eaten if overlapped).
    const fishList = [...this.fish.values()];
    for (const a of fishList) {
      if (!a.alive) continue;
      const rA = fishRadius(a.mass);
      const reach = rA + MOUTH.suctionExtraRadius + 80;
      scratch.length = 0;
      this.fishHash.query(a.x, a.y, reach, scratch);
      const headingMag = Math.hypot(a.headingX, a.headingY);
      const stationary = headingMag < MOUTH.stationaryHeadingEps;
      const hx = stationary ? 0 : a.headingX / headingMag;
      const hy = stationary ? 0 : a.headingY / headingMag;
      for (const b of scratch as Fish[]) {
        if (b.id === a.id || !b.alive) continue;
        if (!canEat(a.mass, b.mass)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const rB = fishRadius(b.mass);

        // Direction gate: if predator is moving, require prey roughly in front.
        if (!stationary && dist > 0.001) {
          const dot = (hx * dx + hy * dy) / dist;
          if (dot < MOUTH.coneCos) continue;
        }

        // Mouth point sits half a suction buffer in front of the predator.
        // Effective bite radius extends rA + suctionExtraRadius from that point.
        // No suction from outside the bite zone — small fish must actually enter
        // the danger area before the giant can vacuum them up.
        const mx = stationary ? a.x : a.x + hx * (rA + MOUTH.suctionExtraRadius * 0.5);
        const my = stationary ? a.y : a.y + hy * (rA + MOUTH.suctionExtraRadius * 0.5);
        const mdx = b.x - mx;
        const mdy = b.y - my;
        const mouthDist2 = mdx * mdx + mdy * mdy;
        const bite = rA + MOUTH.suctionExtraRadius;
        if (mouthDist2 > bite * bite) continue;

        // Within mouth — confirm prey has actually penetrated past 50% rB into
        // the bite zone, OR is already overlapping the body (close-range chomp).
        const overlapByBody = dist < rA - rB * 0.5;
        const overlapByMouth = mouthDist2 < (bite - rB * 0.5) * (bite - rB * 0.5);
        if (!overlapByBody && !overlapByMouth) {
          // Pull prey toward mouth this tick; bite resolves next tick.
          const pullX = (mx - b.x) * MOUTH.suctionPullPerTick;
          const pullY = (my - b.y) * MOUTH.suctionPullPerTick;
          b.x += pullX;
          b.y += pullY;
          continue;
        }

        // a eats b
        const baseGain = b.mass * (1 - FISH.massTaxOnEat);
        a.mass += a.isAi ? baseGain : getFishEatMass(baseGain, a);
        a.mass = Math.min(a.mass, massCapFor(a.isAi));
        a.kills += 1;
        // XP awarded scales with the victim's level — eating a high-level fish is worth more.
        a.xp += xpDroppedOnDeath(b.level, b.mass);
        b.alive = false;
        // mark b for removal at end of tick (handled by caller)
      }
    }

    // baseline mass decay for player fish — applied at end of tick so it
    // doesn't shave a predator below the canEat boundary mid-tick. Scales
    // linearly with current mass. AI fish are intentionally exempt so the
    // spawn economy still works.
    for (const f of this.fish.values()) {
      if (!f.alive) continue;
      // Record the high-water mark before decay shaves it back down. Captures
      // this tick's eating/growth too (eating ran earlier in the step).
      if (f.mass > f.peakMass) f.peakMass = f.mass;
      if (f.isAi) continue;
      f.mass = Math.max(FISH.startMass, f.mass - massDecayPerSec(f.mass) * dtSec);
    }
  }
}
