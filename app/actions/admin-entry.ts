"use server";

import { createHash, timingSafeEqual } from "crypto";
import { isLockedOut, recordFailedAttempt, getTrustedClientIp } from "@/lib/rate-limit";

// ------------------------------------------------------------------
// Hidden-gesture PIN gate for the /login screen's admin entry point.
//
// This is NOT authentication. It only decides whether the browser is
// allowed to navigate to /admin-login — real platform-admin sign-in
// (app/actions/admin-auth.ts) still requires a valid email + password
// against the separate `platform_admins` table and still issues its own
// HMAC-signed session. Nothing here creates a session, touches
// PlatformAdmin, or grants any access by itself.
// ------------------------------------------------------------------

const PIN_PATTERN = /^\d{4}$/;
const SCOPE = "admin_entry_pin_ip";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

// A placeholder that can never equal a valid 4-digit PIN string, used so
// the timing-safe comparison below always runs against a same-shaped
// value whether or not ADMIN_ENTRY_PIN is configured — avoids a branch
// that would only run the comparison in the "configured" case, which
// would otherwise create a timing/code-path difference an attacker could
// use to detect a missing configuration.
const UNMATCHABLE_PLACEHOLDER = "____";

export type VerifyAdminEntryPinResult =
  | { ok: true }
  | { ok: false; lockedOut?: boolean; retryAfterSeconds?: number };

function digestOf(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Timing-safe: both inputs are hashed to a fixed-length digest first, so comparison time never depends on input length or content. */
function pinsMatch(candidate: string, configured: string): boolean {
  return timingSafeEqual(digestOf(candidate), digestOf(configured));
}

/**
 * Verifies the hidden admin-entry PIN. Returns only a generic ok/not-ok
 * result — never reveals whether the server is misconfigured, whether the
 * submitted format was invalid, or whether any digit was correct. The one
 * exception is a lockout state, which (like the account-deletion
 * verification flow in app/actions/public-deletion.ts) is surfaced so the
 * UI can show a "try again later" message rather than a misleading
 * "incorrect code" after every subsequent attempt.
 */
export async function verifyAdminEntryPin(pin: string): Promise<VerifyAdminEntryPinResult> {
  const ip = await getTrustedClientIp();

  const lockout = await isLockedOut({
    scope: SCOPE,
    rawKey: ip,
    max: MAX_FAILED_ATTEMPTS,
    windowMs: LOCKOUT_WINDOW_MS,
  });
  if (lockout.limited) {
    return { ok: false, lockedOut: true, retryAfterSeconds: lockout.retryAfterSeconds };
  }

  const configuredPin = process.env.ADMIN_ENTRY_PIN;
  const isConfigured = typeof configuredPin === "string" && PIN_PATTERN.test(configuredPin);
  if (!isConfigured) {
    // Safe to log: confirms only that setup is incomplete, never the
    // attempted PIN, the configured value (if any), or the caller's IP.
    console.error("ADMIN_ENTRY_PIN is not configured, or is not exactly 4 digits.");
  }

  const isValidInput = typeof pin === "string" && PIN_PATTERN.test(pin);

  // Always run the actual hash-and-compare — unconditionally, not inside
  // the isConfigured/isValidInput checks — so misconfiguration or a
  // malformed submission takes the exact same code path and timing as a
  // wrong-but-well-formed guess. Only after that do the format checks get
  // ANDed in, as cheap boolean logic that doesn't reintroduce a
  // comparison-skipping branch.
  const candidateForCompare = isValidInput ? pin : UNMATCHABLE_PLACEHOLDER;
  const configuredForCompare = isConfigured ? configuredPin : UNMATCHABLE_PLACEHOLDER;
  const digestsMatch = pinsMatch(candidateForCompare, configuredForCompare);
  const matches = isConfigured && isValidInput && digestsMatch;

  if (!matches) {
    await recordFailedAttempt({
      scope: SCOPE,
      rawKey: ip,
      max: MAX_FAILED_ATTEMPTS,
      windowMs: LOCKOUT_WINDOW_MS,
    });
    return { ok: false };
  }

  return { ok: true };
}
