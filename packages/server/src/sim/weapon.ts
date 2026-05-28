import { WEAPONS, getWeaponLevel, FISH, fishRadius, viewRadius, xpDroppedOnDeath } from "@fcf/shared";
import type { WeaponLevel, WeaponId } from "@fcf/shared";
import type { Fish, Projectile, WeaponSlot, OrbitalState, TrailState, BurstSweepState, FlybyState } from "./entity.ts";
import type { World } from "./world.ts";
import { getWeaponDamageMult, getWeaponCooldownMult, getDamageTakenMult } from "./passives.ts";

// Spatial-hash query pad must cover the largest fish radius in play (~200 at mass 300).
const MAX_FISH_RADIUS_PAD = 200;

/**
 * On-screen test: is (x, y) within the owner's view radius? Mirrors the snapshot
 * interest filter (net/snapshot.ts) and the Alien Friends laser gate, so a weapon
 * never damages a fish its owner can't see. Pass viewR2 = viewRadius(owner.mass)²,
 * computed once per fire rather than per candidate.
 */
function withinOwnerView(owner: Fish, x: number, y: number, viewR2: number): boolean {
  const dx = x - owner.x;
  const dy = y - owner.y;
  return dx * dx + dy * dy <= viewR2;
}

/**
 * Apply weapon damage as mass drain. Mass is the fish's health: drained to zero
 * it dies (eating is no longer the only kill). The fish that lands the lethal hit
 * is credited — recorded on the victim so the death handler attributes ranged
 * kills (ESP/aliens) correctly instead of the 250-unit proximity guess. Records a
 * hit event for client-side feedback.
 */
function applyHit(world: World, target: Fish, owner: Fish, damage: number, weaponId: WeaponId): void {
  const resist = target.isAi ? 1 : getDamageTakenMult(target);
  const massLoss = damage * FISH.damageMassLossRatio * resist;
  target.mass -= massLoss;
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
    weaponId,
  });

  // Lethal hit: mass fully drained. Mark dead (removed at end of tick by the
  // server loop, same path as eating-deaths) and credit the shooter.
  if (target.alive && target.mass <= 0) {
    target.alive = false;
    target.killedByName = owner.name;
    target.killedByMass = owner.mass;
    if (!owner.isAi) {
      owner.kills += 1;
      owner.xp += xpDroppedOnDeath(target.level, target.mass);
    }
  }
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
      case "flyby":
        // Sets its own cooldownReadyAt when it summons a wave, so the HUD shows
        // the real countdown to the next UFO — don't clobber it here.
        tickFlyby(world, fish, slot, lvl, dmg, now, cdMult);
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
  pulseAt(world, fish.id, fish, fish.x, fish.y, radius, damage, slot.id, chain, lvl.maxTargets);
}

/**
 * Apply an instantaneous AoE at (x, y): damage every fish within `radius` (the
 * owner is skipped), then emit one zap so the client can draw bolts/beams from
 * `originId` to each struck fish. Shared by ESP/eel pulses (origin = the owner
 * fish) and Alien Friends lasers (origin = the in-flight UFO projectile).
 */
function pulseAt(
  world: World,
  originId: number,
  owner: Fish,
  x: number,
  y: number,
  radius: number,
  damage: number,
  weaponId: WeaponId,
  chain = false,
  maxTargets?: number,
): void {
  const scratch: Fish[] = [];
  world.fishHash.query(x, y, radius + MAX_FISH_RADIUS_PAD, scratch);
  const viewR2 = viewRadius(owner.mass) ** 2;
  // Gather candidates with distance so we can take the nearest `maxTargets`
  // (e.g. ESP caps to 1..5 fish per pulse depending on level).
  const candidates: { target: Fish; d2: number }[] = [];
  for (const target of scratch) {
    if (target.id === owner.id || !target.alive) continue;
    const dx = target.x - x;
    const dy = target.y - y;
    const d2 = dx * dx + dy * dy;
    const reach = radius + fishRadius(target.mass);
    if (d2 > reach * reach) continue;
    if (!withinOwnerView(owner, target.x, target.y, viewR2)) continue; // off-screen — not visible to the owner
    candidates.push({ target, d2 });
  }
  if (maxTargets !== undefined && candidates.length > maxTargets) {
    candidates.sort((a, b) => a.d2 - b.d2);
    candidates.length = maxTargets;
  }
  const struck: { id: number; x: number; y: number }[] = [];
  for (const { target } of candidates) {
    applyHit(world, target, owner, damage, weaponId);
    struck.push({ id: target.id, x: target.x, y: target.y });
  }

  // Nothing in range → fire silently (no bolts).
  if (struck.length === 0) return;

  // Chain weapons (eel) thread the struck fish into a single path via greedy
  // nearest-neighbor from the origin; radial weapons (pulse/laser) leave order arbitrary.
  const ordered = chain ? orderChain(x, y, struck) : struck;
  world.zapEvents.push({
    nodes: [
      { id: originId, x: Math.round(x), y: Math.round(y) },
      ...ordered.map((t) => ({ id: t.id, x: Math.round(t.x), y: Math.round(t.y) })),
    ],
    chain,
    weaponId,
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

/**
 * Alien Friends: summon UFO(s) that fly a straight line across the player's view
 * and pulse a laser AoE every `intervalMs`. Each ship is a zero-damage linear
 * projectile (so it rides the normal projectile pipeline — integrated, snapshot,
 * dead-reckoned client-side) that auto-expires after its flight time. A fresh
 * wave summons when no ships remain and the cooldown has elapsed; each ship picks
 * its own random heading and enters one view edge, crosses over the player, and
 * exits the opposite edge.
 */
function tickFlyby(world: World, fish: Fish, slot: WeaponSlot, lvl: WeaponLevel, damage: number, now: number, cdMult: number): void {
  const state = ensureFlybyState(slot);
  // Drop ships whose projectile has expired/been removed.
  state.ships = state.ships.filter((s) => world.projectiles.has(s.projId));

  if (state.ships.length === 0 && now >= slot.cooldownReadyAt) {
    const count = lvl.count ?? 1;
    const lifetimeMs = lvl.lifetimeMs ?? 5000;
    const lifeSec = lifetimeMs / 1000;
    const shipRadius = lvl.radius ?? 24;
    // Span the player's visible window: enter at one edge, exit the opposite.
    const R = viewRadius(fish.mass);
    const speed = (2 * R) / lifeSec;
    for (let i = 0; i < count; i++) {
      const angle = world.rng() * Math.PI * 2;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const proj = world.spawnProjectile({
        ownerId: fish.id,
        weaponId: slot.id,
        x: fish.x - dirX * R,
        y: fish.y - dirY * R,
        vx: dirX * speed,
        vy: dirY * speed,
        damage: 0, // the body deals no contact damage; the laser pulses do
        radius: shipRadius,
        expiresAt: now + lifetimeMs,
        behavior: "linear",
        reHitMs: 0,
      });
      if (proj.id >= 0) state.ships.push({ projId: proj.id, lastFireAt: now });
    }
    slot.cooldownReadyAt = now + lvl.cooldownMs * cdMult;
  }

  // Each ship snipes one on-screen fish per interval with a laser beam.
  const interval = lvl.intervalMs ?? 1000;
  const viewR = viewRadius(fish.mass);
  for (const ship of state.ships) {
    const proj = world.projectiles.get(ship.projId);
    if (!proj) continue;
    if (now - ship.lastFireAt < interval) continue;
    ship.lastFireAt = now;
    fireLaser(world, fish, proj, viewR, damage, slot.id);
  }
}

/**
 * Alien Friends laser: pick the single fish nearest the UFO that's currently on
 * the owner's screen (within their view radius), damage it, and emit a one-bolt
 * zap so the client draws a beam from the UFO to it. Fires silently when the
 * player has nothing visible to shoot.
 */
function fireLaser(world: World, owner: Fish, ship: Projectile, viewR: number, damage: number, weaponId: WeaponId): void {
  const scratch: Fish[] = [];
  // Candidates = everything on the owner's screen.
  world.fishHash.query(owner.x, owner.y, viewR + MAX_FISH_RADIUS_PAD, scratch);
  const viewR2 = viewR * viewR;
  let best: Fish | null = null;
  let bestD2 = Infinity;
  for (const target of scratch) {
    if (target.id === owner.id || !target.alive) continue;
    if (!withinOwnerView(owner, target.x, target.y, viewR2)) continue; // off-screen — not visible to the owner
    const dx = target.x - ship.x;
    const dy = target.y - ship.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = target;
    }
  }
  if (!best) return;
  applyHit(world, best, owner, damage, weaponId);
  world.zapEvents.push({
    nodes: [
      { id: ship.id, x: Math.round(ship.x), y: Math.round(ship.y) },
      { id: best.id, x: Math.round(best.x), y: Math.round(best.y) },
    ],
    chain: false,
    weaponId,
  });
}

function ensureFlybyState(slot: WeaponSlot): FlybyState {
  if (slot.state && slot.state.kind === "flyby") return slot.state;
  const s: FlybyState = { kind: "flyby", ships: [] };
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
    const viewR2 = viewRadius(owner.mass) ** 2;
    for (const target of scratch) {
      if (target.id === proj.ownerId || !target.alive) continue;
      const dx = target.x - proj.x;
      const dy = target.y - proj.y;
      const reach = proj.radius + fishRadius(target.mass);
      if (dx * dx + dy * dy > reach * reach) continue;
      if (!withinOwnerView(owner, target.x, target.y, viewR2)) continue; // off-screen — not visible to the owner

      // re-hit gate
      if (proj.reHitMs > 0) {
        const lastHit = proj.hits.get(target.id) ?? 0;
        if (now - lastHit < proj.reHitMs) continue;
      }
      proj.hits.set(target.id, now);
      applyHit(world, target, owner, proj.damage, proj.weaponId);

      if (proj.behavior === "linear") {
        // expire after first hit
        proj.expiresAt = now;
        break;
      }
    }
  }
}

export type { WeaponId };
