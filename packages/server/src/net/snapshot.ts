import type { EntityDelta, HitEvent, SnapshotMsg, YouPassiveSlot, YouWeaponSlot, ZapEvent } from "@fcf/shared";
import { MASS_DECAY, MAX_PROJECTILE_RADIUS, viewRadius, xpForLevel } from "@fcf/shared";
import type { World } from "../sim/world.ts";
import type { Chunk, Fish, Fruit, Pellet, Projectile } from "../sim/entity.ts";
import { getMoveSpeed } from "../sim/passives.ts";

export class ClientView {
  // last sent state per entity id, used for change detection
  prevSent = new Map<number, { kind: string; x: number; y: number; mass?: number }>();
  ackSeq = 0;
}

const HEADING_PRECISION = 100;

function encodeHeading(v: number): number {
  return Math.round(v * HEADING_PRECISION) / HEADING_PRECISION;
}

function fishDelta(f: Fish, prev: { mass?: number } | undefined, tick: number): EntityDelta {
  const delta: EntityDelta = {
    id: f.id,
    kind: "fish",
    x: Math.round(f.x),
    y: Math.round(f.y),
  };
  if (!prev || Math.abs((prev.mass ?? -1) - f.mass) > 0.5) delta.mass = Math.round(f.mass);
  if (!prev) {
    delta.color = f.color;
    delta.species = f.species;
    delta.name = f.name;
    delta.isAi = f.isAi;
  }
  delta.vx = Math.round(f.vx);
  delta.vy = Math.round(f.vy);
  delta.hx = encodeHeading(f.headingX);
  delta.hy = encodeHeading(f.headingY);
  // Transient: set only on the tick this fish bit edible prey. Drives the eater's chomp/lurch
  // animation on every client that can see it.
  if (f.bitingTick === tick) delta.biting = true;
  return delta;
}

function projectileDelta(proj: Projectile, prev: unknown): EntityDelta {
  const delta: EntityDelta = {
    id: proj.id,
    kind: "projectile",
    x: Math.round(proj.x),
    y: Math.round(proj.y),
  };
  if (!prev) {
    delta.vx = Math.round(proj.vx);
    delta.vy = Math.round(proj.vy);
    delta.weaponId = proj.weaponId;
    delta.ownerId = proj.ownerId;
    delta.radius = Math.round(proj.radius);
  }
  // Orbital blades carry their angle each tick so the client can animate the orbit at its
  // own framerate (re-anchor to orbitAngle, extrapolate at orbitAngular). orbitRadius grows
  // with owner mass, so it's resent too; both are tiny and orbitals are few.
  if (proj.behavior === "orbital" && proj.orbitAngle !== undefined) {
    delta.orbitAngle = Math.round(proj.orbitAngle * 1000) / 1000;
    delta.orbitAngular = proj.orbitAngular;
    delta.orbitRadius = Math.round(proj.orbitRadius ?? 0);
  }
  return delta;
}

export function buildSnapshot(world: World, self: Fish, view: ClientView, now: number, serverTickMs = 0): SnapshotMsg {
  const r = viewRadius(self.mass);
  const r2 = r * r;
  const seen = new Set<number>();
  const entities: EntityDelta[] = [];
  // Reused across the per-type interest queries below (mirrors world.step's scratch).
  // Hashes are rebuilt against end-of-tick state in the tick loop before snapshots run.
  const scratch: any[] = [];

  const considerFish = (f: Fish): void => {
    if (!f.alive && f.id !== self.id) return;
    if (f.id === self.id) {
      seen.add(f.id);
      return;
    }
    const dx = f.x - self.x;
    const dy = f.y - self.y;
    if (dx * dx + dy * dy > r2) return;
    seen.add(f.id);
    const prev = view.prevSent.get(f.id);
    entities.push(fishDelta(f, prev, world.tick));
    view.prevSent.set(f.id, { kind: "fish", x: f.x, y: f.y, mass: f.mass });
  };

  scratch.length = 0;
  world.fishHash.query(self.x, self.y, r, scratch);
  for (const f of scratch as Fish[]) considerFish(f);

  scratch.length = 0;
  world.pelletHash.query(self.x, self.y, r, scratch);
  for (const p of scratch as Pellet[]) {
    const dx = p.x - self.x;
    const dy = p.y - self.y;
    if (dx * dx + dy * dy > r2) continue;
    seen.add(p.id);
    const prev = view.prevSent.get(p.id);
    if (!prev) {
      entities.push({ id: p.id, kind: "pellet", x: Math.round(p.x), y: Math.round(p.y), color: p.color });
      view.prevSent.set(p.id, { kind: "pellet", x: p.x, y: p.y });
    }
  }

  scratch.length = 0;
  world.fruitHash.query(self.x, self.y, r, scratch);
  for (const fr of scratch as Fruit[]) {
    const dx = fr.x - self.x;
    const dy = fr.y - self.y;
    if (dx * dx + dy * dy > r2) continue;
    seen.add(fr.id);
    const prev = view.prevSent.get(fr.id);
    if (!prev) {
      entities.push({ id: fr.id, kind: "fruit", x: Math.round(fr.x), y: Math.round(fr.y), reward: fr.reward });
      view.prevSent.set(fr.id, { kind: "fruit", x: fr.x, y: fr.y });
    }
  }

  scratch.length = 0;
  world.chunkHash.query(self.x, self.y, r, scratch);
  for (const c of scratch as Chunk[]) {
    const dx = c.x - self.x;
    const dy = c.y - self.y;
    if (dx * dx + dy * dy > r2) continue;
    seen.add(c.id);
    const prev = view.prevSent.get(c.id);
    const delta: EntityDelta = { id: c.id, kind: "chunk", x: Math.round(c.x), y: Math.round(c.y) };
    if (!prev) {
      delta.color = c.color;
      delta.mass = c.mass;
    }
    entities.push(delta);
    view.prevSent.set(c.id, { kind: "chunk", x: c.x, y: c.y });
  }

  // Pad the query by the largest possible projectile radius so a wide pulse ring whose
  // center is outside view but whose body reaches in is still considered (see test below).
  scratch.length = 0;
  world.projectileHash.query(self.x, self.y, r + MAX_PROJECTILE_RADIUS, scratch);
  for (const proj of scratch as Projectile[]) {
    const dx = proj.x - self.x;
    const dy = proj.y - self.y;
    // include projectiles within view OR within their own radius of self (so pulse rings always show)
    if (dx * dx + dy * dy > r2 && (Math.hypot(dx, dy) - proj.radius) > r) continue;
    seen.add(proj.id);
    const prev = view.prevSent.get(proj.id);
    entities.push(projectileDelta(proj, prev));
    view.prevSent.set(proj.id, { kind: "projectile", x: proj.x, y: proj.y });
  }

  // anything we previously sent but no longer see -> removed
  const removed: number[] = [];
  for (const [id] of view.prevSent) {
    if (!seen.has(id)) {
      removed.push(id);
      view.prevSent.delete(id);
    }
  }

  const nextLevelXp = xpForLevel(self.level);
  const weapons: YouWeaponSlot[] = self.weapons.map((s) => ({
    id: s.id,
    level: s.level,
    cooldownReadyAt: s.cooldownReadyAt,
  }));
  const passives: YouPassiveSlot[] = [...self.passives.entries()].map(([id, stack]) => ({ id, stack }));
  const pendingPicks = (self.pendingLevelUp.length > 0 ? 1 : 0) + self.queuedLevelUps;

  const hits = hitEventsFor(world, self, seen);
  const zaps = zapsFor(world, self, seen);

  return {
    t: "snapshot",
    tick: world.tick,
    ackSeq: view.ackSeq,
    serverNow: now,
    serverTickMs,
    you: {
      x: self.x,
      y: self.y,
      vx: self.vx,
      vy: self.vy,
      hx: encodeHeading(self.headingX),
      hy: encodeHeading(self.headingY),
      moveSpeed: getMoveSpeed(self),
      mass: self.mass,
      maxMass: MASS_DECAY.maxMass,
      xp: self.xp,
      level: self.level,
      nextLevelXp,
      boostReadyAt: self.boostReadyAt,
      boostUntil: self.boostUntil,
      serverNow: now,
      weapons,
      passives,
      pendingPicks,
      rerolls: self.rerollsRemaining,
      banishes: self.banishesRemaining,
    },
    entities,
    removed,
    ...(hits.length > 0 ? { hits } : {}),
    ...(zaps.length > 0 ? { zaps } : {}),
  };
}

/**
 * Per-socket hit-event filter: include events whose target is visible to this socket
 * (already in `seen`). The owner flag tells the client whether to fire owner-only
 * feedback (camera kick, etc.).
 */
function hitEventsFor(world: World, self: Fish | null, seen: Set<number>): HitEvent[] {
  if (world.hitEvents.length === 0) return [];
  const out: HitEvent[] = [];
  for (const e of world.hitEvents) {
    if (!seen.has(e.targetId)) continue;
    out.push({
      x: Math.round(e.x),
      y: Math.round(e.y),
      damage: Math.round(e.damage),
      targetId: e.targetId,
      byOwner: self !== null && e.ownerId === self.id,
      weaponId: e.weaponId,
    });
  }
  return out;
}

/**
 * Per-socket zap-event filter: include a zap when its firing fish or any struck fish
 * is visible to this socket. All nodes are sent so the bolt path stays complete even
 * when an intermediate fish is just out of view.
 */
function zapsFor(world: World, self: Fish | null, seen: Set<number>): ZapEvent[] {
  if (world.zapEvents.length === 0) return [];
  const out: ZapEvent[] = [];
  for (const z of world.zapEvents) {
    const ownerId = z.nodes[0]?.id;
    const byOwner = self !== null && ownerId === self.id;
    if (!byOwner && !z.nodes.some((n) => seen.has(n.id))) continue;
    out.push({ nodes: z.nodes, chain: z.chain, weaponId: z.weaponId, byOwner });
  }
  return out;
}

/**
 * Build a snapshot for a spectator socket — no local fish, sees the whole map.
 * Camera position is sent up by the client but doesn't restrict what's visible.
 */
export function buildSpectatorSnapshot(world: World, view: ClientView, now: number, serverTickMs = 0): SnapshotMsg {
  const seen = new Set<number>();
  const entities: EntityDelta[] = [];

  for (const f of world.fish.values()) {
    if (!f.alive) continue;
    seen.add(f.id);
    const prev = view.prevSent.get(f.id);
    entities.push(fishDelta(f, prev, world.tick));
    view.prevSent.set(f.id, { kind: "fish", x: f.x, y: f.y, mass: f.mass });
  }

  for (const p of world.pellets.values()) {
    seen.add(p.id);
    const prev = view.prevSent.get(p.id);
    if (!prev) {
      entities.push({ id: p.id, kind: "pellet", x: Math.round(p.x), y: Math.round(p.y), color: p.color });
      view.prevSent.set(p.id, { kind: "pellet", x: p.x, y: p.y });
    }
  }

  for (const fr of world.fruits.values()) {
    seen.add(fr.id);
    const prev = view.prevSent.get(fr.id);
    if (!prev) {
      entities.push({ id: fr.id, kind: "fruit", x: Math.round(fr.x), y: Math.round(fr.y), reward: fr.reward });
      view.prevSent.set(fr.id, { kind: "fruit", x: fr.x, y: fr.y });
    }
  }

  for (const c of world.chunks.values()) {
    seen.add(c.id);
    const prev = view.prevSent.get(c.id);
    const delta: EntityDelta = { id: c.id, kind: "chunk", x: Math.round(c.x), y: Math.round(c.y) };
    if (!prev) {
      delta.color = c.color;
      delta.mass = c.mass;
    }
    entities.push(delta);
    view.prevSent.set(c.id, { kind: "chunk", x: c.x, y: c.y });
  }

  for (const proj of world.projectiles.values()) {
    seen.add(proj.id);
    const prev = view.prevSent.get(proj.id);
    entities.push(projectileDelta(proj, prev));
    view.prevSent.set(proj.id, { kind: "projectile", x: proj.x, y: proj.y });
  }

  const removed: number[] = [];
  for (const [id] of view.prevSent) {
    if (!seen.has(id)) {
      removed.push(id);
      view.prevSent.delete(id);
    }
  }

  const hits = hitEventsFor(world, null, seen);
  const zaps = zapsFor(world, null, seen);

  return {
    t: "snapshot",
    tick: world.tick,
    ackSeq: view.ackSeq,
    serverNow: now,
    serverTickMs,
    spectator: true,
    entities,
    removed,
    ...(hits.length > 0 ? { hits } : {}),
    ...(zaps.length > 0 ? { zaps } : {}),
  };
}
