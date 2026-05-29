import { Application, BlurFilter, Container, Graphics, Text } from "pixi.js";
import { AdvancedBloomFilter } from "pixi-filters/advanced-bloom";
import { RGBSplitFilter } from "pixi-filters/rgb-split";
import type { EntityDelta, SnapshotMsg, WelcomeMsg, EatenMsg, LeaderboardMsg, YouPassiveSlot, YouWeaponSlot, LevelUpMsg, ZapEvent } from "@fcf/shared";
import { ARENA, BITE, FISH, MOUTH, TICK, MAX_SLOTS, DEFAULT_SPECIES_ID, canEat, canSwallow, colorForSpecies, fishRadius, stepFishMovement, sampleAt, deadReckon, boostDurationMs, WEAPONS, getWeaponLevel, PASSIVES, viewRadius, isEvolutionWeapon, EVOLUTIONS, SLOW } from "@fcf/shared";
import type { PassiveId, WeaponId, TimedSample } from "@fcf/shared";
import { mountSkillPanel, type SkillPanelMount } from "../hud/skill-panel.ts";
import { NetSocket } from "../net/socket.ts";
import { createInput } from "../input.ts";
import { FishSprite, parseColor } from "../render/fish.ts";
import { ProjectileSprite } from "../render/projectile.ts";
import { SaucerSprite } from "../render/saucer.ts";
import { HeliSprite } from "../render/heli.ts";
import { InkBlob } from "../render/ink.ts";
import { ZapEffect } from "../render/lightning.ts";
import { ParticleSystem } from "../render/particles.ts";
import { WaterCausticFilter } from "../render/water-filter.ts";
import { iconUrl, GEAR_SVG } from "../render/icons.ts";
import { mountLevelUp, type LevelUpMount } from "./level-up.ts";
import { mountToastHud, type ToastHud } from "../hud/toast.ts";
import { mountRosterHud, type RosterHud } from "../hud/roster.ts";
import { mountIdentityEditor, type IdentityEditorMount } from "../hud/identity-editor.ts";
import { mountScoreboardHud, type ScoreboardHud } from "../hud/scoreboard.ts";
import { saveIdentity } from "../identity.ts";
import * as snd from "../sound.ts";
import { perf } from "../perf.ts";

interface FishState {
  id: number;
  name: string;
  color: string;
  species: string;
  isAi: boolean;
  /** Server-time-stamped position buffer, sampled at renderTime each frame (R2). */
  samples: TimedSample[];
  /** Last authoritative velocity — only used by the self boost-trail FX (self is predicted). */
  vx: number;
  vy: number;
  mass: number;
  sprite: FishSprite;
}

interface PelletState {
  id: number;
  x: number;
  y: number;
  color: number;
  gfx: Graphics;
}

interface FruitState {
  id: number;
  x: number;
  y: number;
  container: Container;
}

interface ChunkState {
  id: number;
  /** Server-time-stamped position buffer, sampled at renderTime each frame (R2). */
  samples: TimedSample[];
  mass: number;
  color: number;
  gfx: Graphics;
  /** Swallow ball only: server wall-time before which it's uncollectable by anyone. Drives the
   *  "charging" pulse cue and keeps optimisticEat from hiding it before the lock expires. */
  collectableAt?: number;
}

interface ProjectileState {
  id: number;
  /**
   * "linear" → client-side dead-reckoning from the latest authoritative anchor (bullets move at
   * constant velocity server-side). "orbital" → anchored to the owner's rendered position each
   * frame (tuna/piranha circle the owner; not constant-velocity). Picked at first-seen from
   * WEAPONS[weaponId].kind. (trail → InkBlob, radial-pulse → ZapEvent never reach this map.)
   */
  mode: "linear" | "orbital";
  /** Latest authoritative anchor in the server-time (Date.now) domain — re-anchored each delta. */
  lastT: number;
  lastX: number;
  lastY: number;
  /** Launch velocity (linear: drives both motion and orientation; constant for the projectile's life). */
  vx: number;
  vy: number;
  /** Owner fish id (orbital anchoring). */
  ownerId: number;
  /**
   * Orbital only: absolute orbit angle (rad), angular velocity (rad/s) and orbit-ring radius (px),
   * re-anchored each delta. The render loop computes `orbitAngle + orbitAngular * Δt` each frame
   * so the orbit animates smoothly at the client framerate, anchored to the owner's rendered pos.
   */
  orbitAngle: number;
  orbitAngular: number;
  orbitRadius: number;
  radius: number;
  weaponId: string;
  /** performance.now() of first-seen — drives sprite age fades. */
  spawnTime: number;
  /** Per-target performance.now() of the last client-reported hit, for local re-hit throttling. */
  clientHitAt: Map<number, number>;
  sprite: ProjectileSprite | SaucerSprite | HeliSprite;
}

/**
 * How far in the past remote entities are rendered, to hide snapshot-arrival jitter.
 * Measured on production: snapshots are sent every ~51ms but arrive bursty — inter-arrival
 * gaps spike to ~150ms (F3 `snap jitter`). At 100ms a 150ms gap ran the interp cursor off
 * the buffer into extrapolation → visible snap/stutter. 150ms keeps the cursor between real
 * samples through the typical burst, at the cost of ~50ms more apparent lag on other fish.
 */
const INTERP_DELAY_MS = 150;
/** Cap on velocity-based extrapolation past the newest sample — avoids overshoot on dropped packets. */
const MAX_EXTRAP_MS = 100;
/** Per-entity sample-buffer length. 10 ticks ≈ 500ms history covers the 150ms delay + 100ms extrap + bursty jitter. */
const SAMPLE_CAP = 10;
/** Duration of the "swallowed whole" suck-in animation: the victim sprite tweens into the eater's mouth and shrinks. */
const SWALLOW_ANIM_MS = 280;

/**
 * Projectiles are rendered at the PRESENT (not INTERP_DELAY_MS in the past like fish/chunks) so a
 * bullet emerges from the predicted shooter's muzzle and tracks it smoothly. Linear bullets are
 * dead-reckoned forward from their latest authoritative anchor; this caps how far, so a dropped
 * packet can't let a fast bullet run away — the next snapshot re-anchors it seamlessly. Larger than
 * MAX_EXTRAP_MS because we extrapolate forward past present (covering the ~150ms bursty arrival gap).
 */
const PROJ_MAX_EXTRAP_MS = 250;
/** Optional lead added to projectile render time to match the self-prediction time base. Tune by playtest. */
const PROJ_LEAD_MS = 0;

/** Append a server-time-stamped position sample, de-duping a repeated timestamp and capping length. */
function pushSample(samples: TimedSample[], t: number, x: number, y: number): void {
  const last = samples[samples.length - 1];
  if (last && last.t === t) { last.x = x; last.y = y; return; }
  samples.push({ t, x, y });
  if (samples.length > SAMPLE_CAP) samples.shift();
}

/** Emoji used for fruit pickups — kind is purely cosmetic, chosen per-fruit by id. */
const FRUIT_EMOJI = [
  "🍎","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍒","🍑",
  "🥭","🍍","🥥","🥝","🍏","🍐","🍈","🍅","🫒","🥑",
];
/** Spread consecutive entity ids across the emoji list so neighbours differ. */
function fruitEmojiFor(id: number): string {
  let h = Math.imul(id, 2654435761);
  h ^= h >>> 15;
  return FRUIT_EMOJI[(h >>> 0) % FRUIT_EMOJI.length]!;
}

export interface ArenaCallbacks {
  onDeath(msg: EatenMsg): void;
  onLeaderboard(msg: LeaderboardMsg): void;
  onWelcome?(msg: WelcomeMsg): void;
}

export class ArenaScene {
  app: Application;
  world = new Container();
  bg = new Graphics();
  causticsLayer = new Container();
  plankton: Graphics[] = [];
  planktonData: Array<{x: number; y: number; baseY: number; phase: number; speed: number; size: number; alpha: number}> = [];
  private waterFilter = new WaterCausticFilter();
  private bloomFilter: AdvancedBloomFilter;
  private hitFlashFilter: RGBSplitFilter;
  private hitFlashUntil = 0;
  private hitFlashActive = false;
  pelletLayer = new Container();
  fruitLayer = new Container();
  inkLayer = new Container();
  projectileLayer = new Container();
  chunkLayer = new Container();
  fishLayer = new Container();
  hud: HudElements;
  private toastHud: ToastHud;
  private rosterHud: RosterHud;
  private scoreboardHud: ScoreboardHud;

  private net: NetSocket;
  private input = createInput();
  private fishes = new Map<number, FishState>();
  private pellets = new Map<number, PelletState>();
  private fruits = new Map<number, FruitState>();
  private chunks = new Map<number, ChunkState>();
  private projectiles = new Map<number, ProjectileState>();
  private inkBlobs = new Map<number, InkBlob>();
  /** Victims being swallowed whole: their sprite is pulled out of `fishes` and tweened into the eater. */
  private swallowing = new Map<number, { sprite: FishSprite; eaterId: number; ageMs: number; startX: number; startY: number }>();
  private zaps: ZapEffect[] = [];
  private selfId = 0;
  private serverNow = 0;
  private clientServerOffset = 0;
  /** Smoothed server-minus-client wall-clock offset (Date.now domain) driving R2 interpolation. */
  private interpOffset = 0;
  private interpOffsetInit = false;
  // --- F3 network panel metrics ---
  /** performance.now() of the last snapshot arrival, for inter-snapshot interval/jitter. */
  private lastSnapAt = 0;
  /** Rolling buffer (~30) of snapshot arrival intervals in ms. */
  private snapIntervals: number[] = [];
  /** Last server tick-body duration reported via SnapshotMsg.serverTickMs. */
  private lastServerTickMs = 0;
  /** Last measured input→ack round-trip in ms. */
  private lastRttMs = 0;
  /** Timestamped received-byte counts within a ~1s sliding window, for bytes/sec. */
  private rxBytesWindow: Array<{ t: number; n: number }> = [];
  // --- client-authoritative self fish ---
  // The client owns its own fish: it simulates movement locally with a fixed-timestep
  // accumulator (identical physics to the server, see stepFishMovement) and reports the
  // resulting kinematics to the server, which trusts them. No prediction/reconciliation,
  // so there is nothing to correct against — the own fish moves perfectly smoothly.
  /** Local authoritative kinematics; null until seeded from the first you-block. */
  private self: { x: number; y: number; vx: number; vy: number } | null = null;
  /** State one fixed step in the past, for render interpolation across the leftover accumulator. */
  private selfPrev: { x: number; y: number; vx: number; vy: number } | null = null;
  /** Time (ms) accumulated toward the next fixed movement step. */
  private selfAccumMs = 0;
  /** Client-owned boost expiry, in estimated-server-time (Date.now + clientServerOffset). */
  private selfBoostUntil = 0;
  /** Rising-edge detector for the boost key. */
  private prevBoostHeld = false;
  /** Effective base move speed from the latest you-block (after passives, excluding boost). */
  private youMoveSpeed = 0;
  /** Heading unit vector reported to the server (derived from local velocity). */
  private selfHx = 1;
  private selfHy = 0;
  /** One-shot forward lunge impulse (px/s) armed by detectBites on contact, consumed in stepSelf. */
  private pendingLunge = 0;
  /** performance.now() of the last own-fish bite, for the BITE.cooldownMs lunge throttle. */
  private selfLastBiteAt = 0;
  /** Interpolated render position of the self fish this frame (also used for optimistic eating). */
  private selfRenderX = 0;
  private selfRenderY = 0;
  /** Send times of recent inputs (seq → performance.now), kept only for the F3 RTT gauge. */
  private inputSentAt: Array<{ seq: number; sentAt: number }> = [];
  private lastFrameTime = performance.now();
  private inputInterval: number | null = null;
  private callbacks: ArenaCallbacks;
  private youMass = 10;
  private youLevel = 1;
  private youXp = 0;
  private youNextLevelXp = 13;
  private youBoostReadyAt = 0;
  private youSlowUntil = 0;
  private youWeapons: YouWeaponSlot[] = [];
  private youPassives: YouPassiveSlot[] = [];
  private youPendingPicks = 0;
  private youRerolls = 0;
  private youBanishes = 0;
  private skillPanel: SkillPanelMount | null = null;
  private destroyed = false;
  private userZoomTarget = 1;
  private userZoomCurrent = 1;
  private onWheel: ((e: WheelEvent) => void) | null = null;
  private levelUpMount: LevelUpMount | null = null;
  private identityEditorMount: IdentityEditorMount | null = null;
  private particles = new ParticleSystem();
  // FX state tracking
  private prevYouMass = -1;
  private prevBoostReadyAt = 0;
  private boostFxUntil = 0;
  private prevSelfX = 0;
  private prevSelfY = 0;
  /** Camera kick magnitude (current). Decays in tick. */
  private cameraKick = 0;
  private cameraKickUntil = 0;
  private cameraKickX = 0;
  private cameraKickY = 0;
  /** Floating damage-number overlays. Drawn in HUD layer (CSS overlay). */
  private damageNumbers: Array<{ el: HTMLDivElement; worldX: number; worldY: number; spawnAt: number; }> = [];
  private damageLayer: HTMLDivElement | null = null;
  // spectator state
  private mode: "play" | "spectate" = "play";
  private spectatorAnchor: number | null = null;
  private spectatorCam = { x: ARENA.width / 2, y: ARENA.height / 2 };
  private spectatorHeartbeat: number | null = null;
  private spectatorHud: HTMLElement | null = null;
  private spectatorKeysDown = new Set<string>();
  private onSpectatorKey: ((e: KeyboardEvent) => void) | null = null;
  private onSpectatorKeyUp: ((e: KeyboardEvent) => void) | null = null;
  private spectatorDiveCb: (() => void) | null = null;
  // heading cache per fish id (server-sent unit vector)
  private fishHeading = new Map<number, { hx: number; hy: number }>();
  private mouthIndicators = new Map<number, Graphics>();

  constructor(app: Application, net: NetSocket, callbacks: ArenaCallbacks) {
    this.app = app;
    this.net = net;
    this.callbacks = callbacks;
    // Read-only debug/test accessor: current nameplate text per fish (incl. any 💀 danger prefix).
    (window as any).__nameplates = () =>
      Array.from(this.fishes.values()).map((f) => ({ name: f.name, label: f.sprite.getLabelText() }));
    this.hud = mountHud();
    this.toastHud = mountToastHud();
    this.rosterHud = mountRosterHud();
    this.scoreboardHud = mountScoreboardHud();
    this.damageLayer = mountDamageLayer();

    this.bloomFilter = new AdvancedBloomFilter({
      threshold: 0.65,
      bloomScale: 1.1,
      brightness: 1.0,
      blur: 5,
      quality: 4,
    });
    // Without explicit padding the bloom is sampled from a render texture sized
    // to the projectile content's bounds, so glow extending past the edge of
    // any single projectile gets clipped — looks like a flat cutoff.
    this.bloomFilter.padding = 24;
    this.hitFlashFilter = new RGBSplitFilter({
      red: { x: -6, y: 0 },
      green: { x: 0, y: 0 },
      blue: { x: 6, y: 0 },
    });

    this.world.addChild(this.bg);
    this.world.addChild(this.causticsLayer);
    this.world.addChild(this.pelletLayer);
    this.world.addChild(this.fruitLayer);
    this.world.addChild(this.inkLayer);
    this.world.addChild(this.projectileLayer);
    this.world.addChild(this.chunkLayer);
    this.world.addChild(this.fishLayer);
    this.world.addChild(this.particles.container);
    this.app.stage.addChild(this.world);

    // Caustic water shader is overlaid on the base background.
    this.bg.filters = [this.waterFilter];
    // NB: do NOT set projectileLayer.filterArea. PixiJS reads filterArea in the
    // layer's LOCAL space and multiplies it by worldTransform
    // (FilterSystem._calculateFilterArea). Because projectileLayer rides inside the
    // camera-transformed `world`, a screen-space rect like app.screen becomes a box
    // pinned to the WORLD origin that slides off the viewport as the camera pans up/
    // left — clipping every bloomed item (bullets + zaps) in a band near the map's
    // top-left. Letting PixiJS auto-size the bloom from global bounds is camera-
    // correct; bloomFilter.padding (set above) keeps the glow halo from clipping at
    // those bounds. (The "drift band" this once worked around was ZapEffect anchoring
    // the layer bounds to (0,0); that's fixed at the source in render/lightning.ts.)
    this.projectileLayer.filters = [this.bloomFilter];
    // Blur fuses the individual soft ink blobs into one continuous, diffusing cloud.
    const inkBlur = new BlurFilter({ strength: 7, quality: 2 });
    inkBlur.padding = 24;
    this.inkLayer.filters = [inkBlur];
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

    this.hud.gear.addEventListener("click", () => this.openIdentityEditor());

    this.hud.skillSlots.forEach((slot, idx) => {
      slot.root.addEventListener("click", () => {
        const wpnCount = this.youWeapons.length;
        if (idx < wpnCount) {
          const wpn = this.youWeapons[idx]!;
          this.openSkillPanel({ kind: "weapon", id: wpn.id as WeaponId, level: wpn.level });
          return;
        }
        const p = this.youPassives[idx - wpnCount];
        if (p) {
          this.openSkillPanel({ kind: "passive", id: p.id as PassiveId, stack: p.stack });
          return;
        }
        // Empty slot: if a level-up is pending and the modal is dismissed,
        // restore it so the player can pick. (When no pick is pending, no-op.)
        this.surfaceLevelUpIfPending();
      });
    });

    this.hud.skillHint.addEventListener("click", () => this.surfaceLevelUpIfPending());
  }

  private surfaceLevelUpIfPending(): void {
    if (this.youPendingPicks <= 0) return;
    if (this.levelUpMount && this.levelUpMount.isDismissed()) {
      this.levelUpMount.restore();
    }
  }

  private openSkillPanel(target: Parameters<typeof mountSkillPanel>[0]["target"]): void {
    if (this.skillPanel) {
      this.skillPanel.teardown();
      this.skillPanel = null;
    }
    this.skillPanel = mountSkillPanel({
      target,
      onDiscard: () => {
        if (target.kind === "weapon") this.net.discardWeapon(target.id);
        else this.net.discardPassive(target.id);
      },
      onClose: () => { this.skillPanel = null; },
    });
  }

  private openIdentityEditor(): void {
    if (this.identityEditorMount) return;
    const currentName = (window as any).__playerName ?? "Fish";
    const currentSpecies = (window as any).__playerSpecies ?? DEFAULT_SPECIES_ID;
    this.identityEditorMount = mountIdentityEditor({
      current: { name: currentName, species: currentSpecies },
      onSave: (next) => {
        const color = colorForSpecies(next.species);
        (window as any).__playerName = next.name;
        (window as any).__playerSpecies = next.species;
        (window as any).__playerColor = color;
        saveIdentity({ name: next.name, species: next.species, color });
        this.net.identity(next.name, color, next.species);
        const me = this.selfId ? this.fishes.get(this.selfId) : undefined;
        if (me) {
          me.name = next.name;
          me.color = color;
          me.species = next.species;
          me.sprite.setIdentity(next.name, color);
          me.sprite.setSpecies(next.species);
        }
      },
      onClose: () => { this.identityEditorMount = null; },
    });
  }

  private bindNetwork(): void {
    // Bandwidth tap for the F3 panel: record every received frame's char length; the
    // render tick trims this to a 1s window and reports the sum as bytes/sec.
    this.net.onRawMessage = (byteLen) => {
      this.rxBytesWindow.push({ t: performance.now(), n: byteLen });
      if (this.rxBytesWindow.length > 256) this.rxBytesWindow.shift();
    };
    this.net.on("welcome", (msg: WelcomeMsg) => {
      if (msg.selfId) this.selfId = msg.selfId;
      this.callbacks.onWelcome?.(msg);
    });
    this.net.on("snapshot", (msg) => {
      const span = perf.begin("snapshot");
      this.applySnapshot(msg);
      span.end();
    });
    this.net.on("eaten", (msg) => {
      this.tearDownLevelUp();
      snd.playDeath();
      // Auto-enter spectator mode so the live game stays rendered behind the
      // death overlay; main.ts decides whether to surface the spectator HUD.
      this.enterSpectatorMode();
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
    // If the modal is already mounted (e.g. the server rotated to the next
    // queued pick after a pickCard), refresh in place so the player picks
    // through the queue continuously instead of seeing teardown+remount flash.
    if (this.levelUpMount) {
      this.levelUpMount.updateCards(msg);
      return;
    }
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
    // 20 Hz input send — reports the client-authoritative kinematics when we have a
    // local sim, falling back to bare intent before the first you-block seeds it.
    this.inputInterval = window.setInterval(() => {
      const s = this.input.state;
      const seq = this.self
        ? this.net.input(s.vx, s.vy, s.boost, {
            x: this.self.x, y: this.self.y,
            pvx: this.self.vx, pvy: this.self.vy,
            hx: this.selfHx, hy: this.selfHy,
          })
        : this.net.input(s.vx, s.vy, s.boost);
      this.recordInput(seq);
    }, 50);
  }

  /** Remember an input's send time so the F3 panel can measure input→ack RTT. */
  private recordInput(seq: number): void {
    this.inputSentAt.push({ seq, sentAt: performance.now() });
    if (this.inputSentAt.length > 64) this.inputSentAt.shift();
  }

  /** Seed the local self sim from the you-block the first time we see it (or after respawn). */
  private seedSelfIfNeeded(you: NonNullable<SnapshotMsg["you"]>): void {
    this.youMoveSpeed = you.moveSpeed;
    if (this.self !== null) return;
    this.self = { x: you.x, y: you.y, vx: you.vx, vy: you.vy };
    this.selfPrev = { ...this.self };
    this.selfAccumMs = 0;
    const hm = Math.hypot(you.hx, you.hy);
    if (hm > 0.01) { this.selfHx = you.hx / hm; this.selfHy = you.hy / hm; }
  }

  /**
   * Advance the client-authoritative self fish with a fixed-timestep accumulator: consume
   * wall-clock time in TICK.ms chunks running the shared movement integrator. Rendering
   * (in tick) interpolates between selfPrev and self by the leftover-accumulator fraction,
   * which makes motion perfectly smooth and framerate-independent. Boost and the level-up
   * freeze are owned locally — there is no server to reconcile against.
   */
  private stepSelf(dtMs: number): void {
    if (!this.self) return;
    const STEP = TICK.ms;
    const estServerNow = Date.now() + this.clientServerOffset;
    // Boost: trigger locally on the rising edge if the server says we're off cooldown.
    const held = this.input.state.boost;
    if (held && !this.prevBoostHeld && estServerNow >= this.youBoostReadyAt && estServerNow >= this.selfBoostUntil) {
      this.selfBoostUntil = estServerNow + boostDurationMs(this.youMass);
    }
    this.prevBoostHeld = held;
    const boostMult = estServerNow < this.selfBoostUntil ? FISH.boostMultiplier : 1;
    const slowMult = estServerNow < this.youSlowUntil ? SLOW.mult : 1;
    // Movement intent (normalized exactly as the server does), zeroed while the modal is open.
    let ivx = this.input.state.vx;
    let ivy = this.input.state.vy;
    const mag = Math.hypot(ivx, ivy);
    if (mag > 1) { ivx /= mag; ivy /= mag; }
    const frozen = !!this.levelUpMount && !this.levelUpMount.isDismissed();
    if (frozen) { ivx = 0; ivy = 0; }
    // Consume a pending bite lunge (armed by detectBites on contact with edible prey): a one-shot
    // forward velocity bump along the reported heading. It flows through the same shared physics
    // the server trusts (reported via the input message), then decays via stepFishMovement's
    // smoothing — a real catch-up dash, not just a visual.
    if (this.pendingLunge > 0 && !frozen) {
      this.self.vx += this.selfHx * this.pendingLunge;
      this.self.vy += this.selfHy * this.pendingLunge;
      this.pendingLunge = 0;
    }
    this.selfAccumMs += dtMs;
    let steps = 0;
    while (this.selfAccumMs >= STEP && steps < 8) {
      this.selfPrev = { x: this.self.x, y: this.self.y, vx: this.self.vx, vy: this.self.vy };
      stepFishMovement(this.self, ivx, ivy, this.youMoveSpeed * slowMult, boostMult, this.youMass, STEP / 1000);
      this.selfAccumMs -= STEP;
      steps++;
    }
    if (steps === 8) this.selfAccumMs = 0; // backgrounded tab: drop the backlog rather than fast-forward
    // Heading reported to the server: follow the velocity direction once actually moving.
    const sp = Math.hypot(this.self.vx, this.self.vy);
    if (sp > 5) { this.selfHx = this.self.vx / sp; this.selfHy = this.self.vy / sp; }
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
      if (g.y < 0) g.y += ARENA.height;
      if (g.y > ARENA.height) g.y -= ARENA.height;
    }
    // Drive the caustic shader with current time + camera world rect.
    this.waterFilter.setTime(tSec);
    const scale = this.world.scale.x || 1;
    const screenW = this.app.renderer.width;
    const screenH = this.app.renderer.height;
    const visibleW = screenW / scale;
    const visibleH = screenH / scale;
    const camX = -this.world.x / scale;
    const camY = -this.world.y / scale;
    this.waterFilter.setWorldRect(camX, camY, visibleW, visibleH);
  }

  private applySnapshot(msg: SnapshotMsg): void {
    const recvTime = performance.now();
    this.serverNow = msg.serverNow;
    this.clientServerOffset = msg.serverNow - Date.now();

    // Smoothed clock for R2 interpolation: track server wall time, rejecting per-packet
    // jitter via EMA but snapping on first sample / a big stall / tab refocus.
    const offsetSample = msg.serverNow - Date.now();
    if (!this.interpOffsetInit || Math.abs(offsetSample - this.interpOffset) > 250) {
      this.interpOffset = offsetSample;
      this.interpOffsetInit = true;
    } else {
      this.interpOffset += (offsetSample - this.interpOffset) * 0.1;
    }

    // --- F3 network panel: arrival timing, clock health, server-tick budget, RTT ---
    if (this.lastSnapAt > 0) {
      this.snapIntervals.push(recvTime - this.lastSnapAt);
      if (this.snapIntervals.length > 30) this.snapIntervals.shift();
    }
    this.lastSnapAt = recvTime;
    if (this.snapIntervals.length > 0) {
      let sum = 0, lo = Infinity, hi = -Infinity;
      for (const v of this.snapIntervals) { sum += v; if (v < lo) lo = v; if (v > hi) hi = v; }
      perf.setGauge("snap interval", sum / this.snapIntervals.length, "ms");
      perf.setGauge("snap jitter", hi - lo, "ms");
    }
    perf.setGauge("interp offset", this.interpOffset, "ms");
    perf.setGauge("clk offset", this.clientServerOffset, "ms");
    if (msg.serverTickMs != null) {
      this.lastServerTickMs = msg.serverTickMs;
      perf.setGauge("server tick", this.lastServerTickMs, "ms");
    }
    // RTT = arrival − sentAt of the input the server just acked.
    if (msg.you) {
      let acked: { seq: number; sentAt: number } | null = null;
      for (const inp of this.inputSentAt) {
        if (inp.seq <= msg.ackSeq && (acked === null || inp.seq > acked.seq)) acked = inp;
      }
      if (acked) {
        this.lastRttMs = recvTime - acked.sentAt;
        perf.setGauge("rtt", this.lastRttMs, "ms");
      }
      this.inputSentAt = this.inputSentAt.filter((i) => i.seq > msg.ackSeq);
    }

    if (msg.you) {
      // FX: detect changes to self state
      const massBefore = this.prevYouMass;
      const boostReadyBefore = this.prevBoostReadyAt;
      this.youMass = msg.you.mass;
      this.youLevel = msg.you.level;
      this.youXp = msg.you.xp;
      this.youNextLevelXp = msg.you.nextLevelXp;
      this.youBoostReadyAt = msg.you.boostReadyAt;
      this.youSlowUntil = msg.you.slowUntil ?? 0;
      this.youWeapons = msg.you.weapons;
      this.youPassives = msg.you.passives ?? [];
      this.youPendingPicks = msg.you.pendingPicks ?? 0;
      this.youRerolls = msg.you.rerolls ?? 0;
      this.youBanishes = msg.you.banishes ?? 0;
      // Keep the open modal's button visibility live as fruit is collected.
      this.levelUpMount?.setCurrency(this.youRerolls, this.youBanishes);
      if (massBefore >= 0 && msg.you.mass - massBefore > 4) {
        // big mass jump means we ate a fish
        snd.playEat(msg.you.mass);
        const myColor = parseColor((window as any).__playerColor ?? "#ffd97f");
        this.particles.emitEat(msg.you.x, msg.you.y, myColor);
      } else if (massBefore >= 0 && msg.you.mass - massBefore > 0.5) {
        snd.playPellet(0.6);
      }
      if (boostReadyBefore > 0 && msg.you.boostReadyAt - boostReadyBefore > 5000) {
        // new boost just started (cooldown jumped by ≥5s)
        snd.playBoost();
        this.boostFxUntil = recvTime + 1500;
      }
      // Server is the source of truth for "still owe picks?" — when it hits
      // zero, the active modal (if any) is done. This covers the tail of the
      // queue: pickCard for the LAST set sends no follow-up LevelUpMsg, so the
      // snapshot is what tells the client to tear down.
      if (msg.you.pendingPicks === 0 && this.levelUpMount) {
        this.tearDownLevelUp();
      }

      this.prevYouMass = msg.you.mass;
      this.prevBoostReadyAt = msg.you.boostReadyAt;
      this.prevSelfX = msg.you.x;
      this.prevSelfY = msg.you.y;
      // Store self heading so the sprite can use the server-authoritative direction.
      if (this.selfId != null) {
        this.fishHeading.set(this.selfId, { hx: msg.you.hx, hy: msg.you.hy });
      }

      // self fish — client-authoritative: seed the local sim once, then it runs free.
      // (server sends welcome with selfId before snapshots)
      if (this.selfId) {
        this.ensureSelfSprite(msg);
        this.seedSelfIfNeeded(msg.you);
      }
    }

    for (const ent of msg.entities) {
      switch (ent.kind) {
        case "fish": this.applyFishDelta(ent, msg.serverNow); break;
        case "pellet": this.applyPelletDelta(ent); break;
        case "fruit": this.applyFruitDelta(ent); break;
        case "chunk": this.applyChunkDelta(ent, msg.serverNow); break;
        case "projectile": this.applyProjectileDelta(ent, msg.serverNow); break;
      }
    }

    // Fish swallowed whole this tick: hand the victim's sprite to the suck-in animation BEFORE the
    // removed loop, so the matching `removed` entry is a no-op (the swallow owns the teardown).
    if (msg.swallowed && msg.swallowed.length > 0) {
      for (const s of msg.swallowed) this.beginSwallow(s.id, s.by);
    }

    for (const id of msg.removed) {
      this.handleEntityRemoved(id);
      this.removeEntity(id);
    }

    if (msg.hits && msg.hits.length > 0) {
      for (const h of msg.hits) this.handleHitEvent(h, recvTime);
    }

    if (msg.zaps && msg.zaps.length > 0) {
      for (const z of msg.zaps) this.spawnZap(z, recvTime);
    }
  }

  /** A radial-pulse weapon fired: spawn a short-lived lightning effect. */
  private spawnZap(z: ZapEvent, now: number): void {
    const eff = new ZapEffect(z, now);
    this.projectileLayer.addChild(eff.container);
    this.zaps.push(eff);
  }

  /** Hit marker: particles + sound + floating damage number; camera kick if we own the projectile or it landed on us. */
  private handleHitEvent(h: { x: number; y: number; damage: number; targetId: number; byOwner: boolean; weaponId?: string }, recvTime: number): void {
    const isSelfTarget = this.selfId != null && h.targetId === this.selfId;
    // Particle burst — scale by damage.
    const burstColor = h.byOwner ? 0xfff8c8 : isSelfTarget ? 0xff8888 : 0xc8e8ff;
    this.particles.emitShatter(h.x, h.y, burstColor, Math.min(36, 6 + h.damage * 1.2));
    // Sound — punchier when it's our hit. Flyby (alien/overlord) lasers snipe so
    // often that the hit blip becomes an unpleasant stutter, so they stay silent.
    const isFlyby = h.weaponId != null && WEAPONS[h.weaponId as WeaponId]?.kind === "flyby";
    const vol = h.byOwner ? Math.min(1, 0.45 + h.damage * 0.04) : isSelfTarget ? 0.7 : 0.25;
    if (!isFlyby) snd.playWeaponHit(vol);
    // Floating damage number.
    this.spawnDamageNumber(h.x, h.y, h.damage, h.byOwner, isSelfTarget);
    // Self took damage → keep the chromatic flash visual we already had.
    if (isSelfTarget) {
      this.hitFlashUntil = recvTime + 140;
    }
    // Owner-only camera kick. Random direction × magnitude, applied + decayed in tick.
    if (h.byOwner) {
      const mag = Math.min(10, 1.5 + h.damage * 0.18);
      const ang = Math.random() * Math.PI * 2;
      this.cameraKickX += Math.cos(ang) * mag;
      this.cameraKickY += Math.sin(ang) * mag;
      this.cameraKickUntil = recvTime + 140;
    }
  }

  /** Project the floating damage numbers from world coords to screen coords each frame; reap expired ones. */
  private updateDamageNumbers(now: number): void {
    if (this.damageNumbers.length === 0) return;
    const scale = this.world.scale.x || 1;
    const lifeMs = 700;
    const riseTotal = 38;
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i]!;
      const age = now - d.spawnAt;
      if (age >= lifeMs) {
        d.el.remove();
        this.damageNumbers.splice(i, 1);
        continue;
      }
      const t = age / lifeMs;
      const sx = this.world.x + d.worldX * scale;
      const sy = this.world.y + d.worldY * scale - riseTotal * t;
      d.el.style.transform = `translate(calc(${sx}px + var(--jitter, 0px)), ${sy}px)`;
      d.el.style.opacity = String(1 - t * t);
    }
  }

  private spawnDamageNumber(worldX: number, worldY: number, damage: number, byOwner: boolean, isSelf: boolean): void {
    if (!this.damageLayer) return;
    const el = document.createElement("div");
    el.className = "damage-number";
    if (byOwner) el.classList.add("owner");
    if (isSelf) el.classList.add("self");
    el.textContent = String(Math.max(1, Math.round(damage)));
    // Slight horizontal jitter so multiple hits don't overlap.
    el.style.setProperty("--jitter", `${Math.round((Math.random() - 0.5) * 20)}px`);
    this.damageLayer.appendChild(el);
    this.damageNumbers.push({ el, worldX, worldY, spawnAt: performance.now() });
  }

  private handleEntityRemoved(id: number): void {
    // Burst FX when a fish entity disappears (eaten or chipped down).
    const f = this.fishes.get(id);
    if (!f || id === this.selfId) return;
    if (f.mass < 8) return; // tiny fish vanish without spectacle
    const color = parseColor(f.color);
    this.particles.emitChomp(f.sprite.container.x, f.sprite.container.y, color, f.mass);
    if (f.mass > 18) snd.playShatter(0.7);
  }

  /**
   * Ensure the self fish's sprite exists and its mass is current. Position is driven by
   * prediction in tick() (not the interpolation keyframes used for other fish).
   */
  private ensureSelfSprite(msg: SnapshotMsg): void {
    const you = msg.you;
    if (!you) return;
    const key = this.selfId;
    let f = this.fishes.get(key);
    if (!f) {
      const name = (window as any).__playerName ?? "You";
      const color = (window as any).__playerColor ?? "#ffd97f";
      const species = (window as any).__playerSpecies ?? DEFAULT_SPECIES_ID;
      const sprite = new FishSprite(name, color, false, species, true);
      this.fishLayer.addChild(sprite.container);
      f = {
        id: key,
        name,
        color,
        species,
        isAi: false,
        // Self is predicted, never sampled from this buffer — seed it for type-correctness only.
        samples: [{ t: msg.serverNow, x: you.x, y: you.y }],
        vx: you.vx, vy: you.vy,
        mass: you.mass,
        sprite,
      };
      this.fishes.set(key, f);
    }
    f.mass = you.mass;
  }

  private applyFishDelta(ent: EntityDelta, serverNow: number): void {
    if (ent.hx !== undefined && ent.hy !== undefined) {
      this.fishHeading.set(ent.id, { hx: ent.hx, hy: ent.hy });
    }
    if (ent.id === this.selfId) return; // self is client-authoritative (local sim), not interpolated
    let f = this.fishes.get(ent.id);
    if (!f) {
      const species = ent.species ?? DEFAULT_SPECIES_ID;
      const sprite = new FishSprite(ent.name ?? "?", ent.color ?? "#7fcfff", ent.isAi ?? false, species, false);
      this.fishLayer.addChild(sprite.container);
      f = {
        id: ent.id,
        name: ent.name ?? "?",
        color: ent.color ?? "#7fcfff",
        species,
        isAi: ent.isAi ?? false,
        samples: [{ t: serverNow, x: ent.x, y: ent.y }],
        vx: ent.vx ?? 0, vy: ent.vy ?? 0,
        mass: ent.mass ?? 10,
        sprite,
      };
      this.fishes.set(ent.id, f);
      return;
    }
    pushSample(f.samples, serverNow, ent.x, ent.y);
    if (ent.vx !== undefined) f.vx = ent.vx;
    if (ent.vy !== undefined) f.vy = ent.vy;
    if (ent.mass !== undefined) f.mass = ent.mass;
    // The server re-sends name/color (treated as "first-seen" from its snapshot view)
    // when another player edits their identity. Reflect that into the sprite.
    let identityChanged = false;
    if (ent.name !== undefined && ent.name !== f.name) { f.name = ent.name; identityChanged = true; }
    if (ent.color !== undefined && ent.color !== f.color) { f.color = ent.color; identityChanged = true; }
    if (identityChanged) f.sprite.setIdentity(f.name, f.color);
    // Species re-sent (first-seen from the server's snapshot view) when a player changes skin.
    if (ent.species !== undefined && ent.species !== f.species) {
      f.species = ent.species;
      f.sprite.setSpecies(ent.species);
    }
    // Transient bite flags (set on the tick this fish swallowed prey / nibbled a bigger fish).
    if (ent.biting) f.sprite.triggerBite("eat");
    if (ent.nibbling) f.sprite.triggerBite("nibble");
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

  private applyFruitDelta(ent: EntityDelta): void {
    let fr = this.fruits.get(ent.id);
    if (!fr) {
      const container = new Container();
      const label = new Text({ text: fruitEmojiFor(ent.id), style: { fontSize: 78, align: "center" } });
      label.anchor.set(0.5);
      container.addChild(label);
      container.x = ent.x;
      container.y = ent.y;
      this.fruitLayer.addChild(container);
      this.fruits.set(ent.id, { id: ent.id, x: ent.x, y: ent.y, container });
    } else {
      fr.container.x = ent.x;
      fr.container.y = ent.y;
    }
  }

  private applyChunkDelta(ent: EntityDelta, serverNow: number): void {
    let c = this.chunks.get(ent.id);
    if (!c) {
      const gfx = new Graphics();
      // Any xp-bearing chunk is a gold XP ball: the big swallow ball (visualMass 60) and the swarm
      // of small death-drop balls (visualMass 10) both render gold, sized by mass. The fish-colored
      // branch is a fallback for any non-xp chunk (none spawned today).
      const isXpBall = ent.xp !== undefined;
      const color = isXpBall ? 0xffe066 : (ent.color ? parseColor(ent.color) : 0xffd97f);
      if (isXpBall) {
        // A bright gold core wrapped in a soft glow so XP reads as a reward; the 6px floor keeps the
        // small death-drop balls visible while the mass-60 swallow ball still pops large.
        const r = Math.max(6, Math.sqrt(ent.mass ?? 4) * 2.2);
        gfx
          .circle(0, 0, r * 1.7).fill({ color: 0xffe066, alpha: 0.16 })
          .circle(0, 0, r * 1.25).fill({ color: 0xffe066, alpha: 0.28 })
          .circle(0, 0, r).fill({ color: 0xfff2a8, alpha: 1 })
          .stroke({ color: 0xfff6c0, width: 2, alpha: 0.95 });
      } else {
        const r = Math.max(4, Math.sqrt(ent.mass ?? 4) * 1.6);
        gfx
          .circle(0, 0, r)
          .fill({ color, alpha: 0.9 })
          .stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
      }
      gfx.x = ent.x;
      gfx.y = ent.y;
      this.chunkLayer.addChild(gfx);
      c = {
        id: ent.id,
        samples: [{ t: serverNow, x: ent.x, y: ent.y }],
        mass: ent.mass ?? 4,
        color,
        gfx,
        collectableAt: ent.collectableAt,
      };
      this.chunks.set(ent.id, c);
      return;
    }
    pushSample(c.samples, serverNow, ent.x, ent.y);
  }

  private applyProjectileDelta(ent: EntityDelta, serverNow: number): void {
    // Sprite/blob ages are measured against the frame clock (performance.now), so spawn
    // times stay in that domain; the dead-reckon anchor uses serverNow (Date.now domain).
    const spawnNow = performance.now();
    // Trail weapons (ink/kraken) render as static, age-fading diffusing blobs on the
    // blurred inkLayer rather than moving projectile sprites. They never move, so we
    // create on first-seen and ignore subsequent deltas (weaponId only arrives once).
    if (this.inkBlobs.has(ent.id)) return;
    if (ent.weaponId && WEAPONS[ent.weaponId as WeaponId]?.kind === "trail") {
      const blob = new InkBlob(ent.weaponId, ent.radius ?? 30, spawnNow, ent.x, ent.y);
      this.inkLayer.addChild(blob.sprite);
      this.inkBlobs.set(ent.id, blob);
      return;
    }
    let p = this.projectiles.get(ent.id);
    if (!p) {
      const weaponId = ent.weaponId ?? "bubble";
      const radius = ent.radius ?? 8;
      const ownerId = ent.ownerId ?? 0;
      // Flyby weapons (Alien Friends / Overlord) send a UFO body as a linear,
      // zero-damage projectile — render it as a saucer that dead-reckons like any
      // bullet. Its lasers arrive separately as zap events.
      const wkind = WEAPONS[weaponId as WeaponId]?.kind;
      const isFlyby = wkind === "flyby";
      const isHeliBody = wkind === "heli" && ent.body === true;
      const mode = wkind === "orbital" ? "orbital" : "linear";
      const sprite = isFlyby
        ? new SaucerSprite(weaponId, radius, spawnNow)
        : isHeliBody
        ? new HeliSprite(weaponId, radius, spawnNow)
        : new ProjectileSprite(weaponId, radius, spawnNow);
      this.projectileLayer.addChild(sprite.container);
      sprite.setTransform(ent.x, ent.y, ent.vx ?? 0, ent.vy ?? 0);
      // Orbital: seed the angle descriptor so the render loop animates the orbit from
      // parameters (re-anchored each delta), anchored to the owner's rendered position.
      const orbit = this.readOrbit(ent, ownerId);
      p = {
        id: ent.id,
        mode,
        lastT: serverNow, lastX: ent.x, lastY: ent.y,
        vx: ent.vx ?? 0, vy: ent.vy ?? 0,
        ownerId,
        orbitAngle: orbit.angle, orbitAngular: orbit.angular, orbitRadius: orbit.radius,
        radius,
        weaponId,
        spawnTime: spawnNow,
        clientHitAt: new Map(),
        sprite,
      };
      this.projectiles.set(ent.id, p);
      return;
    }
    // Re-anchor to the latest authoritative position. Velocity is sent only on first-seen and is
    // constant for linear projectiles, so the guard keeps it unless the server ever re-sends it.
    p.lastT = serverNow;
    p.lastX = ent.x;
    p.lastY = ent.y;
    if (ent.vx !== undefined) p.vx = ent.vx;
    if (ent.vy !== undefined) p.vy = ent.vy;
    if (p.mode === "orbital") {
      const orbit = this.readOrbit(ent, p.ownerId);
      p.orbitAngle = orbit.angle;
      p.orbitAngular = orbit.angular;
      p.orbitRadius = orbit.radius;
    }
  }

  /**
   * Read an orbital projectile's angle descriptor from a delta. The server ships orbitAngle/
   * orbitAngular/orbitRadius each tick; if (defensively) absent, derive them from the entity
   * position relative to the owner so the orbit still renders.
   */
  private readOrbit(ent: EntityDelta, ownerId: number): { angle: number; angular: number; radius: number } {
    if (ent.orbitAngle !== undefined && ent.orbitRadius !== undefined) {
      return { angle: ent.orbitAngle, angular: ent.orbitAngular ?? 0, radius: ent.orbitRadius };
    }
    const owner = this.ownerRenderedPos(ownerId);
    if (owner) {
      const dx = ent.x - owner.x;
      const dy = ent.y - owner.y;
      return { angle: Math.atan2(dy, dx), angular: 0, radius: Math.hypot(dx, dy) };
    }
    return { angle: 0, angular: 0, radius: 0 };
  }

  /**
   * Optimistically hide pickups the self fish is swimming over so they vanish on contact
   * instead of ~1 RTT later. The server (which now sims at our authoritative position, see
   * applyClientState) commits the actual eat and confirms via `removed`, which destroys the
   * entity. We test against the bare body radius — a subset of the server's passive-extended
   * pickup radius — so anything we hide is guaranteed to be eaten and never flickers back.
   */
  private optimisticEat(): void {
    const r = fishRadius(this.youMass);
    const r2 = r * r;
    const cx = this.selfRenderX;
    const cy = this.selfRenderY;
    for (const p of this.pellets.values()) {
      if (!p.gfx.visible) continue;
      const dx = cx - p.x, dy = cy - p.y;
      if (dx * dx + dy * dy <= r2) p.gfx.visible = false;
    }
    for (const fr of this.fruits.values()) {
      if (!fr.container.visible) continue;
      const dx = cx - fr.x, dy = cy - fr.y;
      if (dx * dx + dy * dy <= r2) fr.container.visible = false;
    }
    for (const c of this.chunks.values()) {
      if (!c.gfx.visible) continue;
      // A locked swallow ball can't be eaten yet — don't optimistically hide it, or it would
      // vanish locally while the server keeps it for the full 2s lock.
      if (c.collectableAt !== undefined && this.serverNow < c.collectableAt) continue;
      const dx = cx - c.gfx.x, dy = cy - c.gfx.y;
      if (dx * dx + dy * dy <= r2) c.gfx.visible = false;
    }
  }

  /**
   * Honor-the-client weapon hits: when one of our own rendered projectiles overlaps an enemy
   * fish on screen, report it so the hit lands on what we actually see — even though the server's
   * geometry (enemies ~150ms behind, bullets dead-reckoned to present) may disagree. The server
   * shares the projectile's re-hit gate between this and its own detection, so nothing
   * double-applies; this local throttle just avoids message spam. Only linear bullets and orbital
   * blades live in `this.projectiles` (trail/pulse are AoE handled server-side); zero-damage flyby
   * saucers are rejected server-side.
   */
  private detectClientHits(now: number): void {
    for (const p of this.projectiles.values()) {
      if (p.ownerId !== this.selfId) continue;
      const reHit = this.clientReHitMs(p.weaponId);
      const px = p.sprite.container.x;
      const py = p.sprite.container.y;
      for (const f of this.fishes.values()) {
        if (f.id === this.selfId) continue;
        const dx = f.sprite.container.x - px;
        const dy = f.sprite.container.y - py;
        const reach = p.radius + fishRadius(f.mass);
        if (dx * dx + dy * dy > reach * reach) continue;
        const last = p.clientHitAt.get(f.id) ?? -Infinity;
        if (now - last < reHit) continue;
        p.clientHitAt.set(f.id, now);
        this.net.weaponHit(p.id, f.id);
      }
    }
  }

  /**
   * Own-fish bite prediction (animation + lunge only; the server resolves the real eat/nibble/burp
   * from our reported position). Mirrors the server rules so we don't mispredict:
   *  - EAT: a fish we can swallow, contacted within our FRONT mouth cone → big chomp + strong lurch.
   *  - NIBBLE: a BIGGER fish we're touching from any angle → quick nip + small dart-in.
   * Uses our reported heading (selfHx/selfHy — exactly what the server cones against) and the
   * predicted render position. Cooldown-gated so sustained contact doesn't stack lunges.
   */
  private detectBites(now: number): void {
    if (now - this.selfLastBiteAt < BITE.cooldownMs) return;
    const me = this.fishes.get(this.selfId);
    if (!me) return;
    const rSelf = fishRadius(this.youMass);
    const cx = this.selfRenderX;
    const cy = this.selfRenderY;
    for (const f of this.fishes.values()) {
      if (f.id === this.selfId) continue;
      const dx = f.sprite.container.x - cx;
      const dy = f.sprite.container.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > rSelf + fishRadius(f.mass) + BITE.contactPad) continue; // not in contact
      if (canSwallow(this.youMass, f.mass)) {
        // Eating requires facing the prey (front cone) — matches the server's front-of-face rule.
        const dot = dist > 0.001 ? (this.selfHx * dx + this.selfHy * dy) / dist : 1;
        if (dot < MOUTH.coneCos) continue;
        this.selfLastBiteAt = now;
        this.pendingLunge = BITE.eatLungeImpulse;
        me.sprite.triggerBite("eat");
        return;
      }
      if (f.mass > this.youMass) {
        // Smaller than this fish → nibble it (any angle).
        this.selfLastBiteAt = now;
        this.pendingLunge = BITE.lungeImpulse * 0.5;
        me.sprite.triggerBite("nibble");
        return;
      }
      if (this.youMass >= f.mass) {
        // Bigger than this fish but can't swallow it yet (the "between zone"), or equal size →
        // light BITE. Requires facing the prey (front cone), matching the server's bite rule; the
        // server resolves the real damage from our reported position. A fuller lunge than a nibble.
        const dot = dist > 0.001 ? (this.selfHx * dx + this.selfHy * dy) / dist : 1;
        if (dot < MOUTH.coneCos) continue;
        this.selfLastBiteAt = now;
        this.pendingLunge = BITE.lungeImpulse;
        me.sprite.triggerBite("nibble");
        return;
      }
    }
  }

  /** Local re-hit throttle for a weapon (ms). Single-hit weapons (reHitMs 0) fire once per target. */
  private clientReHitMs(weaponId: string): number {
    const r = WEAPONS[weaponId as WeaponId]?.levels[0]?.reHitMs ?? 0;
    return r > 0 ? r : 100_000;
  }

  /** Owner fish's current rendered (sprite container) position, or null if the owner isn't present. */
  private ownerRenderedPos(id: number): { x: number; y: number } | null {
    const f = this.fishes.get(id);
    if (!f) return null;
    return { x: f.sprite.container.x, y: f.sprite.container.y };
  }

  private removeEntity(id: number): void {
    const f = this.fishes.get(id);
    if (f) {
      f.sprite.destroy();
      this.fishes.delete(id);
      this.fishHeading.delete(id);
      const m = this.mouthIndicators.get(id);
      if (m) { m.destroy(); this.mouthIndicators.delete(id); }
      return;
    }
    const p = this.pellets.get(id);
    if (p) {
      p.gfx.destroy();
      this.pellets.delete(id);
      return;
    }
    const fr = this.fruits.get(id);
    if (fr) {
      fr.container.destroy({ children: true });
      this.fruits.delete(id);
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
    const ink = this.inkBlobs.get(id);
    if (ink) {
      ink.destroy();
      this.inkBlobs.delete(id);
      return;
    }
  }

  /**
   * Begin the "swallowed whole" animation: pull the victim's sprite out of the interpolation set
   * (so the upcoming `removed` entry is a no-op) and hand it to the suck-in tween, which pulls it
   * into the eater and shrinks it. A chomp burst punctuates the gulp. Skipped for our own fish (the
   * death scene takes over) and for victims we aren't currently tracking.
   */
  private beginSwallow(victimId: number, eaterId: number): void {
    if (victimId === this.selfId) return;
    const f = this.fishes.get(victimId);
    if (!f) return;
    this.fishes.delete(victimId);
    this.fishHeading.delete(victimId);
    const m = this.mouthIndicators.get(victimId);
    if (m) { m.destroy(); this.mouthIndicators.delete(victimId); }
    this.particles.emitChomp(f.sprite.container.x, f.sprite.container.y, parseColor(f.color), f.mass);
    if (f.mass > 18) snd.playShatter(0.7);
    this.swallowing.set(victimId, {
      sprite: f.sprite,
      eaterId,
      ageMs: 0,
      startX: f.sprite.container.x,
      startY: f.sprite.container.y,
    });
  }

  /** Advance any in-progress swallow tweens: pull the victim into the eater's mouth, shrink + fade, then destroy. */
  private advanceSwallows(dtMs: number): void {
    if (this.swallowing.size === 0) return;
    for (const [id, sw] of this.swallowing) {
      sw.ageMs += dtMs;
      const t = Math.min(1, sw.ageMs / SWALLOW_ANIM_MS);
      const eater = this.fishes.get(sw.eaterId);
      const tx = eater ? eater.sprite.container.x : sw.startX;
      const ty = eater ? eater.sprite.container.y : sw.startY;
      const k = 1 - (1 - t) * (1 - t); // ease-out toward the mouth
      sw.sprite.container.x = sw.startX + (tx - sw.startX) * k;
      sw.sprite.container.y = sw.startY + (ty - sw.startY) * k;
      sw.sprite.container.scale.set(Math.max(0.01, 1 - t));
      sw.sprite.container.alpha = 1 - t * 0.7;
      if (t >= 1) {
        sw.sprite.destroy();
        this.swallowing.delete(id);
      }
    }
  }

  private tick = () => {
    if (this.destroyed) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    // Advance the client-authoritative self fish (fixed-timestep accumulator), then resolve
    // its interpolated render position and optimistically hide anything it's swimming over.
    this.stepSelf(dt * 1000);
    if (this.mode === "play" && this.self) {
      const alpha = this.selfPrev ? Math.min(1, this.selfAccumMs / TICK.ms) : 1;
      this.selfRenderX = this.selfPrev ? this.selfPrev.x + (this.self.x - this.selfPrev.x) * alpha : this.self.x;
      this.selfRenderY = this.selfPrev ? this.selfPrev.y + (this.self.y - this.selfPrev.y) * alpha : this.self.y;
      this.optimisticEat();
    }

    // Sample other entities at server-time minus the interp delay (Date.now domain, to match
    // the buffered sample timestamps). The smoothed offset keeps this from jittering frame-to-frame.
    const renderTime = Date.now() + this.interpOffset - INTERP_DELAY_MS;
    const fishSpan = perf.begin("fish-interp");
    for (const f of this.fishes.values()) {
      // Self fish: rendered straight from the local authoritative sim, interpolated between
      // the previous and current fixed step — no interpolation buffer, no reconciliation, so
      // your own movement tracks input with zero lag and zero velocity wobble.
      if (this.mode === "play" && f.id === this.selfId && this.self) {
        // Position resolved above (selfRenderX/Y); heading derives from local velocity
        // (pass undefined so the sprite slerps it).
        f.sprite.setTransform(this.selfRenderX, this.selfRenderY, this.self.vx, this.self.vy, undefined, dt);
        f.sprite.update(f.mass, dt);
        continue;
      }
      const s = sampleAt(f.samples, renderTime, MAX_EXTRAP_MS);
      if (!s) continue;
      const serverHeading = this.fishHeading.get(f.id);
      f.sprite.setTransform(s.x, s.y, s.vx, s.vy, serverHeading, dt);
      f.sprite.update(f.mass, dt);
      // Flag fish that can swallow the local player (≥15% bigger) with a 💀 nameplate prefix,
      // so you can see at a glance which neighbours are deadly. Self is handled above (never flagged).
      f.sprite.setDanger(this.mode === "play" && canSwallow(f.mass, this.youMass));
    }
    fishSpan.end();

    const chunkSpan = perf.begin("chunk-interp");
    for (const c of this.chunks.values()) {
      const s = sampleAt(c.samples, renderTime, MAX_EXTRAP_MS);
      if (!s) continue;
      c.gfx.x = s.x;
      c.gfx.y = s.y;
      // Locked swallow ball: pulse translucent + slightly small to read as "charging / not yet
      // grabbable", then snap to full once the 2s lock expires and anyone can scoop it.
      if (c.collectableAt !== undefined) {
        if (this.serverNow < c.collectableAt) {
          const pulse = 0.5 + 0.5 * Math.sin(renderTime / 110);
          c.gfx.alpha = 0.35 + 0.35 * pulse;
          c.gfx.scale.set(0.82 + 0.12 * pulse);
        } else if (c.gfx.alpha !== 1) {
          c.gfx.alpha = 1;
          c.gfx.scale.set(1);
        }
      }
    }
    chunkSpan.end();

    // Suck-in tweens for fish being swallowed whole (driven by server `swallowed` events).
    this.advanceSwallows(dt * 1000);

    const projSpan = perf.begin("proj-interp");
    // Projectiles render at the PRESENT (not renderTime, which is INTERP_DELAY_MS in the past) so
    // they stay in sync with the predicted shooter. Linear bullets dead-reckon forward from their
    // latest anchor at constant velocity (re-anchoring is seamless); orbitals ride the owner sprite.
    const presentServerTime = Date.now() + this.interpOffset + PROJ_LEAD_MS;
    for (const p of this.projectiles.values()) {
      if (p.mode === "linear") {
        const pos = deadReckon(p.lastX, p.lastY, p.vx, p.vy, presentServerTime - p.lastT, PROJ_MAX_EXTRAP_MS);
        p.sprite.setTransform(pos.x, pos.y, p.vx, p.vy);
      } else {
        // orbital: advance the angle continuously from the descriptor (re-anchored each
        // snapshot, extrapolated at the angular velocity between) and place it on the owner's
        // current rendered ring — smooth 60fps instead of stepping at the 20Hz snapshot rate.
        const owner = this.ownerRenderedPos(p.ownerId);
        if (owner) {
          const ahead = Math.max(0, presentServerTime - p.lastT) / 1000;
          const a = p.orbitAngle + p.orbitAngular * ahead;
          const x = owner.x + Math.cos(a) * p.orbitRadius;
          const y = owner.y + Math.sin(a) * p.orbitRadius;
          // Face the direction of travel (tangent) so the blade banks through its orbit.
          const tx = -Math.sin(a) * p.orbitAngular;
          const ty = Math.cos(a) * p.orbitAngular;
          p.sprite.setTransform(x, y, tx, ty);
        }
        // owner missing (off-screen / dead): leave the sprite put; server removal cleans it up.
      }
    }
    for (const blob of this.inkBlobs.values()) blob.update(now);
    if (this.mode === "play" && this.selfId) {
      this.detectClientHits(now);
      this.detectBites(now);
    }
    projSpan.end();

    // Lightning bolts (radial-pulse / eel): short-lived, re-anchored each frame to the
    // live interpolated sprite of each node (player + struck fish) so they track movement.
    if (this.zaps.length > 0) {
      const resolve = (id: number, fallback: { x: number; y: number }) => {
        const f = this.fishes.get(id);
        if (f) return { x: f.sprite.container.x, y: f.sprite.container.y };
        // Alien Friends lasers originate from the UFO projectile, not a fish — so a
        // node id can also be a projectile (the saucer). Track its live position so
        // the beam follows the moving ship during its brief flash.
        const pr = this.projectiles.get(id);
        if (pr) return { x: pr.sprite.container.x, y: pr.sprite.container.y };
        return fallback;
      };
      for (let i = this.zaps.length - 1; i >= 0; i--) {
        const eff = this.zaps[i]!;
        if (eff.expired(now)) {
          eff.destroy();
          this.zaps.splice(i, 1);
        } else {
          eff.update(now, resolve);
        }
      }
    }

    // camera
    const screenW = this.app.renderer.width;
    const screenH = this.app.renderer.height;
    if (this.mode === "play") {
      const self = this.selfId ? this.fishes.get(this.selfId) : undefined;
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
    } else {
      this.updateSpectatorCamera(dt, screenW, screenH);
    }

    // Camera kick: short jolt on owner hits, decays toward zero quickly.
    if (this.cameraKickX !== 0 || this.cameraKickY !== 0) {
      this.world.x += this.cameraKickX;
      this.world.y += this.cameraKickY;
      const kickDecay = Math.pow(0.0001, dt);
      this.cameraKickX *= kickDecay;
      this.cameraKickY *= kickDecay;
      if (Math.abs(this.cameraKickX) < 0.05 && Math.abs(this.cameraKickY) < 0.05) {
        this.cameraKickX = 0;
        this.cameraKickY = 0;
      }
    }

    this.updateDamageNumbers(now);

    this.updateMouthIndicators();

    const bgSpan = perf.begin("background");
    this.animateBackground(now);
    bgSpan.end();
    const partSpan = perf.begin("particles");
    this.particles.update(dt);
    partSpan.end();
    // Hit-flash: chromatic split kicks in briefly when self takes damage.
    if (now < this.hitFlashUntil) {
      const remaining = this.hitFlashUntil - now;
      const t = Math.max(0, Math.min(1, remaining / 140));
      const offset = 8 * t;
      this.hitFlashFilter.red = { x: -offset, y: 0 };
      this.hitFlashFilter.blue = { x: offset, y: 0 };
      if (!this.hitFlashActive) {
        this.world.filters = [this.hitFlashFilter];
        this.hitFlashActive = true;
      }
    } else if (this.hitFlashActive) {
      this.world.filters = [];
      this.hitFlashActive = false;
    }
    if (now < this.boostFxUntil && this.selfId) {
      const me = this.fishes.get(this.selfId);
      if (me) {
        const myColor = parseColor((window as any).__playerColor ?? "#ffd97f");
        this.particles.emitBoostTrail(me.sprite.container.x, me.sprite.container.y, me.vx, me.vy, myColor);
      }
    }
    this.updateHud();
    this.updateSkillsHud(now);
    this.updateLabelScales();

    perf.setCount("fish", this.fishes.size);
    perf.setCount("pellets", this.pellets.size);
    perf.setCount("fruits", this.fruits.size);
    perf.setCount("chunks", this.chunks.size);
    perf.setCount("projectiles", this.projectiles.size);

    // Pellets inside the visible camera rect — surfaces the Gaussian-clustering cost
    // (more pellets per snapshot near the dense center) without touching the distribution.
    {
      const zoom = this.world.scale.x || 1;
      const left = -this.world.x / zoom;
      const top = -this.world.y / zoom;
      const right = left + screenW / zoom;
      const bottom = top + screenH / zoom;
      let inView = 0;
      for (const p of this.pellets.values()) {
        if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) inView++;
      }
      perf.setGauge("pellets/view", inView, "#");
    }
    perf.setGauge("pending in", this.inputSentAt.length, "#");
    {
      const cutoff = now - 1000;
      while (this.rxBytesWindow.length > 0 && this.rxBytesWindow[0]!.t < cutoff) this.rxBytesWindow.shift();
      let bytes = 0;
      for (const e of this.rxBytesWindow) bytes += e.n;
      perf.setGauge("rx", bytes, "B/s");
    }
    perf.frame();
  };

  private updateSkillsHud(now: number): void {
    const slots = this.hud.skillSlots;
    const serverNow = Date.now() + this.clientServerOffset;
    const wpnCount = this.youWeapons.length;
    const pickPending = this.youPendingPicks > 0;
    const dismissed = this.levelUpMount?.isDismissed() ?? false;
    this.hud.skillHint.classList.toggle("hidden", !(pickPending && dismissed));
    // Evolution-pair hint: a weapon + its paired passive (owned at any level) form
    // an evolution route — glitter both pips so the player knows the combo is special.
    const ownedPassives = new Set(this.youPassives.map((p) => p.id));
    const evoPairWeapons = new Set<string>();
    const evoPairPassives = new Set<string>();
    for (const w of this.youWeapons) {
      const evo = EVOLUTIONS[w.id];
      if (evo && ownedPassives.has(evo.passive)) {
        evoPairWeapons.add(w.id);
        evoPairPassives.add(evo.passive);
      }
    }
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      slot.root.classList.remove("evo-pair");
      if (i < wpnCount) {
        const wpn = this.youWeapons[i]!;
        const def = WEAPONS[wpn.id as keyof typeof WEAPONS];
        slot.root.classList.remove("empty");
        slot.root.classList.remove("actionable");
        if (!def) {
          setPipUnknown(slot.icon);
          slot.label.textContent = "";
          slot.cooldown.style.background = "transparent";
          continue;
        }
        setPipIcon(slot.icon, wpn.id);
        slot.label.textContent = isEvolutionWeapon(wpn.id as any) ? "E" : `L${wpn.level}`;
        slot.root.classList.toggle("evo-pair", evoPairWeapons.has(wpn.id));
        const lvl = getWeaponLevel(wpn.id as any, wpn.level);
        const cd = lvl.cooldownMs > 0 ? lvl.cooldownMs : 0;
        // Clockwise clock-wipe overlay starting at 12 o'clock. pct = fraction of
        // cooldown remaining (1 = just fired, 0 = ready). Continuous weapons
        // (cooldownMs === 0) skip the overlay entirely.
        if (cd > 0) {
          const remaining = Math.max(0, wpn.cooldownReadyAt - serverNow);
          const pct = Math.max(0, Math.min(1, remaining / cd));
          if (pct > 0) {
            const angle = pct * 360;
            slot.cooldown.style.background =
              `conic-gradient(from -90deg, rgba(0,0,0,0.65) ${angle}deg, transparent ${angle}deg)`;
          } else {
            slot.cooldown.style.background = "transparent";
          }
        } else {
          slot.cooldown.style.background = "transparent";
        }
        continue;
      }
      const p = this.youPassives[i - wpnCount];
      if (!p) {
        slot.root.classList.add("empty");
        slot.root.classList.toggle("actionable", pickPending);
        clearPipIcon(slot.icon);
        slot.label.textContent = "";
        slot.cooldown.style.background = "transparent";
        continue;
      }
      slot.root.classList.remove("empty");
      slot.root.classList.remove("actionable");
      const def = PASSIVES[p.id as PassiveId];
      slot.cooldown.style.background = "transparent";
      if (!def) {
        setPipUnknown(slot.icon);
        slot.label.textContent = "";
        continue;
      }
      setPipIcon(slot.icon, p.id);
      slot.label.textContent = `${p.stack}/${def.maxStack}`;
      slot.root.classList.toggle("evo-pair", evoPairPassives.has(p.id));
    }
  }

  /** Keep fish name labels at >= 14px on-screen regardless of zoom. */
  private updateLabelScales(): void {
    const ws = this.world.scale.x || 1;
    for (const f of this.fishes.values()) {
      f.sprite.setLabelMinPxScale(ws);
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
    // re-roll / banish tokens — only shown when the player holds any.
    this.hud.rerolls.textContent = this.youRerolls.toString();
    this.hud.banishes.textContent = this.youBanishes.toString();
    this.hud.rerollCell.style.display = this.youRerolls > 0 ? "" : "none";
    this.hud.banishCell.style.display = this.youBanishes > 0 ? "" : "none";
  }

  /** Called when our fish dies. Switches to free-pan spectator with WASD pan + Space cycle. */
  enterSpectatorMode(): void {
    if (this.mode === "spectate") return;
    this.mode = "spectate";
    if (this.selfId) {
      this.fishHeading.delete(this.selfId);
      // Drop the local sprite for the dead player — server removed the fish, no need to keep it.
      const me = this.fishes.get(this.selfId);
      if (me) { me.sprite.destroy(); this.fishes.delete(this.selfId); }
    }
    this.selfId = 0;
    // Reset the local sim so the next life re-seeds from its first you-block.
    this.self = null;
    this.selfPrev = null;
    this.selfAccumMs = 0;
    this.selfBoostUntil = 0;
    this.prevBoostHeld = false;
    this.inputSentAt = [];
    this.spectatorAnchor = null;
    // Seed camera at the last known self position so the transition isn't jarring.
    if (this.prevSelfX || this.prevSelfY) {
      this.spectatorCam.x = this.prevSelfX;
      this.spectatorCam.y = this.prevSelfY;
    }
    this.startSpectatorHeartbeat();
    // Pause regular input so movement keys don't leak to the dead fish.
    if (this.inputInterval !== null) {
      clearInterval(this.inputInterval);
      this.inputInterval = null;
    }
    // HUD elements for play mode are not useful while dead.
    this.hud.root.style.display = "none";
  }

  /** Called on respawn. Restores play mode (selfId set later via welcome). */
  exitSpectatorMode(): void {
    if (this.mode === "play") return;
    this.mode = "play";
    this.unmountSpectatorHud();
    this.unbindSpectatorKeys();
    this.stopSpectatorHeartbeat();
    this.prevYouMass = -1;
    this.prevBoostReadyAt = 0;
    this.hud.root.style.display = "";
    if (this.inputInterval === null) this.startInputLoop();
  }

  /** Mount the spectator overlay (DIVE AGAIN button + WASD/Space controls). */
  showSpectatorHud(): void {
    if (this.mode !== "spectate") return;
    this.mountSpectatorHud();
    this.bindSpectatorKeys();
  }

  /** Hide the spectator overlay (e.g., while the death modal is up). */
  hideSpectatorHud(): void {
    this.unmountSpectatorHud();
    this.unbindSpectatorKeys();
  }

  /** Register a callback invoked when the user presses DIVE AGAIN from the spectator HUD. */
  onSpectatorDive(cb: () => void): void {
    this.spectatorDiveCb = cb;
  }

  private mountSpectatorHud(): void {
    if (this.spectatorHud) return;
    const root = document.createElement("div");
    root.className = "spectator-hud";
    root.innerHTML = `
      <div class="spectator-hint">SPECTATING — WASD pan · Space cycle player</div>
      <button class="spectator-dive" type="button">DIVE AGAIN</button>
    `;
    document.body.appendChild(root);
    root.querySelector(".spectator-dive")!.addEventListener("click", () => {
      this.spectatorDiveCb?.();
    });
    this.spectatorHud = root;
  }

  private unmountSpectatorHud(): void {
    if (this.spectatorHud) {
      this.spectatorHud.remove();
      this.spectatorHud = null;
    }
  }

  private bindSpectatorKeys(): void {
    this.onSpectatorKey = (e: KeyboardEvent) => {
      if (["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) {
        e.preventDefault();
      }
      if (e.repeat) return;
      if (e.code === "Space") {
        this.cycleSpectatorAnchor();
        return;
      }
      this.spectatorKeysDown.add(e.code);
    };
    this.onSpectatorKeyUp = (e: KeyboardEvent) => {
      this.spectatorKeysDown.delete(e.code);
    };
    window.addEventListener("keydown", this.onSpectatorKey);
    window.addEventListener("keyup", this.onSpectatorKeyUp);
  }

  private unbindSpectatorKeys(): void {
    if (this.onSpectatorKey) window.removeEventListener("keydown", this.onSpectatorKey);
    if (this.onSpectatorKeyUp) window.removeEventListener("keyup", this.onSpectatorKeyUp);
    this.onSpectatorKey = null;
    this.onSpectatorKeyUp = null;
    this.spectatorKeysDown.clear();
  }

  private startSpectatorHeartbeat(): void {
    this.spectatorHeartbeat = window.setInterval(() => {
      this.net.spectate(this.spectatorCam.x, this.spectatorCam.y);
    }, 200);
    // Send one immediately so the server flips us into spectator state.
    this.net.spectate(this.spectatorCam.x, this.spectatorCam.y);
  }

  private stopSpectatorHeartbeat(): void {
    if (this.spectatorHeartbeat !== null) {
      clearInterval(this.spectatorHeartbeat);
      this.spectatorHeartbeat = null;
    }
  }

  private cycleSpectatorAnchor(): void {
    const playerIds: number[] = [];
    for (const f of this.fishes.values()) {
      if (!f.isAi) playerIds.push(f.id);
    }
    playerIds.sort((a, b) => a - b);
    if (playerIds.length === 0) {
      this.spectatorAnchor = null;
      return;
    }
    const cur = this.spectatorAnchor;
    let nextIdx = 0;
    if (cur !== null) {
      const idx = playerIds.indexOf(cur);
      nextIdx = idx === -1 ? 0 : (idx + 1) % playerIds.length;
    }
    this.spectatorAnchor = playerIds[nextIdx]!;
    const anchored = this.fishes.get(this.spectatorAnchor);
    if (anchored) {
      this.spectatorCam.x = anchored.sprite.container.x;
      this.spectatorCam.y = anchored.sprite.container.y;
    }
  }

  private updateSpectatorCamera(dt: number, screenW: number, screenH: number): void {
    const PAN_SPEED = 800; // world units / sec at default zoom
    const k = this.spectatorKeysDown;
    let vx = 0, vy = 0;
    if (k.has("KeyA") || k.has("ArrowLeft"))  vx -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) vx += 1;
    if (k.has("KeyW") || k.has("ArrowUp"))    vy -= 1;
    if (k.has("KeyS") || k.has("ArrowDown"))  vy += 1;
    const mag = Math.hypot(vx, vy);
    if (mag > 0) {
      // Free-pan disengages the anchor.
      if (this.spectatorAnchor !== null) this.spectatorAnchor = null;
      this.spectatorCam.x += (vx / mag) * PAN_SPEED * dt;
      this.spectatorCam.y += (vy / mag) * PAN_SPEED * dt;
    } else if (this.spectatorAnchor !== null) {
      const anchored = this.fishes.get(this.spectatorAnchor);
      if (anchored) {
        // Smooth follow.
        const ease = 1 - Math.pow(0.001, dt);
        this.spectatorCam.x += (anchored.sprite.container.x - this.spectatorCam.x) * ease;
        this.spectatorCam.y += (anchored.sprite.container.y - this.spectatorCam.y) * ease;
      } else {
        this.spectatorAnchor = null;
      }
    }
    this.spectatorCam.x = Math.max(0, Math.min(ARENA.width, this.spectatorCam.x));
    this.spectatorCam.y = Math.max(0, Math.min(ARENA.height, this.spectatorCam.y));

    const ease = 1 - Math.pow(0.001, dt);
    this.userZoomCurrent += (this.userZoomTarget - this.userZoomCurrent) * ease;
    const zoom = 0.6 * this.userZoomCurrent;
    this.world.scale.set(zoom);
    this.world.x = screenW / 2 - this.spectatorCam.x * zoom;
    this.world.y = screenH / 2 - this.spectatorCam.y * zoom;
  }

  private updateMouthIndicators(): void {
    // Draw a faint forward mouth cone on fish above the slowdown threshold.
    // Helps players read the new "stay out of the front" rule.
    const SHOW_FROM_MASS = 500;
    for (const f of this.fishes.values()) {
      const r = fishRadius(f.mass);
      if (f.mass < SHOW_FROM_MASS) {
        const old = this.mouthIndicators.get(f.id);
        if (old) { old.destroy(); this.mouthIndicators.delete(f.id); }
        continue;
      }
      const heading = this.fishHeading.get(f.id);
      if (!heading) continue;
      const hmag = Math.hypot(heading.hx, heading.hy);
      if (hmag < 0.05) {
        const old = this.mouthIndicators.get(f.id);
        if (old) { old.destroy(); this.mouthIndicators.delete(f.id); }
        continue;
      }
      const hx = heading.hx / hmag;
      const hy = heading.hy / hmag;
      const bite = r + MOUTH.suctionExtraRadius;
      let g = this.mouthIndicators.get(f.id);
      if (!g) {
        g = new Graphics();
        this.mouthIndicators.set(f.id, g);
        // Insert behind fish sprite so it doesn't cover the fish.
        this.fishLayer.addChildAt(g, 0);
      }
      // Triangle cone pointing along heading from fish center.
      const angle = Math.atan2(hy, hx);
      const half = Math.acos(MOUTH.coneCos); // half-angle
      const tipDist = bite * 1.6;
      const sideAngle = half;
      const tipX = f.sprite.container.x + Math.cos(angle) * tipDist;
      const tipY = f.sprite.container.y + Math.sin(angle) * tipDist;
      const leftX = f.sprite.container.x + Math.cos(angle - sideAngle) * r * 1.2;
      const leftY = f.sprite.container.y + Math.sin(angle - sideAngle) * r * 1.2;
      const rightX = f.sprite.container.x + Math.cos(angle + sideAngle) * r * 1.2;
      const rightY = f.sprite.container.y + Math.sin(angle + sideAngle) * r * 1.2;
      g.clear()
        .moveTo(f.sprite.container.x, f.sprite.container.y)
        .lineTo(leftX, leftY)
        .lineTo(tipX, tipY)
        .lineTo(rightX, rightY)
        .closePath()
        .fill({ color: 0xff5566, alpha: 0.12 });
    }
    // Clean up indicators for fish that no longer exist
    for (const [id, g] of this.mouthIndicators) {
      if (!this.fishes.has(id)) {
        g.destroy();
        this.mouthIndicators.delete(id);
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.tearDownLevelUp();
    if (this.identityEditorMount) {
      this.identityEditorMount.teardown();
      this.identityEditorMount = null;
    }
    if (this.inputInterval !== null) clearInterval(this.inputInterval);
    this.app.ticker.remove(this.tick);
    if (this.onWheel) {
      this.app.canvas.removeEventListener("wheel", this.onWheel);
      this.onWheel = null;
    }
    this.unbindSpectatorKeys();
    this.unmountSpectatorHud();
    this.stopSpectatorHeartbeat();
    this.input.teardown();
    for (const f of this.fishes.values()) f.sprite.destroy();
    for (const sw of this.swallowing.values()) sw.sprite.destroy();
    for (const p of this.pellets.values()) p.gfx.destroy();
    for (const fr of this.fruits.values()) fr.container.destroy({ children: true });
    for (const c of this.chunks.values()) c.gfx.destroy();
    for (const pr of this.projectiles.values()) pr.sprite.destroy();
    for (const blob of this.inkBlobs.values()) blob.destroy();
    for (const eff of this.zaps) eff.destroy();
    for (const g of this.mouthIndicators.values()) g.destroy();
    this.particles.destroy();
    this.fishes.clear();
    this.pellets.clear();
    this.fruits.clear();
    this.chunks.clear();
    this.projectiles.clear();
    this.inkBlobs.clear();
    this.zaps.length = 0;
    this.mouthIndicators.clear();
    this.fishHeading.clear();
    this.world.destroy({ children: true });
    this.hud.root.remove();
    this.toastHud.teardown();
    this.rosterHud.teardown();
    if (this.damageLayer) {
      this.damageLayer.remove();
      this.damageLayer = null;
    }
    this.damageNumbers.length = 0;
    this.scoreboardHud.teardown();
    this.skillPanel?.teardown();
    this.skillPanel = null;
  }
}

interface SkillSlotEl {
  root: HTMLElement;
  icon: HTMLElement;
  label: HTMLElement;
  cooldown: HTMLElement;
}

interface HudElements {
  root: HTMLElement;
  mass: HTMLElement;
  level: HTMLElement;
  xpFill: HTMLElement;
  boost: HTMLElement;
  skillSlots: SkillSlotEl[];
  skillHint: HTMLButtonElement;
  gear: HTMLElement;
  rerolls: HTMLElement;
  banishes: HTMLElement;
  rerollCell: HTMLElement;
  banishCell: HTMLElement;
}

function mountHud(): HudElements {
  const root = document.createElement("div");
  root.innerHTML = `
    <div class="hud">
      <div class="hud-left">
        <button class="hud-gear" type="button" data-gear aria-label="Edit fish">${GEAR_SVG}</button>
        <div class="hud-stat">
          <div><div class="label">Mass</div><div class="value" data-mass>10</div></div>
          <div><div class="label">Level</div><div class="value" data-level>1</div></div>
          <div class="hud-token reroll" data-reroll-cell style="display:none"><div class="label">Re-roll</div><div class="value" data-rerolls>0</div></div>
          <div class="hud-token banish" data-banish-cell style="display:none"><div class="label">Banish</div><div class="value" data-banishes>0</div></div>
        </div>
      </div>
    </div>
    <div class="hud-skills" data-skills>
      <div class="hud-skill-row" data-skill-row>
        ${Array.from({ length: MAX_SLOTS }).map(() => `
          <div class="skill-pip empty" type="button">
            <div class="skill-pip-cooldown"></div>
            <div class="skill-pip-icon"></div>
            <div class="skill-pip-label"></div>
          </div>
        `).join("")}
      </div>
      <button class="hud-skill-hint hidden" type="button" data-skill-hint>Choose a skill (Esc)</button>
    </div>
    <div class="boost-indicator ready" data-boost>BOOST [Space]</div>
    <div class="xp-bar"><div class="xp-bar-fill" data-xp></div></div>
  `;
  document.body.appendChild(root);
  const skillSlots: SkillSlotEl[] = Array.from(root.querySelectorAll(".skill-pip")).map((el) => ({
    root: el as HTMLElement,
    icon: el.querySelector(".skill-pip-icon") as HTMLElement,
    label: el.querySelector(".skill-pip-label") as HTMLElement,
    cooldown: el.querySelector(".skill-pip-cooldown") as HTMLElement,
  }));
  return {
    root,
    mass: root.querySelector("[data-mass]") as HTMLElement,
    level: root.querySelector("[data-level]") as HTMLElement,
    xpFill: root.querySelector("[data-xp]") as HTMLElement,
    boost: root.querySelector("[data-boost]") as HTMLElement,
    skillSlots,
    skillHint: root.querySelector("[data-skill-hint]") as HTMLButtonElement,
    gear: root.querySelector("[data-gear]") as HTMLElement,
    rerolls: root.querySelector("[data-rerolls]") as HTMLElement,
    banishes: root.querySelector("[data-banishes]") as HTMLElement,
    rerollCell: root.querySelector("[data-reroll-cell]") as HTMLElement,
    banishCell: root.querySelector("[data-banish-cell]") as HTMLElement,
  };
}

function mountDamageLayer(): HTMLDivElement {
  const layer = document.createElement("div");
  layer.className = "damage-layer";
  document.body.appendChild(layer);
  return layer;
}

/** Paint a weapon/passive ability icon into a skill pip (CSS background-image). */
function setPipIcon(el: HTMLElement, id: string): void {
  el.textContent = "";
  el.style.backgroundImage = `url("${iconUrl(id)}")`;
}

/** Empty slot — no icon, no glyph. */
function clearPipIcon(el: HTMLElement): void {
  el.textContent = "";
  el.style.backgroundImage = "none";
}

/** Safety fallback for an id with no matching icon/def (shouldn't happen in practice). */
function setPipUnknown(el: HTMLElement): void {
  el.style.backgroundImage = "none";
  el.textContent = "?";
}
