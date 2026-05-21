import { Application, Container, Graphics } from "pixi.js";
import type { EntityDelta, SnapshotMsg, WelcomeMsg, EatenMsg, LeaderboardMsg } from "@fcf/shared";
import { ARENA, fishRadius } from "@fcf/shared";
import { NetSocket } from "../net/socket.ts";
import { createInput } from "../input.ts";
import { FishSprite, parseColor } from "../render/fish.ts";

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

const INTERP_DELAY_MS = 100;

export interface ArenaCallbacks {
  onDeath(msg: EatenMsg): void;
  onLeaderboard(msg: LeaderboardMsg): void;
}

export class ArenaScene {
  app: Application;
  world = new Container();
  bg = new Graphics();
  pelletLayer = new Container();
  chunkLayer = new Container();
  fishLayer = new Container();
  hud: HudElements;

  private net: NetSocket;
  private input = createInput();
  private fishes = new Map<number, FishState>();
  private pellets = new Map<number, PelletState>();
  private chunks = new Map<number, ChunkState>();
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
  private destroyed = false;

  constructor(app: Application, net: NetSocket, callbacks: ArenaCallbacks) {
    this.app = app;
    this.net = net;
    this.callbacks = callbacks;
    this.hud = mountHud();

    this.world.addChild(this.bg);
    this.world.addChild(this.pelletLayer);
    this.world.addChild(this.chunkLayer);
    this.world.addChild(this.fishLayer);
    this.app.stage.addChild(this.world);

    this.drawBackground();
    this.bindNetwork();
    this.startInputLoop();
    this.app.ticker.add(this.tick);
  }

  private bindNetwork(): void {
    this.net.on("welcome", (msg: WelcomeMsg) => {
      if (msg.selfId) this.selfId = msg.selfId;
    });
    this.net.on("snapshot", (msg) => this.applySnapshot(msg));
    this.net.on("eaten", (msg) => {
      this.callbacks.onDeath(msg);
    });
    this.net.on("leaderboard", (msg) => this.callbacks.onLeaderboard(msg));
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
    // base ocean
    g.rect(0, 0, ARENA.width, ARENA.height).fill({ color: 0x0a2236, alpha: 1 });
    // arena border
    g.rect(0, 0, ARENA.width, ARENA.height).stroke({ color: 0x1c4a72, width: 6, alpha: 0.8 });
    // grid
    const step = 200;
    for (let x = 0; x <= ARENA.width; x += step) {
      g.moveTo(x, 0).lineTo(x, ARENA.height).stroke({ color: 0x153854, width: 1, alpha: 0.5 });
    }
    for (let y = 0; y <= ARENA.height; y += step) {
      g.moveTo(0, y).lineTo(ARENA.width, y).stroke({ color: 0x153854, width: 1, alpha: 0.5 });
    }
  }

  private applySnapshot(msg: SnapshotMsg): void {
    const recvTime = performance.now();
    this.serverNow = msg.you.serverNow;
    this.clientServerOffset = msg.you.serverNow - Date.now();

    this.youMass = msg.you.mass;
    this.youLevel = msg.you.level;
    this.youXp = msg.you.xp;
    this.youNextLevelXp = msg.you.nextLevelXp;
    this.youBoostReadyAt = msg.you.boostReadyAt;

    // self fish — update directly (server sends welcome with selfId before snapshots)
    if (this.selfId) this.applySelfFish(msg);

    for (const ent of msg.entities) {
      switch (ent.kind) {
        case "fish": this.applyFishDelta(ent, recvTime); break;
        case "pellet": this.applyPelletDelta(ent); break;
        case "chunk": this.applyChunkDelta(ent, recvTime); break;
      }
    }

    for (const id of msg.removed) {
      this.removeEntity(id);
    }
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

    // camera
    const self = this.selfId ? this.fishes.get(this.selfId) : undefined;
    const screenW = this.app.renderer.width;
    const screenH = this.app.renderer.height;
    if (self) {
      const zoom = 1 / (1 + Math.log10(Math.max(1, self.mass / 10)));
      this.world.scale.set(zoom);
      this.world.x = screenW / 2 - self.sprite.container.x * zoom;
      this.world.y = screenH / 2 - self.sprite.container.y * zoom;
    }

    this.updateHud();
  };

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
    if (this.inputInterval !== null) clearInterval(this.inputInterval);
    this.app.ticker.remove(this.tick);
    this.input.teardown();
    for (const f of this.fishes.values()) f.sprite.destroy();
    for (const p of this.pellets.values()) p.gfx.destroy();
    for (const c of this.chunks.values()) c.gfx.destroy();
    this.fishes.clear();
    this.pellets.clear();
    this.chunks.clear();
    this.world.destroy({ children: true });
    this.hud.root.remove();
  }
}

interface HudElements {
  root: HTMLElement;
  mass: HTMLElement;
  level: HTMLElement;
  players: HTMLElement;
  xpFill: HTMLElement;
  boost: HTMLElement;
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
    <div class="boost-indicator ready" data-boost>BOOST [Space]</div>
    <div class="xp-bar"><div class="xp-bar-fill" data-xp></div></div>
  `;
  document.body.appendChild(root);
  return {
    root,
    mass: root.querySelector("[data-mass]") as HTMLElement,
    level: root.querySelector("[data-level]") as HTMLElement,
    players: root.querySelector("[data-players]") as HTMLElement,
    xpFill: root.querySelector("[data-xp]") as HTMLElement,
    boost: root.querySelector("[data-boost]") as HTMLElement,
  };
}
