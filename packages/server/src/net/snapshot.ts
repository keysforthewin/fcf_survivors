import type { EntityDelta, SnapshotMsg, YouWeaponSlot } from "@fcf/shared";
import { viewRadius, xpForLevel } from "@fcf/shared";
import type { World } from "../sim/world.ts";
import type { Fish, Projectile } from "../sim/entity.ts";

export class ClientView {
  // last sent state per entity id, used for change detection
  prevSent = new Map<number, { kind: string; x: number; y: number; mass?: number; hp?: number }>();
  ackSeq = 0;
}

const HEADING_PRECISION = 100;

function encodeHeading(v: number): number {
  return Math.round(v * HEADING_PRECISION) / HEADING_PRECISION;
}

function fishDelta(f: Fish, prev: { mass?: number; hp?: number } | undefined): EntityDelta {
  const delta: EntityDelta = {
    id: f.id,
    kind: "fish",
    x: Math.round(f.x),
    y: Math.round(f.y),
  };
  if (!prev || Math.abs((prev.mass ?? -1) - f.mass) > 0.5) delta.mass = Math.round(f.mass);
  if (!prev || Math.abs((prev.hp ?? -1) - f.hp) > 0.5) delta.hp = Math.round(f.hp);
  if (!prev) {
    delta.color = f.color;
    delta.name = f.name;
    delta.maxHp = Math.round(f.maxHp);
    delta.isAi = f.isAi;
  }
  delta.vx = Math.round(f.vx);
  delta.vy = Math.round(f.vy);
  delta.hx = encodeHeading(f.headingX);
  delta.hy = encodeHeading(f.headingY);
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
  return delta;
}

export function buildSnapshot(world: World, self: Fish, view: ClientView, now: number): SnapshotMsg {
  const r = viewRadius(self.mass);
  const r2 = r * r;
  const seen = new Set<number>();
  const entities: EntityDelta[] = [];

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
    entities.push(fishDelta(f, prev));
    view.prevSent.set(f.id, { kind: "fish", x: f.x, y: f.y, mass: f.mass, hp: f.hp });
  };

  for (const f of world.fish.values()) considerFish(f);

  for (const p of world.pellets.values()) {
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

  for (const c of world.chunks.values()) {
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

  for (const proj of world.projectiles.values()) {
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

  return {
    t: "snapshot",
    tick: world.tick,
    ackSeq: view.ackSeq,
    serverNow: now,
    you: {
      x: self.x,
      y: self.y,
      hx: encodeHeading(self.headingX),
      hy: encodeHeading(self.headingY),
      mass: self.mass,
      hp: self.hp,
      maxHp: self.maxHp,
      xp: self.xp,
      level: self.level,
      nextLevelXp,
      boostReadyAt: self.boostReadyAt,
      boostUntil: self.boostUntil,
      serverNow: now,
      weapons,
    },
    entities,
    removed,
  };
}

/**
 * Build a snapshot for a spectator socket — no local fish, sees the whole map.
 * Camera position is sent up by the client but doesn't restrict what's visible.
 */
export function buildSpectatorSnapshot(world: World, view: ClientView, now: number): SnapshotMsg {
  const seen = new Set<number>();
  const entities: EntityDelta[] = [];

  for (const f of world.fish.values()) {
    if (!f.alive) continue;
    seen.add(f.id);
    const prev = view.prevSent.get(f.id);
    entities.push(fishDelta(f, prev));
    view.prevSent.set(f.id, { kind: "fish", x: f.x, y: f.y, mass: f.mass, hp: f.hp });
  }

  for (const p of world.pellets.values()) {
    seen.add(p.id);
    const prev = view.prevSent.get(p.id);
    if (!prev) {
      entities.push({ id: p.id, kind: "pellet", x: Math.round(p.x), y: Math.round(p.y), color: p.color });
      view.prevSent.set(p.id, { kind: "pellet", x: p.x, y: p.y });
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

  return {
    t: "snapshot",
    tick: world.tick,
    ackSeq: view.ackSeq,
    serverNow: now,
    spectator: true,
    entities,
    removed,
  };
}
