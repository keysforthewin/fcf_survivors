import { ClientMsg, type ServerMsg, type EatenMsg, type LeaderboardMsg, type LevelUpMsg, type PlayerJoinedMsg, type PlayerDiedMsg, type CombatToastMsg, type WeaponId, type RosterEntry, type RosterMsg, parseCardId } from "@fcf/shared";
import { ARENA, TICK, DEFAULT_SPECIES_ID, isSpeciesId } from "@fcf/shared";
import { applyClientWeaponHit } from "./sim/weapon.ts";
import { World, type WorldDeps } from "./sim/world.ts";
import { processLevelUps, applyCard, rerollCard, banishCard } from "./sim/levelup.ts";
import { discardWeapon, discardPassive } from "./sim/discard.ts";
import { ClientView, buildSnapshot, buildSpectatorSnapshot } from "./net/snapshot.ts";
import { topLeaderboard, writeScore, ensureMongo, type LeaderboardSort } from "./db/scores.ts";
import { createHash } from "node:crypto";

interface SocketData {
  id: string;
  ip: string;
  fishId: number | null;
  view: ClientView;
  startedAt: number;
  name: string;
  color: string;
  /** Chosen fish species id (see shared/species.ts); reused as the respawn default. */
  species: string;
  /**
   * Draw id of the pendingLevelUp set we last pushed a LevelUpMsg for. The
   * server increments fish.pendingLevelUpDrawId each time it assigns a fresh
   * pendingLevelUp (initial level-up, or after a pickCard drained a queued one),
   * so this gate fires exactly once per new card set.
   */
  levelUpSentDrawId: number | null;
  /** True while the socket has no fish but is still receiving world snapshots. */
  isSpectator: boolean;
  /** Last reported camera center for spectators (informational; full world is sent). */
  camX: number;
  camY: number;
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

function sanitizeSpecies(raw: string | undefined): string {
  return raw !== undefined && isSpeciesId(raw) ? raw : DEFAULT_SPECIES_ID;
}

function ipHash(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export function startServer(opts: StartServerOpts = {}): RunningServer {
  const PORT = opts.port ?? Number(process.env.PORT ?? 4000);
  const world = new World(opts.worldDeps);
  const sockets = new Map<string, Bun.ServerWebSocket<SocketData>>();
  // Boot is idle: no connections yet, so pause pellet spawn + AI grazing until
  // a human connects. Kept in sync from the open/close handlers below.
  world.humansPresent = false;
  // Per-player session metadata keyed by fishId. Outlives the socket so a
  // disconnect (where ws.data is no longer reachable from the tick loop) can
  // still produce a complete ScoreDoc. The `disconnected` flag tells the
  // dead-fish loop to credit "the void" instead of a nearby player.
  const playerSessions = new Map<number, { startedAt: number; ipHash: string; disconnected: boolean }>();
  let socketCounter = 0;
  const log = opts.log ?? true;

  if (opts.connectMongo ?? true) ensureMongo();

  function send(ws: Bun.ServerWebSocket<SocketData>, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }

  function broadcast(
    msg: ServerMsg,
    exclude?: Bun.ServerWebSocket<SocketData> | Set<Bun.ServerWebSocket<SocketData>>,
  ): void {
    const excludeSet = exclude instanceof Set ? exclude : undefined;
    for (const ws of sockets.values()) {
      if (excludeSet ? excludeSet.has(ws) : ws === exclude) continue;
      send(ws, msg);
    }
  }

  // A renamed fish needs every client to re-send its name on the next snapshot
  // (buildSnapshot only emits name on first-seen). Used when a human claim
  // evicts an NPC's name — all sockets must forget it, including the claimant's.
  function repropagateFish(fishId: number): void {
    for (const ws of sockets.values()) ws.data.view.prevSent.delete(fishId);
  }

  // Humans get priority over AI fish names: rename any NPC using `name` and
  // re-propagate each renamed fish so clients pick up the new name.
  function claimNameForHuman(name: string): void {
    for (const id of world.claimHumanName(name)) repropagateFish(id);
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

  // game loop — fixed timestep. Human fish are client-authoritative (the client runs its
  // own fixed-step sim at TICK.ms and reports kinematics), but AI fish still integrate here,
  // and a fixed dt keeps stepFishMovement (explicitly NOT substep-invariant) stable. Under
  // sustained overload a fixed dt dilates game-time rather than teleporting fish forward —
  // watch the `server tick` gauge in the F3 panel to spot an over-budget tick.
  const FIXED_DT = TICK.ms / 1000;
  const tickInterval = setInterval(() => {
    const tickStart = performance.now();
    const wallNow = world.now();

    world.step(FIXED_DT, wallNow);

    // collect dead fish (snapshot stats BEFORE removal)
    interface DeadPlayer {
      fishId: number;
      name: string;
      color: string;
      x: number;
      y: number;
      mass: number;
      peakMass: number;
      hits: number;
      damage: number;
      level: number;
      kills: number;
      spawnedAt: number;
      killerName: string;
      killerMass: number;
      killerId?: number;
      weaponId?: WeaponId;
      weapons: Array<{ id: string; level: number }>;
      passives: Array<{ id: string; stack: number }>;
      evolution: string | null;
    }
    const deadPlayers: DeadPlayer[] = [];
    const allDead: Array<{ x: number; y: number; mass: number; color: string; level: number; eatenWhole: boolean }> = [];
    // Personal "you ate/killed X" toasts for the (human) killer of any dead fish — AI victims too.
    const killToasts: Array<{ killerId: number; kind: "ate" | "kill"; other: string; color: string; weaponId?: WeaponId }> = [];

    for (const f of world.fish.values()) {
      if (f.alive) continue;
      allDead.push({ x: f.x, y: f.y, mass: f.mass, color: f.color, level: f.level, eatenWhole: !!f.eatenWhole });
      if (f.killedById !== undefined) {
        // eatenWhole ⇒ "You ate X"; a recorded weapon ⇒ "You killed X with <weapon>"; else "You killed X".
        killToasts.push({
          killerId: f.killedById,
          kind: f.eatenWhole ? "ate" : "kill",
          other: f.name,
          color: f.color,
          weaponId: f.killedByWeaponId,
        });
      }
      if (!f.isAi && f.socketId) {
        // Disconnects don't credit a nearby fish; the toast on other clients
        // keys "left" off byName === "the void". This also closes the
        // rage-quit-feeds-your-friend exploit.
        const isDisconnect = playerSessions.get(f.id)?.disconnected ?? false;
        let killer: { name: string; mass: number } | null = null;
        if (!isDisconnect) {
          if (f.killedByName !== undefined) {
            // Killed by a weapon — credit the recorded shooter. The proximity
            // search below misses ranged kills (10x ESP, screen-wide aliens).
            killer = { name: f.killedByName, mass: f.killedByMass ?? 0 };
          } else {
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
          }
        }
        const EVOLUTION_IDS = new Set(["tidal", "puffer", "eel", "kraken", "school"]);
        const evolution = f.weapons.find((s) => EVOLUTION_IDS.has(s.id))?.id ?? null;
        deadPlayers.push({
          fishId: f.id,
          name: f.name,
          color: f.color,
          x: f.x,
          y: f.y,
          mass: f.mass,
          peakMass: f.peakMass,
          hits: f.hits,
          damage: f.damageDealt,
          level: f.level,
          kills: f.kills,
          spawnedAt: f.spawnedAt,
          killerName: killer?.name ?? "the void",
          killerMass: killer?.mass ?? 0,
          killerId: f.killedById,
          weaponId: f.killedByWeaponId,
          weapons: f.weapons.map((s) => ({ id: s.id, level: s.level })),
          passives: [...f.passives.entries()].map(([id, stack]) => ({ id, stack })),
          evolution,
        });
      }
    }

    // spawn death drops and remove all dead fish. Fish swallowed WHOLE drop nothing here — their
    // XP was already burped from the eater's mouth (see world.ts eat block). DAMAGE kills
    // (weapon/nibble) scatter the victim's XP as a swarm of collectable balls at the body
    // (World.spawnDeathDrops) — the killer gets no automatic XP, so anyone can contest the loot.
    for (const d of allDead) {
      if (d.eatenWhole) continue;
      world.spawnDeathDrops(d.x, d.y, d.mass, d.color, d.level, wallNow);
    }
    for (const [id, f] of world.fish) {
      if (!f.alive) world.removeFish(id);
    }

    // fishId → socket for this tick (alive players only). Killers are alive, so this resolves them
    // for the personal "You ate/killed X" toast and to exclude them from their own kill's death line.
    const wsByFish = new Map<number, Bun.ServerWebSocket<SocketData>>();
    for (const s of sockets.values()) if (s.data.fishId !== null) wsByFish.set(s.data.fishId, s);

    // notify dead players + persist score
    for (const dp of deadPlayers) {
      const ws = [...sockets.values()].find((s) => s.data.fishId === dp.fishId);
      const session = playerSessions.get(dp.fishId);
      playerSessions.delete(dp.fishId);

      // Broadcast playerDied to everyone except the dying socket (or to everyone
      // if the socket is already gone — disconnect case).
      // The killer (if a connected human) gets the personal "You killed/ate X" toast instead of the
      // third-person death line, so exclude them here as well as the dying socket.
      const killerWs = dp.killerId !== undefined ? wsByFish.get(dp.killerId) : undefined;
      const deathExclude = new Set<Bun.ServerWebSocket<SocketData>>();
      if (ws) deathExclude.add(ws);
      if (killerWs) deathExclude.add(killerWs);
      broadcast(
        {
          t: "playerDied",
          name: dp.name,
          color: dp.color,
          byName: dp.killerName,
          ...(dp.weaponId !== undefined ? { weaponId: dp.weaponId } : {}),
        } satisfies PlayerDiedMsg,
        deathExclude,
      );
      broadcastRoster();

      const startedAt = session?.startedAt ?? dp.spawnedAt;
      const ipH = session?.ipHash ?? "unknown";
      const durationMs = wallNow - startedAt;

      if (ws) {
        send(ws, {
          t: "eaten",
          byName: dp.killerName,
          byMass: dp.killerMass,
          finalMass: dp.mass,
          peakMass: dp.peakMass,
          finalLevel: dp.level,
          kills: dp.kills,
          hits: dp.hits,
          damage: dp.damage,
          durationMs,
          weapons: dp.weapons,
          passives: dp.passives,
          evolution: dp.evolution,
        } satisfies EatenMsg);
        ws.data.fishId = null;
        ws.data.isSpectator = true;
        ws.data.camX = dp.x;
        ws.data.camY = dp.y;
        // NB: do NOT reset ws.data.view here. The view's prevSent is the server's
        // model of what the client currently has rendered; the snapshot diff
        // (prevSent − seen → removed) relies on it carrying across mode changes.
        // Wiping it would silently strand any client-side entities outside the
        // next snapshot's seen set as never-removed ghosts.
      }

      writeScore({
        name: dp.name,
        color: dp.color,
        kills: dp.kills,
        peakMass: dp.peakMass,
        hits: dp.hits,
        damage: dp.damage,
        level: dp.level,
        durationMs,
        killedBy: dp.killerName,
        startedAt: new Date(startedAt),
        endedAt: new Date(wallNow),
        ipHash: ipH,
        weapons: dp.weapons,
        passives: dp.passives,
        evolution: dp.evolution,
      }).catch(() => {});

      if (ws) broadcastLeaderboard(ws).catch(() => {});
      else broadcastLeaderboard().catch(() => {});
    }

    // Personal kill/ate toasts to each (alive, human) killer.
    for (const kt of killToasts) {
      const kws = wsByFish.get(kt.killerId);
      if (!kws || kws.data.fishId !== kt.killerId) continue;
      send(kws, {
        t: "combatToast",
        kind: kt.kind,
        other: kt.other,
        color: kt.color,
        ...(kt.weaponId !== undefined ? { weaponId: kt.weaponId } : {}),
      } satisfies CombatToastMsg);
    }

    // Personal melee combat toasts: "You hit X" (attacker) / "You were bitten by X" (victim warning
    // from a genuine threat). Sent only to the player they're about; a recipient that died this tick
    // has a null fishId now and is skipped (their death is covered by playerDied).
    for (const ev of world.combatEvents) {
      const cws = wsByFish.get(ev.recipientId);
      if (!cws || cws.data.fishId !== ev.recipientId) continue;
      send(cws, {
        t: "combatToast",
        kind: ev.kind,
        other: ev.otherName,
        color: ev.otherColor,
      } satisfies CombatToastMsg);
    }
    world.combatEvents.length = 0;

    // level up handling — extracted so tests and prod use the same code path
    processLevelUps(world);

    // Dispatch level-up modals to players whose pendingLevelUp just populated
    // OR just rotated to the next queued pick.
    for (const ws of sockets.values()) {
      const fid = ws.data.fishId;
      if (fid === null) continue;
      const fish = world.fish.get(fid);
      if (!fish || !fish.alive) continue;
      if (fish.pendingLevelUp.length === 0) {
        ws.data.levelUpSentDrawId = null;
        continue;
      }
      if (ws.data.levelUpSentDrawId === fish.pendingLevelUpDrawId) continue;
      const msg: LevelUpMsg = {
        t: "levelUp",
        level: fish.level,
        cards: fish.pendingLevelUp,
        queued: fish.queuedLevelUps,
        rerolls: fish.rerollsRemaining,
        banishes: fish.banishesRemaining,
      };
      send(ws, msg);
      ws.data.levelUpSentDrawId = fish.pendingLevelUpDrawId;
    }

    // Rebuild spatial hashes against end-of-tick state (this-tick projectiles fired,
    // death-chunks spawned, dead fish removed) so the per-socket interest queries in
    // buildSnapshot see fresh, correct entities rather than the stale mid-step hash.
    world.rebuildSpatialHashes();

    // Wall-clock cost of this tick's sim body (everything above — step + dead-fish +
    // level-ups + hash rebuild — excluding the broadcast below). Shipped to clients via
    // SnapshotMsg.serverTickMs for the F3 network panel.
    const tickMs = performance.now() - tickStart;

    // send snapshots
    for (const ws of sockets.values()) {
      const fid = ws.data.fishId;
      if (fid !== null) {
        const fish = world.fish.get(fid);
        if (!fish) continue;
        const snap = buildSnapshot(world, fish, ws.data.view, wallNow, tickMs);
        send(ws, snap);
      } else if (ws.data.isSpectator) {
        const snap = buildSpectatorSnapshot(world, ws.data.view, wallNow, tickMs);
        send(ws, snap);
      }
    }

    // periodic roster broadcast (~2Hz) as a backup for mass/level updates.
    // Join/death events also push an immediate roster — see broadcastRoster() above.
    if (world.tick % 10 === 0) broadcastRoster();

    // clear removed buffer + hit/zap/swallow events now that all snapshots have been built
    world.removedIds.length = 0;
    world.hitEvents.length = 0;
    world.zapEvents.length = 0;
    world.swallowEvents.length = 0;
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
          data: { id, ip, fishId: null, view: new ClientView(), startedAt: 0, name: "", color: "", species: DEFAULT_SPECIES_ID, levelUpSentDrawId: null, isSpectator: false, camX: ARENA.width / 2, camY: ARENA.height / 2 },
        });
        if (ok) return undefined;
        return new Response("Upgrade failed", { status: 500 });
      }
      if (url.pathname === "/leaderboard") {
        const sortParam = url.searchParams.get("sort");
        const valid = ["kills", "mass", "hits", "damage", "level", "time"] as const;
        const sort = (valid as readonly string[]).includes(sortParam ?? "") ? (sortParam as LeaderboardSort) : "kills";
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
        world.humansPresent = true;
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
          const species = sanitizeSpecies(msg.species);
          const fish = world.spawnPlayer(name, color, ws.data.id, species);
          ws.data.fishId = fish.id;
          ws.data.startedAt = now;
          ws.data.name = name;
          ws.data.color = color;
          ws.data.species = species;
          claimNameForHuman(name);
          playerSessions.set(fish.id, { startedAt: now, ipHash: ipHash(ws.data.ip), disconnected: false });
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
          if (msg.x !== undefined && msg.y !== undefined) {
            // Client-authoritative kinematics: trust the reported position/velocity/heading.
            world.applyClientState(
              fish,
              {
                x: msg.x,
                y: msg.y,
                vx: msg.pvx ?? 0,
                vy: msg.pvy ?? 0,
                hx: msg.hx ?? fish.headingX,
                hy: msg.hy ?? fish.headingY,
              },
              msg.boost,
              now,
            );
          } else {
            // Legacy intent path (AI-driven cucumber tests / older clients).
            const mag = Math.hypot(msg.vx, msg.vy);
            let nx = msg.vx;
            let ny = msg.vy;
            if (mag > 1) { nx /= mag; ny /= mag; }
            world.applyInput(fish, nx, ny, msg.boost, now);
          }
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
            ws.data.levelUpSentDrawId = null;
          }
        } else if (msg.t === "rerollCard") {
          const fid = ws.data.fishId;
          if (fid === null) return;
          const fish = world.fish.get(fid);
          if (!fish || !fish.alive) return;
          if (fish.pendingLevelUp.length === 0) return;
          // On success the draw id changed; clear the gate so the dispatch loop
          // re-emits LevelUpMsg with the swapped card.
          if (rerollCard(world, fish, msg.cardId)) ws.data.levelUpSentDrawId = null;
        } else if (msg.t === "banishCard") {
          const fid = ws.data.fishId;
          if (fid === null) return;
          const fish = world.fish.get(fid);
          if (!fish || !fish.alive) return;
          if (fish.pendingLevelUp.length === 0) return;
          if (banishCard(world, fish, msg.cardId)) ws.data.levelUpSentDrawId = null;
        } else if (msg.t === "weaponHit") {
          const fid = ws.data.fishId;
          if (fid === null) return;
          const fish = world.fish.get(fid);
          if (!fish || !fish.alive) return;
          // Honor the client-reported hit (deduped against server detection via the
          // projectile's re-hit gate). Records a HitEvent broadcast in the next snapshot.
          applyClientWeaponHit(world, fish, msg.projectileId, msg.targetId, now);
        } else if (msg.t === "discardWeapon") {
          const fid = ws.data.fishId;
          if (fid === null) return;
          const fish = world.fish.get(fid);
          if (!fish) return;
          discardWeapon(world, fish, msg.weaponId);
        } else if (msg.t === "discardPassive") {
          const fid = ws.data.fishId;
          if (fid === null) return;
          const fish = world.fish.get(fid);
          if (!fish) return;
          discardPassive(world, fish, msg.passiveId);
        } else if (msg.t === "setLevelUpDismissed") {
          const fid = ws.data.fishId;
          if (fid === null) return;
          const fish = world.fish.get(fid);
          if (!fish || !fish.alive) return;
          // No-op when no modal is pending — guards against stale clients.
          if (fish.pendingLevelUp.length === 0) return;
          fish.levelUpDismissed = msg.dismissed;
        } else if (msg.t === "spectate") {
          // Spectator camera heartbeat. Allowed only when the socket has no live fish.
          if (ws.data.fishId !== null) {
            const f = world.fish.get(ws.data.fishId);
            if (f && f.alive) return;
          }
          ws.data.isSpectator = true;
          ws.data.camX = msg.camX;
          ws.data.camY = msg.camY;
        } else if (msg.t === "respawn") {
          // Reuse the socket: spin up a fresh fish without dropping the connection.
          if (ws.data.fishId !== null) {
            const f = world.fish.get(ws.data.fishId);
            if (f && f.alive) return;
          }
          const name = sanitizeName(msg.name ?? ws.data.name ?? "Fish");
          const color = sanitizeColor(msg.color ?? ws.data.color ?? "#7fcfff");
          const species = sanitizeSpecies(msg.species ?? ws.data.species);
          const fish = world.spawnPlayer(name, color, ws.data.id, species);
          ws.data.fishId = fish.id;
          ws.data.startedAt = now;
          ws.data.name = name;
          ws.data.color = color;
          ws.data.species = species;
          ws.data.isSpectator = false;
          ws.data.levelUpSentDrawId = null;
          claimNameForHuman(name);
          playerSessions.set(fish.id, { startedAt: now, ipHash: ipHash(ws.data.ip), disconnected: false });
          send(ws, {
            t: "welcome",
            selfId: fish.id,
            arena: { width: ARENA.width, height: ARENA.height },
            tickHz: TICK.hz,
          });
          broadcast({ t: "playerJoined", name, color } satisfies PlayerJoinedMsg, ws);
          broadcastRoster();
        } else if (msg.t === "identity") {
          const fid = ws.data.fishId;
          if (fid === null) return;
          const fish = world.fish.get(fid);
          if (!fish || !fish.alive) return;
          let changed = false;
          if (msg.name !== undefined) {
            const name = sanitizeName(msg.name);
            if (name !== fish.name) { fish.name = name; ws.data.name = name; changed = true; claimNameForHuman(name); }
          }
          if (msg.color !== undefined) {
            const color = sanitizeColor(msg.color);
            if (color !== fish.color) { fish.color = color; ws.data.color = color; changed = true; }
          }
          if (msg.species !== undefined) {
            const species = sanitizeSpecies(msg.species);
            if (species !== fish.species) { fish.species = species; ws.data.species = species; changed = true; }
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
        world.humansPresent = sockets.size > 0;
        const fid = ws.data.fishId;
        if (fid !== null) {
          const f = world.fish.get(fid);
          if (f && f.alive) {
            // Mark the session as disconnected BEFORE killing the fish so the
            // next tick's dead-player loop treats it as a "left" rather than
            // an in-arena death, and still persists the ScoreDoc using the
            // session's startedAt / ipHash (ws is about to be unreachable).
            const session = playerSessions.get(fid);
            if (session) session.disconnected = true;
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
