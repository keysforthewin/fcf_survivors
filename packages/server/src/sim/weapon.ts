import { WEAPONS, getWeaponLevel, FISH, fishRadius } from "@fcf/shared";
import type { WeaponLevel, WeaponId } from "@fcf/shared";
import type { Fish, Projectile, WeaponSlot, OrbitalState, TrailState } from "./entity.ts";
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
      case "radial-burst":
        if (now >= slot.cooldownReadyAt) {
          fireRadialBurst(world, fish, slot, lvl, dmg, now);
          slot.cooldownReadyAt = now + lvl.cooldownMs * cdMult;
        }
        break;
      case "radial-pulse":
        if (now >= slot.cooldownReadyAt) {
          firePulse(world, fish, slot, lvl, dmg, now);
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

function fireRadialBurst(world: World, fish: Fish, slot: WeaponSlot, lvl: WeaponLevel, damage: number, now: number): void {
  const count = lvl.count ?? 8;
  const speed = lvl.speed ?? 360;
  const lifetimeMs = lvl.lifetimeMs ?? 600;
  const radius = lvl.radius ?? 6;
  // Inherit forward momentum as a single uniform drift so the ring stays a true
  // circle, but cap it below the spine speed so trailing spines still fly
  // outward (rather than stalling and trailing into a comet shape at high speed).
  const DRIFT_CAP = 1 / 3;     // leading spines end up ~2x the speed of trailing ones
  const vmag = Math.hypot(fish.vx, fish.vy);
  let driftX = 0;
  let driftY = 0;
  if (vmag > 1) {
    const drift = Math.min(vmag, speed * DRIFT_CAP);
    driftX = (fish.vx / vmag) * drift;
    driftY = (fish.vy / vmag) * drift;
  }
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const dirX = Math.cos(a);
    const dirY = Math.sin(a);
    world.spawnProjectile({
      ownerId: fish.id,
      weaponId: slot.id,
      x: fish.x + dirX * 8,
      y: fish.y + dirY * 8,
      vx: dirX * speed + driftX,
      vy: dirY * speed + driftY,
      damage,
      radius,
      expiresAt: now + lifetimeMs,
      behavior: "linear",
      reHitMs: lvl.reHitMs ?? 0,
    });
  }
}

function firePulse(world: World, fish: Fish, slot: WeaponSlot, lvl: WeaponLevel, damage: number, now: number): void {
  const radius = lvl.pulseRadius ?? lvl.range;
  const lifetimeMs = lvl.lifetimeMs ?? 200;
  // Spawn a single static visualization projectile so the client can draw the ring.
  world.spawnProjectile({
    ownerId: fish.id,
    weaponId: slot.id,
    x: fish.x,
    y: fish.y,
    vx: 0,
    vy: 0,
    damage: 0,                    // damage applied inline below; vis projectile is harmless
    radius,
    expiresAt: now + lifetimeMs,
    behavior: "static",
    reHitMs: 1_000_000,           // never re-hits
  });

  // Apply damage to any fish in range. Self-damage is prevented by id check.
  const scratch: Fish[] = [];
  world.fishHash.query(fish.x, fish.y, radius + MAX_FISH_RADIUS_PAD, scratch);
  for (const target of scratch) {
    if (target.id === fish.id || !target.alive) continue;
    const dx = target.x - fish.x;
    const dy = target.y - fish.y;
    const reach = radius + fishRadius(target.mass);
    if (dx * dx + dy * dy > reach * reach) continue;
    applyHit(world, target, fish, damage);
  }
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
