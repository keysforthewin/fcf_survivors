/** Tiny WebSocket client for protocol/transport BDD scenarios. */

export interface TestClient {
  messages: any[];
  connect(): Promise<void>;
  send(msg: unknown): void;
  hello(name: string, color: string): void;
  input(seq: number, vx: number, vy: number, boost: boolean): void;
  pickCard(cardId: string): void;
  /** Send a raw payload that bypasses the protocol shape (for malformed-message tests). */
  sendRaw(raw: string): void;
  /** Wait for the next message matching the predicate; rejects on timeout. */
  wait<T = any>(pred: (msg: any) => boolean, timeoutMs?: number): Promise<T>;
  close(): void;
}

export function testClient(url: string): TestClient {
  let ws: WebSocket | null = null;
  const messages: any[] = [];
  const waiters: Array<{ pred: (m: any) => boolean; resolve: (m: any) => void; timer: ReturnType<typeof setTimeout> }> = [];

  const handle = {
    messages,
    async connect() {
      const sock = new WebSocket(url);
      ws = sock;
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("ws connect timeout")), 5000);
        sock.addEventListener("open", () => { clearTimeout(t); resolve(); }, { once: true });
        sock.addEventListener("error", (e) => { clearTimeout(t); reject(e instanceof Error ? e : new Error("ws error")); }, { once: true });
      });
      sock.addEventListener("message", (evt) => {
        if (typeof evt.data !== "string") return;
        let msg: any;
        try { msg = JSON.parse(evt.data); } catch { return; }
        messages.push(msg);
        for (let i = waiters.length - 1; i >= 0; i--) {
          const w = waiters[i]!;
          if (w.pred(msg)) {
            clearTimeout(w.timer);
            waiters.splice(i, 1);
            w.resolve(msg);
          }
        }
      });
    },
    send(msg) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify(msg));
    },
    sendRaw(raw) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(raw);
    },
    hello(name, color) { handle.send({ t: "hello", name, color }); },
    input(seq, vx, vy, boost) { handle.send({ t: "input", seq, vx, vy, boost }); },
    pickCard(cardId) { handle.send({ t: "pickCard", cardId }); },
    wait(pred, timeoutMs = 3000) {
      return new Promise<any>((resolve, reject) => {
        const existing = messages.find(pred);
        if (existing) return resolve(existing);
        const timer = setTimeout(() => {
          const idx = waiters.findIndex((w) => w.timer === timer);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(new Error(`wait timeout (${timeoutMs}ms). Saw: ${messages.map((m) => m?.t).join(", ") || "<nothing>"}`));
        }, timeoutMs);
        waiters.push({ pred, resolve, timer });
      });
    },
    close() {
      if (ws) {
        try { ws.close(); } catch {}
      }
    },
  } satisfies TestClient;
  return handle;
}
