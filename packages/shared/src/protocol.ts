import { z } from "zod";

export const HelloMsg = z.object({
  t: z.literal("hello"),
  name: z.string().min(1).max(16),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type HelloMsg = z.infer<typeof HelloMsg>;

export const InputMsg = z.object({
  t: z.literal("input"),
  seq: z.number().int().nonnegative(),
  vx: z.number().min(-1).max(1),
  vy: z.number().min(-1).max(1),
  boost: z.boolean(),
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
  kind: "fish" | "pellet" | "projectile" | "chunk";
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  hx?: number;
  hy?: number;
  mass?: number;
  color?: string;
  name?: string;
  weaponId?: string;
  ownerId?: number;
  radius?: number;
  isAi?: boolean;
}

/** Per-tick hit event: a projectile damaged a fish. Used for client-side hit markers. */
export interface HitEvent {
  x: number;
  y: number;
  damage: number;
  targetId: number;
  /** True when the receiving socket owns the projectile that caused this hit. */
  byOwner: boolean;
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
    hx: number;
    hy: number;
    mass: number;
    /** Hard cap on player mass; HUD uses this for the mass-cap indicator. */
    maxMass: number;
    xp: number;
    level: number;
    nextLevelXp: number;
    boostReadyAt: number;
    boostUntil: number;
    serverNow: number;
    weapons: YouWeaponSlot[];
    passives: YouPassiveSlot[];
    /**
     * Total number of level-up picks pending on the server — includes the active
     * card set currently shown (if any) plus all queued additional picks.
     * 0 means no pending picks. HUD uses this to render a "k more pending" badge.
     */
    pendingPicks: number;
  };
  /** Server's current time, always sent (matches you.serverNow when present). */
  serverNow: number;
  /** True when this snapshot is being delivered to a spectator socket (no local fish). */
  spectator?: boolean;
  entities: EntityDelta[];
  removed: number[];
  /** Hit events that occurred this tick and are visible to this socket. */
  hits?: HitEvent[];
  /** Radial-pulse zap events this tick that are visible to this socket. */
  zaps?: ZapEvent[];
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
