import { Application } from "pixi.js";
import { NetSocket } from "./net/socket.ts";
import { showTitle } from "./scenes/title.ts";
import { showDeath } from "./scenes/death.ts";
import { ArenaScene } from "./scenes/arena.ts";
import { loadIdentity, saveIdentity } from "./identity.ts";
import type { LeaderboardEntry } from "@fcf/shared";

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

  let lastLeaderboard: LeaderboardEntry[] = [];

  // outer game loop: title → arena → death → repeat
  let prefill: { name?: string; color?: string } = loadIdentity();
  while (true) {
    const choice = await showTitle(prefill);
    prefill = { name: choice.name, color: choice.color };
    saveIdentity(prefill);
    (window as any).__playerName = choice.name;
    (window as any).__playerColor = choice.color;

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = import.meta.env.DEV
      ? `${proto}//${location.hostname}:4000/ws`
      : `${proto}//${location.host}${import.meta.env.BASE_URL}ws`;
    const net = new NetSocket(wsUrl);
    try {
      await net.connect();
    } catch (e) {
      alert("Could not connect to game server. Is it running?");
      continue;
    }
    net.hello(choice.name, choice.color);

    let deathMsg: any = null;
    const arena = new ArenaScene(app, net, {
      onDeath(msg) { deathMsg = msg; },
      onLeaderboard(msg) { lastLeaderboard = msg.top; },
    });

    // wait for death (or socket close)
    await new Promise<void>((resolve) => {
      const check = () => {
        if (deathMsg) resolve();
        else requestAnimationFrame(check);
      };
      net.onClose(() => {
        if (!deathMsg) {
          deathMsg = {
            t: "eaten",
            byName: "disconnect",
            byMass: 0,
            finalMass: 0,
            finalLevel: 1,
            kills: 0,
            durationMs: 0,
            weapons: [],
            passives: [],
            evolution: null,
          };
        }
        resolve();
      });
      check();
    });

    arena.destroy();
    await showDeath(deathMsg, lastLeaderboard);
    // Pick up any identity edits made on the death screen so the next dive prefills them.
    prefill = loadIdentity();
  }
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#fff;padding:2rem">Fatal: ${err?.message ?? err}</pre>`;
});
