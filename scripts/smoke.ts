// End-to-end smoke test: connect via websocket, play for a few seconds,
// verify snapshots arrive and the fish moves + gains mass from pellets.

const WS_URL = process.env.WS_URL ?? "ws://localhost:4000/ws";

interface Snapshot {
  t: "snapshot";
  tick: number;
  you: { x: number; y: number; mass: number; hp: number; level: number };
  entities: any[];
  removed: number[];
}

interface Welcome {
  t: "welcome";
  selfId: number;
  arena: { width: number; height: number };
  tickHz: number;
}

const ws = new WebSocket(WS_URL);
let welcome: Welcome | null = null;
let firstSnap: Snapshot | null = null;
let lastSnap: Snapshot | null = null;
let snapCount = 0;
let entityKindsSeen = new Set<string>();
let saw = { fish: false, pellet: false, ai: 0, otherPlayers: 0 };

ws.addEventListener("open", () => {
  console.log("[smoke] socket open");
  ws.send(JSON.stringify({ t: "hello", name: "TestyBot", color: "#ff85a1" }));
});

ws.addEventListener("message", (evt) => {
  const data = typeof evt.data === "string" ? evt.data : new TextDecoder().decode(evt.data as ArrayBuffer);
  const msg = JSON.parse(data);
  if (msg.t === "welcome") {
    welcome = msg;
    console.log(`[smoke] welcome selfId=${msg.selfId} arena=${msg.arena.width}x${msg.arena.height} tick=${msg.tickHz}Hz`);
  } else if (msg.t === "snapshot") {
    snapCount++;
    if (!firstSnap) firstSnap = msg;
    lastSnap = msg;
    for (const e of msg.entities) {
      entityKindsSeen.add(e.kind);
      if (e.kind === "fish") {
        if (e.isAi === true) saw.ai++;
        else if (e.isAi === false) saw.otherPlayers++;
      }
    }
  } else if (msg.t === "leaderboard") {
    console.log(`[smoke] leaderboard rows=${msg.top.length}`);
  }
});

ws.addEventListener("error", (e) => {
  console.error("[smoke] socket error", e);
});

// drive movement: spiral pattern
let seq = 0;
const sendInput = () => {
  if (ws.readyState !== WebSocket.OPEN) return;
  const t = seq * 0.05;
  const vx = Math.cos(t);
  const vy = Math.sin(t);
  ws.send(JSON.stringify({ t: "input", seq, vx, vy, boost: false }));
  seq++;
};
const inputTimer = setInterval(sendInput, 50);

// run for 5 seconds, then summarize
setTimeout(() => {
  clearInterval(inputTimer);
  ws.close();

  const ok = (cond: boolean, label: string) => {
    console.log(`${cond ? "✓" : "✗"} ${label}`);
    return cond;
  };

  let pass = true;
  pass = ok(!!welcome, "welcome message received") && pass;
  pass = ok(snapCount > 50, `received ${snapCount} snapshots (>50)`) && pass;
  pass = ok(!!firstSnap && !!lastSnap, "snapshots have data") && pass;
  if (firstSnap && lastSnap) {
    const dx = lastSnap.you.x - firstSnap.you.x;
    const dy = lastSnap.you.y - firstSnap.you.y;
    const moved = Math.hypot(dx, dy);
    pass = ok(moved > 100, `fish moved ${moved.toFixed(1)} units (>100)`) && pass;
    const massGain = lastSnap.you.mass - firstSnap.you.mass;
    pass = ok(massGain > 0, `mass grew by ${massGain.toFixed(1)} (>0, ate pellets)`) && pass;
  }
  pass = ok(entityKindsSeen.has("pellet"), `saw pellets`) && pass;
  pass = ok(entityKindsSeen.has("fish"), `saw other fish`) && pass;
  pass = ok(saw.ai > 0, `saw ${saw.ai} AI fish entity-updates`) && pass;

  console.log(pass ? "\n✓ SMOKE PASS" : "\n✗ SMOKE FAIL");
  process.exit(pass ? 0 : 1);
}, 6000);
