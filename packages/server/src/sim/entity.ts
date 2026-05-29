import type { EntityId, WeaponId, LevelUpCard } from "@fcf/shared";

export interface WeaponSlot {
  id: WeaponId;
  level: number;
  cooldownReadyAt: number;
  /**
   * Per-weapon volatile state. Trail uses {lastDropAt}. Orbital uses
   * {phase, projectileIds}. Radial-burst (Turret) uses {startedAt, firedCount}
   * while a ring is mid-sweep. Flyby (Alien Friends) tracks its in-flight ships.
   */
  state?: TrailState | OrbitalState | BurstSweepState | FlybyState | HeliState;
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

/**
 * Tracks an in-progress radial-burst sweep: the ring's bullets are emitted one
 * at a time across ~1s instead of all in a single tick. Present only while a
 * ring is firing; cleared (back to undefined) when the ring completes.
 */
export interface BurstSweepState {
  kind: "burst-sweep";
  /** Wall-time the current ring began. */
  startedAt: number;
  /** Bullets emitted so far this ring (also the next bullet's index). */
  firedCount: number;
}

/**
 * Tracks the UFOs a flyby weapon (Alien Friends) currently has crossing the
 * screen. Each ship is a zero-damage linear projectile that auto-expires; the
 * per-shot AoE laser is driven off `lastFireAt`. When `ships` empties and the
 * cooldown has elapsed, a fresh wave is summoned.
 */
export interface FlybyState {
  kind: "flyby";
  ships: { projId: number; lastFireAt: number }[];
}

/**
 * Tracks the single minicopter a heli weapon currently has in the air. The body is a
 * damage-0 linear projectile that flies a 3-phase patrol: `enter` (streak in from a
 * screen edge), `attack` (loiter around the player, nose tracking enemies, firing the
 * lead-aimed AK only when aligned), `exit` (peel off and leave through an edge). `heading`
 * is the smoothed nose angle (rad) — written to the body's `facing` each tick and used to
 * orient the sprite + aim bullets. Re-summons once `ship` clears and the cooldown elapses.
 */
export interface HeliState {
  kind: "heli";
  ship: {
    projId: number;
    phase: "enter" | "attack" | "exit";
    heading: number;
    lastFireAt: number;
    /** Desired loiter position as an OFFSET from the player (added to fish.x/y each tick), so the
     *  target tracks the player instead of going stale when they move (see tickHeli). */
    offX: number;
    offY: number;
    nextWaypointAt: number;
    /** Wall-time the attack phase ends → switch to exit. Set on the enter→attack transition. */
    attackUntil: number;
    /** Fixed outward direction (unit vector) the body streaks along during exit. A constant heading
     *  (not a finite point) means it never stops/bounces, so a chasing player can't pin it on screen;
     *  it's removed once it leaves the arena or the player's view. */
    exitDx: number;
    exitDy: number;
  } | null;
}

export type PassiveId =
  | "fin" | "gulp" | "scales" | "teeth" | "reflex" | "magnet" | "recovery" | "hungry" | "closeEncounters" | "comms" | "sybex";

export interface Fish {
  id: EntityId;
  kind: "fish";
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetVx: number;
  targetVy: number;
  /**
   * True once a client has reported authoritative kinematics for this fish (see
   * world.applyClientState). When set, world.step stops integrating this fish's
   * movement and heading from intent — the owning client owns its position. AI
   * fish never set this; they are always server-simulated.
   */
  clientAuthoritative: boolean;
  /** Unit-vector heading remembered when the fish was last moving. Used to aim weapons when idle. */
  headingX: number;
  headingY: number;
  mass: number;
  color: string;
  /** Chosen fish species id (see shared/species.ts) → which photo sprite clients render. */
  species: string;
  name: string;
  isAi: boolean;
  /**
   * Server tick on which this fish last swallowed prey whole. The snapshot builder turns
   * `bitingTick === world.tick` into a transient `biting` flag so clients play the
   * mouth-open chomp/lurch animation on the eater. Undefined until the first eat.
   */
  bitingTick?: number;
  /** Server tick on which this fish last took a quick BITE — either nibbling a bigger fish, or
   *  biting prey it's bigger than but can't yet swallow → transient `nibbling` flag (quick nip anim). */
  nibblingTick?: number;
  /** Wall-time of this fish's last nibble (of a bigger fish); gates NIBBLE.cooldownMs. */
  lastNibbleAt?: number;
  /** Wall-time of this fish's last BITE (of prey it can't yet swallow); gates BITE.cooldownMs.
   *  Separate from lastNibbleAt so a bite and a nibble of different neighbours don't stomp each
   *  other's cooldown when a fish sits between a bigger and a smaller neighbour. */
  lastBiteAt?: number;
  /**
   * Set true on the tick this fish was swallowed whole (as opposed to killed by a weapon or nibble).
   * The death handler skips dropping corpse chunks for it — its XP is burped from the eater's mouth
   * at eat time instead (see world.ts eat block). `undefined` ⇒ killed by weapon/nibble/void.
   */
  eatenWhole?: boolean;
  /**
   * Wall-time until which this fish cannot be eaten (spawn protection). 0/undefined = none.
   * Set on (re)spawn for players so any-contact eating doesn't instantly chomp a fresh fish.
   */
  spawnProtectedUntil?: number;
  /** Wall-time until which this fish moves at SLOW.mult speed (Battle Comms debuff). 0/undefined = not slowed. */
  slowUntil?: number;
  /**
   * Transient per-tick move-speed multiplier from Subversive Sybex proximity auras (1 = none).
   * Recomputed every tick by applySybexAuras before AI/player movement; the strongest nearby aura wins.
   */
  auraSlowMult?: number;
  boost: boolean;
  boostUntil: number;
  boostReadyAt: number;
  level: number;
  xp: number;
  kills: number;
  /** Highest mass reached during this life; never decreases. The leaderboard "mass" stat. */
  peakMass: number;
  /** Times this fish's weapons have damaged a fish. Players only — AI never fire. */
  hits: number;
  /** Total raw weapon damage this fish has dealt across all weapons. */
  damageDealt: number;
  spawnedAt: number;
  socketId: string | null; // null for AI
  alive: boolean;
  aiState?: AiState;
  weapons: WeaponSlot[];
  passives: Map<PassiveId, number>;
  pendingLevelUp: LevelUpCard[];
  /**
   * Additional level-up picks queued behind the one in `pendingLevelUp`.
   * When a card is applied, the next queued pick is drawn (with fresh cards
   * based on the just-updated loadout) and becomes the new active pick.
   */
  queuedLevelUps: number;
  /**
   * When true, the player has dismissed their level-up modal and is allowed to
   * move and fire weapons even though pendingLevelUp is still populated. They
   * can re-open the modal client-side and pick later. Cleared only when the
   * entire queue is resolved (all picks consumed or applied).
   */
  levelUpDismissed: boolean;
  /**
   * Monotonic counter incremented every time `pendingLevelUp` is assigned a
   * fresh draw. Lets the server detect "new cards available" so it can re-emit
   * LevelUpMsg after a pickCard consumed the queue.
   */
  pendingLevelUpDrawId: number;
  /** Re-roll tokens collected from fruit. Spent to re-roll a single level-up card. */
  rerollsRemaining: number;
  /** Banish tokens collected from fruit. Spent to banish a level-up card. */
  banishesRemaining: number;
  /**
   * Card subjects (see cardSubject) banished this life. Filtered out of every
   * future draw. Cleared only on (re)spawn — a "round" is one life.
   */
  banishedSubjects: Set<string>;
  /**
   * Set when a weapon lands the lethal hit (mass drained to zero), so the death
   * handler can credit the shooter instead of the 250-unit proximity heuristic —
   * which misses ranged kills (ESP/aliens). `undefined` ⇒ died by eating or the
   * void. Set just before removal; never reset (fish are fresh objects per life).
   */
  killedByName?: string;
  killedByMass?: number;
}

export interface AiState {
  mode: "wander" | "flee" | "chase" | "feed";
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
  /** Wall-time when the current flee began (0 if not currently fleeing). */
  fleeStartedAt: number;
  /** Last-known predator position; used to compute flee direction when predator is out of sight. */
  fleeLastKnownX: number;
  fleeLastKnownY: number;
  /** Wall-time after which the fish forgets the last predator and stops biasing wander away from it. */
  fleeMemoryUntil: number;
  /**
   * Per-target aggro meter (entityId → accumulated aggro). Ramps while an edible target loiters
   * in AGGRO.radius and from nibble damage taken; decays + pruned each tick. Lazy-init'd in
   * updateAi so the cucumber harness (which builds AiState literals omitting these) stays safe.
   */
  aggro: Map<EntityId, number>;
  /** Target this fish has committed to hunting (meter crossed threshold). null = not committed. */
  angeredTargetId: EntityId | null;
  /** Last-known position of the angered target while briefly out of sight (mirrors fleeLastKnown). */
  chaseLastKnownX: number;
  chaseLastKnownY: number;
  /** Wall-time the angered-chase commitment expires (refreshed while the target is within leash). */
  chaseCommitUntil: number;
  /** Per-fish jitter [0,1) added to the aggro commit threshold so a school doesn't aggro in lockstep. */
  aggroJitter: number;
  /**
   * Feeding frenzy (FRENZY): the dropped XP-ball chunk this fish is currently rushing, or null.
   * A CHUNK id, NOT a fish id — kept separate from `targetId` (which flee/chase/hysteresis/
   * stuck-blacklist all assume is a fish). Recomputed each tick to the nearest in-range ball.
   */
  feedTargetId: EntityId | null;
}

export interface Pellet {
  id: EntityId;
  kind: "pellet";
  x: number;
  y: number;
  color: string;
}

export interface Fruit {
  id: EntityId;
  kind: "fruit";
  x: number;
  y: number;
  /** Which level-up token this fruit grants on pickup. */
  reward: "reroll" | "banish";
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
  /**
   * Burp chunks only: XP granted on collection (instead of the corpse-chunk's mass-derived XP),
   * and these grant no mass — the swallow already gave the eater the prey's mass. `mass` is then
   * just the render size. `undefined` ⇒ a normal corpse chunk (mass + mass-derived XP).
   */
  xp?: number;
  /** Burp chunks only: wall-time before which this chunk can't be collected (arming delay). */
  collectableAt?: number;
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
  /** Heli weapons only: true for the minicopter BODY (damage 0), false/undefined for its bullets. Drives client sprite choice. */
  isBody?: boolean;
  /** Vehicle weapons (Nitro's Customs/Dealership): a piercing body that plows through every fish it touches
   *  instead of expiring on first contact. The reHitMs gate (set to the lifetime) keeps it to one hit per fish. */
  pierce?: boolean;
  /** Heli body only, refreshed each tick: the smoothed nose angle (rad). Shipped in the snapshot so the
   *  client rotates the sprite to where the heli is aiming (not just its travel direction). */
  facing?: number;
  /** Per-target last-hit timestamp for orbital/trail/pulse re-hit gating. */
  hits: Map<EntityId, number>;
  reHitMs: number;
  /** Orbital-only: per-blade phase offset + orbit radius (relative to owner). */
  orbitPhase?: number;
  orbitRadius?: number;
  /**
   * Orbital-only, refreshed each tick: the blade's current absolute orbit angle and the
   * angular velocity (rad/s). Shipped in the snapshot so clients animate the orbit at their
   * own framerate (re-anchoring to orbitAngle each snapshot, extrapolating at orbitAngular
   * between) instead of stepping at the 20 Hz snapshot cadence. See snapshot.projectileDelta.
   */
  orbitAngle?: number;
  orbitAngular?: number;
}

export type AnyEntity = Fish | Pellet | Fruit | Chunk | Projectile;

/** Server-side record of a hit that occurred this tick. Snapshot builder turns this into HitEvents per socket. */
export interface HitEventRecord {
  x: number;
  y: number;
  damage: number;
  targetId: EntityId;
  ownerId: EntityId;
  /** Weapon that landed the hit — lets the client pick or mute per-weapon hit sounds. */
  weaponId: WeaponId;
}

/**
 * Server-side record of a radial-pulse zap this tick. Snapshot builder turns this into
 * ZapEvents per socket. nodes[0] is the firing fish; nodes[1..] are struck fish.
 */
export interface ZapEventRecord {
  nodes: { id: EntityId; x: number; y: number }[];
  chain: boolean;
  weaponId: WeaponId;
}
