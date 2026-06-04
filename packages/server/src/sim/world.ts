import { AGGRO, AI, ARENA, BITE, BURP, DEATH_XP_DROP, DEFAULT_SPECIES_ID, FISH, FRUIT, MAX_FISH_RADIUS_PAD, MOUTH, NIBBLE, PELLET, SPAWN, TICK, boostDurationMs, canSwallow, centerGaussianPoint, clampToArena, fishRadius, massCapFor, massDecayPerSec, rotateHeadingToward, stepFishMovement, viewRadius, xpDroppedOnDeath } from "@fcf/shared";
import type { WeaponId } from "@fcf/shared";
import type { Fish, Pellet, Fruit, Chunk, Projectile, ProjectileBehavior, HitEventRecord, ZapEventRecord } from "./entity.ts";
import { SpatialHash } from "./spatial.ts";
import { addAggro, maintainAiPopulation, pickAiName, updateAi } from "./ai.ts";
import { tryFireWeapons, applyProjectileDamage, applyNibble } from "./weapon.ts";
import { getMoveSpeed, getBoostCooldown, getPickupRadius, getPelletXp, getFishEatMass, getEatRangeMult, getEffectiveMoveSpeed, applySybexAuras } from "./passives.ts";

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
  fruits = new Map<number, Fruit>();
  chunks = new Map<number, Chunk>();
  projectiles = new Map<number, Projectile>();
  removedIds: number[] = [];
  /** Hit events that occurred during the current tick. Drained by snapshot builder. */
  hitEvents: HitEventRecord[] = [];
  /** Radial-pulse zap events that occurred during the current tick. Drained by snapshot builder. */
  zapEvents: ZapEventRecord[] = [];
  /** Fish swallowed whole this tick: { victim id, eater id }. Drives the client suck-in anim. Drained by snapshot builder. */
  swallowEvents: Array<{ id: number; by: number }> = [];
  /** Human players BITTEN this tick (new engagement, throttled per BITE.toastEngagementMs):
   *  { victim id, attacker id }. Drained by the tick loop → "bitten" toast broadcast. */
  bittenEvents: Array<{ id: number; by: number }> = [];

  private idCounter = 1;
  tick = 0;
  lastTickAt = 0;

  /**
   * Whether any human is connected. Production drives this from the live socket
   * count (see index.ts open/close). When false the world stops spawning pellets
   * and AI fish stop grazing them — the idle state, since the game sits empty
   * most of the time. Defaults true so the sim runs its full pellet economy
   * standalone (cucumber tests rely on this default).
   */
  humansPresent = true;

  /** Test seams: replace these via the constructor to make sim deterministic. */
  now: () => number;
  rng: () => number;
  autoSpawnPellets: boolean;
  maintainAi: boolean;

  // spatial hash for collision queries (rebuilt each tick)
  fishHash = new SpatialHash<Fish>(256);
  pelletHash = new SpatialHash<Pellet>(128);
  fruitHash = new SpatialHash<Fruit>(128);
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

  /**
   * Clear and repopulate the per-type spatial hashes from current entity state.
   * Called mid-`step()` for collision queries, and again from the tick loop after
   * all mutation (deaths/chunk-spawn/projectile-fire) so per-socket snapshot interest
   * queries see fresh end-of-tick state. Only alive fish are inserted.
   */
  rebuildSpatialHashes(): void {
    this.fishHash.clear();
    this.pelletHash.clear();
    this.fruitHash.clear();
    this.chunkHash.clear();
    this.projectileHash.clear();
    for (const f of this.fish.values()) if (f.alive) this.fishHash.insert(f.x, f.y, f);
    for (const p of this.pellets.values()) this.pelletHash.insert(p.x, p.y, p);
    for (const fr of this.fruits.values()) this.fruitHash.insert(fr.x, fr.y, fr);
    for (const c of this.chunks.values()) this.chunkHash.insert(c.x, c.y, c);
    for (const p of this.projectiles.values()) this.projectileHash.insert(p.x, p.y, p);
  }

  spawnPlayer(name: string, color: string, socketId: string, species: string = DEFAULT_SPECIES_ID): Fish {
    const fish: Fish = {
      id: this.nextId(),
      kind: "fish",
      x: ARENA.width * 0.1 + this.rng() * ARENA.width * 0.8,
      y: ARENA.height * 0.1 + this.rng() * ARENA.height * 0.8,
      vx: 0,
      vy: 0,
      targetVx: 0,
      targetVy: 0,
      clientAuthoritative: false,
      headingX: 1,
      headingY: 0,
      mass: FISH.startMass,
      color,
      species,
      name,
      isAi: false,
      spawnProtectedUntil: this.now() + SPAWN.protectMs,
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
      rerollsRemaining: 0,
      banishesRemaining: 0,
      banishedSubjects: new Set(),
    };
    this.fish.set(fish.id, fish);
    return fish;
  }

  /**
   * Every name currently in use by a live fish — humans and NPCs alike. The
   * AI-name picker avoids this set so no two NPCs ever share a name and no NPC
   * collides with a human.
   */
  takenNames(): Set<string> {
    const names = new Set<string>();
    for (const f of this.fish.values()) {
      if (f.alive) names.add(f.name);
    }
    return names;
  }

  /**
   * Humans get priority over AI fish names. After a human claims `name`, rename
   * any live AI fish currently using it so no NPC shares a human's name. The
   * replacement avoids every live human name (not just `name`), so eviction
   * never just shuffles the collision onto another player. Returns the ids of
   * renamed fish so the caller can re-propagate them to clients.
   */
  claimHumanName(name: string): number[] {
    const renamed: number[] = [];
    const taken = this.takenNames();
    taken.add(name);
    for (const f of this.fish.values()) {
      if (f.alive && f.isAi && f.name === name) {
        const newName = pickAiName(this.rng, taken);
        f.name = newName;
        taken.add(newName);
        renamed.push(f.id);
      }
    }
    return renamed;
  }

  removeFish(id: number): void {
    if (this.fish.delete(id)) this.removedIds.push(id);
  }

  removePellet(id: number): void {
    if (this.pellets.delete(id)) this.removedIds.push(id);
  }

  removeFruit(id: number): void {
    if (this.fruits.delete(id)) this.removedIds.push(id);
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
    isBody?: boolean;
    pierce?: boolean;
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
        isBody: opts.isBody,
        pierce: opts.pierce,
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
      isBody: opts.isBody,
      pierce: opts.pierce,
    };
    this.projectiles.set(proj.id, proj);
    return proj;
  }

  spawnPellet(): Pellet {
    const { x, y } = centerGaussianPoint(this.rng, PELLET.centerSpread);
    const p: Pellet = {
      id: this.nextId(),
      kind: "pellet",
      x,
      y,
      color: PELLET_PALETTE[Math.floor(this.rng() * PELLET_PALETTE.length)]!,
    };
    this.pellets.set(p.id, p);
    return p;
  }

  spawnFruit(): Fruit {
    const f: Fruit = {
      id: this.nextId(),
      kind: "fruit",
      x: this.rng() * ARENA.width,
      y: this.rng() * ARENA.height,
      reward: this.rng() < FRUIT.rerollChance ? "reroll" : "banish",
    };
    this.fruits.set(f.id, f);
    return f;
  }

  spawnChunk(x: number, y: number, mass: number, color: string, now: number, xp?: number, lifetimeMs = 15_000): Chunk {
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
      expiresAt: now + lifetimeMs,
    };
    // When xp is set this is an XP ball: pickup grants this XP and NO mass (mass is render size
    // only), exactly like a burp chunk. Used for the death-drop swarm (see spawnDeathDrops).
    if (xp !== undefined) c.xp = xp;
    this.chunks.set(c.id, c);
    return c;
  }

  /**
   * Scatter a dead fish's XP as a swarm of cheap, collectable gold balls at the body — the death
   * drop for DAMAGE kills (weapons/nibble; swallowed-whole fish burp their XP instead). The killer
   * gets no automatic XP (see weapon.ts); the victim's whole XP value (xpDroppedOnDeath) is split
   * across many balls that ANYONE can pick up, turning a kill into a contested scrum. `deadMass` is
   * the mass at death (≈0 once damage drains it — fine, the XP value carries a per-level bonus too).
   */
  spawnDeathDrops(x: number, y: number, deadMass: number, color: string, level: number, now: number): void {
    const totalXp = xpDroppedOnDeath(level, deadMass);
    if (totalXp <= 0) return;
    // Lots of balls (~xpPerBall each), clamped to [minBalls, maxBalls] and never more balls than XP
    // so each is worth ≥1. Split the XP exactly — the first `remainder` balls carry one extra.
    let count = Math.round(totalXp / DEATH_XP_DROP.xpPerBall);
    count = Math.max(DEATH_XP_DROP.minBalls, Math.min(DEATH_XP_DROP.maxBalls, count));
    count = Math.max(1, Math.min(count, Math.floor(totalXp)));
    const base = Math.floor(totalXp / count);
    const remainder = totalXp - base * count;
    for (let i = 0; i < count; i++) {
      const xp = base + (i < remainder ? 1 : 0);
      this.spawnChunk(x, y, DEATH_XP_DROP.visualMass, color, now, xp, DEATH_XP_DROP.lifetimeMs);
    }
  }

  /**
   * Spawn a "burp" chunk: an XP-carrying pellet sprayed from an eater's mouth when it swallows
   * prey whole. Unlike corpse chunks it grants XP (not mass) on collection, and is inert until
   * `collectableAt` so the eater can't instantly re-vacuum its own burp. `mass` is render-size only.
   */
  spawnBurpChunk(x: number, y: number, dirX: number, dirY: number, speed: number, xp: number, color: string, now: number): Chunk {
    const c: Chunk = {
      id: this.nextId(),
      kind: "chunk",
      x,
      y,
      vx: dirX * speed,
      vy: dirY * speed,
      mass: BURP.visualMass,
      color,
      xp,
      collectableAt: now + BURP.lockMs,
      expiresAt: now + BURP.lifetimeMs,
    };
    this.chunks.set(c.id, c);
    return c;
  }

  /**
   * Record a bite taken by `victim` from `attacker`. When `victim` is a human player it enqueues a
   * "bitten" toast event — but only once per engagement: a different attacker, or no bite from the
   * same attacker for BITE.toastEngagementMs, counts as a fresh engagement. AI victims are silent.
   */
  private recordBite(victim: Fish, attacker: Fish, now: number): void {
    if (victim.isAi) return;
    let seen = victim.biteToastAt;
    if (!seen) { seen = new Map(); victim.biteToastAt = seen; }
    const fresh = now - (seen.get(attacker.id) ?? -Infinity) > BITE.toastEngagementMs;
    seen.set(attacker.id, now);
    if (fresh) this.bittenEvents.push({ id: victim.id, by: attacker.id });
    // Bound the map: forget attackers we haven't seen within the engagement window.
    for (const [aid, t] of seen) if (now - t > BITE.toastEngagementMs) seen.delete(aid);
  }

  /**
   * Spray a swallowed fish's XP forward out of the eater's mouth as a fan of collectable burp
   * chunks. Direction is the eater's remembered heading (a unit vector even at rest), and the speed
   * is sized so a stationary eater's spray drifts to rest ~BURP.landFraction of a screen ahead
   * (chunks decay 6%/tick → total travel ≈ speed·BURP.travelPerSpeed). Deterministic (no RNG) so
   * the eat path doesn't perturb seeded tests.
   */
  private burpXp(eater: Fish, prey: Fish, rA: number, now: number): void {
    // Eating whole is worth BURP.eatXpMult× a damage-kill — sprayed as collectable XP (BURP.count
    // orbs; currently a single big orb) so swallowing is strictly more rewarding than chipping.
    const total = BURP.eatXpMult * xpDroppedOnDeath(prey.level, prey.mass);
    if (total <= 0) return;
    const hmag = Math.hypot(eater.headingX, eater.headingY) || 1;
    const baseAngle = Math.atan2(eater.headingY / hmag, eater.headingX / hmag);
    // Spray from the nose (front body edge) — the mouth.
    const mouthOffset = rA;
    const mx = eater.x + Math.cos(baseAngle) * mouthOffset;
    const my = eater.y + Math.sin(baseAngle) * mouthOffset;
    const landDist = Math.max(0, viewRadius(eater.mass) * BURP.landFraction - mouthOffset);
    const baseSpeed = landDist / BURP.travelPerSpeed;
    const each = Math.max(1, Math.round(total / BURP.count));
    let remaining = total;
    for (let i = 0; i < BURP.count && remaining > 0; i++) {
      const xp = i === BURP.count - 1 ? remaining : Math.min(remaining, each);
      remaining -= xp;
      // Even fan across the cone + alternating speed — deterministic spread, no RNG.
      const t = BURP.count > 1 ? (i / (BURP.count - 1)) * 2 - 1 : 0;
      const ang = baseAngle + t * BURP.spreadRad;
      const speed = baseSpeed * (0.9 + 0.2 * (i % 2));
      this.spawnBurpChunk(mx, my, Math.cos(ang), Math.sin(ang), speed, xp, eater.color, now);
    }
  }

  /**
   * Apply input to a player fish. The level-up modal is non-blocking: the player
   * keeps swimming (and firing) while it's open, so input is always honored.
   */
  applyInput(fish: Fish, vx: number, vy: number, boost: boolean, now: number): void {
    fish.targetVx = vx;
    fish.targetVy = vy;
    if (boost && now >= fish.boostReadyAt) {
      fish.boost = true;
      fish.boostUntil = now + boostDurationMs(fish.mass);
      fish.boostReadyAt = now + getBoostCooldown(fish);
    }
  }

  /**
   * Apply client-authoritative kinematics for a player's own fish. The client owns
   * its position, velocity and heading; we trust them (this is a smoothness-first,
   * non-anti-cheat design) and only clamp to the arena as a sanity guard against a
   * buggy client sending NaN / out-of-bounds. Once called, world.step stops
   * integrating this fish's movement (see the `clientAuthoritative` branch there).
   *
   * Boost cooldown bookkeeping stays server-side so the HUD stays honest; the client
   * applies the boost speed multiplier itself in its local sim.
   */
  applyClientState(
    fish: Fish,
    s: { x: number; y: number; vx: number; vy: number; hx: number; hy: number },
    boost: boolean,
    now: number,
  ): void {
    if (boost && now >= fish.boostReadyAt) {
      fish.boost = true;
      fish.boostUntil = now + boostDurationMs(fish.mass);
      fish.boostReadyAt = now + getBoostCooldown(fish);
    }
    fish.clientAuthoritative = true;
    fish.x = s.x;
    fish.y = s.y;
    fish.vx = s.vx;
    fish.vy = s.vy;
    const hm = Math.hypot(s.hx, s.hy);
    if (hm > 0.01) {
      fish.headingX = s.hx / hm;
      fish.headingY = s.hy / hm;
    }
    clampToArena(fish, fish.mass);
  }

  step(dtSec: number, now: number): void {
    this.tick++;

    // Recompute Subversive Sybex proximity slows BEFORE any movement this tick — AI reads its slow
    // inside updateAi (below) and players inside getEffectiveMoveSpeed, so the aura must be current.
    // Uses last tick's fishHash (≤1 tick stale, same staleness AI already tolerates).
    applySybexAuras(this);

    // spawn pellets up to target count — only while a human is connected, so an
    // idle (unwatched) server doesn't churn the pellet/fruit economy.
    if (this.autoSpawnPellets && this.humansPresent) {
      let toSpawn = Math.min(
        PELLET.spawnPerTick,
        PELLET.targetCount - this.pellets.size,
      );
      while (toSpawn-- > 0) this.spawnPellet();
      // fruit ride the same background-spawn switch (disabled together in tests)
      let fruitToSpawn = Math.min(
        FRUIT.spawnPerTick,
        FRUIT.targetCount - this.fruits.size,
      );
      while (fruitToSpawn-- > 0) this.spawnFruit();
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
        // Client-authoritative fish own their position/velocity/heading — the client
        // reported them via applyClientState, so we don't integrate or re-aim here.
        if (f.clientAuthoritative) continue;
        // Player movement (velocity smoothing + integrate + arena clamp) lives in
        // @fcf/shared so the client predictor runs identical physics. See movement.ts.
        stepFishMovement(f, f.targetVx, f.targetVy, getEffectiveMoveSpeed(f, now), f.boost ? FISH.boostMultiplier : 1, f.mass, dtSec);
      } else {
        f.x += f.vx * dtSec;
        f.y += f.vy * dtSec;
      }
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
      // clamp AI to arena (players are already clamped inside stepFishMovement above)
      if (f.isAi) clampToArena(f, f.mass);
    }

    // integrate chunks (drift + decay)
    for (const c of this.chunks.values()) {
      c.x += c.vx * dtSec;
      c.y += c.vy * dtSec;
      c.vx *= 0.94;
      c.vy *= 0.94;
      // Pin XP balls inside the arena: a chunk spawned at the edge (a death-drop scatter
      // or a forward burp spray) carries outward velocity and would otherwise drift out
      // of bounds. Reuse the fish clamp — it pins the center inside (the small radius pad
      // keeps the ball visible) and kills the wall-ward velocity so it rests, not jitters.
      clampToArena(c, c.mass);
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
    this.rebuildSpatialHashes();

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
      // AI fish only graze pellets while a human is connected; humans always eat.
      if (f.isAi && !this.humansPresent) continue;
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

    // collisions: PLAYERS eat fruit (bigger super-pellet + a reroll/banish token).
    // AI skip fruit so they don't vacuum tokens off the map.
    for (const f of this.fish.values()) {
      if (!f.alive || f.isAi) continue;
      const baseR = fishRadius(f.mass);
      const pickupR = getPickupRadius(baseR, f);
      scratch.length = 0;
      this.fruitHash.query(f.x, f.y, pickupR + FRUIT.radius, scratch);
      for (const fr of scratch as Fruit[]) {
        const dx = f.x - fr.x;
        const dy = f.y - fr.y;
        if (dx * dx + dy * dy <= pickupR * pickupR) {
          this.removeFruit(fr.id);
          f.mass += FRUIT.massGain;
          f.mass = Math.min(f.mass, massCapFor(f.isAi));
          f.xp += getPelletXp(FRUIT.xpGain, f);
          if (fr.reward === "reroll") f.rerollsRemaining += 1;
          else f.banishesRemaining += 1;
          // Immediately respawn a replacement elsewhere (keeps the map at the cap).
          if (this.autoSpawnPellets) this.spawnFruit();
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
        // Burp chunks are inert until armed, so an eater can't instantly re-vacuum its own burp.
        if (c.collectableAt && now < c.collectableAt) continue;
        const dx = f.x - c.x;
        const dy = f.y - c.y;
        if (dx * dx + dy * dy <= r * r) {
          this.removeChunk(c.id);
          if (c.xp !== undefined) {
            // Burp chunk: XP only — the swallow already granted the eater the prey's mass.
            f.xp += c.xp;
          } else {
            f.mass += c.mass * (1 - FISH.massTaxOnEat);
            f.mass = Math.min(f.mass, massCapFor(f.isAi));
            f.xp += Math.max(1, Math.floor(c.mass * 0.5));
          }
        }
      }
    }

    // (level-ups are applied by processLevelUps; see sim/levelup.ts)

    // collisions: a fish swallows smaller fish, bites prey it can't yet swallow, and smaller fish
    // nibble bigger ones. Eating is GAP-gated off the front mouth: a fish swallows edible prey the
    // moment the body-edge gap in front of its mouth is within `eatReach` (≈5px flat — see
    // MOUTH.eatReach; Close Encounters extends it for players) AND the prey sits inside the forward
    // cone. There is no suction and no behind-approach bonus — a chase lands only by closing your
    // mouth to within `eatReach`. A truly stationary fish (no heading) has no cone and eats from any
    // angle. While a predator is still closing in (gap within `biteReach` = eatReach × biteReachMult)
    // it plays a cosmetic bite WIND-UP (bitingTick) so prey can see it coming. The loop runs each
    // fish as actor `a`, so "a swallows b", "a bites b" and "a nibbles b" all resolve across iterations.
    const fishList = [...this.fish.values()];
    for (const a of fishList) {
      if (!a.alive) continue;
      const rA = fishRadius(a.mass);
      // Close Encounters extends a player's eat reach (and, proportionally, the wind-up reach). AI
      // and fish without the passive use the flat base.
      const eatReach = MOUTH.eatReach * (a.isAi ? 1 : getEatRangeMult(a));
      const biteReach = eatReach * MOUTH.biteReachMult;
      // Query wide enough to catch the largest plausible neighbour. A tiny fish nibbling a huge one
      // needs rB (up to MAX_FISH_RADIUS_PAD) in the radius, not 2·rA — that only covers prey smaller
      // than the actor. The bite-animation reach is the farthest engage distance.
      const reach = rA + MAX_FISH_RADIUS_PAD + biteReach;
      scratch.length = 0;
      this.fishHash.query(a.x, a.y, reach, scratch);
      const headingMag = Math.hypot(a.headingX, a.headingY);
      const stationary = headingMag < MOUTH.stationaryHeadingEps;
      const hx = stationary ? 0 : a.headingX / headingMag;
      const hy = stationary ? 0 : a.headingY / headingMag;
      for (const b of scratch as Fish[]) {
        if (b.id === a.id || !b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const rB = fishRadius(b.mass);
        // Body-edge gap in front of the mouth: <0 means the bodies overlap. The flat reach makes the
        // eat distance independent of fish size.
        const gap = dist - rA - rB;
        // `a`'s facing toward `b`. A stationary fish has no cone, so it counts as facing any prey.
        const dot = (!stationary && dist > 0.001) ? (hx * dx + hy * dy) / dist : 1;
        const inFront = stationary || dot >= MOUTH.coneCos;
        // Spawn protection: a freshly (re)spawned player can't be eaten OR bitten for a window.
        const protectedB = !!(b.spawnProtectedUntil && now < b.spawnProtectedUntil);

        if (canSwallow(a.mass, b.mass)) {
          // ---- a can swallow b: it must FACE b (front cone) and have its mouth on it (gap ≤ eatReach).
          if (protectedB || !inFront) continue;
          if (gap > eatReach) {
            // Not eating yet, but closing in within the bite-animation reach → play the chomp wind-up
            // (cosmetic only). Pulsed by BITE.cooldownMs so it gnashes rhythmically as it approaches.
            if (gap <= biteReach && now - (a.lastBiteAnimAt ?? 0) >= BITE.cooldownMs) {
              a.lastBiteAnimAt = now;
              a.bitingTick = this.tick;
            }
            continue;
          }

          // a swallows b WHOLE: instant mass gain (you grow), but NO instant XP — the kill's XP is
          // burped forward out of the mouth as collectable chunks (burpXp). The corpse is not
          // dropped as chunks (eatenWhole) since it was swallowed.
          const baseGain = b.mass * (1 - FISH.massTaxOnEat);
          a.mass += a.isAi ? baseGain : getFishEatMass(baseGain, a);
          a.mass = Math.min(a.mass, massCapFor(a.isAi));
          a.kills += 1;
          b.alive = false; // marked for removal at end of tick (handled by caller)
          b.killedById = a.id; // swallow counts as a kill (no weapon)
          b.eatenWhole = true;
          a.bitingTick = this.tick;
          this.burpXp(a, b, rA, now);
          this.swallowEvents.push({ id: b.id, by: a.id });
          // Forward lurch onto the prey (AI eaters; players apply their own lunge client-side).
          if (a.isAi && !stationary) {
            a.vx += hx * BITE.eatLungeImpulse;
            a.vy += hy * BITE.eatLungeImpulse;
          }
        } else if (b.mass > a.mass) {
          // ---- a is smaller than b: NIBBLE — take a bite out of b for damage = a.level. Any angle
          // (you can gnaw a big fish from behind) but you must be touching it (gap ≤ eatReach). Does
          // not eat b; sustained nibble damage feeds b's aggro (if AI) so it eventually turns to chase.
          if (protectedB || gap > eatReach) continue;
          const last = a.lastNibbleAt ?? 0;
          if (now - last < NIBBLE.cooldownMs) continue;
          a.lastNibbleAt = now;
          const dmg = a.level * NIBBLE.damagePerLevel;
          applyNibble(b, a, dmg);
          a.nibblingTick = this.tick;
          if (b.isAi && b.aiState) addAggro(b.aiState, a.id, dmg * AGGRO.perDamage);
          this.recordBite(b, a, now);
          // Small dart-in (AI nibblers; players apply their own client-side).
          if (a.isAi && !stationary) {
            a.vx += hx * BITE.lungeImpulse * 0.5;
            a.vy += hy * BITE.lungeImpulse * 0.5;
          }
        } else {
          // ---- a is bigger than b but NOT by the swallow ratio (the "between zone"), or they're the
          // same size: a can't swallow b, so it takes a light BITE for damage instead. Front-of-face
          // and mouth-on like eating (gap ≤ eatReach); repeated bites soften b until a is big enough
          // and the next contact swallows it whole. Uses its OWN cooldown (lastBiteAt).
          if (protectedB || !inFront || gap > eatReach) continue;
          const last = a.lastBiteAt ?? 0;
          if (now - last < BITE.cooldownMs) continue;
          a.lastBiteAt = now;
          const dmg = a.level * BITE.biteDamagePerLevel;
          applyNibble(b, a, dmg);
          a.nibblingTick = this.tick;
          if (b.isAi && b.aiState) addAggro(b.aiState, a.id, dmg * AGGRO.perDamage);
          this.recordBite(b, a, now);
          // Forward lurch into the bite (AI eaters; players apply their own client-side).
          if (a.isAi && !stationary) {
            a.vx += hx * BITE.lungeImpulse;
            a.vy += hy * BITE.lungeImpulse;
          }
        }
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
      // Natural decay must never heal. A fish weapons have drained below spawn
      // mass stays there — applying the Math.max(startMass, …) floor would snap it
      // back up to startMass each tick and undo the damage. It recovers only by
      // eating (pellets/chunks/fish above).
      if (f.mass > FISH.startMass) {
        f.mass = Math.max(FISH.startMass, f.mass - massDecayPerSec(f.mass) * dtSec);
      }
    }
  }
}
