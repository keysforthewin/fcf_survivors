import { WEAPONS, getWeaponLevel, ARENA, FISH, MAX_FISH_RADIUS_PAD, fishRadius, viewRadius, battleCommsSlowMs } from "@fcf/shared";
import type { WeaponLevel, WeaponId } from "@fcf/shared";
import type { Fish, Projectile, WeaponSlot, OrbitalState, TrailState, BurstSweepState, FlybyState, HeliState } from "./entity.ts";
import type { World } from "./world.ts";
import { getWeaponDamageBonus, getWeaponCooldownMult, getDamageTakenReduction } from "./passives.ts";

/** Every hit always lands at least this much, so flat armor (Full Metal) can't fully nullify a weapon. */
const MIN_HIT_DAMAGE = 1;

/** Heli body sprite/collision radius (it deals no damage; this is just its size). 2× for visibility. */
const HELI_BODY_RADIUS = 96;
/** Speed (units/sec) the heli body cruises toward its loiter waypoint while attacking. Set above the
 *  player's base move speed (320) so it keeps station on a moving player; the body is harmless. */
const HELI_CRUISE_SPEED = 420;
/** Speed (units/sec) the heli body flies during enter/exit transit — fast, so it streaks in/out. */
const HELI_TRANSIT_SPEED = 1200;
/** How fast (rad/sec) the nose slews toward its target heading — a real-heli banking turn. */
const HELI_TURN_RATE = 8;
/** Fire only when the nose is within this many rad of the lead-aim angle (so it shoots where it faces). */
const HELI_FIRE_ALIGN = 0.45;
/** Loiter ring (min/max radius) the heli picks waypoints within, around the player. */
const HELI_WAYPOINT_MIN_R = 180;
const HELI_WAYPOINT_MAX_R = 420;
/** Re-pick a loiter waypoint at least this often (ms). */
const HELI_REPICK_MS = 1500;
/** Re-pick once the body gets within this distance of its waypoint. */
const HELI_ARRIVE_DIST = 60;
/** Heli AK bullet lifetime (ms) — separate from the heli's own uptime. Long enough to span the screen. */
const HELI_BULLET_LIFETIME_MS = 4000;
/** Backstop padding (ms) added to the body projectile's expiry to cover transit time around the attack window. */
const HELI_ENTER_MAX_MS = 4000;
const HELI_EXIT_MAX_MS = 4000;
/** Fixed sim step (matches tickOrbital) — used for the heading slew. */
const HELI_DT = 1 / 20;

/** Shortest signed angular difference a→b, in (-π, π]. */
function angDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Slew `cur` toward `target` by at most `maxStep` rad, along the shortest path. */
function slewAngle(cur: number, target: number, maxStep: number): number {
  const d = angDiff(cur, target);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

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
function applyHit(world: World, target: Fish, owner: Fish, damage: number, weaponId: WeaponId, now: number): void {
  // Full Metal subtracts a flat amount from incoming damage (floored at MIN_HIT_DAMAGE so armor
  // never fully nullifies a weapon). The post-armor value is what's drained, credited, and shown —
  // so the floating damage number reflects what the target actually took.
  const reduction = target.isAi ? 0 : getDamageTakenReduction(target);
  const dealt = Math.max(MIN_HIT_DAMAGE, damage - reduction);
  target.mass -= dealt * FISH.damageMassLossRatio;
  // Credit the firer's leaderboard stats. AI never fire, but guard anyway.
  if (!owner.isAi) {
    owner.hits += 1;
    owner.damageDealt += dealt;
  }
  world.hitEvents.push({
    x: target.x,
    y: target.y,
    damage: dealt,
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
      // Kill COUNT only — no automatic XP. The victim's XP scatters as collectable balls at the
      // corpse (see World.spawnDeathDrops); the killer earns it by swimming over to pick it up, the
      // same as everyone else, so a kill becomes a contested scrum instead of a free reward.
      owner.kills += 1;
    }
  }

  // Battle Comms: any fish a player damages is slowed to half speed for a level-scaled window.
  // AI never carry passives, so this is a no-op for AI owners. The owner is the attacker, never slowed.
  if (!owner.isAi) {
    const dur = battleCommsSlowMs(owner.passives.get("comms") ?? 0);
    if (dur > 0) target.slowUntil = Math.max(target.slowUntil ?? 0, now + dur);
  }
}

/**
 * Apply a nibble: a smaller fish biting a bigger one (the fish-eat loop calls this when a fish
 * contacts a bigger fish it can't swallow). Drains the target's mass (mass is health) like a weapon
 * hit, but with no weaponId/HitEvent — feedback is the chomp animation — and without crediting
 * weapon stats (hits/damage are weapon-only). A nibble that drains the target to zero kills it and
 * credits the nibbler (so you can chip a bigger fish to death); the corpse drops normal chunks
 * (`eatenWhole` stays unset), exactly like a weapon kill — it was NOT swallowed whole.
 */
export function applyNibble(target: Fish, attacker: Fish, damage: number): void {
  const reduction = target.isAi ? 0 : getDamageTakenReduction(target);
  const dealt = Math.max(MIN_HIT_DAMAGE, damage - reduction);
  target.mass -= dealt * FISH.damageMassLossRatio;
  if (target.alive && target.mass <= 0) {
    target.alive = false;
    target.killedByName = attacker.name;
    target.killedByMass = attacker.mass;
    if (!attacker.isAi) {
      // Kill COUNT only — no automatic XP (the victim's XP drops as collectable balls). See applyHit.
      attacker.kills += 1;
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

  const cdMult = getWeaponCooldownMult(fish);
  const dmgBonus = getWeaponDamageBonus(fish);

  for (const slot of fish.weapons) {
    const def = WEAPONS[slot.id];
    const lvl = getWeaponLevel(slot.id, slot.level);
    const dmg = lvl.damage + dmgBonus;

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
          firePulse(world, fish, slot, lvl, dmg, def.chain ?? false, now);
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
      case "heli":
        tickHeli(world, fish, slot, lvl, dmg, now, cdMult);
        break;
      case "vehicle":
        // Cars are fire-and-forget (no per-wave state like flyby): on cooldown, launch a wave that
        // sweeps across the screen and pierces every fish in its lane.
        if (now >= slot.cooldownReadyAt) {
          fireVehicleWave(world, fish, slot, lvl, dmg, now);
          slot.cooldownReadyAt = now + lvl.cooldownMs * cdMult;
        }
        break;
    }
  }
}

/** Lateral gap between adjacent cars in a wave (px) — roughly a car-width so they read as a row, not a stack. */
const VEHICLE_LANE_SPACING = 600;

/**
 * Nitro's Customs / Dealership: launch a wave of `count` large cars that sweep ACROSS the player's
 * screen in one straight line (mirrors the flyby crossing — enter one edge, exit the opposite). The
 * cars ride a band perpendicular to travel so they form a row. Each is a piercing linear body that
 * plows through every fish it touches for `damage`; the reHitMs gate (= lifetime) keeps it to one hit
 * per fish and stops the server/client hit paths double-applying.
 */
function fireVehicleWave(world: World, fish: Fish, slot: WeaponSlot, lvl: WeaponLevel, damage: number, now: number): void {
  const count = lvl.count ?? 1;
  const lifetimeMs = lvl.lifetimeMs ?? 3800;
  const radius = lvl.radius ?? 240;
  const R = viewRadius(fish.mass);
  const speed = (2 * R) / (lifetimeMs / 1000); // cross the full view (enter edge → exit edge) over the lifetime
  // One random crossing direction for the whole volley, plus the unit vector perpendicular to it.
  const angle = world.rng() * Math.PI * 2;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const perpX = -dirY;
  const perpY = dirX;
  // Band spans (count-1)*spacing, capped at the view diameter so every lane still crosses the visible disk.
  const band = Math.min((count - 1) * VEHICLE_LANE_SPACING, 2 * R);
  for (let i = 0; i < count; i++) {
    const off = count === 1 ? 0 : band * (i / (count - 1) - 0.5);
    const ox = perpX * off;
    const oy = perpY * off;
    world.spawnProjectile({
      ownerId: fish.id,
      weaponId: slot.id,
      x: fish.x - dirX * R + ox,
      y: fish.y - dirY * R + oy,
      vx: dirX * speed,
      vy: dirY * speed,
      damage,
      radius,
      expiresAt: now + lifetimeMs,
      behavior: "linear",
      pierce: true,
      reHitMs: lvl.reHitMs ?? lifetimeMs,
    });
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

/** Bullets in a Turret burst are spread evenly across this window (ms). */
const SWEEP_MS = 1000;
/** How many full circles the Turret's spray spirals through during one sweep. */
const SWEEP_REVOLUTIONS = 3;

/**
 * Advance an in-progress Turret sweep: emit every bullet that has come due since
 * the last tick. Bullet `i` of `count` is due at `(i / count) * SWEEP_MS` into the
 * burst, so the spray spirals SWEEP_REVOLUTIONS full circles over ~SWEEP_MS. Returns
 * true once the whole burst has fired.
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
    const a = (i / count) * Math.PI * 2 * SWEEP_REVOLUTIONS;
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

function firePulse(world: World, fish: Fish, slot: WeaponSlot, lvl: WeaponLevel, damage: number, chain: boolean, now: number): void {
  const radius = lvl.pulseRadius ?? lvl.range;
  pulseAt(world, fish.id, fish, fish.x, fish.y, radius, damage, slot.id, now, chain, lvl.maxTargets);
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
  now: number,
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
    applyHit(world, target, owner, damage, weaponId, now);
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
    // Shipped to clients so they animate the orbit smoothly at their own framerate.
    proj.orbitAngle = a;
    proj.orbitAngular = angular;
    proj.orbitRadius = orbitR;
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
    fireLaser(world, fish, proj, viewR, damage, slot.id, now);
  }
}

/**
 * Alien Friends laser: pick the single fish nearest the UFO that's currently on
 * the owner's screen (within their view radius), damage it, and emit a one-bolt
 * zap so the client draws a beam from the UFO to it. Fires silently when the
 * player has nothing visible to shoot.
 */
function fireLaser(world: World, owner: Fish, ship: Projectile, viewR: number, damage: number, weaponId: WeaponId, now: number): void {
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
  applyHit(world, best, owner, damage, weaponId, now);
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

function ensureHeliState(slot: WeaponSlot): HeliState {
  if (slot.state && slot.state.kind === "heli") return slot.state;
  const s: HeliState = { kind: "heli", ship: null };
  slot.state = s;
  return s;
}

/** A loiter OFFSET (relative to the player) on the ring [MIN_R, MAX_R]. Added to the live player
 *  position each tick so the target tracks the player instead of going stale when they move. */
function pickHeliWaypoint(world: World): { dx: number; dy: number } {
  const ang = world.rng() * Math.PI * 2;
  const r = HELI_WAYPOINT_MIN_R + world.rng() * (HELI_WAYPOINT_MAX_R - HELI_WAYPOINT_MIN_R);
  return { dx: Math.cos(ang) * r, dy: Math.sin(ang) * r };
}

/** A point on/just past the player's screen edge, in a random direction (for enter/exit). */
function pickHeliEdgePoint(world: World, fish: Fish, distMult: number): { x: number; y: number; ang: number } {
  const ang = world.rng() * Math.PI * 2;
  const r = viewRadius(fish.mass) * distMult;
  return { x: fish.x + Math.cos(ang) * r, y: fish.y + Math.sin(ang) * r, ang };
}

/** Steer the body toward (tx, ty) at `speed`, writing vx/vy that integrate next tick. */
function steerHeli(proj: Projectile, tx: number, ty: number, speed: number): void {
  const dx = tx - proj.x;
  const dy = ty - proj.y;
  const mag = Math.hypot(dx, dy) || 1;
  proj.vx = (dx / mag) * speed;
  proj.vy = (dy / mag) * speed;
}

/**
 * Mortal's Heli: summon a minicopter (a damage-0 linear projectile) that streaks in from a screen
 * edge (`enter`), loiters around the player while turning its nose onto enemies and firing a
 * lead-aimed AK only when aligned (`attack`), then peels off and leaves through an edge (`exit`).
 * Sets its own cooldownReadyAt (like tickFlyby) so the HUD shows the real next-summon countdown.
 */
function tickHeli(world: World, fish: Fish, slot: WeaponSlot, lvl: WeaponLevel, damage: number, now: number, cdMult: number): void {
  const state = ensureHeliState(slot);
  // Drop the ship once its body projectile has expired/been removed.
  if (state.ship && !world.projectiles.has(state.ship.projId)) state.ship = null;

  // Summon when none is up and the cooldown has elapsed: spawn off a random screen edge,
  // aimed inward toward a first loiter waypoint, and fly in fast.
  if (!state.ship && now >= slot.cooldownReadyAt) {
    const lifetimeMs = lvl.lifetimeMs ?? 8000;
    const entry = pickHeliEdgePoint(world, fish, 1.0);
    const wp = pickHeliWaypoint(world);
    const proj = world.spawnProjectile({
      ownerId: fish.id,
      weaponId: slot.id,
      x: entry.x,
      y: entry.y,
      vx: 0,
      vy: 0,
      damage: 0,                 // the body is harmless; its bullets deal the damage
      radius: HELI_BODY_RADIUS,
      // Generous backstop: enter + on-station + exit. Normal completion removes it explicitly in `exit`.
      expiresAt: now + HELI_ENTER_MAX_MS + lifetimeMs + HELI_EXIT_MAX_MS,
      behavior: "linear",
      reHitMs: 0,
      isBody: true,
    });
    if (proj.id >= 0) {
      const heading = Math.atan2(fish.y - entry.y, fish.x - entry.x); // nose toward the arena
      proj.facing = heading;
      state.ship = {
        projId: proj.id,
        phase: "enter",
        heading,
        lastFireAt: now,
        offX: wp.dx,
        offY: wp.dy,
        nextWaypointAt: now + HELI_REPICK_MS,
        attackUntil: 0,
        exitDx: 0,
        exitDy: 0,
      };
    }
    slot.cooldownReadyAt = now + (lvl.cooldownMs ?? 20000) * cdMult;
  }

  const ship = state.ship;
  if (!ship) return;
  const proj = world.projectiles.get(ship.projId);
  if (!proj) { state.ship = null; return; }

  const distToPlayer = Math.hypot(proj.x - fish.x, proj.y - fish.y);

  // Loiter target follows the player: the stored offset added to the LIVE player position. This is
  // what fixes the "stuck bouncing on a dead spot when the player moves" bug — the target never
  // goes stale, so the body always converges to the ring around wherever the player is now.
  if (ship.phase === "enter") {
    // Fly fast toward the first loiter target; nose follows travel. Begin attacking once the body
    // reaches the loiter ring — gate on the live player OR on reaching the target, so it can never
    // get trapped in `enter` (the old `distToPlayer`-only gate never fired once the player moved off).
    const tx = fish.x + ship.offX;
    const ty = fish.y + ship.offY;
    steerHeli(proj, tx, ty, HELI_TRANSIT_SPEED);
    const dtx = proj.x - tx;
    const dty = proj.y - ty;
    const reachedTarget = dtx * dtx + dty * dty < HELI_WAYPOINT_MAX_R * HELI_WAYPOINT_MAX_R;
    if (distToPlayer < HELI_WAYPOINT_MAX_R || reachedTarget) {
      ship.phase = "attack";
      ship.attackUntil = now + (lvl.lifetimeMs ?? 8000);
    }
  } else if (ship.phase === "attack") {
    // Loiter: re-pick an offset periodically or on arrival so the heli keeps circling the player.
    let tx = fish.x + ship.offX;
    let ty = fish.y + ship.offY;
    const dtx = proj.x - tx;
    const dty = proj.y - ty;
    if (now >= ship.nextWaypointAt || dtx * dtx + dty * dty < HELI_ARRIVE_DIST * HELI_ARRIVE_DIST) {
      const wp = pickHeliWaypoint(world);
      ship.offX = wp.dx;
      ship.offY = wp.dy;
      ship.nextWaypointAt = now + HELI_REPICK_MS;
      tx = fish.x + ship.offX;
      ty = fish.y + ship.offY;
    }
    steerHeli(proj, tx, ty, HELI_CRUISE_SPEED);

    // Time's up → peel off. Lock in a fixed outward heading (away from the player) and streak straight
    // out from here on. A constant direction (not a finite waypoint) means it never decelerates or
    // overshoots, so a player tailing it can't keep it pinned on screen.
    if (now >= ship.attackUntil) {
      let ex = proj.x - fish.x;
      let ey = proj.y - fish.y;
      const em = Math.hypot(ex, ey);
      if (em > 1) {
        ex /= em;
        ey /= em;
      } else {
        const a = world.rng() * Math.PI * 2;
        ex = Math.cos(a);
        ey = Math.sin(a);
      }
      ship.exitDx = ex;
      ship.exitDy = ey;
      ship.phase = "exit";
    }
  } else {
    // exit: streak straight out along the locked heading at transit speed — never stops or bounces.
    // Remove once the body has fully left the arena (guaranteed even if the player chases it across
    // the map) or is well clear of the player's view (the common case when they don't follow).
    proj.vx = ship.exitDx * HELI_TRANSIT_SPEED;
    proj.vy = ship.exitDy * HELI_TRANSIT_SPEED;
    const leftArena =
      proj.x < -HELI_BODY_RADIUS ||
      proj.x > ARENA.width + HELI_BODY_RADIUS ||
      proj.y < -HELI_BODY_RADIUS ||
      proj.y > ARENA.height + HELI_BODY_RADIUS;
    if (leftArena || distToPlayer > viewRadius(fish.mass) * 1.15) {
      world.removeProjectile(proj.id);
      state.ship = null;
      return;
    }
  }

  // Aim + heading. While attacking, nose tracks the lead-aim angle of the nearest enemy (or
  // travel direction when there's nothing to shoot); in transit it noses into its travel direction.
  const travel = Math.atan2(proj.vy, proj.vx);
  let aim: number | null = null;
  if (ship.phase === "attack") {
    const target = nearestOnScreenEnemy(world, fish, proj);
    if (target) aim = leadAngle(proj.x, proj.y, target, lvl.speed ?? 460);
  }
  const desired = aim ?? travel;
  ship.heading = slewAngle(ship.heading, desired, HELI_TURN_RATE * HELI_DT);
  proj.facing = ship.heading;

  // Fire on the level cadence, but only when attacking, with a real target, and the nose is
  // aligned to the aim — bullets always leave along the nose, so it shoots where it faces.
  if (ship.phase === "attack" && aim !== null && Math.abs(angDiff(ship.heading, aim)) <= HELI_FIRE_ALIGN) {
    const interval = lvl.intervalMs ?? 700;
    if (now - ship.lastFireAt >= interval) {
      ship.lastFireAt = now;
      fireHeliBullet(world, fish, proj, lvl, damage, now);
    }
  }
}

/**
 * Pick the enemy fish nearest the heli that's currently on the owner's screen (mirrors
 * fireLaser's visibility gate), or null if the owner has nothing visible to shoot.
 */
function nearestOnScreenEnemy(world: World, owner: Fish, ship: Projectile): Fish | null {
  const scratch: Fish[] = [];
  const viewR = viewRadius(owner.mass);
  world.fishHash.query(owner.x, owner.y, viewR + MAX_FISH_RADIUS_PAD, scratch);
  const viewR2 = viewR * viewR;
  let best: Fish | null = null;
  let bestD2 = Infinity;
  for (const target of scratch) {
    if (target.id === owner.id || !target.alive) continue;
    if (!withinOwnerView(owner, target.x, target.y, viewR2)) continue;
    const dx = target.x - ship.x;
    const dy = target.y - ship.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = target; }
  }
  return best;
}

/**
 * Interception aim: the angle from (ox,oy) to where `target` will be, given a bullet of
 * `bulletSpeed`, by solving |R + V·t| = bulletSpeed·t for the smallest positive t. Falls
 * back to aiming at the target's current position when there is no positive solution.
 */
function leadAngle(ox: number, oy: number, target: Fish, bulletSpeed: number): number {
  const rx = target.x - ox;
  const ry = target.y - oy;
  const tvx = target.vx;
  const tvy = target.vy;
  const a = tvx * tvx + tvy * tvy - bulletSpeed * bulletSpeed;
  const b = 2 * (rx * tvx + ry * tvy);
  const c = rx * rx + ry * ry;
  let t = -1;
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) > 1e-6) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const cands = [(-b + sq) / (2 * a), (-b - sq) / (2 * a)].filter((v) => v > 1e-4);
      if (cands.length) t = Math.min(...cands);
    }
  }
  if (t > 0) return Math.atan2(ry + tvy * t, rx + tvx * t);
  return Math.atan2(ry, rx);
}

/**
 * The heli fires `count` AK bullets (gunship: 2 with a slight spread) straight out the nose —
 * along `ship.facing`, which the caller has already slewed onto the lead-aim angle of the target.
 * Bullets are normal single-hit linear projectiles attributed to the heli's weapon id, so they
 * ride applyProjectileDamage and trigger Battle Comms on hit, and emerge from the nose tip.
 */
function fireHeliBullet(world: World, fish: Fish, ship: Projectile, lvl: WeaponLevel, damage: number, now: number): void {
  const speed = lvl.speed ?? 460;
  const count = lvl.count ?? 1;
  const spread = lvl.spread ?? 0;
  const radius = lvl.radius ?? 18;
  const facing = ship.facing ?? Math.atan2(ship.vy, ship.vx);
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : spread * (i / (count - 1) - 0.5);
    const a = facing + offset;
    const dirX = Math.cos(a);
    const dirY = Math.sin(a);
    world.spawnProjectile({
      ownerId: fish.id,
      weaponId: ship.weaponId,
      // Emerge from the nose tip so the muzzle reads off the front of the (now 2×) body.
      x: ship.x + dirX * HELI_BODY_RADIUS,
      y: ship.y + dirY * HELI_BODY_RADIUS,
      vx: dirX * speed,
      vy: dirY * speed,
      damage,
      radius,
      expiresAt: now + HELI_BULLET_LIFETIME_MS,
      behavior: "linear",
      reHitMs: 0,
    });
  }
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
      applyHit(world, target, owner, proj.damage, proj.weaponId, now);

      if (proj.behavior === "linear" && !proj.pierce) {
        // expire after first hit (piercing vehicles plow on through; the reHitMs gate above keeps
        // them to one hit per fish)
        proj.expiresAt = now;
        break;
      }
    }
  }
}

/**
 * Apply a client-reported weapon hit. The client owns its own fish and renders projectiles
 * at the present while enemies lag ~150ms behind, so a hit that visually lands on the client
 * can disagree with the server's geometry — we honor the client's call rather than re-deriving
 * it. This complements (does not replace) server-side `applyProjectileDamage`: both share the
 * projectile's `hits` re-hit gate, so a hit detected by one path can never be double-applied by
 * the other. The only sanity check is a view-radius bound, so a buggy client can't snipe across
 * the map; geometry/reach is intentionally trusted. Returns true if damage was applied.
 */
export function applyClientWeaponHit(
  world: World,
  owner: Fish,
  projectileId: number,
  targetId: number,
  now: number,
): boolean {
  const proj = world.projectiles.get(projectileId);
  if (!proj || proj.ownerId !== owner.id) return false;
  if (now >= proj.expiresAt || proj.damage <= 0) return false;
  const target = world.fish.get(targetId);
  if (!target || !target.alive || target.id === owner.id) return false;
  // Sanity bound only — the client reports on-screen hits, so this passes naturally.
  if (!withinOwnerView(owner, target.x, target.y, viewRadius(owner.mass) ** 2)) return false;
  // Re-hit gate shared with applyProjectileDamage (prevents double-apply and message spam).
  if (proj.reHitMs > 0) {
    const lastHit = proj.hits.get(target.id) ?? 0;
    if (now - lastHit < proj.reHitMs) return false;
  } else if (proj.hits.has(target.id)) {
    return false; // single-hit projectile already spent on this target
  }
  proj.hits.set(target.id, now);
  applyHit(world, target, owner, proj.damage, proj.weaponId, now);
  if (proj.behavior === "linear" && !proj.pierce) proj.expiresAt = now; // single-hit bullets expire on contact; piercing vehicles continue
  return true;
}

export type { WeaponId };
