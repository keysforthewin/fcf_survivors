import { WEAPONS, getWeaponLevel, FISH, fishRadius } from "@fcf/shared";
import type { WeaponLevel, WeaponId } from "@fcf/shared";
import type { Fish, Projectile, WeaponSlot, OrbitalState, TrailState, BurstSweepState } from "./entity.ts";
import type { World } from "./world.ts";
import { getWeaponDamageMult, getWeaponCooldownMult, getDamageTakenMult } from "./passives.ts";

// Spatial-hash query pad must cover the largest fish radius in play (~200 at mass 300).
const MAX_FISH_RADIUS_PAD = 200;

/**
 * Apply weapon damage as mass drain. Mass floors at FISH.startMass so weapons
 * can never kill — only being eaten kills a fish. Records a hit event for
 * client-side feedback.
 */
function applyHit(world: World, target: Fish, owner: Fish, damage: number): void {
  const resist = target.isAi ? 1 : getDamageTakenMult(target);
  const massLoss = damage * FISH.damageMassLossRatio * resist;
  target.mass = Math.max(FISH.startMass, target.mass - massLoss);
  // Credit the firer's leaderboard stats. AI never fire, but guard anyway.
  if (!owner.isAi) {
    owner.hits += 1;
    owner.damageDealt += damage;
  }
  world.hitEvents.push({
    x: target.x,
    y: target.y,
    damage,
    targetId: target.id,
    ownerId: owner.id,
  });
}

/**
 * Per-tick: fire ready weapons + maintain orbital/trail per-weapon state.
 * Called from world.step after spatial hashes are rebuilt.
 *
 * Note: trail and orbital weapons are continuous — they don't use cooldownReadyAt for
 * the "is it ready to fire" gate, they're always active. cooldownReadyAt is still
 * advanced for them so the HUD has something to render (we just reset it to now for them).
 */
export function tryFireWeapons(world: World, fish: Fish, now: number): void {
  if (!fish.alive || fish.isAi) return;
  if (fish.pendingLevelUp.length > 0 && !fish.levelUpDismissed) return;

  const cdMult = getWeaponCooldownMult(fish);
  const dmgMult = getWeaponDamageMult(fish);

  for (const slot of fish.weapons) {
    const def = WEAPONS[slot.id];
    const lvl = getWeaponLevel(slot.id, slot.level);
    const dmg = lvl.damage * dmgMult;

    switch (def.kind) {
      case "projectile":
        if (now >= slot.cooldownReadyAt) {
          fireLinear(world, fish, slot, lvl, dmg, now);
          slot.cooldownReadyAt = now + lvl.cooldownMs * cdMult;
        }
        break;
      case "radial-burst": {
        // Turret: emit the ring one bullet at a time across SWEEP_MS rather than
        // all at once. Start a sweep when the cooldown is up; keep ticking the
        // active sweep regardless of cooldownReadyAt until the ring completes.
        if (slot.state?.kind !== "burst-sweep" && now >= slot.cooldownReadyAt) {
          slot.state = { kind: "burst-sweep", startedAt: now, firedCount: 0 };
        }
        if (slot.state?.kind === "burst-sweep") {
          const startedAt = slot.state.startedAt;
          if (tickBurstSweep(world, fish, slot, lvl, dmg, now)) {
            slot.state = undefined;
            // Re-arm relative to the ring's start so the firing cadence matches
            // the per-level cooldown (cooldownMs >> SWEEP_MS, so always >0).
            slot.cooldownReadyAt = startedAt + lvl.cooldownMs * cdMult;
          }
        }
        break;
      }
      case "radial-pulse":
        if (now >= slot.cooldownReadyAt) {
          firePulse(world, fish, slot, lvl, dmg, def.chain ?? false);
          slot.cooldownReadyAt = now + lvl.cooldownMs * cdMult;
        }
        break;
      case "trail":
        tickTrail(world, fish, slot, lvl, dmg, now);
        slot.cooldownReadyAt = now;
        break;
      case "orbital":
        tickOrbital(world, fish, slot, lvl, dmg, now);
        slot.cooldownReadyAt = now;
        break;
    }
  }
}

function headingOf(fish: Fish): { hx: number; hy: number } {
  const speed = Math.hypot(fish.vx, fish.vy);
  if (speed > 1) {
    return { hx: fish.vx / speed, hy: fish.vy / speed };
  }
  return { hx: fish.headingX, hy: fish.headingY };
}

function fireLinear(world: World, fish: Fish, slot: WeaponSlot, lvl: WeaponLevel, damage: number, now: number): void {
  const count = lvl.count ?? 1;
  const speed = lvl.speed ?? 380;
  const lifetimeMs = lvl.lifetimeMs ?? 1000;
  const radius = lvl.radius ?? 8;
  const spread = lvl.spread ?? 0;
  const { hx, hy } = headingOf(fish);
  const baseAngle = Math.atan2(hy, hx);

  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (spread * (i / (count - 1) - 0.5));
    const a = baseAngle + offset;
    const dirX = Math.cos(a);
    const dirY = Math.sin(a);
    world.spawnProjectile({
      ownerId: fish.id,
      weaponId: slot.id,
      x: fish.x + dirX * 6,
      y: fish.y + dirY * 6,
      // Inherit shooter's velocity so shots stay "in front" of a moving fish.
      vx: dirX * speed + fish.vx,
      vy: dirY * speed + fish.vy,
      damage,
      radius,
      expiresAt: now + lifetimeMs,
      behavior: "linear",
      reHitMs: lvl.reHitMs ?? 0,
    });
  }
}

/** Bullets in a Turret ring are spread evenly across this window (ms). */
const SWEEP_MS = 1000;

/**
 * Advance an in-progress Turret sweep: emit every bullet that has come due since
 * the last tick. Bullet `i` of `count` is due at `(i / count) * SWEEP_MS` into the
 * ring, so the ring sweeps a full circle over ~SWEEP_MS. Returns true once the
 * whole ring has fired.
 */
function tickBurstSweep(world: World, fish: Fish, slot: WeaponSlot, lvl: WeaponLevel, damage: number, now: number): boolean {
  const state = slot.state as BurstSweepState;
  const count = lvl.count ?? 8;
  const speed = lvl.speed ?? 360;
  const lifetimeMs = lvl.lifetimeMs ?? 600;
  const radius = lvl.radius ?? 6;

  // How many bullets should have fired by now: bullet 0 is due immediately, so
  // the +1 fires the first bullet on the sweep's opening tick (no dead frame).
  const frac = Math.min(1, (now - state.startedAt) / SWEEP_MS);
  const due = Math.min(count, Math.floor(frac * count) + 1);

  // Only forward-facing spines inherit the fish's velocity, scaled by how much they
  // point along it. Side and backward spines inherit none, so every spine always
  // shoots away from the fish — the back ones fly out behind instead of being
  // carried along with a fast-moving (e.g. boosting) fish.
  const vmag = Math.hypot(fish.vx, fish.vy);
  const vhx = vmag > 1 ? fish.vx / vmag : 0;
  const vhy = vmag > 1 ? fish.vy / vmag : 0;

  for (let i = state.firedCount; i < due; i++) {
    const a = (i / count) * Math.PI * 2;
    const dirX = Math.cos(a);
    const dirY = Math.sin(a);
    const inherit = Math.max(0, dirX * vhx + dirY * vhy);   // 1 = with travel, 0 = side/behind
    world.spawnProjectile({
      ownerId: fish.id,
      weaponId: slot.id,
      x: fish.x + dirX * 8,
      y: fish.y + dirY * 8,
      vx: dirX * speed + fish.vx * inherit,
      vy: dirY * speed + fish.vy * inherit,
      damage,
      radius,
      expiresAt: now + lifetimeMs,
      behavior: "linear",
      reHitMs: lvl.reHitMs ?? 0,
    });
  }
  state.firedCount = due;
  return state.firedCount >= count;
}

function firePulse(world: World, fish: Fish, slot: WeaponSlot, lvl: WeaponLevel, damage: number, chain: boolean): void {
  const radius = lvl.pulseRadius ?? lvl.range;

  // Damage every fish in range (self-damage prevented by id check) and collect the
  // struck fish so the client can draw a lightning bolt to each one.
  const scratch: Fish[] = [];
  world.fishHash.query(fish.x, fish.y, radius + MAX_FISH_RADIUS_PAD, scratch);
  const struck: { id: number; x: number; y: number }[] = [];
  for (const target of scratch) {
    if (target.id === fish.id || !target.alive) continue;
    const dx = target.x - fish.x;
    const dy = target.y - fish.y;
    const reach = radius + fishRadius(target.mass);
    if (dx * dx + dy * dy > reach * reach) continue;
    applyHit(world, target, fish, damage);
    struck.push({ id: target.id, x: target.x, y: target.y });
  }

  // No fish hit → the pulse fires silently (no bolts).
  if (struck.length === 0) return;

  // Chain weapons (eel) thread the struck fish into a single path via greedy
  // nearest-neighbor from the origin; radial weapons (pulse) leave order arbitrary.
  const ordered = chain ? orderChain(fish.x, fish.y, struck) : struck;
  world.zapEvents.push({
    nodes: [
      { id: fish.id, x: Math.round(fish.x), y: Math.round(fish.y) },
      ...ordered.map((t) => ({ id: t.id, x: Math.round(t.x), y: Math.round(t.y) })),
    ],
    chain,
    weaponId: slot.id,
  });
}

/** Greedy nearest-neighbor ordering of struck fish, starting from the origin (ox, oy). */
function orderChain(
  ox: number,
  oy: number,
  struck: { id: number; x: number; y: number }[],
): { id: number; x: number; y: number }[] {
  const remaining = struck.slice();
  const ordered: { id: number; x: number; y: number }[] = [];
  let cx = ox;
  let cy = oy;
  while (remaining.length > 0) {
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dx = remaining[i]!.x - cx;
      const dy = remaining[i]!.y - cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const next = remaining.splice(bestI, 1)[0]!;
    ordered.push(next);
    cx = next.x;
    cy = next.y;
  }
  return ordered;
}

function tickTrail(world: World, fish: Fish, slot: WeaponSlot, lvl: WeaponLevel, damage: number, now: number): void {
  const state = ensureTrailState(slot);
  const interval = lvl.intervalMs ?? 250;
  if (now - state.lastDropAt < interval) return;
  state.lastDropAt = now;

  world.spawnProjectile({
    ownerId: fish.id,
    weaponId: slot.id,
    x: fish.x,
    y: fish.y,
    vx: 0,
    vy: 0,
    damage,
    radius: lvl.radius ?? 30,
    expiresAt: now + (lvl.lifetimeMs ?? 3000),
    behavior: "static",
    reHitMs: lvl.reHitMs ?? 350,
  });
}

function ensureTrailState(slot: WeaponSlot): TrailState {
  if (slot.state && slot.state.kind === "trail") return slot.state;
  const s: TrailState = { kind: "trail", lastDropAt: 0 };
  slot.state = s;
  return s;
}

function tickOrbital(world: World, fish: Fish, slot: WeaponSlot, lvl: WeaponLevel, damage: number, now: number): void {
  const state = ensureOrbitalState(slot);
  const count = lvl.count ?? 2;
  // Keep the piranhas a fixed clearance outside the body so they don't sink into
  // a large fish. Recomputed each tick so the orbit widens as the player grows.
  const ORBIT_GAP = 50;
  const orbitR = Math.max(lvl.range, fishRadius(fish.mass) + ORBIT_GAP);
  const angular = lvl.intervalMs ?? 3.0;     // rad/sec
  const radius = lvl.radius ?? 14;

  const dtSec = 1 / 20;
  state.phase += angular * dtSec;

  // Ensure we have exactly `count` orbital projectiles alive.
  const alive: number[] = [];
  for (const pid of state.projectileIds) {
    if (world.projectiles.has(pid)) alive.push(pid);
  }
  state.projectileIds = alive;

  while (state.projectileIds.length < count) {
    const idx = state.projectileIds.length;
    const a = state.phase + (idx / count) * Math.PI * 2;
    const px = fish.x + Math.cos(a) * orbitR;
    const py = fish.y + Math.sin(a) * orbitR;
    const proj = world.spawnProjectile({
      ownerId: fish.id,
      weaponId: slot.id,
      x: px,
      y: py,
      vx: 0,
      vy: 0,
      damage,
      radius,
      expiresAt: Number.POSITIVE_INFINITY,    // orbital projectiles live until owner dies
      behavior: "orbital",
      reHitMs: lvl.reHitMs ?? 500,
      orbitPhase: (idx / count) * Math.PI * 2,
      orbitRadius: orbitR,
    });
    state.projectileIds.push(proj.id);
  }

  while (state.projectileIds.length > count) {
    const id = state.projectileIds.pop()!;
    world.removeProjectile(id);
  }

  for (const pid of state.projectileIds) {
    const proj = world.projectiles.get(pid);
    if (!proj) continue;
    const a = state.phase + (proj.orbitPhase ?? 0);
    proj.x = fish.x + Math.cos(a) * orbitR;
    proj.y = fish.y + Math.sin(a) * orbitR;
    proj.damage = damage;
    proj.radius = radius;
    proj.reHitMs = lvl.reHitMs ?? 500;
  }
}

function ensureOrbitalState(slot: WeaponSlot): OrbitalState {
  if (slot.state && slot.state.kind === "orbital") return slot.state;
  const s: OrbitalState = { kind: "orbital", phase: 0, projectileIds: [] };
  slot.state = s;
  return s;
}

/** Called from world.step when owner dies: orphan orbital/trail projectiles so they clean up. */
export function cleanupOwnerProjectiles(world: World, ownerId: number): void {
  for (const [id, proj] of world.projectiles) {
    if (proj.ownerId === ownerId && (proj.behavior === "orbital" || proj.behavior === "static")) {
      world.removeProjectile(id);
    }
  }
}

/** Apply projectile->fish damage. Called from world.step after spatial hashes rebuilt. */
export function applyProjectileDamage(world: World, now: number): void {
  if (world.projectiles.size === 0) return;
  const scratch: Fish[] = [];
  for (const proj of world.projectiles.values()) {
    if (now >= proj.expiresAt) continue;
    if (proj.damage <= 0) continue;

    const owner = world.fish.get(proj.ownerId);
    if (!owner || !owner.alive) {
      // Linear projectiles continue to live so in-flight shots still land.
      // Orbital/static get cleaned up here as a fallback to cleanupOwnerProjectiles.
      if (proj.behavior === "linear") continue;
      world.removeProjectile(proj.id);
      continue;
    }

    scratch.length = 0;
    world.fishHash.query(proj.x, proj.y, proj.radius + MAX_FISH_RADIUS_PAD, scratch);
    for (const target of scratch) {
      if (target.id === proj.ownerId || !target.alive) continue;
      const dx = target.x - proj.x;
      const dy = target.y - proj.y;
      const reach = proj.radius + fishRadius(target.mass);
      if (dx * dx + dy * dy > reach * reach) continue;

      // re-hit gate
      if (proj.reHitMs > 0) {
        const lastHit = proj.hits.get(target.id) ?? 0;
        if (now - lastHit < proj.reHitMs) continue;
      }
      proj.hits.set(target.id, now);
      applyHit(world, target, owner, proj.damage);

      if (proj.behavior === "linear") {
        // expire after first hit
        proj.expiresAt = now;
        break;
      }
    }
  }
}

export type { WeaponId };
