import { World, type WorldDeps } from "../../src/sim/world.ts";
import type { Fish, Pellet, AiState } from "../../src/sim/entity.ts";
import { fishHp } from "@fcf/shared";
import { seededRng } from "./seeded-rng.ts";

export interface FishSeed {
  name?: string;
  color?: string;
  x: number;
  y: number;
  mass?: number;
  isAi?: boolean;
  aiMode?: AiState["mode"];
  /** If true, the simulation will treat this as a player fish (socketId set, no aiState). */
  socketId?: string | null;
}

export interface PelletSeed {
  x: number;
  y: number;
  color?: string;
}

export interface MakeWorldOpts {
  seed?: number;
  startTime?: number;
  fish?: FishSeed[];
  pellets?: PelletSeed[];
  /** Enable production-style pellet auto-spawn. Default false in tests. */
  autoSpawnPellets?: boolean;
  /** Enable production-style AI population maintenance. Default false in tests. */
  maintainAi?: boolean;
}

export interface TestClock {
  set(t: number): void;
  advance(ms: number): void;
  now(): number;
}

export interface TestSim {
  world: World;
  clock: TestClock;
  rng: () => number;
  /** Map of fish name → id, for named entity lookups in steps. */
  byName: Map<string, number>;
}

export function makeWorld(opts: MakeWorldOpts = {}): TestSim {
  const startTime = opts.startTime ?? 1_700_000_000_000;
  let t = startTime;
  const clock: TestClock = {
    set(v) { t = v; },
    advance(ms) { t += ms; },
    now() { return t; },
  };
  const rng = seededRng(opts.seed ?? 1);
  const deps: WorldDeps = {
    now: () => t,
    rng,
    autoSpawnPellets: opts.autoSpawnPellets ?? false,
    maintainAi: opts.maintainAi ?? false,
  };
  const world = new World(deps);
  const byName = new Map<string, number>();

  for (const seed of opts.fish ?? []) {
    const id = world.nextId();
    const mass = seed.mass ?? 10;
    const fish: Fish = {
      id,
      kind: "fish",
      x: seed.x,
      y: seed.y,
      vx: 0,
      vy: 0,
      targetVx: 0,
      targetVy: 0,
      headingX: 1,
      headingY: 0,
      mass,
      hp: fishHp(mass),
      maxHp: fishHp(mass),
      color: seed.color ?? "#7fcfff",
      name: seed.name ?? `Fish${id}`,
      isAi: seed.isAi ?? false,
      boost: false,
      boostUntil: 0,
      boostReadyAt: 0,
      level: 1,
      xp: 0,
      kills: 0,
      spawnedAt: t,
      socketId: seed.socketId ?? (seed.isAi ? null : `test-${id}`),
      alive: true,
      weapons: [],
      passives: new Map(),
      pendingLevelUp: [],
    };
    if (seed.isAi) {
      fish.aiState = {
        mode: seed.aiMode ?? "wander",
        modeUntil: t + 2000,
        wanderHeading: 0,
        targetId: null,
      };
    }
    world.fish.set(id, fish);
    byName.set(fish.name, id);
  }

  for (const pseed of opts.pellets ?? []) {
    const id = world.nextId();
    const p: Pellet = {
      id,
      kind: "pellet",
      x: pseed.x,
      y: pseed.y,
      color: pseed.color ?? "#ffdf80",
    };
    world.pellets.set(id, p);
  }

  return { world, clock, rng, byName };
}

export function advanceTicks(sim: TestSim, n: number, dtMs = 50): void {
  for (let i = 0; i < n; i++) {
    sim.clock.advance(dtMs);
    sim.world.step(dtMs / 1000, sim.clock.now());
  }
}

/** Find a fish by registered name. Throws if missing. */
export function getFish(sim: TestSim, name: string): Fish {
  const id = sim.byName.get(name);
  if (id == null) throw new Error(`No fish named '${name}' (registered: ${[...sim.byName.keys()].join(", ")})`);
  const f = sim.world.fish.get(id);
  if (!f) throw new Error(`Fish '${name}' (id=${id}) not in world (eaten?)`);
  return f;
}

/** Find a fish by name, returning undefined if it has been removed. */
export function tryFish(sim: TestSim, name: string): Fish | undefined {
  const id = sim.byName.get(name);
  if (id == null) return undefined;
  return sim.world.fish.get(id);
}
