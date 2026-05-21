export interface InputState {
  vx: number;
  vy: number;
  boost: boolean;
}

export interface InputController {
  state: InputState;
  teardown(): void;
}

export function createInput(): InputController {
  const keys = new Set<string>();
  const state: InputState = { vx: 0, vy: 0, boost: false };

  const recompute = () => {
    let vx = 0;
    let vy = 0;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) vx -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD")) vx += 1;
    if (keys.has("ArrowUp") || keys.has("KeyW")) vy -= 1;
    if (keys.has("ArrowDown") || keys.has("KeyS")) vy += 1;
    const m = Math.hypot(vx, vy);
    if (m > 1) { vx /= m; vy /= m; }
    state.vx = vx;
    state.vy = vy;
    state.boost = keys.has("Space");
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    recompute();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
    recompute();
  };
  const onBlur = () => {
    keys.clear();
    recompute();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  return {
    state,
    teardown() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    },
  };
}
