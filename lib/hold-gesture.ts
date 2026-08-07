// Pure, framework-independent timing logic for a press-and-hold gesture —
// kept separate from React/pointer-event wiring so it can be unit tested
// with fake timers without rendering a component or touching the DOM.

export const ADMIN_HOLD_DURATION_MS = 2000;
export const ADMIN_HOLD_PROGRESS_DELAY_MS = 1000;

export interface HoldGestureCallbacks {
  /** Fired once the hold has lasted progressDelayMs — show a subtle indicator. */
  onProgressStart: () => void;
  /** Fired when a hold that had started progress is cancelled or completes. */
  onProgressEnd: () => void;
  /** Fired once the hold has lasted the full durationMs. */
  onComplete: () => void;
}

export interface HoldGestureController {
  /** Call on pointerdown. */
  start: () => void;
  /** Call on pointerup / pointerleave / pointercancel. */
  cancel: () => void;
}

export function createHoldGestureController(
  callbacks: HoldGestureCallbacks,
  durationMs: number = ADMIN_HOLD_DURATION_MS,
  progressDelayMs: number = ADMIN_HOLD_PROGRESS_DELAY_MS
): HoldGestureController {
  let progressTimer: ReturnType<typeof setTimeout> | null = null;
  let completeTimer: ReturnType<typeof setTimeout> | null = null;
  let progressStarted = false;

  function clearTimers() {
    if (progressTimer) {
      clearTimeout(progressTimer);
      progressTimer = null;
    }
    if (completeTimer) {
      clearTimeout(completeTimer);
      completeTimer = null;
    }
  }

  function start() {
    clearTimers();
    progressStarted = false;
    progressTimer = setTimeout(() => {
      progressTimer = null;
      progressStarted = true;
      callbacks.onProgressStart();
    }, progressDelayMs);
    completeTimer = setTimeout(() => {
      clearTimers();
      progressStarted = false;
      callbacks.onComplete();
    }, durationMs);
  }

  function cancel() {
    const wasProgressing = progressStarted;
    clearTimers();
    progressStarted = false;
    if (wasProgressing) {
      callbacks.onProgressEnd();
    }
  }

  return { start, cancel };
}
