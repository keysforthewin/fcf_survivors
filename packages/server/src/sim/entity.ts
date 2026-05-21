import type { EntityId } from "@fcf/shared";

export interface Fish {
  id: EntityId;
  kind: "fish";
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetVx: number;
  targetVy: number;
  mass: number;
  hp: number;
  maxHp: number;
  color: string;
  name: string;
  isAi: boolean;
  boost: boolean;
  boostUntil: number;
  boostReadyAt: number;
  level: number;
  xp: number;
  kills: number;
  spawnedAt: number;
  socketId: string | null; // null for AI
  alive: boolean;
  aiState?: AiState;
}

export interface AiState {
  mode: "wander" | "flee" | "chase";
  modeUntil: number;
  wanderHeading: number;
  targetId: EntityId | null;
}

export interface Pellet {
  id: EntityId;
  kind: "pellet";
  x: number;
  y: number;
  color: string;
}

export interface Chunk {
  id: EntityId;
  kind: "chunk";
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  color: string;
  expiresAt: number;
}

export type AnyEntity = Fish | Pellet | Chunk;
