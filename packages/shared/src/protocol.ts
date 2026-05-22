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

export const ClientMsg = z.discriminatedUnion("t", [
  HelloMsg,
  InputMsg,
  PickCardMsg,
  IdentityMsg,
  SpectateMsg,
  RespawnMsg,
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
  hp?: number;
  maxHp?: number;
  color?: string;
  name?: string;
  weaponId?: string;
  ownerId?: number;
  radius?: number;
  isAi?: boolean;
}

export interface YouWeaponSlot {
  id: string;
  level: number;
  cooldownReadyAt: number;
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
    hp: number;
    maxHp: number;
    xp: number;
    level: number;
    nextLevelXp: number;
    boostReadyAt: number;
    boostUntil: number;
    serverNow: number;
    weapons: YouWeaponSlot[];
  };
  /** Server's current time, always sent (matches you.serverNow when present). */
  serverNow: number;
  /** True when this snapshot is being delivered to a spectator socket (no local fish). */
  spectator?: boolean;
  entities: EntityDelta[];
  removed: number[];
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
}

export interface OwnedWeapon { id: string; level: number; }
export interface OwnedPassive { id: string; stack: number; }

export interface EatenMsg {
  t: "eaten";
  byName: string;
  byMass: number;
  finalMass: number;
  finalLevel: number;
  kills: number;
  durationMs: number;
  weapons: OwnedWeapon[];
  passives: OwnedPassive[];
  evolution: string | null;
}

export interface LeaderboardEntry {
  name: string;
  color: string;
  finalMass: number;
  level: number;
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
