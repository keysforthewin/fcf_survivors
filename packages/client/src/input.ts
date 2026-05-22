export interface InputState {
  vx: number;
  vy: number;
  boost: boolean;
}

export interface InputController {
  state: InputState;
  teardown(): void;
}

const TOUCH_RADIUS = 56;             // visual joystick radius
const TOUCH_DEAD_ZONE = 8;            // px of slop before motion kicks in

export function createInput(): InputController {
  const keys = new Set<string>();
  const state: InputState = { vx: 0, vy: 0, boost: false };

  // --- keyboard ---
  const recompute = () => {
    let vx = 0;
    let vy = 0;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) vx -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD")) vx += 1;
    if (keys.has("ArrowUp") || keys.has("KeyW")) vy -= 1;
    if (keys.has("ArrowDown") || keys.has("KeyS")) vy += 1;
    const m = Math.hypot(vx, vy);
    if (m > 1) { vx /= m; vy /= m; }
    // Touch joystick overrides keyboard when active.
    if (touchActive) return;
    state.vx = vx;
    state.vy = vy;
    state.boost = keys.has("Space") || touchBoostHeld;
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
    touchBoostHeld = false;
    recompute();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  // --- touch ---
  let touchActive = false;
  let touchBoostHeld = false;
  let stickRoot: HTMLElement | null = null;
  let stickThumb: HTMLElement | null = null;
  let boostBtn: HTMLButtonElement | null = null;
  let activeStickPointerId: number | null = null;
  let activeBoostPointerId: number | null = null;
  let stickCenterX = 0;
  let stickCenterY = 0;

  const supportsTouch = ("ontouchstart" in window) || ((navigator as any).maxTouchPoints ?? 0) > 0;
  if (supportsTouch) mountTouchUi();

  function mountTouchUi() {
    stickRoot = document.createElement("div");
    stickRoot.className = "touch-stick";
    stickRoot.innerHTML = `<div class="touch-stick-thumb"></div>`;
    stickThumb = stickRoot.querySelector(".touch-stick-thumb") as HTMLElement;
    document.body.appendChild(stickRoot);

    boostBtn = document.createElement("button");
    boostBtn.type = "button";
    boostBtn.className = "touch-boost";
    boostBtn.textContent = "BOOST";
    document.body.appendChild(boostBtn);

    // Joystick handlers
    stickRoot.addEventListener("pointerdown", onStickDown);
    window.addEventListener("pointermove", onStickMove);
    window.addEventListener("pointerup", onStickUp);
    window.addEventListener("pointercancel", onStickUp);

    // Boost handlers
    boostBtn.addEventListener("pointerdown", onBoostDown);
    boostBtn.addEventListener("pointerup", onBoostUp);
    boostBtn.addEventListener("pointercancel", onBoostUp);
    boostBtn.addEventListener("pointerleave", onBoostUp);
  }

  function onStickDown(e: PointerEvent): void {
    if (activeStickPointerId !== null) return;
    activeStickPointerId = e.pointerId;
    touchActive = true;
    const rect = stickRoot!.getBoundingClientRect();
    stickCenterX = rect.left + rect.width / 2;
    stickCenterY = rect.top + rect.height / 2;
    updateStick(e.clientX, e.clientY);
    e.preventDefault();
  }

  function onStickMove(e: PointerEvent): void {
    if (e.pointerId !== activeStickPointerId) return;
    updateStick(e.clientX, e.clientY);
    e.preventDefault();
  }

  function onStickUp(e: PointerEvent): void {
    if (e.pointerId !== activeStickPointerId) return;
    activeStickPointerId = null;
    touchActive = false;
    state.vx = 0;
    state.vy = 0;
    if (stickThumb) {
      stickThumb.style.transform = "translate(-50%, -50%)";
    }
    // make sure keyboard state takes over again
    recompute();
  }

  function updateStick(clientX: number, clientY: number): void {
    const dx = clientX - stickCenterX;
    const dy = clientY - stickCenterY;
    const dist = Math.hypot(dx, dy);
    const cap = TOUCH_RADIUS - 6;
    let nx = dist === 0 ? 0 : dx / dist;
    let ny = dist === 0 ? 0 : dy / dist;
    const drawDist = Math.min(dist, cap);
    if (stickThumb) {
      stickThumb.style.transform = `translate(calc(-50% + ${nx * drawDist}px), calc(-50% + ${ny * drawDist}px))`;
    }
    if (dist < TOUCH_DEAD_ZONE) {
      state.vx = 0;
      state.vy = 0;
    } else {
      const mag = Math.min(1, dist / cap);
      state.vx = nx * mag;
      state.vy = ny * mag;
    }
    state.boost = touchBoostHeld;
  }

  function onBoostDown(e: PointerEvent): void {
    if (activeBoostPointerId !== null) return;
    activeBoostPointerId = e.pointerId;
    touchBoostHeld = true;
    state.boost = true;
    boostBtn?.classList.add("pressed");
    e.preventDefault();
  }

  function onBoostUp(e: PointerEvent): void {
    if (activeBoostPointerId !== null && e.pointerId !== activeBoostPointerId) return;
    activeBoostPointerId = null;
    touchBoostHeld = false;
    state.boost = keys.has("Space");
    boostBtn?.classList.remove("pressed");
  }

  return {
    state,
    teardown() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (stickRoot) {
        stickRoot.removeEventListener("pointerdown", onStickDown);
        stickRoot.remove();
      }
      if (boostBtn) boostBtn.remove();
      window.removeEventListener("pointermove", onStickMove);
      window.removeEventListener("pointerup", onStickUp);
      window.removeEventListener("pointercancel", onStickUp);
    },
  };
}
