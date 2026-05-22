import type {
  EatenMsg,
  HelloMsg,
  InputMsg,
  LeaderboardMsg,
  LevelUpMsg,
  PlayerJoinedMsg,
  PlayerDiedMsg,
  RosterMsg,
  SnapshotMsg,
  WelcomeMsg,
} from "@fcf/shared";

type ServerMsg =
  | WelcomeMsg
  | SnapshotMsg
  | LevelUpMsg
  | EatenMsg
  | LeaderboardMsg
  | PlayerJoinedMsg
  | PlayerDiedMsg
  | RosterMsg;

type Handler<T extends ServerMsg> = (msg: T) => void;

export class NetSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private seq = 0;
  private handlers: { [K in ServerMsg["t"]]?: Handler<Extract<ServerMsg, { t: K }>> } = {};
  private openHandlers: Array<() => void> = [];
  private closeHandlers: Array<() => void> = [];

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.addEventListener("open", () => {
        this.openHandlers.forEach((h) => h());
        resolve();
      });
      ws.addEventListener("close", () => {
        this.closeHandlers.forEach((h) => h());
      });
      ws.addEventListener("error", (e) => {
        console.error("[ws] error", e);
        reject(e);
      });
      ws.addEventListener("message", (evt) => {
        if (typeof evt.data !== "string") return;
        let parsed: ServerMsg;
        try {
          parsed = JSON.parse(evt.data);
        } catch {
          return;
        }
        const h = this.handlers[parsed.t] as Handler<ServerMsg> | undefined;
        if (h) h(parsed);
      });
    });
  }

  on<K extends ServerMsg["t"]>(t: K, fn: Handler<Extract<ServerMsg, { t: K }>>): void {
    this.handlers[t] = fn as any;
  }

  onClose(fn: () => void): void { this.closeHandlers.push(fn); }
  onOpen(fn: () => void): void { this.openHandlers.push(fn); }

  send(obj: HelloMsg | InputMsg | { t: "pickCard"; cardId: string } | { t: "identity"; name?: string; color?: string }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(obj));
  }

  hello(name: string, color: string): void {
    this.send({ t: "hello", name, color });
  }

  identity(name?: string, color?: string): void {
    this.send({ t: "identity", name, color });
  }

  input(vx: number, vy: number, boost: boolean): void {
    this.seq++;
    this.send({ t: "input", seq: this.seq, vx, vy, boost });
  }
}
