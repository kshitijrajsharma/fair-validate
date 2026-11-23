const DRAG_TO_ANSWER = 60;
const HOLD_MS = 300;
const WHEEL_STEP = 40;
const WHEEL_QUIET_MS = 200;

type GestureHandlers = {
  busy: () => boolean;
  lean: (dx: number, dy: number) => void;
  settle: () => void;
  hold: (holding: boolean) => void;
  answer: (valid: boolean) => void;
  move: (step: 1 | -1) => void;
};

export function bindGestures(
  screen: HTMLElement,
  tileBox: HTMLElement,
  on: GestureHandlers,
): () => void {
  let start: { x: number; y: number } | undefined;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let holding = false;

  screen.addEventListener("pointerdown", (event) => {
    if (on.busy() || (event.target as HTMLElement).closest("button, a")) return;
    start = { x: event.clientX, y: event.clientY };
    tileBox.style.transition = "none";
    holdTimer = setTimeout(() => {
      holding = true;
      on.hold(true);
    }, HOLD_MS);
  });

  screen.addEventListener("pointermove", (event) => {
    if (!start || holding || on.busy()) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 8) clearTimeout(holdTimer);
    on.lean(dx, dy);
  });

  const release = (event: PointerEvent) => {
    clearTimeout(holdTimer);
    if (holding) {
      holding = false;
      start = undefined;
      on.hold(false);
      return;
    }
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = undefined;
    tileBox.style.transition = "";
    if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_TO_ANSWER) {
      on.settle();
      return;
    }
    if (Math.abs(dx) >= Math.abs(dy)) on.answer(dx > 0);
    else on.move(dy < 0 ? 1 : -1);
  };
  screen.addEventListener("pointerup", release);
  screen.addEventListener("pointercancel", release);

  const keys: Record<string, () => void> = {
    ArrowRight: () => on.answer(true),
    ArrowLeft: () => on.answer(false),
    ArrowUp: () => on.move(1),
    ArrowDown: () => on.move(-1),
  };
  const onKey = (event: KeyboardEvent) => {
    if (keys[event.key]) {
      event.preventDefault();
      keys[event.key]();
    }
  };
  document.addEventListener("keydown", onKey);

  let wheel = 0;
  let lastWheel = 0;
  let moved = false;
  screen.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey || screen.classList.contains("ended")) return;
      // One flick sends a stream of momentum events; a quiet gap ends the gesture.
      if (event.timeStamp - lastWheel > WHEEL_QUIET_MS) {
        wheel = 0;
        moved = false;
      }
      lastWheel = event.timeStamp;
      wheel +=
        event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
          ? event.deltaY
          : Math.sign(event.deltaY) * WHEEL_STEP;
      if (moved || on.busy() || Math.abs(wheel) < WHEEL_STEP) return;
      moved = true;
      on.move(wheel > 0 ? 1 : -1);
    },
    { passive: true },
  );
  return () => document.removeEventListener("keydown", onKey);
}
