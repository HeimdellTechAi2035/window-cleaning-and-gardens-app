import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createHoldGestureController,
  ADMIN_HOLD_DURATION_MS,
  ADMIN_HOLD_PROGRESS_DELAY_MS,
} from "@/lib/hold-gesture";

function makeCallbacks() {
  return {
    onProgressStart: vi.fn(),
    onProgressEnd: vi.fn(),
    onComplete: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createHoldGestureController — press-and-hold admin entry gesture", () => {
  it("normal click (start immediately followed by cancel) does nothing", () => {
    const callbacks = makeCallbacks();
    const controller = createHoldGestureController(callbacks);

    controller.start();
    controller.cancel();
    vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);

    expect(callbacks.onComplete).not.toHaveBeenCalled();
    expect(callbacks.onProgressStart).not.toHaveBeenCalled();
  });

  it("short hold under the progress delay does nothing", () => {
    const callbacks = makeCallbacks();
    const controller = createHoldGestureController(callbacks);

    controller.start();
    vi.advanceTimersByTime(ADMIN_HOLD_PROGRESS_DELAY_MS - 200);
    controller.cancel();
    vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);

    expect(callbacks.onProgressStart).not.toHaveBeenCalled();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
    // Never entered the "progressing" state, so no need to signal its end.
    expect(callbacks.onProgressEnd).not.toHaveBeenCalled();
  });

  it("a full 2-second hold fires onComplete exactly once", () => {
    const callbacks = makeCallbacks();
    const controller = createHoldGestureController(callbacks);

    controller.start();
    vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);

    expect(callbacks.onProgressStart).toHaveBeenCalledTimes(1);
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);

    // Further time passing must not fire it again.
    vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
  });

  it("releasing early (after progress has started) cancels and never completes", () => {
    const callbacks = makeCallbacks();
    const controller = createHoldGestureController(callbacks);

    controller.start();
    vi.advanceTimersByTime(ADMIN_HOLD_PROGRESS_DELAY_MS + 200);
    expect(callbacks.onProgressStart).toHaveBeenCalledTimes(1);

    controller.cancel();
    vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);

    expect(callbacks.onProgressEnd).toHaveBeenCalledTimes(1);
    expect(callbacks.onComplete).not.toHaveBeenCalled();
  });

  it("pointer leaving the target cancels the hold the same way as releasing", () => {
    // The component wires pointerleave to the same cancel() call as
    // pointerup/pointercancel, so this is the same code path — verified
    // here at the controller level since that's where the logic lives.
    const callbacks = makeCallbacks();
    const controller = createHoldGestureController(callbacks);

    controller.start();
    vi.advanceTimersByTime(ADMIN_HOLD_PROGRESS_DELAY_MS + 500);
    controller.cancel(); // simulates onPointerLeave
    vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);

    expect(callbacks.onComplete).not.toHaveBeenCalled();
  });

  it("a second start() after a cancelled hold still requires the full duration", () => {
    const callbacks = makeCallbacks();
    const controller = createHoldGestureController(callbacks);

    controller.start();
    vi.advanceTimersByTime(1000);
    controller.cancel();

    controller.start();
    vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS - 1);
    expect(callbacks.onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
  });
});
