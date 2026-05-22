import { ClientMsg, type ServerMsg, type EatenMsg, type LeaderboardMsg, type LevelUpMsg, type PlayerJoinedMsg, type PlayerDiedMsg, type RosterEntry, type RosterMsg, parseCardId } from "@fcf/shared";
import { ARENA, TICK } from "@fcf/shared";
import { World, type WorldDeps } from "./sim/world.ts";
import { processLevelUps, applyCard } from "./sim/levelup.ts";
import { ClientView, buildSnapshot } from "./net/snapshot.ts";
import { topLeaderboard, writeScore, ensureMongo } from "./db/scores.ts";
import { createHash } from "node:crypto";

interface SocketData {
  id: string;
  ip: string;
  fishId: number | null;
  view: ClientView;
  startedAt: number;
  name: string;
  color: string;
  /** Level we've already pushed a LevelUpMsg for, so we don't spam. Reset on pickCard. */
  levelUpSentForLevel: number | null;
}

export interface StartServerOpts {
  /** TCP port for HTTP/WS. Defaults to env PORT or 4000. Pass 0 for ephemeral. */
  port?: number;
  /** Injected clock/rng for deterministic tests. Forwarded to the World. */
  worldDeps?: WorldDeps;
  /** Set false in tests to skip the periodic 15s leaderboard broadcast. */
  periodicLeaderboard?: boolean;
  /** Fire-and-forget ensureMongo at boot. Defaults true; tests pass false. */
  connectMongo?: boolean;
  /** Verbose logs. Defaults true; tests pass false. */
  log?: boolean;
}

export interface RunningServer {
  server: Bun.Server<SocketData>;
  world: World;
  port: number;
  close: () => Promise<void>;
}

function sanitizeName(raw: string): string {
  return raw.replace(/[^\w\- ]/g, "").trim().slice(0, 16) || "Fish";
}

function sanitizeColor(raw: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : "#7fcfff";
}

function ipHash(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export function startServer(opts: StartServerOpts = {}): RunningServer {
  const PORT = opts.port ?? Number(process.env.PORT ?? 4000);
  const world = new World(opts.worldDeps);
  const sockets = new Map<string, Bun.ServerWebSocket<SocketData>>();
  let socketCounter = 0;
  const log = opts.log ?? true;

  if (opts.connectMongo ?? true) ensureMongo();

  function send(ws: Bun.ServerWebSocket<SocketData>, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }

  function broadcast(msg: ServerMsg, exclude?: Bun.ServerWebSocket<SocketData>): void {
    for (const ws of sockets.values()) {
      if (ws === exclude) continue;
      send(ws, msg);
    }
  }

  function rosterForSocket(myFishId: number | null): RosterEntry[] {
    const out: RosterEntry[] = [];
    for (const f of world.fish.values()) {
      if (!f.alive || f.isAi) continue;
      out.push({
        name: f.name,
        color: f.color,
        mass: f.mass,
        level: f.level,
        isMe: f.id === myFishId,
      });
    }
    out.sort((a, b) => b.mass - a.mass);
    return out;
  }

  function broadcastRoster(): void {
    for (const ws of sockets.values()) {
      send(ws, { t: "roster", players: rosterForSocket(ws.data.fishId) } satisfies RosterMsg);
    }
  }

  async function broadcastLeaderboard(target?: Bun.ServerWebSocket<SocketData>): Promise<void> {
    const top = await topLeaderboard(10);
    const msg: LeaderboardMsg = { t: "leaderboard", top };
    if (target) {
      send(target, msg);
    } else {
      for (const ws of sockets.values()) send(ws, msg);
    }
  }

  let lbInterval: ReturnType<typeof setInterval> | null = null;
  if (opts.periodicLeaderboard ?? true) {
    lbInterval = setInterval(() => {
      broadcastLeaderboard().catch(() => {});
    }, 15_000);
  }

  // game loop
  let lastTickAt = performance.now();
  const tickInterval = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastTickAt) / 1000);
    lastTickAt = now;
    const wallNow = world.now();

    world.step(dt, wallNow);

    // collect dead fish (snapshot stats BEFORE removal)
    interface DeadPlayer {
      fishId: number;
      name: string;
      color: string;
      mass: number;
      level: number;
      kills: number;
      spawnedAt: number;
      killerName: string;
      killerMass: number;
      weapons: Array<{ id: string; level: number }>;
      passives: Array<{ id: string; stack: number }>;
      evolution: string | null;
    }
    const deadPlayers: DeadPlayer[] = [];
    const allDead: Array<{ x: number; y: number; mass: number; color: string }> = [];

    for (const f of world.fish.values()) {
      if (f.alive) continue;
      allDead.push({ x: f.x, y: f.y, mass: f.mass, color: f.color });
      if (!f.isAi && f.socketId) {
        let killer: { name: string; mass: number } | null = null;
        let bestMass = 0;
        for (const other of world.fish.values()) {
          if (other.id === f.id || !other.alive) continue;
          const dx = other.x - f.x;
          const dy = other.y - f.y;
          if (dx * dx + dy * dy <= 250 * 250 && other.mass > bestMass) {
            bestMass = other.mass;
            killer = { name: other.name, mass: other.mass };
          }
        }
        const EVOLUTION_IDS = new Set(["tidal", "puffer", "eel", "kraken", "school"]);
        const evolution = f.weapons.find((s) => EVOLUTION_IDS.has(s.id))?.id ?? null;
        deadPlayers.push({
          fishId: f.id,
          name: f.name,
          color: f.color,
          mass: f.mass,
          level: f.level,
          kills: f.kills,
          spawnedAt: f.spawnedAt,
          killerName: killer?.name ?? "the void",
          killerMass: killer?.mass ?? 0,
          weapons: f.weapons.map((s) => ({ id: s.id, level: s.level })),
          passives: [...f.passives.entries()].map(([id, stack]) => ({ id, stack })),
          evolution,
        });
      }
    }

    // spawn chunks and remove all dead fish
    for (const d of allDead) {
      const chunkCount = Math.min(8, Math.max(2, Math.ceil(d.mass / 12)));
      const each = (d.mass * 0.6) / chunkCount;
      for (let i = 0; i < chunkCount; i++) {
        world.spawnChunk(d.x, d.y, each, d.color, wallNow);
      }
    }
    for (const [id, f] of world.fish) {
      if (!f.alive) world.removeFish(id);
    }

    // notify dead players + persist score
    for (const dp of deadPlayers) {
      const ws = [...sockets.values()].find((s) => s.data.fishId === dp.fishId);
      // Broadcast playerDied to everyone except the dying socket (or to everyone
      // if the socket is already gone — disconnect case).
      broadcast(
        { t: "playerDied", name: dp.name, color: dp.color, byName: dp.killerName } satisfies PlayerDiedMsg,
        ws,
      );
      broadcastRoster();
      if (!ws) continue;
      const startedAt = ws.data.startedAt;
      const durationMs = wallNow - startedAt;
      send(ws, {
        t: "eaten",
        byName: dp.killerName,
        byMass: dp.killerMass,
        finalMass: dp.mass,
        finalLevel: dp.level,
        kills: dp.kills,
        durationMs,
        weapons: dp.weapons,
        passives: dp.passives,
        evolution: dp.evolution,
      } satisfies EatenMsg);
      ws.data.fishId = null;
      writeScore({
        name: dp.name,
        color: dp.color,
        finalMass: dp.mass,
        level: dp.level,
        kills: dp.kills,
        durationMs,
        killedBy: dp.killerName,
        startedAt: new Date(startedAt),
        endedAt: new Date(wallNow),
        ipHash: ipHash(ws.data.ip),
        weapons: dp.weapons,
        passives: dp.passives,
        evolution: dp.evolution,
      }).catch(() => {});
      broadcastLeaderboard(ws).catch(() => {});
    }

    // level up handling — extracted so tests and prod use the same code path
    processLevelUps(world);

    // dispatch level-up modals to players whose pendingLevelUp just populated
    for (const ws of sockets.values()) {
      const fid = ws.data.fishId;
      if (fid === null) continue;
      const fish = world.fish.get(fid);
      if (!fish || !fish.alive) continue;
      if (fish.pendingLevelUp.length === 0) {
        ws.data.levelUpSentForLevel = null;
        continue;
      }
      if (ws.data.levelUpSentForLevel === fish.level) continue;
      const msg: LevelUpMsg = {
        t: "levelUp",
        level: fish.level,
        cards: fish.pendingLevelUp,
      };
      send(ws, msg);
      ws.data.levelUpSentForLevel = fish.level;
    }

    // send snapshots
    for (const ws of sockets.values()) {
      const fid = ws.data.fishId;
      if (fid === null) continue;
      const fish = world.fish.get(fid);
      if (!fish) continue;
      const snap = buildSnapshot(world, fish, ws.data.view, wallNow);
      send(ws, snap);
    }

    // periodic roster broadcast (~2Hz) as a backup for mass/level updates.
    // Join/death events also push an immediate roster — see broadcastRoster() above.
    if (world.tick % 10 === 0) broadcastRoster();

    // clear removed buffer
    world.removedIds.length = 0;
  }, TICK.ms);

  // HTTP + WS server
  const server = Bun.serve<SocketData>({
    port: PORT,
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        const id = `s${++socketCounter}`;
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? srv.requestIP(req)?.address ?? "unknown";
        const ok = srv.upgrade(req, {
          data: { id, ip, fishId: null, view: new ClientView(), startedAt: 0, name: "", color: "", levelUpSentForLevel: null },
        });
        if (ok) return undefined;
        return new Response("Upgrade failed", { status: 500 });
      }
      if (url.pathname === "/leaderboard") {
        const sortParam = url.searchParams.get("sort");
        const sort = sortParam === "recent" || sortParam === "kills" ? sortParam : "mass";
        return topLeaderboard(20, sort)
          .then((rows) => new Response(JSON.stringify(rows), { headers: { "content-type": "application/json" } }));
      }
      if (url.pathname === "/health") {
        return new Response("ok");
      }
      return new Response("Fruit Cup Survivors server", { status: 200 });
    },
    websocket: {
      open(ws) {
        sockets.set(ws.data.id, ws);
        broadcastLeaderboard(ws).catch(() => {});
        if (log) console.log(`[ws] open ${ws.data.id} (${ws.data.ip})`);
      },
      message(ws, raw) {
        if (typeof raw !== "string") return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return;
        }
        const result = ClientMsg.safeParse(parsed);
        if (!result.success) return;
        const msg = result.data;
        const now = world.now();
        if (msg.t === "hello") {
          if (ws.data.fishId !== null) return;
          const name = sanitizeName(msg.name);
          const color = sanitizeColor(msg.color);
          const fish = world.spawnPlayer(name, color, ws.data.id);
          ws.data.fishId = fish.id;
          ws.data.startedAt = now;
          ws.data.name = name;
          ws.data.color = color;
          ws.data.view = new ClientView();
          send(ws, {
            t: "welcome",
            selfId: fish.id,
            arena: { width: ARENA.width, height: ARENA.height },
            tickHz: TICK.hz,
          });
          broadcast({ t: "playerJoined", name, color } satisfies PlayerJoinedMsg, ws);
          broadcastRoster();
        } else if (msg.t === "input") {
          const fid = ws.data.fishId;
          if (fid === null) return;
          const fish = world.fish.get(fid);
          if (!fish || !fish.alive) return;
          ws.data.view.ackSeq = msg.seq;
          // clamp magnitude to 1
          const mag = Math.hypot(msg.vx, msg.vy);
          let nx = msg.vx;
          let ny = msg.vy;
          if (mag > 1) { nx /= mag; ny /= mag; }
          world.applyInput(fish, nx, ny, msg.boost, now);
        } else if (msg.t === "pickCard") {
          const fid = ws.data.fishId;
          if (fid === null) return;
          const fish = world.fish.get(fid);
          if (!fish || !fish.alive) return;
          if (fish.pendingLevelUp.length === 0) return;
          const parsed = parseCardId(msg.cardId);
          if (!parsed) return;
          const ok = applyCard(world, fish, msg.cardId, parsed);
          if (ok) {
            ws.data.levelUpSentForLevel = null;
          }
        } else if (msg.t === "identity") {
          const fid = ws.data.fishId;
          if (fid === null) return;
          const fish = world.fish.get(fid);
          if (!fish || !fish.alive) return;
          let changed = false;
          if (msg.name !== undefined) {
            const name = sanitizeName(msg.name);
            if (name !== fish.name) { fish.name = name; ws.data.name = name; changed = true; }
          }
          if (msg.color !== undefined) {
            const color = sanitizeColor(msg.color);
            if (color !== fish.color) { fish.color = color; ws.data.color = color; changed = true; }
          }
          if (changed) {
            // Force other clients' snapshot views to re-send name/color for this fish
            // (buildSnapshot only emits those fields on first-seen).
            for (const other of sockets.values()) {
              if (other === ws) continue;
              other.data.view.prevSent.delete(fish.id);
            }
            broadcastRoster();
          }
        }
      },
      close(ws) {
        sockets.delete(ws.data.id);
        const fid = ws.data.fishId;
        if (fid !== null) {
          const f = world.fish.get(fid);
          if (f && f.alive) {
            f.alive = false;
          }
        }
        if (log) console.log(`[ws] close ${ws.data.id}`);
      },
    },
  });

  if (log) console.log(`[server] listening on http://localhost:${server.port}  ws: ws://localhost:${server.port}/ws`);

  return {
    server,
    world,
    port: server.port ?? PORT,
    async close() {
      clearInterval(tickInterval);
      if (lbInterval) clearInterval(lbInterval);
      // close all sockets so clients see a close event
      for (const ws of sockets.values()) {
        try { ws.close(); } catch {}
      }
      sockets.clear();
      server.stop(true);
    },
  };
}

if (import.meta.main) {
  startServer();
}
