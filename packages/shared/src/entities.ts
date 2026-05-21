export type EntityId = number;

export type EntityKind = "fish" | "pellet" | "projectile" | "chunk";

export interface FishView {
  id: EntityId;
  kind: "fish";
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  hp: number;
  maxHp: number;
  color: string;
  name: string;
  isAi: boolean;
}

export interface PelletView {
  id: EntityId;
  kind: "pellet";
  x: number;
  y: number;
  color: string;
}

export interface ProjectileView {
  id: EntityId;
  kind: "projectile";
  x: number;
  y: number;
  vx: number;
  vy: number;
  weaponId: string;
  ownerId: EntityId;
  radius: number;
}

export interface ChunkView {
  id: EntityId;
  kind: "chunk";
  x: number;
  y: number;
  mass: number;
  color: string;
}

export type AnyEntityView = FishView | PelletView | ProjectileView | ChunkView;
