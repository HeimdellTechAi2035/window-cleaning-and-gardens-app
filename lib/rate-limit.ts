import { createHmac, randomUUID } from "crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

// ------------------------------------------------------------------
// Abuse protection for the unauthenticated public deletion-request
// endpoints only (/legal/delete-account and its verification step).
// Backed by a Postgres table (prisma/schema.prisma: RateLimitBucket) so
// counters are shared correctly across Netlify's serverless/distributed
// instances — an in-memory Map would reset per cold start and wouldn't be
// shared between concurrent instances, so it can't provide a real limit.
// ------------------------------------------------------------------

function getHashSecret(): string {
  // Reuses the same AUTH_SECRET already required for NextAuth/session
  // signing (see lib/admin-auth.ts) rather than introducing a second
  // required secret to provision — domain-separated below via a scope
  // prefix on the HMAC input, so this use can never collide with, or be
  // confused for, a session-signing HMAC even though the key is shared.
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return secret;
}

/** Keyed HMAC — never a plain/unsalted hash — so stored keys can't be reversed or dictionary-matched back to a real IP/email. */
function hashKey(scope: string, rawValue: string): string {
  return createHmac("sha256", getHashSecret()).update(`${scope}:${rawValue}`).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolves the connecting client's IP from Netlify's own trusted header,
 * never from client-suppliable forwarding headers. `x-nf-client-connection-ip`
 * is set by Netlify's edge from the actual TCP connection and cannot be
 * overridden by request headers the client sends — unlike `x-forwarded-for`,
 * which a client can pre-populate with an arbitrary value.
 *
 * If that header is absent (e.g. local dev, not running behind Netlify),
 * every request collapses into one shared "unknown-ip" bucket rather than
 * skipping IP-based limiting altogether — fails closed instead of open.
 */
export async function getTrustedClientIp(): Promise<string> {
  const h = await headers();
  const nfIp = h.get("x-nf-client-connection-ip");
  if (nfIp && nfIp.trim()) return nfIp.trim();
  return "unknown-ip";
}

interface RateLimitOptions {
  /** Identifies which limit this is, e.g. "public_deletion_submit_ip". */
  scope: string;
  /** The raw value to key on (IP address or normalised email) — hashed before storage/lookup. */
  rawKey: string;
  max: number;
  windowMs: number;
}

export interface RateLimitResult {
  limited: boolean;
  retryAfterSeconds?: number;
}

/**
 * Atomically increments (or starts) a fixed-window counter for (scope, key)
 * in a single statement, and returns the resulting count + window expiry.
 *
 * This replaces an earlier read-then-write implementation (SELECT, decide,
 * then UPSERT/UPDATE) that had a genuine lost-update race under concurrency:
 * multiple simultaneous requests could all read "count < max" before any of
 * their writes committed, letting more than `max` requests through in a
 * single burst — measured directly against real Postgres (see
 * docs/google-play-account-deletion-implementation.md).
 *
 * `INSERT ... ON CONFLICT (scope, key) DO UPDATE` is a single atomic
 * statement, not a read followed by a write: Postgres takes a row-level lock
 * on the conflicting row for the duration of the statement, so concurrent
 * callers targeting the same (scope, key) are serialised by the database
 * itself — each one evaluates the CASE expressions below against the row's
 * *current* committed state (re-checked per Postgres's documented
 * read-committed behaviour for ON CONFLICT DO UPDATE), not a stale value read
 * earlier in a separate round trip. This is what makes the increment and the
 * window-expiry reset atomic, and it is also why a duplicate-key error can
 * never occur here — ON CONFLICT DO UPDATE never raises one for the
 * constraint it targets, so there is nothing to catch.
 *
 * All values are passed as tagged-template parameters (Prisma's `$queryRaw`
 * parameterises these automatically) — never string-concatenated into the
 * query text.
 */
async function atomicIncrementBucket(scope: string, key: string, windowMs: number): Promise<{ count: number; expiresAt: Date }> {
  const now = new Date();
  const freshExpiresAt = new Date(now.getTime() + windowMs);
  const id = randomUUID();

  const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
    INSERT INTO "rate_limit_buckets" ("id", "scope", "key", "count", "expiresAt", "createdAt", "updatedAt")
    VALUES (${id}, ${scope}, ${key}, 1, ${freshExpiresAt}, now(), now())
    ON CONFLICT ("scope", "key") DO UPDATE SET
      "count" = CASE
        WHEN "rate_limit_buckets"."expiresAt" <= now() THEN 1
        ELSE "rate_limit_buckets"."count" + 1
      END,
      "expiresAt" = CASE
        WHEN "rate_limit_buckets"."expiresAt" <= now() THEN EXCLUDED."expiresAt"
        ELSE "rate_limit_buckets"."expiresAt"
      END,
      "updatedAt" = now()
    RETURNING "count", "expiresAt"
  `;

  const row = rows[0];
  return { count: Number(row.count), expiresAt: new Date(row.expiresAt) };
}

/**
 * Fixed-window counter, keyed by (scope, HMAC-hashed value). Every call
 * both checks and records an attempt in one step — appropriate for volume
 * limits (submissions per IP/email) where every attempt should count
 * regardless of outcome, so the limiter itself can't be used as an
 * account-enumeration side channel (it must count and behave identically
 * whether or not a matching account exists).
 */
export async function checkAndRecordRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const key = hashKey(options.scope, options.rawKey);

  maybeCleanupExpired();

  const { count, expiresAt } = await atomicIncrementBucket(options.scope, key, options.windowMs);

  if (count > options.max) {
    return { limited: true, retryAfterSeconds: retryAfterFrom(expiresAt, new Date()) };
  }
  return { limited: false };
}

/**
 * Checks a failure-lockout counter WITHOUT recording an attempt — used
 * before a verification-token check so an already-locked-out caller never
 * even reaches the token comparison. Call `recordFailedAttempt` separately,
 * and only on failure, so legitimate callers who get it right first time
 * are never penalised.
 */
export async function isLockedOut(options: Omit<RateLimitOptions, "rawKey"> & { rawKey: string }): Promise<RateLimitResult> {
  const key = hashKey(options.scope, options.rawKey);
  const now = new Date();

  const existing = await prisma.rateLimitBucket.findUnique({
    where: { scope_key: { scope: options.scope, key } },
  });
  if (!existing || existing.expiresAt <= now) return { limited: false };
  if (existing.count >= options.max) {
    return { limited: true, retryAfterSeconds: retryAfterFrom(existing.expiresAt, now) };
  }
  return { limited: false };
}

/**
 * Increments the failure-lockout counter for a scope/key — call only on a
 * failed attempt. Uses the same atomic INSERT ... ON CONFLICT DO UPDATE as
 * checkAndRecordRateLimit, for the same reason: the previous read-then-write
 * form of this function had the identical lost-update race under concurrent
 * failed guesses against the same key.
 */
export async function recordFailedAttempt(options: RateLimitOptions): Promise<void> {
  const key = hashKey(options.scope, options.rawKey);
  await atomicIncrementBucket(options.scope, key, options.windowMs);
}

function retryAfterFrom(expiresAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
}

/**
 * Opportunistic cleanup of expired buckets — no scheduled function/cron
 * infrastructure exists in this project to hook a periodic sweep into, and
 * this table only ever holds one row per actively-limited IP/email, so a
 * low-probability sweep on the hot path keeps it bounded without adding
 * new infrastructure. Fire-and-forget; a failure here must never block the
 * request it was piggybacking on.
 */
function maybeCleanupExpired(): void {
  if (Math.random() >= 0.05) return;
  prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
}
