import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import { Application } from "pixi.js";
import { NetSocket } from "./net/socket.ts";
import { showTitle } from "./scenes/title.ts";
import { showDeath } from "./scenes/death.ts";
import { ArenaScene } from "./scenes/arena.ts";
import { loadIdentity, saveIdentity } from "./identity.ts";
import { preloadFishTextures } from "./render/species-textures.ts";
import { DEFAULT_SPECIES_ID, type EatenMsg, type LeaderboardEntry, type WelcomeMsg } from "@fcf/shared";

async function main() {
  const root = document.getElementById("game-root")!;
  const app = new Application();
  await app.init({
    background: 0x06121c,
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  root.appendChild(app.canvas);

  // Warm the photo-real fish textures before the title/arena so sprites render immediately.
  await preloadFishTextures();

  let lastLeaderboard: LeaderboardEntry[] = [];

  // Initial title pass to pick name + species.
  const saved = loadIdentity();
  const choice = await showTitle(saved);
  const species = choice.species ?? saved.species ?? DEFAULT_SPECIES_ID;
  const identity = { name: choice.name, color: choice.color, species };
  saveIdentity(identity);
  (window as any).__playerName = choice.name;
  (window as any).__playerColor = choice.color;
  (window as any).__playerSpecies = species;

  // One persistent websocket spans every dive — respawn reuses it instead of
  // dropping the connection. This is what makes "death overlay over live game"
  // and the spectator camera feasible.
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = import.meta.env.DEV
    ? `${proto}//${location.hostname}:4000/ws`
    : `${proto}//${location.host}${import.meta.env.BASE_URL}ws`;
  const net = new NetSocket(wsUrl);
  try {
    await net.connect();
  } catch {
    alert("Could not connect to game server. Is it running?");
    return;
  }
  net.hello(choice.name, choice.color, species);

  let pendingDeath: EatenMsg | null = null;
  let deathListeners: Array<(msg: EatenMsg) => void> = [];
  let socketDead = false;

  let pendingWelcome: WelcomeMsg | null = null;
  let welcomeListeners: Array<(msg: WelcomeMsg) => void> = [];
  const arena = new ArenaScene(app, net, {
    onDeath(msg) {
      pendingDeath = msg;
      for (const l of deathListeners) l(msg);
    },
    onLeaderboard(msg) { lastLeaderboard = msg.top; },
    onWelcome(msg) {
      pendingWelcome = msg;
      const ls = welcomeListeners;
      welcomeListeners = [];
      for (const l of ls) l(msg);
    },
  });

  net.onClose(() => {
    socketDead = true;
    if (!pendingDeath) {
      const synthetic: EatenMsg = {
        t: "eaten",
        byName: "disconnect",
        byMass: 0,
        finalMass: 0,
        peakMass: 0,
        finalLevel: 1,
        kills: 0,
        hits: 0,
        damage: 0,
        durationMs: 0,
        weapons: [],
        passives: [],
        evolution: null,
      };
      pendingDeath = synthetic;
      for (const l of deathListeners) l(synthetic);
    }
  });

  function waitForDeath(): Promise<EatenMsg> {
    return new Promise((resolve) => {
      if (pendingDeath) { resolve(pendingDeath); return; }
      const l = (msg: EatenMsg) => {
        deathListeners = deathListeners.filter((x) => x !== l);
        resolve(msg);
      };
      deathListeners.push(l);
    });
  }

  function waitForWelcome(): Promise<WelcomeMsg> {
    return new Promise((resolve) => {
      pendingWelcome = null;
      welcomeListeners.push((msg) => resolve(msg));
    });
  }

  while (true) {
    const eaten = await waitForDeath();
    pendingDeath = null;
    if (socketDead) {
      alert("Connection lost. Reload to dive again.");
      return;
    }

    // Death overlay sits on top of the live arena. The arena auto-entered
    // spectator mode from its `eaten` handler so snapshots keep arriving.
    arena.hideSpectatorHud(); // make sure no leftover spectator HUD is visible

    const intent = await showDeath(eaten, lastLeaderboard);

    if (intent === "spectate") {
      // Show spectator controls and wait for the user to click DIVE AGAIN there.
      arena.showSpectatorHud();
      await new Promise<void>((resolve) => {
        arena.onSpectatorDive(() => resolve());
      });
      arena.hideSpectatorHud();
    }

    // DIVE AGAIN — reuse the existing socket and identity.
    const id = loadIdentity();
    arena.exitSpectatorMode();
    net.respawn(id.name, id.color, id.species);
    await waitForWelcome();
  }
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#fff;padding:2rem">Fatal: ${err?.message ?? err}</pre>`;
});
