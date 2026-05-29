import { z } from "zod";

export const HelloMsg = z.object({
  t: z.literal("hello"),
  name: z.string().min(1).max(16),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  // Chosen fish species id (see shared/species.ts). Optional + loosely validated here;
  // the server sanitizes it to a known id (or default) so an unknown skin never rejects
  // the whole hello. Legacy clients that omit it get the default species server-side.
  species: z.string().max(40).optional(),
});
export type HelloMsg = z.infer<typeof HelloMsg>;

export const InputMsg = z.object({
  t: z.literal("input"),
  seq: z.number().int().nonnegative(),
  vx: z.number().min(-1).max(1),
  vy: z.number().min(-1).max(1),
  boost: z.boolean(),
  // --- client-authoritative kinematics (optional) ---
  // The client owns its own fish: when these are present the server writes them
  // straight onto the fish (clamped to the arena) instead of integrating movement
  // from the vx/vy intent. They are optional so AI-driven cucumber tests and any
  // legacy client keep working through the intent path. See world.applyClientState.
  x: z.number().optional(),
  y: z.number().optional(),
  pvx: z.number().optional(),
  pvy: z.number().optional(),
  hx: z.number().optional(),
  hy: z.number().optional(),
});
export type InputMsg = z.infer<typeof InputMsg>;

export const PickCardMsg = z.object({
  t: z.literal("pickCard"),
  cardId: z.string(),
});
export type PickCardMsg = z.infer<typeof PickCardMsg>;

export const IdentityMsg = z.object({
  t: z.literal("identity"),
  name: z.string().min(1).max(16).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  species: z.string().max(40).optional(),
});
export type IdentityMsg = z.infer<typeof IdentityMsg>;

export const SpectateMsg = z.object({
  t: z.literal("spectate"),
  camX: z.number(),
  camY: z.number(),
});
export type SpectateMsg = z.infer<typeof SpectateMsg>;

export const RespawnMsg = z.object({
  t: z.literal("respawn"),
  name: z.string().min(1).max(16).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  species: z.string().max(40).optional(),
});
export type RespawnMsg = z.infer<typeof RespawnMsg>;

export const DiscardWeaponMsg = z.object({
  t: z.literal("discardWeapon"),
  weaponId: z.string(),
});
export type DiscardWeaponMsg = z.infer<typeof DiscardWeaponMsg>;

export const DiscardPassiveMsg = z.object({
  t: z.literal("discardPassive"),
  passiveId: z.string(),
});
export type DiscardPassiveMsg = z.infer<typeof DiscardPassiveMsg>;

export const SetLevelUpDismissedMsg = z.object({
  t: z.literal("setLevelUpDismissed"),
  dismissed: z.boolean(),
});
export type SetLevelUpDismissedMsg = z.infer<typeof SetLevelUpDismissedMsg>;

export const RerollCardMsg = z.object({
  t: z.literal("rerollCard"),
  cardId: z.string(),
});
export type RerollCardMsg = z.infer<typeof RerollCardMsg>;

export const BanishCardMsg = z.object({
  t: z.literal("banishCard"),
  cardId: z.string(),
});
export type BanishCardMsg = z.infer<typeof BanishCardMsg>;

// Client-reported weapon hit: the player's own projectile (`projectileId`) visually overlapped
// an enemy fish (`targetId`). The server honors it (sharing the projectile's re-hit gate with
// its own detection so damage is never double-applied). See world/weapon applyClientWeaponHit.
export const WeaponHitMsg = z.object({
  t: z.literal("weaponHit"),
  projectileId: z.number().int().nonnegative(),
  targetId: z.number().int().nonnegative(),
});
export type WeaponHitMsg = z.infer<typeof WeaponHitMsg>;

export const ClientMsg = z.discriminatedUnion("t", [
  HelloMsg,
  InputMsg,
  PickCardMsg,
  IdentityMsg,
  SpectateMsg,
  RespawnMsg,
  DiscardWeaponMsg,
  DiscardPassiveMsg,
  SetLevelUpDismissedMsg,
  RerollCardMsg,
  BanishCardMsg,
  WeaponHitMsg,
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

export interface WelcomeMsg {
  t: "welcome";
  selfId: number;
  arena: { width: number; height: number };
  tickHz: number;
}

export interface EntityDelta {
  id: number;
  kind: "fish" | "pellet" | "projectile" | "chunk" | "fruit";
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  hx?: number;
  hy?: number;
  mass?: number;
  color?: string;
  /** Fish only (first-seen / on change): chosen species id → which photo sprite to render. */
  species?: string;
  /** Fish only (transient, set only on the tick this fish swallowed prey whole): drives the eat chomp/lurch anim. */
  biting?: boolean;
  /** Projectile only (first-seen): true for a heli BODY (vs. its bullets) so the client renders a heli sprite. */
  body?: boolean;
  /** Fish only (transient, set only on the tick this fish nibbled a bigger fish): drives the quick nip anim. */
  nibbling?: boolean;
  /** Chunk only (first-seen): XP payload of an XP ball — a swallow's gold ball or a death-drop
   *  ball (collecting grants this XP, no mass). Presence is also what tints a chunk gold. */
  xp?: number;
  /** Chunk only (first-seen): wall-time before which this ball can't be collected by ANYONE (the
   *  swallow ball's ~2s fairness lock). The client shows a "charging" cue until this passes. */
  collectableAt?: number;
  name?: string;
  weaponId?: string;
  ownerId?: number;
  radius?: number;
  isAi?: boolean;
  /** Fruit only (first-seen): which token this fruit grants on pickup. */
  reward?: "reroll" | "banish";
  /**
   * Orbital projectiles only: the blade's absolute orbit angle (rad), angular velocity
   * (rad/s) and orbit-ring radius (px). The client re-anchors to orbitAngle each snapshot
   * and extrapolates at orbitAngular between them, anchored to the owner's rendered position,
   * so the orbit animates at the client's framerate instead of stepping at the snapshot rate.
   */
  orbitAngle?: number;
  orbitAngular?: number;
  orbitRadius?: number;
}

/** Per-tick hit event: a projectile damaged a fish. Used for client-side hit markers. */
export interface HitEvent {
  x: number;
  y: number;
  damage: number;
  targetId: number;
  /** True when the receiving socket owns the projectile that caused this hit. */
  byOwner: boolean;
  /** Weapon that landed the hit — lets the client pick or mute per-weapon hit sounds. */
  weaponId?: string;
}

/** Per-tick zap event: a radial-pulse weapon fired and struck fish. Drives lightning bolts. */
export interface ZapEvent {
  /**
   * Bolt path. nodes[0] is the firing origin (the player); nodes[1..] are struck fish.
   * Each node carries its entity id (so the client can track the live interpolated
   * sprite) and a fallback position (server position at fire time).
   */
  nodes: { id: number; x: number; y: number }[];
  /** false = radial bolts from nodes[0] to each other node; true = a connected chain. */
  chain: boolean;
  /** Weapon that fired ("pulse" | "eel") — selects bolt color. */
  weaponId: string;
  /** True when the receiving socket fired this zap. */
  byOwner: boolean;
}

export interface YouWeaponSlot {
  id: string;
  level: number;
  cooldownReadyAt: number;
}

export interface YouPassiveSlot {
  id: string;
  stack: number;
}

export interface SnapshotMsg {
  t: "snapshot";
  tick: number;
  ackSeq: number;
  /** Present when the receiving socket has a live fish. Absent for spectator sockets. */
  you?: {
    x: number;
    y: number;
    /** Authoritative velocity (raw). Seeds client-side prediction/reconciliation. */
    vx: number;
    vy: number;
    hx: number;
    hy: number;
    /**
     * Effective base move speed after passive + mass multipliers (`getMoveSpeed`), excluding
     * the boost multiplier. The client applies boost itself during prediction. Sent so the
     * client predictor can compute desired velocity without seeing passive internals.
     */
    moveSpeed: number;
    mass: number;
    /** Hard cap on player mass; HUD uses this for the mass-cap indicator. */
    maxMass: number;
    xp: number;
    level: number;
    nextLevelXp: number;
    boostReadyAt: number;
    boostUntil: number;
    /** Wall-time until which the player's own fish is slowed (Battle Comms). 0 = not slowed. The client applies the SLOW.mult itself in stepSelf. */
    slowUntil: number;
    serverNow: number;
    weapons: YouWeaponSlot[];
    passives: YouPassiveSlot[];
    /**
     * Total number of level-up picks pending on the server — includes the active
     * card set currently shown (if any) plus all queued additional picks.
     * 0 means no pending picks. HUD uses this to render a "k more pending" badge.
     */
    pendingPicks: number;
    /** Re-roll tokens available (collected from fruit). Spent on level-up cards. */
    rerolls: number;
    /** Banish tokens available (collected from fruit). Spent on level-up cards. */
    banishes: number;
  };
  /** Server's current time, always sent (matches you.serverNow when present). */
  serverNow: number;
  /**
   * Wall-clock duration (ms) of the server tick body that produced this snapshot —
   * the sim step + post-step pipeline, excluding the broadcast itself. Diagnostic
   * only (F3 network panel); >TICK.ms means the tick is over budget. Optional for
   * back-compat with any builder that doesn't set it.
   */
  serverTickMs?: number;
  /** True when this snapshot is being delivered to a spectator socket (no local fish). */
  spectator?: boolean;
  entities: EntityDelta[];
  removed: number[];
  /** Hit events that occurred this tick and are visible to this socket. */
  hits?: HitEvent[];
  /** Radial-pulse zap events this tick that are visible to this socket. */
  zaps?: ZapEvent[];
  /**
   * Fish swallowed whole this tick whose eater is visible to this socket: victim `id` + eater `by`.
   * The client intercepts the matching `removed` entry and plays a suck-in-and-shrink animation
   * (the victim sprite tweens into the eater's mouth) instead of destroying it outright.
   */
  swallowed?: Array<{ id: number; by: number }>;
}

export interface LevelUpCard {
  id: string;
  title: string;
  description: string;
  kind: "weapon" | "upgrade" | "passive" | "evolution";
}

export interface LevelUpMsg {
  t: "levelUp";
  level: number;
  cards: LevelUpCard[];
  /** Additional picks queued behind this one. 0 means this is the last set. */
  queued: number;
  /** Re-roll tokens the player currently holds (for button visibility). */
  rerolls: number;
  /** Banish tokens the player currently holds (for button visibility). */
  banishes: number;
}

export interface OwnedWeapon { id: string; level: number; }
export interface OwnedPassive { id: string; stack: number; }

export interface EatenMsg {
  t: "eaten";
  byName: string;
  byMass: number;
  finalMass: number;
  /** Largest mass reached this run (the leaderboard "mass" stat). */
  peakMass: number;
  finalLevel: number;
  kills: number;
  hits: number;
  damage: number;
  durationMs: number;
  weapons: OwnedWeapon[];
  passives: OwnedPassive[];
  evolution: string | null;
}

export interface LeaderboardEntry {
  name: string;
  color: string;
  kills: number;
  /** Largest mass reached in the player's best run. */
  peakMass: number;
  hits: number;
  damage: number;
  /** Highest level reached in the player's best run. */
  level: number;
  /** Longest single-run survival, in ms. */
  durationMs?: number;
  endedAt: number;
  evolution?: string | null;
}

export interface LeaderboardMsg {
  t: "leaderboard";
  top: LeaderboardEntry[];
}

export interface PlayerJoinedMsg {
  t: "playerJoined";
  name: string;
  color: string;
}

export interface PlayerDiedMsg {
  t: "playerDied";
  name: string;
  color: string;
  /** Name of the eater. "the void" when no killer was nearby (e.g. disconnect or solo death). */
  byName: string;
}

export interface RosterEntry {
  name: string;
  color: string;
  mass: number;
  level: number;
  /** True for the row that represents the receiving socket's own fish. */
  isMe: boolean;
}

export interface RosterMsg {
  t: "roster";
  players: RosterEntry[];
}

export type ServerMsg =
  | WelcomeMsg
  | SnapshotMsg
  | LevelUpMsg
  | EatenMsg
  | LeaderboardMsg
  | PlayerJoinedMsg
  | PlayerDiedMsg
  | RosterMsg;
