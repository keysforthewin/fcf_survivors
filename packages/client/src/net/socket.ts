import type {
  EatenMsg,
  HelloMsg,
  InputMsg,
  LeaderboardMsg,
  LevelUpMsg,
  PlayerJoinedMsg,
  PlayerDiedMsg,
  PlayerBittenMsg,
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
  | PlayerBittenMsg
  | RosterMsg;

type Handler<T extends ServerMsg> = (msg: T) => void;

export class NetSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private seq = 0;
  private handlers: { [K in ServerMsg["t"]]?: Handler<Extract<ServerMsg, { t: K }>> } = {};
  private openHandlers: Array<() => void> = [];
  private closeHandlers: Array<() => void> = [];
  /** Optional raw-message tap for bandwidth accounting: char length of the frame + message type. */
  onRawMessage: ((byteLen: number, t: string) => void) | null = null;

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
        this.onRawMessage?.(evt.data.length, parsed.t);
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

  send(
    obj:
      | HelloMsg
      | InputMsg
      | { t: "pickCard"; cardId: string }
      | { t: "identity"; name?: string; color?: string; species?: string }
      | { t: "spectate"; camX: number; camY: number }
      | { t: "respawn"; name?: string; color?: string; species?: string }
      | { t: "discardWeapon"; weaponId: string }
      | { t: "discardPassive"; passiveId: string }
      | { t: "setLevelUpDismissed"; dismissed: boolean }
      | { t: "rerollCard"; cardId: string }
      | { t: "banishCard"; cardId: string }
      | { t: "weaponHit"; projectileId: number; targetId: number }
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(obj));
  }

  hello(name: string, color: string, species?: string): void {
    this.send({ t: "hello", name, color, species });
  }

  identity(name?: string, color?: string, species?: string): void {
    this.send({ t: "identity", name, color, species });
  }

  /**
   * Send an input and return the seq it was tagged with (used for the F3 RTT gauge).
   * `auth` carries the client-authoritative kinematics; when present the server writes
   * them straight onto the fish instead of integrating from the vx/vy intent.
   */
  input(
    vx: number,
    vy: number,
    boost: boolean,
    auth?: { x: number; y: number; pvx: number; pvy: number; hx: number; hy: number },
  ): number {
    this.seq++;
    this.send({ t: "input", seq: this.seq, vx, vy, boost, ...(auth ?? {}) });
    return this.seq;
  }

  spectate(camX: number, camY: number): void {
    this.send({ t: "spectate", camX, camY });
  }

  respawn(name?: string, color?: string, species?: string): void {
    this.send({ t: "respawn", name, color, species });
  }

  discardWeapon(weaponId: string): void {
    this.send({ t: "discardWeapon", weaponId });
  }

  discardPassive(passiveId: string): void {
    this.send({ t: "discardPassive", passiveId });
  }

  setLevelUpDismissed(dismissed: boolean): void {
    this.send({ t: "setLevelUpDismissed", dismissed });
  }

  rerollCard(cardId: string): void {
    this.send({ t: "rerollCard", cardId });
  }

  banishCard(cardId: string): void {
    this.send({ t: "banishCard", cardId });
  }

  /** Report that one of our own projectiles visually hit an enemy fish (client-authoritative hit). */
  weaponHit(projectileId: number, targetId: number): void {
    this.send({ t: "weaponHit", projectileId, targetId });
  }

  isOpen(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
