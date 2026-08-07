// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { ADMIN_HOLD_DURATION_MS } from "@/lib/hold-gesture";

// jsdom rendering occasionally exceeds Vitest's 5s default under full-suite
// parallel load — same rationale as tests/reviewer-access-actions.test.ts's
// testTimeout bump.
vi.setConfig({ testTimeout: 20000 });

// AdminEntryKeypadModal itself (Radix Dialog, keypad, PIN verification) is
// fully covered by tests/admin-entry-keypad-modal.test.tsx — stubbed out
// here so these tests isolate exactly what AdminEntryBrand is responsible
// for: the hold-gesture wiring, vibration feedback, and opening the modal.
vi.mock("@/components/auth/admin-entry-keypad-modal", () => ({
  AdminEntryKeypadModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="keypad-modal-stub" /> : null,
}));

import { AdminEntryBrand } from "@/components/auth/admin-entry-brand";

function getBrandTarget(): HTMLElement {
  // The brand wrapper div is the one carrying the pointer handlers —
  // identified here via the RoundFlow wordmark it contains.
  return screen.getByText("RoundFlow").parentElement as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AdminEntryBrand — hidden press-and-hold entry point", () => {
  it("a normal click (immediate pointerup) does not open the keypad", () => {
    render(<AdminEntryBrand />);
    const target = getBrandTarget();

    act(() => {
      fireEvent.pointerDown(target, { button: 0 });
      fireEvent.pointerUp(target, { button: 0 });
      vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);
    });

    expect(screen.queryByTestId("keypad-modal-stub")).not.toBeInTheDocument();
  });

  it("a hold under 2 seconds does not open the keypad", () => {
    render(<AdminEntryBrand />);
    const target = getBrandTarget();

    act(() => {
      fireEvent.pointerDown(target, { button: 0 });
      vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS - 100);
      fireEvent.pointerUp(target, { button: 0 });
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByTestId("keypad-modal-stub")).not.toBeInTheDocument();
  });

  it("a full 2-second hold opens the keypad", () => {
    render(<AdminEntryBrand />);
    const target = getBrandTarget();

    act(() => {
      fireEvent.pointerDown(target, { button: 0 });
      vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);
    });

    expect(screen.getByTestId("keypad-modal-stub")).toBeInTheDocument();
  });

  it("releasing early cancels the hold", () => {
    render(<AdminEntryBrand />);
    const target = getBrandTarget();

    act(() => {
      fireEvent.pointerDown(target, { button: 0 });
      vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS - 300);
      fireEvent.pointerUp(target, { button: 0 });
      vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);
    });

    expect(screen.queryByTestId("keypad-modal-stub")).not.toBeInTheDocument();
  });

  it("the pointer leaving the target cancels the hold", () => {
    render(<AdminEntryBrand />);
    const target = getBrandTarget();

    act(() => {
      fireEvent.pointerDown(target, { button: 0 });
      vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS - 300);
      fireEvent.pointerLeave(target, { button: 0 });
      vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);
    });

    expect(screen.queryByTestId("keypad-modal-stub")).not.toBeInTheDocument();
  });

  it("pointercancel cancels the hold", () => {
    render(<AdminEntryBrand />);
    const target = getBrandTarget();

    act(() => {
      fireEvent.pointerDown(target, { button: 0 });
      vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS - 300);
      fireEvent.pointerCancel(target, { button: 0 });
      vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);
    });

    expect(screen.queryByTestId("keypad-modal-stub")).not.toBeInTheDocument();
  });

  it("vibrates briefly on a successful hold, when supported", () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrateMock, configurable: true });

    render(<AdminEntryBrand />);
    const target = getBrandTarget();
    act(() => {
      fireEvent.pointerDown(target, { button: 0 });
      vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);
    });

    expect(vibrateMock).toHaveBeenCalledWith(50);
  });

  it("fails silently when vibrate is unsupported", () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "vibrate");
    // @ts-expect-error simulating a browser without the Vibration API
    delete navigator.vibrate;

    render(<AdminEntryBrand />);
    const target = getBrandTarget();

    expect(() => {
      act(() => {
        fireEvent.pointerDown(target, { button: 0 });
        vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);
      });
    }).not.toThrow();

    expect(screen.getByTestId("keypad-modal-stub")).toBeInTheDocument();

    if (original) Object.defineProperty(navigator, "vibrate", original);
  });

  it("does not open the keypad from a non-primary pointer button", () => {
    render(<AdminEntryBrand />);
    const target = getBrandTarget();

    act(() => {
      fireEvent.pointerDown(target, { button: 2 }); // right-click
      vi.advanceTimersByTime(ADMIN_HOLD_DURATION_MS);
    });

    expect(screen.queryByTestId("keypad-modal-stub")).not.toBeInTheDocument();
  });

  it("the RoundFlow wordmark renders normally and stays non-focusable", () => {
    render(<AdminEntryBrand />);
    const wordmark = screen.getByText("RoundFlow");
    expect(wordmark).toBeInTheDocument();
    const target = getBrandTarget();
    expect(target).not.toHaveAttribute("tabindex");
    expect(target).not.toHaveAttribute("role");
  });
});
