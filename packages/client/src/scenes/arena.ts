import { Application, Container, Graphics } from "pixi.js";
import type { EntityDelta, SnapshotMsg, WelcomeMsg, EatenMsg, LeaderboardMsg, YouWeaponSlot, LevelUpMsg } from "@fcf/shared";
import { ARENA, fishRadius, WEAPONS, getWeaponLevel, viewRadius } from "@fcf/shared";
import { NetSocket } from "../net/socket.ts";
import { createInput } from "../input.ts";
import { FishSprite, parseColor } from "../render/fish.ts";
import { ProjectileSprite } from "../render/projectile.ts";
import { ParticleSystem } from "../render/particles.ts";
import { mountLevelUp, type LevelUpMount } from "./level-up.ts";
import { mountToastHud, type ToastHud } from "../hud/toast.ts";
import { mountRosterHud, type RosterHud } from "../hud/roster.ts";
import * as snd from "../sound.ts";

interface FishState {
  id: number;
  name: string;
  color: string;
  isAi: boolean;
  // interp
  prevX: number;
  prevY: number;
  prevTime: number;
  nextX: number;
  nextY: number;
  nextTime: number;
  vx: number;
  vy: number;
  mass: number;
  hp: number;
  maxHp: number;
  sprite: FishSprite;
}

interface PelletState {
  id: number;
  x: number;
  y: number;
  color: number;
  gfx: Graphics;
}

interface ChunkState {
  id: number;
  prevX: number;
  prevY: number;
  prevTime: number;
  nextX: number;
  nextY: number;
  nextTime: number;
  mass: number;
  color: number;
  gfx: Graphics;
}

interface ProjectileState {
  id: number;
  prevX: number;
  prevY: number;
  prevTime: number;
  nextX: number;
  nextY: number;
  nextTime: number;
  vx: number;
  vy: number;
  radius: number;
  weaponId: string;
  spawnTime: number;
  /** When the projectile was first seen. Used for fade-out of pulse rings. */
  sprite: ProjectileSprite;
}

const INTERP_DELAY_MS = 100;

export interface ArenaCallbacks {
  onDeath(msg: EatenMsg): void;
  onLeaderboard(msg: LeaderboardMsg): void;
}

export class ArenaScene {
  app: Application;
  world = new Container();
  bg = new Graphics();
  causticsLayer = new Container();
  plankton: Graphics[] = [];
  planktonData: Array<{x: number; y: number; baseY: number; phase: number; speed: number; size: number; alpha: number}> = [];
  caustic1 = new Graphics();
  caustic2 = new Graphics();
  caustic3 = new Graphics();
  pelletLayer = new Container();
  projectileLayer = new Container();
  chunkLayer = new Container();
  fishLayer = new Container();
  hud: HudElements;
  private toastHud: ToastHud;
  private rosterHud: RosterHud;

  private net: NetSocket;
  private input = createInput();
  private fishes = new Map<number, FishState>();
  private pellets = new Map<number, PelletState>();
  private chunks = new Map<number, ChunkState>();
  private projectiles = new Map<number, ProjectileState>();
  private selfId = 0;
  private serverNow = 0;
  private clientServerOffset = 0;
  private lastFrameTime = performance.now();
  private inputInterval: number | null = null;
  private callbacks: ArenaCallbacks;
  private youMass = 10;
  private youLevel = 1;
  private youXp = 0;
  private youNextLevelXp = 13;
  private youBoostReadyAt = 0;
  private youWeapons: YouWeaponSlot[] = [];
  private destroyed = false;
  private userZoomTarget = 1;
  private userZoomCurrent = 1;
  private onWheel: ((e: WheelEvent) => void) | null = null;
  private levelUpMount: LevelUpMount | null = null;
  private particles = new ParticleSystem();
  // FX state tracking
  private prevYouMass = -1;
  private prevYouHp = -1;
  private prevBoostReadyAt = 0;
  private boostFxUntil = 0;
  private prevSelfX = 0;
  private prevSelfY = 0;

  constructor(app: Application, net: NetSocket, callbacks: ArenaCallbacks) {
    this.app = app;
    this.net = net;
    this.callbacks = callbacks;
    this.hud = mountHud();
    this.toastHud = mountToastHud();
    this.rosterHud = mountRosterHud();

    this.world.addChild(this.bg);
    this.world.addChild(this.causticsLayer);
    this.world.addChild(this.pelletLayer);
    this.world.addChild(this.projectileLayer);
    this.world.addChild(this.chunkLayer);
    this.world.addChild(this.fishLayer);
    this.world.addChild(this.particles.container);
    this.app.stage.addChild(this.world);
    this.causticsLayer.addChild(this.caustic1);
    this.causticsLayer.addChild(this.caustic2);
    this.causticsLayer.addChild(this.caustic3);
    this.seedPlankton();

    this.drawBackground();
    this.bindNetwork();
    this.startInputLoop();
    this.app.ticker.add(this.tick);

    const ZOOM_SENS = 0.0015;
    const USER_ZOOM_MIN = 0.4;
    const USER_ZOOM_MAX = 3.0;
    this.onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * ZOOM_SENS);
      this.userZoomTarget = Math.max(USER_ZOOM_MIN, Math.min(USER_ZOOM_MAX, this.userZoomTarget * factor));
    };
    this.app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private bindNetwork(): void {
    this.net.on("welcome", (msg: WelcomeMsg) => {
      if (msg.selfId) this.selfId = msg.selfId;
    });
    this.net.on("snapshot", (msg) => this.applySnapshot(msg));
    this.net.on("eaten", (msg) => {
      this.tearDownLevelUp();
      snd.playDeath();
      this.callbacks.onDeath(msg);
    });
    this.net.on("leaderboard", (msg) => this.callbacks.onLeaderboard(msg));
    this.net.on("levelUp", (msg: LevelUpMsg) => this.showLevelUp(msg));
    this.net.on("playerJoined", (msg) => {
      this.toastHud.show(`${msg.name} joined`, msg.color);
    });
    this.net.on("playerDied", (msg) => {
      const text = msg.byName === "the void"
        ? `${msg.name} left`
        : `${msg.name} was eaten by ${msg.byName}`;
      this.toastHud.show(text, msg.color);
    });
    this.net.on("roster", (msg) => this.rosterHud.update(msg.players));
  }

  private showLevelUp(msg: LevelUpMsg): void {
    this.tearDownLevelUp();
    snd.playLevelUp();
    this.levelUpMount = mountLevelUp(this.net, msg);
  }

  private tearDownLevelUp(): void {
    if (this.levelUpMount) {
      this.levelUpMount.teardown();
      this.levelUpMount = null;
    }
  }

  private startInputLoop(): void {
    // 20 Hz input send
    this.inputInterval = window.setInterval(() => {
      const s = this.input.state;
      this.net.input(s.vx, s.vy, s.boost);
    }, 50);
  }

  private drawBackground(): void {
    const g = this.bg;
    g.clear();
    // deep base
    g.rect(0, 0, ARENA.width, ARENA.height).fill({ color: 0x051624, alpha: 1 });
    // softer center brightness (concentric ellipses, additive feel)
    const cx = ARENA.width / 2;
    const cy = ARENA.height / 2;
    const rings = [
      { r: ARENA.width * 0.6, c: 0x0c2f4c, a: 0.35 },
      { r: ARENA.width * 0.45, c: 0x103a5c, a: 0.30 },
      { r: ARENA.width * 0.28, c: 0x174a73, a: 0.22 },
    ];
    for (const ring of rings) {
      g.circle(cx, cy, ring.r).fill({ color: ring.c, alpha: ring.a });
    }
    // arena border
    g.rect(0, 0, ARENA.width, ARENA.height).stroke({ color: 0x1c4a72, width: 6, alpha: 0.8 });
    // grid (lighter than before to play with the gradient)
    const step = 200;
    for (let x = 0; x <= ARENA.width; x += step) {
      g.moveTo(x, 0).lineTo(x, ARENA.height).stroke({ color: 0x153854, width: 1, alpha: 0.30 });
    }
    for (let y = 0; y <= ARENA.height; y += step) {
      g.moveTo(0, y).lineTo(ARENA.width, y).stroke({ color: 0x153854, width: 1, alpha: 0.30 });
    }
  }

  private seedPlankton(): void {
    const count = 120;
    const palette = [0x7fcfff, 0x9affcf, 0xffd97f, 0xff85a1];
    for (let i = 0; i < count; i++) {
      const x = Math.random() * ARENA.width;
      const y = Math.random() * ARENA.height;
      const size = 1.5 + Math.random() * 2.5;
      const alpha = 0.18 + Math.random() * 0.22;
      const g = new Graphics();
      const color = palette[Math.floor(Math.random() * palette.length)]!;
      g.circle(0, 0, size).fill({ color, alpha });
      g.x = x;
      g.y = y;
      this.causticsLayer.addChild(g);
      this.plankton.push(g);
      this.planktonData.push({
        x, y, baseY: y,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.2,
        size, alpha,
      });
    }
  }

  private animateBackground(now: number): void {
    const tSec = now / 1000;
    for (let i = 0; i < this.plankton.length; i++) {
      const d = this.planktonData[i]!;
      const g = this.plankton[i]!;
      const dy = Math.sin(tSec * 0.3 + d.phase) * 8;
      const dx = Math.cos(tSec * 0.4 + d.phase * 1.3) * 5;
      g.y = d.baseY + dy - tSec * d.speed * 2;
      g.x = d.x + dx;
      // wrap vertically across the arena
      if (g.y < 0) g.y += ARENA.height;
      if (g.y > ARENA.height) g.y -= ARENA.height;
    }
    // caustic shimmer — three large translucent ellipses that breathe and drift
    const a = Math.sin(tSec * 0.15) * 0.5 + 0.5;
    this.caustic1.clear();
    this.caustic1.ellipse(
      ARENA.width * 0.35 + Math.cos(tSec * 0.1) * 400,
      ARENA.height * 0.4 + Math.sin(tSec * 0.13) * 250,
      1700, 1100,
    ).fill({ color: 0x7fcfff, alpha: 0.025 + a * 0.02 });
    this.caustic2.clear();
    this.caustic2.ellipse(
      ARENA.width * 0.65 + Math.sin(tSec * 0.12) * 350,
      ARENA.height * 0.55 + Math.cos(tSec * 0.18) * 320,
      1500, 1300,
    ).fill({ color: 0xffe884, alpha: 0.018 + (1 - a) * 0.015 });
    this.caustic3.clear();
    this.caustic3.ellipse(
      ARENA.width * 0.5 + Math.cos(tSec * 0.08) * 600,
      ARENA.height * 0.7 + Math.sin(tSec * 0.06) * 220,
      2000, 900,
    ).fill({ color: 0xb088ff, alpha: 0.012 + a * 0.012 });
  }

  private applySnapshot(msg: SnapshotMsg): void {
    const recvTime = performance.now();
    this.serverNow = msg.you.serverNow;
    this.clientServerOffset = msg.you.serverNow - Date.now();

    // FX: detect changes to self state
    const massBefore = this.prevYouMass;
    const hpBefore = this.prevYouHp;
    const boostReadyBefore = this.prevBoostReadyAt;
    this.youMass = msg.you.mass;
    this.youLevel = msg.you.level;
    this.youXp = msg.you.xp;
    this.youNextLevelXp = msg.you.nextLevelXp;
    this.youBoostReadyAt = msg.you.boostReadyAt;
    this.youWeapons = msg.you.weapons;
    if (massBefore >= 0 && msg.you.mass - massBefore > 4) {
      // big mass jump means we ate a fish
      snd.playEat(msg.you.mass);
      const myColor = parseColor((window as any).__playerColor ?? "#ffd97f");
      this.particles.emitEat(msg.you.x, msg.you.y, myColor);
    } else if (massBefore >= 0 && msg.you.mass - massBefore > 0.5) {
      snd.playPellet(0.6);
    }
    if (hpBefore >= 0 && msg.you.hp < hpBefore - 1) {
      snd.playHit(0.7);
    }
    if (boostReadyBefore > 0 && msg.you.boostReadyAt - boostReadyBefore > 5000) {
      // new boost just started (cooldown jumped by ≥5s)
      snd.playBoost();
      this.boostFxUntil = recvTime + 1500;
    }
    this.prevYouMass = msg.you.mass;
    this.prevYouHp = msg.you.hp;
    this.prevBoostReadyAt = msg.you.boostReadyAt;
    this.prevSelfX = msg.you.x;
    this.prevSelfY = msg.you.y;

    // self fish — update directly (server sends welcome with selfId before snapshots)
    if (this.selfId) this.applySelfFish(msg);

    for (const ent of msg.entities) {
      switch (ent.kind) {
        case "fish": this.applyFishDelta(ent, recvTime); break;
        case "pellet": this.applyPelletDelta(ent); break;
        case "chunk": this.applyChunkDelta(ent, recvTime); break;
        case "projectile": this.applyProjectileDelta(ent, recvTime); break;
      }
    }

    for (const id of msg.removed) {
      this.handleEntityRemoved(id);
      this.removeEntity(id);
    }
  }

  private handleEntityRemoved(id: number): void {
    // Shatter FX when a fish entity disappears (eaten or chipped down).
    const f = this.fishes.get(id);
    if (!f || id === this.selfId) return;
    if (f.mass < 8) return; // tiny fish vanish without spectacle
    const color = parseColor(f.color);
    this.particles.emitShatter(f.sprite.container.x, f.sprite.container.y, color, f.mass);
    if (f.mass > 18) snd.playShatter(0.7);
  }

  private applySelfFish(msg: SnapshotMsg): void {
    const key = this.selfId;
    let f = this.fishes.get(key);
    const now = performance.now();
    if (!f) {
      const name = (window as any).__playerName ?? "You";
      const color = (window as any).__playerColor ?? "#ffd97f";
      const sprite = new FishSprite(name, color, false);
      this.fishLayer.addChild(sprite.container);
      f = {
        id: key,
        name,
        color,
        isAi: false,
        prevX: msg.you.x, prevY: msg.you.y, prevTime: now,
        nextX: msg.you.x, nextY: msg.you.y, nextTime: now,
        vx: 0, vy: 0,
        mass: msg.you.mass,
        hp: msg.you.hp,
        maxHp: msg.you.maxHp,
        sprite,
      };
      this.fishes.set(key, f);
    }
    f.prevX = f.nextX;
    f.prevY = f.nextY;
    f.prevTime = f.nextTime;
    f.nextX = msg.you.x;
    f.nextY = msg.you.y;
    f.nextTime = now + INTERP_DELAY_MS;
    f.mass = msg.you.mass;
    f.hp = msg.you.hp;
    f.maxHp = msg.you.maxHp;
  }

  private applyFishDelta(ent: EntityDelta, recvTime: number): void {
    if (ent.id === this.selfId) return; // handled by applySelfFish
    let f = this.fishes.get(ent.id);
    const now = recvTime;
    if (!f) {
      const sprite = new FishSprite(ent.name ?? "?", ent.color ?? "#7fcfff", ent.isAi ?? false);
      this.fishLayer.addChild(sprite.container);
      f = {
        id: ent.id,
        name: ent.name ?? "?",
        color: ent.color ?? "#7fcfff",
        isAi: ent.isAi ?? false,
        prevX: ent.x, prevY: ent.y, prevTime: now,
        nextX: ent.x, nextY: ent.y, nextTime: now + INTERP_DELAY_MS,
        vx: ent.vx ?? 0, vy: ent.vy ?? 0,
        mass: ent.mass ?? 10,
        hp: ent.hp ?? 20,
        maxHp: ent.maxHp ?? 20,
        sprite,
      };
      this.fishes.set(ent.id, f);
      return;
    }
    f.prevX = f.nextX;
    f.prevY = f.nextY;
    f.prevTime = f.nextTime;
    f.nextX = ent.x;
    f.nextY = ent.y;
    f.nextTime = now + INTERP_DELAY_MS;
    if (ent.vx !== undefined) f.vx = ent.vx;
    if (ent.vy !== undefined) f.vy = ent.vy;
    if (ent.mass !== undefined) f.mass = ent.mass;
    if (ent.hp !== undefined) f.hp = ent.hp;
    if (ent.maxHp !== undefined) f.maxHp = ent.maxHp;
  }

  private applyPelletDelta(ent: EntityDelta): void {
    let p = this.pellets.get(ent.id);
    if (!p) {
      const gfx = new Graphics();
      const color = ent.color ? parseColor(ent.color) : 0xffd97f;
      gfx.circle(0, 0, 6).fill(color).stroke({ color: 0xffffff, width: 1, alpha: 0.4 });
      gfx.x = ent.x;
      gfx.y = ent.y;
      this.pelletLayer.addChild(gfx);
      this.pellets.set(ent.id, { id: ent.id, x: ent.x, y: ent.y, color, gfx });
    } else {
      p.gfx.x = ent.x;
      p.gfx.y = ent.y;
    }
  }

  private applyChunkDelta(ent: EntityDelta, recvTime: number): void {
    let c = this.chunks.get(ent.id);
    const now = recvTime;
    if (!c) {
      const gfx = new Graphics();
      const color = ent.color ? parseColor(ent.color) : 0xffd97f;
      const r = Math.max(4, Math.sqrt(ent.mass ?? 4) * 1.6);
      gfx
        .circle(0, 0, r)
        .fill({ color, alpha: 0.9 })
        .stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
      gfx.x = ent.x;
      gfx.y = ent.y;
      this.chunkLayer.addChild(gfx);
      c = {
        id: ent.id,
        prevX: ent.x, prevY: ent.y, prevTime: now,
        nextX: ent.x, nextY: ent.y, nextTime: now + INTERP_DELAY_MS,
        mass: ent.mass ?? 4,
        color,
        gfx,
      };
      this.chunks.set(ent.id, c);
      return;
    }
    c.prevX = c.nextX;
    c.prevY = c.nextY;
    c.prevTime = c.nextTime;
    c.nextX = ent.x;
    c.nextY = ent.y;
    c.nextTime = now + INTERP_DELAY_MS;
  }

  private applyProjectileDelta(ent: EntityDelta, recvTime: number): void {
    let p = this.projectiles.get(ent.id);
    const now = recvTime;
    if (!p) {
      const weaponId = ent.weaponId ?? "bubble";
      const radius = ent.radius ?? 8;
      const sprite = new ProjectileSprite(weaponId, radius, now);
      this.projectileLayer.addChild(sprite.container);
      sprite.setTransform(ent.x, ent.y, ent.vx ?? 0, ent.vy ?? 0);
      p = {
        id: ent.id,
        prevX: ent.x, prevY: ent.y, prevTime: now,
        nextX: ent.x, nextY: ent.y, nextTime: now + INTERP_DELAY_MS,
        vx: ent.vx ?? 0, vy: ent.vy ?? 0,
        radius,
        weaponId,
        spawnTime: now,
        sprite,
      };
      this.projectiles.set(ent.id, p);
      return;
    }
    p.prevX = p.nextX;
    p.prevY = p.nextY;
    p.prevTime = p.nextTime;
    p.nextX = ent.x;
    p.nextY = ent.y;
    p.nextTime = now + INTERP_DELAY_MS;
    if (ent.vx !== undefined) p.vx = ent.vx;
    if (ent.vy !== undefined) p.vy = ent.vy;
  }

  private removeEntity(id: number): void {
    const f = this.fishes.get(id);
    if (f) {
      f.sprite.destroy();
      this.fishes.delete(id);
      return;
    }
    const p = this.pellets.get(id);
    if (p) {
      p.gfx.destroy();
      this.pellets.delete(id);
      return;
    }
    const c = this.chunks.get(id);
    if (c) {
      c.gfx.destroy();
      this.chunks.delete(id);
      return;
    }
    const pr = this.projectiles.get(id);
    if (pr) {
      pr.sprite.destroy();
      this.projectiles.delete(id);
      return;
    }
  }

  private tick = () => {
    if (this.destroyed) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    // interpolate and render fish
    const renderTime = now - INTERP_DELAY_MS;
    for (const f of this.fishes.values()) {
      const span = Math.max(1, f.nextTime - f.prevTime);
      const t = Math.max(0, Math.min(1, (now - f.prevTime) / span));
      const x = f.prevX + (f.nextX - f.prevX) * t;
      const y = f.prevY + (f.nextY - f.prevY) * t;
      const vx = (f.nextX - f.prevX) / (span / 1000);
      const vy = (f.nextY - f.prevY) / (span / 1000);
      f.sprite.setTransform(x, y, vx, vy);
      f.sprite.update(f.mass, f.hp, f.maxHp, dt);
    }

    for (const c of this.chunks.values()) {
      const span = Math.max(1, c.nextTime - c.prevTime);
      const t = Math.max(0, Math.min(1, (now - c.prevTime) / span));
      c.gfx.x = c.prevX + (c.nextX - c.prevX) * t;
      c.gfx.y = c.prevY + (c.nextY - c.prevY) * t;
    }

    for (const p of this.projectiles.values()) {
      const span = Math.max(1, p.nextTime - p.prevTime);
      const t = Math.max(0, Math.min(1, (now - p.prevTime) / span));
      const px = p.prevX + (p.nextX - p.prevX) * t;
      const py = p.prevY + (p.nextY - p.prevY) * t;
      p.sprite.setTransform(px, py, p.vx, p.vy);
      // pulse rings fade out over their lifetime
      p.sprite.tickAge(now, p.weaponId === "pulse" || p.weaponId === "eel" ? 280 : null);
    }

    // camera
    const self = this.selfId ? this.fishes.get(this.selfId) : undefined;
    const screenW = this.app.renderer.width;
    const screenH = this.app.renderer.height;
    if (self) {
      const ease = 1 - Math.pow(0.001, dt);
      this.userZoomCurrent += (this.userZoomTarget - this.userZoomCurrent) * ease;

      const autoZoom = 1 / (1 + Math.log10(Math.max(1, self.mass / 10)));
      let zoom = autoZoom * this.userZoomCurrent;

      const halfDiag = Math.hypot(screenW, screenH) / 2;
      const zoomMin = halfDiag / viewRadius(self.mass);
      if (zoom < zoomMin) zoom = zoomMin;

      this.world.scale.set(zoom);
      this.world.x = screenW / 2 - self.sprite.container.x * zoom;
      this.world.y = screenH / 2 - self.sprite.container.y * zoom;
    }

    this.animateBackground(now);
    this.particles.update(dt);
    if (now < this.boostFxUntil && this.selfId) {
      const me = this.fishes.get(this.selfId);
      if (me) {
        const myColor = parseColor((window as any).__playerColor ?? "#ffd97f");
        this.particles.emitBoostTrail(me.sprite.container.x, me.sprite.container.y, me.vx, me.vy, myColor);
      }
    }
    this.updateHud();
    this.updateWeaponsHud(now);
  };

  private updateWeaponsHud(now: number): void {
    const slots = this.hud.weaponSlots;
    const serverNow = Date.now() + this.clientServerOffset;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      const wpn = this.youWeapons[i];
      if (!wpn) {
        slot.root.classList.add("empty");
        slot.icon.textContent = "";
        slot.level.textContent = "";
        slot.cooldown.style.transform = `scale(0)`;
        continue;
      }
      slot.root.classList.remove("empty");
      const def = WEAPONS[wpn.id as keyof typeof WEAPONS];
      if (!def) {
        slot.icon.textContent = "?";
        slot.level.textContent = "";
        continue;
      }
      slot.icon.textContent = weaponGlyph(wpn.id);
      slot.icon.style.color = weaponColor(wpn.id);
      slot.level.textContent = `L${wpn.level}`;
      const lvl = getWeaponLevel(wpn.id as any, wpn.level);
      const cd = lvl.cooldownMs > 0 ? lvl.cooldownMs : 1;
      const remaining = Math.max(0, wpn.cooldownReadyAt - serverNow);
      const pct = Math.max(0, Math.min(1, remaining / cd));
      slot.cooldown.style.transform = `scale(${pct})`;
    }
  }

  private updateHud(): void {
    const now = Date.now() + this.clientServerOffset;
    this.hud.mass.textContent = Math.floor(this.youMass).toString();
    this.hud.level.textContent = this.youLevel.toString();
    const xpPct = Math.max(0, Math.min(100, (this.youXp / Math.max(1, this.youNextLevelXp)) * 100));
    this.hud.xpFill.style.width = `${xpPct}%`;
    const boostRemaining = Math.max(0, this.youBoostReadyAt - now);
    if (boostRemaining > 0) {
      this.hud.boost.textContent = `BOOST in ${(boostRemaining / 1000).toFixed(1)}s`;
      this.hud.boost.classList.remove("ready");
    } else {
      this.hud.boost.textContent = "BOOST [Space]";
      this.hud.boost.classList.add("ready");
    }
    // count living players
    let players = 0;
    for (const f of this.fishes.values()) if (!f.isAi) players++;
    this.hud.players.textContent = players.toString();
  }

  destroy(): void {
    this.destroyed = true;
    this.tearDownLevelUp();
    if (this.inputInterval !== null) clearInterval(this.inputInterval);
    this.app.ticker.remove(this.tick);
    if (this.onWheel) {
      this.app.canvas.removeEventListener("wheel", this.onWheel);
      this.onWheel = null;
    }
    this.input.teardown();
    for (const f of this.fishes.values()) f.sprite.destroy();
    for (const p of this.pellets.values()) p.gfx.destroy();
    for (const c of this.chunks.values()) c.gfx.destroy();
    for (const pr of this.projectiles.values()) pr.sprite.destroy();
    this.particles.destroy();
    this.fishes.clear();
    this.pellets.clear();
    this.chunks.clear();
    this.projectiles.clear();
    this.world.destroy({ children: true });
    this.hud.root.remove();
    this.toastHud.teardown();
    this.rosterHud.teardown();
  }
}

interface WeaponSlotEl {
  root: HTMLElement;
  icon: HTMLElement;
  level: HTMLElement;
  cooldown: HTMLElement;
}

interface HudElements {
  root: HTMLElement;
  mass: HTMLElement;
  level: HTMLElement;
  players: HTMLElement;
  xpFill: HTMLElement;
  boost: HTMLElement;
  weaponSlots: WeaponSlotEl[];
}

function mountHud(): HudElements {
  const root = document.createElement("div");
  root.innerHTML = `
    <div class="hud">
      <div class="hud-left">
        <div class="hud-stat">
          <div><div class="label">Mass</div><div class="value" data-mass>10</div></div>
          <div><div class="label">Level</div><div class="value" data-level>1</div></div>
        </div>
      </div>
      <div class="hud-right">
        <div class="hud-stat">
          <div><div class="label">Players</div><div class="value" data-players>1</div></div>
        </div>
      </div>
    </div>
    <div class="hud-weapons" data-weapons>
      ${[0,1,2,3].map(() => `
        <div class="weapon-pip empty">
          <div class="weapon-pip-cooldown"></div>
          <div class="weapon-pip-icon"></div>
          <div class="weapon-pip-level"></div>
        </div>
      `).join("")}
    </div>
    <div class="boost-indicator ready" data-boost>BOOST [Space]</div>
    <div class="xp-bar"><div class="xp-bar-fill" data-xp></div></div>
  `;
  document.body.appendChild(root);
  const slots: WeaponSlotEl[] = Array.from(root.querySelectorAll(".weapon-pip")).map((el) => ({
    root: el as HTMLElement,
    icon: el.querySelector(".weapon-pip-icon") as HTMLElement,
    level: el.querySelector(".weapon-pip-level") as HTMLElement,
    cooldown: el.querySelector(".weapon-pip-cooldown") as HTMLElement,
  }));
  return {
    root,
    mass: root.querySelector("[data-mass]") as HTMLElement,
    level: root.querySelector("[data-level]") as HTMLElement,
    players: root.querySelector("[data-players]") as HTMLElement,
    xpFill: root.querySelector("[data-xp]") as HTMLElement,
    boost: root.querySelector("[data-boost]") as HTMLElement,
    weaponSlots: slots,
  };
}

function weaponGlyph(id: string): string {
  switch (id) {
    case "bubble":  return "○";
    case "spine":   return "✦";
    case "pulse":   return "⚡";
    case "ink":     return "●";
    case "piranha": return "◣";
    case "tidal":   return "≈";
    case "puffer":  return "✺";
    case "eel":     return "⚡";
    case "kraken":  return "✦";
    case "school":  return "◤";
    default:        return "?";
  }
}

function weaponColor(id: string): string {
  switch (id) {
    case "bubble":  return "#b6ecff";
    case "spine":   return "#ffe884";
    case "pulse":   return "#7fcfff";
    case "ink":     return "#bf94e6";
    case "piranha": return "#ff9070";
    case "tidal":   return "#7fdfff";
    case "puffer":  return "#ffe884";
    case "eel":     return "#b088ff";
    case "kraken":  return "#9a5fff";
    case "school":  return "#ff6f30";
    default:        return "#ffffff";
  }
}
