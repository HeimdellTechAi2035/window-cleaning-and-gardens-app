"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateVerificationToken, tokenMatchesHash, calculateProcessingDeadline } from "@/lib/account-deletion";
import { sendEmail, notifyBestEffort } from "@/lib/twilio";
import { checkAndRecordRateLimit, isLockedOut, recordFailedAttempt, getTrustedClientIp, normalizeEmail } from "@/lib/rate-limit";

const ACTIVE_DELETION_STATUSES = ["PENDING_VERIFICATION", "VERIFIED", "IN_PROGRESS"] as const;

// Abuse-protection limits for these unauthenticated public endpoints only.
// See docs/google-play-account-deletion-implementation.md for rationale.
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_SUBMISSIONS_PER_IP_PER_HOUR = 5;
const MAX_SUBMISSIONS_PER_EMAIL_PER_DAY = 3;
const MAX_FAILED_VERIFICATIONS_PER_IP = 10;
const VERIFY_LOCKOUT_WINDOW_MS = HOUR_MS;

const RATE_LIMIT_MESSAGE = "Too many requests.";

function withRetryHint(base: string, retryAfterSeconds?: number): string {
  if (!retryAfterSeconds) return `${base} Please try again later.`;
  const minutes = Math.ceil(retryAfterSeconds / 60);
  if (minutes <= 1) return `${base} Please try again in about a minute.`;
  if (minutes < 60) return `${base} Please try again in about ${minutes} minutes.`;
  const hours = Math.ceil(minutes / 60);
  return `${base} Please try again in about ${hours} hour${hours === 1 ? "" : "s"}.`;
}

// A single generic response for every outcome of the public form — found
// or not found, user or organization, already-pending or brand new. The
// caller must never be able to distinguish "that email has an account"
// from "it doesn't" by the response alone (Google Play / GDPR account-
// enumeration concern).
const GENERIC_RESPONSE =
  "If that matches a RoundFlow account, we've sent a verification link to that email address. It expires in 48 hours.";

const publicRequestSchema = z.object({
  email: z.string().email(),
  organizationName: z.string().optional(),
  requestType: z.enum(["USER", "ORGANIZATION"]),
  explanation: z.string().max(2000).optional(),
  confirmed: z.literal("on", { message: "Please confirm you understand" }),
});

export async function submitPublicDeletionRequestAction(
  formData: FormData
): Promise<{ ok: true; message: string } | { error: string }> {
  const parsed = publicRequestSchema.safeParse({
    email: formData.get("email"),
    organizationName: formData.get("organizationName") || undefined,
    requestType: formData.get("requestType"),
    explanation: formData.get("explanation") || undefined,
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email, organizationName, requestType } = parsed.data;

  // Abuse protection — checked (and recorded) before any account lookup, so
  // the limiter's own behaviour can never be used to infer whether the
  // submitted email matches a real account: every submission counts against
  // both buckets identically regardless of outcome.
  const ip = await getTrustedClientIp();
  const ipRateLimit = await checkAndRecordRateLimit({
    scope: "public_deletion_submit_ip",
    rawKey: ip,
    max: MAX_SUBMISSIONS_PER_IP_PER_HOUR,
    windowMs: HOUR_MS,
  });
  if (ipRateLimit.limited) {
    return { error: withRetryHint(RATE_LIMIT_MESSAGE, ipRateLimit.retryAfterSeconds) };
  }

  const normalizedEmail = normalizeEmail(email);
  const emailRateLimit = await checkAndRecordRateLimit({
    scope: "public_deletion_submit_email",
    rawKey: normalizedEmail,
    max: MAX_SUBMISSIONS_PER_EMAIL_PER_DAY,
    windowMs: DAY_MS,
  });
  if (emailRateLimit.limited) {
    return { error: withRetryHint(RATE_LIMIT_MESSAGE, emailRateLimit.retryAfterSeconds) };
  }

  try {
    // Best-effort, silent lookups — found or not, the response is identical.
    let userId: string | null = null;
    let organizationId: string | null = null;
    let organizationNameSnapshot: string | null = null;

    if (requestType === "USER") {
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true, organizationId: true } });
      if (user) {
        userId = user.id;
        organizationId = user.organizationId;
      }
    } else {
      // Organization name isn't unique in the schema — findFirst is the
      // best available match. An ambiguous name is a rare edge case a
      // platform admin can reconcile manually from the verified request's
      // details (see docs/google-play-account-deletion-implementation.md).
      if (organizationName) {
        const org = await prisma.organization.findFirst({ where: { name: organizationName } });
        if (org) {
          organizationId = org.id;
          organizationNameSnapshot = org.name;
        }
      }
    }

    // Don't create duplicate pending public requests for the same email —
    // silently no-op (still return the generic response) rather than
    // revealing there's already one in flight.
    const existingActive = await prisma.accountDeletionRequest.findFirst({
      where: { requesterEmail: email, source: "PUBLIC_WEB", status: { in: [...ACTIVE_DELETION_STATUSES] } },
    });
    if (existingActive) {
      return { ok: true, message: GENERIC_RESPONSE };
    }

    const { token, tokenHash, expiry } = generateVerificationToken();

    await prisma.accountDeletionRequest.create({
      data: {
        requestType,
        source: "PUBLIC_WEB",
        status: "PENDING_VERIFICATION",
        userId,
        organizationId,
        organizationNameSnapshot,
        requesterEmail: email,
        verificationTokenHash: tokenHash,
        verificationExpiry: expiry,
        processingNotes: parsed.data.explanation ? `Requester note: ${parsed.data.explanation}` : null,
      },
    });

    if (process.env.RESEND_API_KEY) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://greenfixapp.netlify.app";
      const verifyUrl = `${baseUrl}/legal/delete-account/verify?token=${token}`;
      await notifyBestEffort("account deletion verification email", () =>
        sendEmail({
          to: email,
          subject: "Confirm your RoundFlow account deletion request",
          html: deletionVerificationEmail(verifyUrl),
        })
      );
    }
    // If Resend isn't configured, the request sits as PENDING_VERIFICATION
    // for a platform admin to verify identity manually — never silently
    // claim it's verified when it isn't.

    return { ok: true, message: GENERIC_RESPONSE };
  } catch (e) {
    console.error("Public deletion request failed:", e);
    // Even on an unexpected error, don't leak internals to an unauthenticated caller.
    return { ok: true, message: GENERIC_RESPONSE };
  }
}

export async function verifyPublicDeletionRequestAction(
  token: string
): Promise<{ ok: true } | { error: string }> {
  // Blind-guessing protection: a fixed number of failed verification
  // attempts per IP locks that IP out for the rest of the window, checked
  // BEFORE any token comparison happens. Tokens are 256-bit random values,
  // so this is defense-in-depth on top of already-strong entropy, not the
  // primary protection — see docs/google-play-account-deletion-implementation.md
  // for why this is scoped to the guessing IP rather than "per request"
  // (a blind guess can't be attributed to a specific request until, and
  // unless, it actually matches one).
  const ip = await getTrustedClientIp();
  const lockout = await isLockedOut({
    scope: "public_deletion_verify_ip",
    rawKey: ip,
    max: MAX_FAILED_VERIFICATIONS_PER_IP,
    windowMs: VERIFY_LOCKOUT_WINDOW_MS,
  });
  if (lockout.limited) {
    return { error: withRetryHint("Too many verification attempts.", lockout.retryAfterSeconds) };
  }

  if (!token || token.length < 32) {
    await recordFailedAttempt({
      scope: "public_deletion_verify_ip",
      rawKey: ip,
      max: MAX_FAILED_VERIFICATIONS_PER_IP,
      windowMs: VERIFY_LOCKOUT_WINDOW_MS,
    });
    return { error: "This verification link is invalid." };
  }

  try {
    const candidates = await prisma.accountDeletionRequest.findMany({
      where: {
        status: "PENDING_VERIFICATION",
        verificationTokenHash: { not: null },
        verificationExpiry: { gt: new Date() },
      },
    });

    const match = candidates.find((c) => c.verificationTokenHash && tokenMatchesHash(token, c.verificationTokenHash));
    if (!match) {
      await recordFailedAttempt({
        scope: "public_deletion_verify_ip",
        rawKey: ip,
        max: MAX_FAILED_VERIFICATIONS_PER_IP,
        windowMs: VERIFY_LOCKOUT_WINDOW_MS,
      });
      return { error: "This verification link is invalid or has expired. Please submit a new request." };
    }

    const verifiedAt = new Date();
    await prisma.accountDeletionRequest.update({
      where: { id: match.id },
      data: {
        status: "VERIFIED",
        verifiedAt,
        processingDeadline: calculateProcessingDeadline(verifiedAt),
        // Single-use: blank the token out immediately so it can never be replayed.
        verificationTokenHash: null,
        verificationExpiry: null,
      },
    });

    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to verify request" };
  }
}

function deletionVerificationEmail(verifyUrl: string) {
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#111827;">Confirm your deletion request</h2>
      <p>Someone requested deletion of a RoundFlow account using this email address.</p>
      <p>If this was you, confirm the request below. This link expires in 48 hours and can only be used once.</p>
      <a href="${verifyUrl}" style="display:inline-block; background:#dc2626; color:white; padding:12px 20px; border-radius:8px; text-decoration:none; margin-top:12px;">Confirm deletion request</a>
      <p style="color:#6b7280; font-size:12px; margin-top:24px;">If you didn't request this, you can safely ignore this email — no account will be deleted.</p>
    </div>
  `;
}
