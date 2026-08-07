"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Delete, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { verifyAdminEntryPin } from "@/app/actions/admin-entry";

const PIN_LENGTH = 4;
const KEYPAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

interface AdminEntryKeypadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// This modal is a navigation gate, not an auth surface. A correct PIN only
// calls router.push("/admin-login") — it never creates a session, never
// touches the platform-admin table, and the entered digits are discarded
// (component state, never persisted) the instant the modal closes for any
// reason. Real admin sign-in still happens entirely on /admin-login.
export function AdminEntryKeypadModal({ open, onOpenChange }: AdminEntryKeypadModalProps) {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setDigits([]);
      setError(null);
    }
  }, [open]);

  const submit = useCallback(
    (pin: string) => {
      startTransition(async () => {
        const result = await verifyAdminEntryPin(pin);
        if (result.ok) {
          setDigits([]);
          setError(null);
          onOpenChange(false);
          router.push("/admin-login");
          return;
        }
        setDigits([]);
        setError(result.lockedOut ? "Too many attempts. Try again later." : "Incorrect code.");
      });
    },
    [onOpenChange, router]
  );

  const appendDigit = useCallback(
    (digit: string) => {
      if (isPending) return;
      setError(null);
      setDigits((prev) => (prev.length >= PIN_LENGTH ? prev : [...prev, digit]));
    },
    [isPending]
  );

  const backspace = useCallback(() => {
    if (isPending) return;
    setError(null);
    setDigits((prev) => prev.slice(0, -1));
  }, [isPending]);

  const canSubmit = digits.length === PIN_LENGTH && !isPending;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    submit(digits.join(""));
  }, [canSubmit, digits, submit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        appendDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
      // Escape is handled by the Dialog primitive itself.
    },
    [appendDigit, backspace, handleSubmit]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Enter access code</DialogTitle>
          <DialogDescription>Enter the 4-digit code to continue.</DialogDescription>
        </DialogHeader>

        <div
          role="status"
          aria-label={`${digits.length} of ${PIN_LENGTH} digits entered`}
          className="mb-4 flex items-center justify-center gap-3"
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              data-filled={i < digits.length}
              className={`h-3 w-3 rounded-full border border-border ${i < digits.length ? "bg-foreground" : "bg-transparent"}`}
            />
          ))}
        </div>

        <p role="alert" className="mb-3 min-h-[1.25rem] text-center text-sm text-destructive">
          {error ?? ""}
        </p>

        <div className="grid grid-cols-3 gap-2">
          {KEYPAD_DIGITS.map((d) => (
            <button
              key={d}
              type="button"
              aria-label={`Digit ${d}`}
              disabled={isPending}
              onClick={() => appendDigit(d)}
              className="rounded-lg border border-border py-3 text-lg font-medium hover:bg-muted disabled:opacity-50"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            aria-label="Backspace"
            disabled={isPending || digits.length === 0}
            onClick={backspace}
            className="flex items-center justify-center rounded-lg border border-border py-3 hover:bg-muted disabled:opacity-50"
          >
            <Delete className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Digit 0"
            disabled={isPending}
            onClick={() => appendDigit("0")}
            className="rounded-lg border border-border py-3 text-lg font-medium hover:bg-muted disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            aria-label="Submit code"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="flex items-center justify-center rounded-lg border border-border py-3 hover:bg-muted disabled:opacity-50"
          >
            <Check className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
