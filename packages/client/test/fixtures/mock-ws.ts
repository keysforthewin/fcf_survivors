import type { Page } from "@playwright/test";

/**
 * Injects a fake WebSocket constructor into the page BEFORE any module loads,
 * along with a `window.__test` API for scenarios to drive the client:
 *
 *   window.__test.welcome()           — emit a welcome message
 *   window.__test.snapshot({...})     — emit a snapshot (sensible defaults)
 *   window.__test.eaten({...})        — emit an eaten message
 *   window.__test.leaderboard([...])  — emit a leaderboard
 *   window.__test.sent                — every payload the client has sent
 *   window.__test.lastInput           — most recent input message
 *   window.__test.lastHello           — the hello message
 */
export async function installMockWebSocket(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const __test: any = {
      sent: [] as any[],
      instances: [] as any[],
      lastInput: null,
      lastHello: null,
      autoWelcome: true,
    };
    (window as any).__test = __test;

    const emit = (instance: any, msg: any): void => {
      const evt = new MessageEvent("message", { data: JSON.stringify(msg) });
      if (instance.onmessage) instance.onmessage(evt);
      instance.dispatchEvent(evt);
    };
    __test.emit = emit;
    __test.emitAll = (msg: any): void => {
      for (const inst of __test.instances) emit(inst, msg);
    };
    __test.welcome = (
      selfId = 1,
      arena = { width: 8000, height: 8000 },
      tickHz = 20
    ): void => {
      __test.emitAll({ t: "welcome", selfId, arena, tickHz });
    };
    __test.snapshot = (payload: Partial<any> = {}): void => {
      const you = {
        x: 4000,
        y: 4000,
        mass: 10,
        hp: 20,
        maxHp: 20,
        xp: 0,
        level: 1,
        nextLevelXp: 13,
        boostReadyAt: 0,
        serverNow: Date.now(),
        ...(payload.you ?? {}),
      };
      const base = {
        t: "snapshot",
        tick: 1,
        ackSeq: 0,
        entities: [],
        removed: [],
        ...payload,
        you,
      };
      __test.emitAll(base);
    };
    __test.eaten = (payload: Partial<any> = {}): void => {
      const base = {
        t: "eaten",
        byName: "Megafish",
        byMass: 100,
        finalMass: 50,
        finalLevel: 3,
        kills: 2,
        durationMs: 60_000,
        ...payload,
      };
      __test.emitAll(base);
    };
    __test.leaderboard = (top: any[] = []): void => {
      __test.emitAll({ t: "leaderboard", top });
    };

    class MockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      CONNECTING = 0;
      OPEN = 1;
      CLOSING = 2;
      CLOSED = 3;
      readyState = 0;
      url: string;
      onopen: ((e: any) => void) | null = null;
      onclose: ((e: any) => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      onmessage: ((e: any) => void) | null = null;

      constructor(url: string) {
        super();
        this.url = url;
        __test.instances.push(this);
        setTimeout(() => {
          this.readyState = 1;
          const e = new Event("open");
          if (this.onopen) this.onopen(e);
          this.dispatchEvent(e);
        }, 0);
      }

      send(data: string): void {
        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          return;
        }
        __test.sent.push(parsed);
        if (parsed.t === "input") __test.lastInput = parsed;
        if (parsed.t === "hello") {
          __test.lastHello = parsed;
          if (__test.autoWelcome) {
            setTimeout(() => __test.welcome(1), 5);
          }
        }
      }

      close(): void {
        this.readyState = 3;
        const e = new Event("close");
        if (this.onclose) this.onclose(e);
        this.dispatchEvent(e);
      }
    }
    (window as any).WebSocket = MockWebSocket;
  });
}
