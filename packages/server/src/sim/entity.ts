import type { EntityId, WeaponId, LevelUpCard } from "@fcf/shared";

export interface WeaponSlot {
  id: WeaponId;
  level: number;
  cooldownReadyAt: number;
  /** Per-weapon volatile state. Trail uses {lastDropAt}. Orbital uses {phase, projectileIds}. */
  state?: TrailState | OrbitalState;
}

export interface TrailState {
  kind: "trail";
  lastDropAt: number;
}

export interface OrbitalState {
  kind: "orbital";
  phase: number;
  projectileIds: number[];
}

export type PassiveId =
  | "fin" | "gulp" | "scales" | "teeth" | "reflex" | "magnet" | "recovery" | "hungry";

export interface Fish {
  id: EntityId;
  kind: "fish";
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetVx: number;
  targetVy: number;
  /** Unit-vector heading remembered when the fish was last moving. Used to aim weapons when idle. */
  headingX: number;
  headingY: number;
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
  weapons: WeaponSlot[];
  passives: Map<PassiveId, number>;
  pendingLevelUp: LevelUpCard[];
}

export interface AiState {
  mode: "wander" | "flee" | "chase";
  modeUntil: number;
  wanderHeading: number;
  targetId: EntityId | null;
  /** Wall-time when the current targetId was last set. */
  targetSince: number;
  /** Position + time of the last stuck-detection sample. */
  lastSampleX: number;
  lastSampleY: number;
  lastSampleAt: number;
  /** Wall-time when we first noticed this fish hadn't moved meaningfully (null when moving). */
  stuckSince: number | null;
  /** entityId → wall-time when the blacklist entry expires. */
  blacklist: Map<EntityId, number>;
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

export type ProjectileBehavior = "linear" | "orbital" | "static";

export interface Projectile {
  id: EntityId;
  kind: "projectile";
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: EntityId;
  weaponId: WeaponId;
  damage: number;
  radius: number;
  expiresAt: number;
  behavior: ProjectileBehavior;
  /** Per-target last-hit timestamp for orbital/trail/pulse re-hit gating. */
  hits: Map<EntityId, number>;
  reHitMs: number;
  /** Orbital-only: orbit angle + radius (relative to owner). */
  orbitPhase?: number;
  orbitRadius?: number;
}

export type AnyEntity = Fish | Pellet | Chunk | Projectile;
