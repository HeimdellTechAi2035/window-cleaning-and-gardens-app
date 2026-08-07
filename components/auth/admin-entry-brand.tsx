"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  createHoldGestureController,
  ADMIN_HOLD_DURATION_MS,
  ADMIN_HOLD_PROGRESS_DELAY_MS,
  type HoldGestureController,
} from "@/lib/hold-gesture";
import { AdminEntryKeypadModal } from "@/components/auth/admin-entry-keypad-modal";

// The RoundFlow logo/wordmark on the login screen doubles as a hidden entry
// point: holding it for ~2s opens a PIN keypad, and only a correct PIN
// navigates to /admin-login. This is a navigation convenience only — the
// PIN is not authentication and grants no access by itself. Real sign-in
// still requires platform-admin credentials and a separate session
// (lib/admin-auth.ts, app/actions/admin-auth.ts), verified entirely on
// /admin-login. A plain click/tap never opens anything: the hold-gesture
// controller only fires onComplete after the full duration, and any
// pointerup/leave/cancel before then resets it.
export function AdminEntryBrand() {
  const [holding, setHolding] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const controllerRef = useRef<HoldGestureController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = createHoldGestureController({
      onProgressStart: () => setHolding(true),
      onProgressEnd: () => setHolding(false),
      onComplete: () => {
        setHolding(false);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(50);
          } catch {
            // Unsupported/blocked — fail silently, this is cosmetic only.
          }
        }
        setKeypadOpen(true);
      },
    });
  }

  useEffect(() => {
    return () => controllerRef.current?.cancel();
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    controllerRef.current?.start();
  }, []);

  const handlePointerEnd = useCallback(() => {
    controllerRef.current?.cancel();
  }, []);

  return (
    <>
      <div
        className="relative mb-8 flex select-none items-center justify-center gap-2"
        style={{ WebkitTouchCallout: "none", touchAction: "manipulation" }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Image
          src="/icons/icon-512.png"
          alt=""
          width={40}
          height={40}
          className="h-10 w-10"
          priority
          draggable={false}
        />
        <span className="text-lg font-semibold">RoundFlow</span>
        <span
          aria-hidden="true"
          className={`absolute -bottom-1.5 left-1/2 block h-0.5 -translate-x-1/2 rounded-full bg-muted-foreground/50 transition-[width] ease-linear ${
            holding ? "w-10" : "w-0"
          }`}
          style={{
            transitionDuration: holding ? `${ADMIN_HOLD_DURATION_MS - ADMIN_HOLD_PROGRESS_DELAY_MS}ms` : "0ms",
          }}
        />
      </div>
      <AdminEntryKeypadModal open={keypadOpen} onOpenChange={setKeypadOpen} />
    </>
  );
}
