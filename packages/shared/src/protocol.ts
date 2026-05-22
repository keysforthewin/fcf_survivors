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

export const ClientMsg = z.discriminatedUnion("t", [HelloMsg, InputMsg, PickCardMsg]);
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
  you: {
    x: number;
    y: number;
    mass: number;
    hp: number;
    maxHp: number;
    xp: number;
    level: number;
    nextLevelXp: number;
    boostReadyAt: number;
    serverNow: number;
    weapons: YouWeaponSlot[];
  };
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

export type ServerMsg = WelcomeMsg | SnapshotMsg | LevelUpMsg | EatenMsg | LeaderboardMsg;
