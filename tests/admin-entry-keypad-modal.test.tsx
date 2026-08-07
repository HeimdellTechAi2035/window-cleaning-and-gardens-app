// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// jsdom rendering + Radix's DismissableLayer timers occasionally exceed
// Vitest's 5s default under full-suite parallel load — same rationale as
// tests/reviewer-access-actions.test.ts's testTimeout bump.
vi.setConfig({ testTimeout: 20000 });

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const verifyAdminEntryPinMock = vi.fn();
vi.mock("@/app/actions/admin-entry", () => ({
  verifyAdminEntryPin: (...args: unknown[]) => verifyAdminEntryPinMock(...args),
}));

import { AdminEntryKeypadModal } from "@/components/auth/admin-entry-keypad-modal";

function clickDigits(digits: string) {
  for (const d of digits) {
    fireEvent.click(screen.getByRole("button", { name: `Digit ${d}` }));
  }
}

beforeEach(() => {
  pushMock.mockReset();
  verifyAdminEntryPinMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("AdminEntryKeypadModal", () => {
  it("does not render the keypad when closed", () => {
    render(<AdminEntryKeypadModal open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Enter access code")).not.toBeInTheDocument();
  });

  it("shows 0 of 4 digits entered initially, and updates as digits are entered", () => {
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("status", { name: "0 of 4 digits entered" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Digit 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Digit 8" }));

    expect(screen.getByRole("status", { name: "2 of 4 digits entered" })).toBeTruthy();
  });

  it("never renders the entered digits as plain text", () => {
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    clickDigits("48");
    expect(screen.queryByText("48")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("48");
  });

  it("Backspace (button) removes the last digit", () => {
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    clickDigits("48");
    fireEvent.click(screen.getByRole("button", { name: "Backspace" }));
    expect(screen.getByRole("status", { name: "1 of 4 digits entered" })).toBeTruthy();
  });

  it("physical keyboard digit entry works", () => {
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "5" });
    fireEvent.keyDown(dialog, { key: "2" });
    expect(screen.getByRole("status", { name: "2 of 4 digits entered" })).toBeTruthy();
  });

  it("physical keyboard Backspace works", () => {
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "5" });
    fireEvent.keyDown(dialog, { key: "2" });
    fireEvent.keyDown(dialog, { key: "Backspace" });
    expect(screen.getByRole("status", { name: "1 of 4 digits entered" })).toBeTruthy();
  });

  it("non-numeric keyboard input is ignored", () => {
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "a" });
    fireEvent.keyDown(dialog, { key: "$" });
    fireEvent.keyDown(dialog, { key: " " });
    expect(screen.getByRole("status", { name: "0 of 4 digits entered" })).toBeTruthy();
    expect(verifyAdminEntryPinMock).not.toHaveBeenCalled();
  });

  it("more than 4 digits are rejected — the 5th tap is simply ignored", () => {
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    clickDigits("48219"); // 5 taps
    expect(screen.getByRole("status", { name: "4 of 4 digits entered" })).toBeTruthy();
  });

  it("the submit button is disabled with fewer than 4 digits, and Enter does nothing", () => {
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    clickDigits("482");
    expect(screen.getByRole("button", { name: "Submit code" })).toBeDisabled();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    expect(verifyAdminEntryPinMock).not.toHaveBeenCalled();
  });

  it("Enter submits once 4 digits are entered", async () => {
    verifyAdminEntryPinMock.mockResolvedValue({ ok: true });
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    clickDigits("4821");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    await waitFor(() => expect(verifyAdminEntryPinMock).toHaveBeenCalledWith("4821"));
  });

  it("clicking the checkmark submits once 4 digits are entered", async () => {
    verifyAdminEntryPinMock.mockResolvedValue({ ok: true });
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    clickDigits("4821");
    fireEvent.click(screen.getByRole("button", { name: "Submit code" }));
    await waitFor(() => expect(verifyAdminEntryPinMock).toHaveBeenCalledWith("4821"));
  });

  it("correct PIN closes the modal and navigates to /admin-login", async () => {
    verifyAdminEntryPinMock.mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    render(<AdminEntryKeypadModal open={true} onOpenChange={onOpenChange} />);
    clickDigits("4821");
    fireEvent.click(screen.getByRole("button", { name: "Submit code" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin-login"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("wrong PIN does not navigate, and clears the entered digits", async () => {
    verifyAdminEntryPinMock.mockResolvedValue({ ok: false });
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    clickDigits("0000");
    fireEvent.click(screen.getByRole("button", { name: "Submit code" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Incorrect code."));
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "0 of 4 digits entered" })).toBeTruthy();
  });

  it("does not reveal whether a lockout, bad format, or wrong PIN caused the generic failure", async () => {
    verifyAdminEntryPinMock.mockResolvedValue({ ok: false });
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    clickDigits("0000");
    fireEvent.click(screen.getByRole("button", { name: "Submit code" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Incorrect code."));
  });

  it("shows a distinct message when locked out", async () => {
    verifyAdminEntryPinMock.mockResolvedValue({ ok: false, lockedOut: true, retryAfterSeconds: 900 });
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    clickDigits("0000");
    fireEvent.click(screen.getByRole("button", { name: "Submit code" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Too many attempts. Try again later."));
  });

  it("clears digits when the modal is reopened after being closed", () => {
    const { rerender } = render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    clickDigits("48");
    expect(screen.getByRole("status", { name: "2 of 4 digits entered" })).toBeTruthy();

    rerender(<AdminEntryKeypadModal open={false} onOpenChange={vi.fn()} />);
    rerender(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("status", { name: "0 of 4 digits entered" })).toBeTruthy();
  });

  it("Escape closes the modal", async () => {
    const onOpenChange = vi.fn();
    render(<AdminEntryKeypadModal open={true} onOpenChange={onOpenChange} />);
    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("clicking the backdrop closes the modal", async () => {
    const onOpenChange = vi.fn();
    render(<AdminEntryKeypadModal open={true} onOpenChange={onOpenChange} />);
    // Radix's DismissableLayer attaches its outside-pointerdown listener in
    // a setTimeout(0) after mount, and (for the primary button) defers the
    // actual dismissal to the following "click" — so a real click sequence
    // (via user-event, which fires pointerdown/up/click in order) is needed
    // rather than a single synthetic pointerdown, plus a tick to let that
    // listener attach first. Radix also scroll-locks <body> (pointer-events:
    // none) while open, so the click must target the overlay itself — the
    // actual visible backdrop — not body, which real users can't click on.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const overlay = document.querySelector(".fixed.inset-0") as HTMLElement;
    expect(overlay).toBeTruthy();
    const user = userEvent.setup();
    await user.click(overlay);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("has proper dialog semantics and accessible button labels", () => {
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    for (const d of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]) {
      expect(screen.getByRole("button", { name: `Digit ${d}` })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Backspace" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit code" })).toBeTruthy();
  });

  it("does not advertise admin functionality anywhere in its visible or accessible text", () => {
    render(<AdminEntryKeypadModal open={true} onOpenChange={vi.fn()} />);
    const text = document.body.textContent ?? "";
    expect(text.toLowerCase()).not.toContain("admin");
    expect(text.toLowerCase()).not.toContain("secret");
  });
});
