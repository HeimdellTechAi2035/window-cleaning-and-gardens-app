import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above the rest of the file and can only
// safely reference vitest's own `vi` global — not other imported user
// modules (those become lazy bindings not yet initialised at hoist time).
// So the in-memory fake `rateLimitBucket` model + `$queryRaw` are built
// inline here. `findUnique`/`deleteMany` still mirror the real Prisma model
// methods (used by isLockedOut/cleanup); `$queryRaw` simulates the atomic
// `INSERT ... ON CONFLICT DO UPDATE` lib/rate-limit.ts now uses for every
// increment (checkAndRecordRateLimit / recordFailedAttempt) — sequential
// simulation is sufficient here since JS test execution isn't concurrent;
// true concurrent-correctness is validated separately against real Postgres
// (scripts/validate-account-deletion-staging.ts), not achievable in a mock.
const fakeModel = vi.hoisted(() => {
  interface Row {
    scope: string;
    key: string;
    count: number;
    expiresAt: Date;
  }
  const store = new Map<string, Row>();
  const id = (scope: string, key: string) => `${scope}::${key}`;

  return {
    _store: store,
    findUnique: vi.fn(async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => {
      const row = store.get(id(where.scope_key.scope, where.scope_key.key));
      return row ? { ...row } : null;
    }),
    deleteMany: vi.fn(async ({ where }: { where: { expiresAt: { lt: Date } } }) => {
      let count = 0;
      for (const [key, row] of store) {
        if (row.expiresAt < where.expiresAt.lt) {
          store.delete(key);
          count++;
        }
      }
      return { count };
    }),
    // Mirrors atomicIncrementBucket's single INSERT ... ON CONFLICT DO UPDATE:
    // interpolated values arrive in template order (id, scope, key, freshExpiresAt).
    queryRaw: vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      const [, scope, key, freshExpiresAt] = values as [string, string, string, Date];
      const now = new Date();
      const compositeKey = id(scope, key);
      const existing = store.get(compositeKey);
      let count: number;
      let expiresAt: Date;
      if (!existing || existing.expiresAt <= now) {
        count = 1;
        expiresAt = freshExpiresAt;
      } else {
        count = existing.count + 1;
        expiresAt = existing.expiresAt;
      }
      store.set(compositeKey, { scope, key, count, expiresAt });
      return [{ count, expiresAt }];
    }),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rateLimitBucket: { findUnique: fakeModel.findUnique, deleteMany: fakeModel.deleteMany },
    $queryRaw: fakeModel.queryRaw,
  },
}));

let mockHeaders: Record<string, string> = {};
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => mockHeaders[name.toLowerCase()] ?? null,
  })),
}));

import {
  checkAndRecordRateLimit,
  isLockedOut,
  recordFailedAttempt,
  getTrustedClientIp,
  normalizeEmail,
} from "@/lib/rate-limit";

beforeEach(() => {
  fakeModel._store.clear();
  mockHeaders = {};
  process.env.AUTH_SECRET = "test-only-secret-for-rate-limit-hmac";
});

describe("checkAndRecordRateLimit", () => {
  const opts = { scope: "test_scope", rawKey: "1.2.3.4", max: 5, windowMs: 60_000 };

  it("allows requests below the threshold", async () => {
    for (let i = 0; i < 4; i++) {
      const result = await checkAndRecordRateLimit(opts);
      expect(result.limited).toBe(false);
    }
  });

  it("blocks the request that exceeds the threshold and reports a retry-after", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await checkAndRecordRateLimit(opts);
      expect(result.limited).toBe(false);
    }
    const sixth = await checkAndRecordRateLimit(opts);
    expect(sixth.limited).toBe(true);
    expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("stops blocking once the window has expired", async () => {
    for (let i = 0; i < 5; i++) {
      await checkAndRecordRateLimit(opts);
    }
    expect((await checkAndRecordRateLimit(opts)).limited).toBe(true);

    // Simulate the window having elapsed by backdating the stored row's
    // expiry, rather than sleeping in the test.
    for (const row of fakeModel._store.values()) {
      row.expiresAt = new Date(Date.now() - 1000);
    }

    const afterExpiry = await checkAndRecordRateLimit(opts);
    expect(afterExpiry.limited).toBe(false);
  });

  it("never persists the raw key — only a keyed-HMAC hash of it", async () => {
    await checkAndRecordRateLimit({ scope: "ip_scope", rawKey: "203.0.113.7", max: 5, windowMs: 60_000 });

    const rows = [...fakeModel._store.values()];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.key).not.toBe("203.0.113.7");
      expect(row.key).not.toContain("203.0.113.7");
      expect(row.key).toMatch(/^[0-9a-f]{64}$/); // sha256 hex digest
    }
  });

  it("keeps different keys within the same scope fully isolated from each other", async () => {
    const a = { scope: "shared_scope", rawKey: "email-a@example.com", max: 1, windowMs: 60_000 };
    const b = { scope: "shared_scope", rawKey: "email-b@example.com", max: 1, windowMs: 60_000 };

    expect((await checkAndRecordRateLimit(a)).limited).toBe(false);
    expect((await checkAndRecordRateLimit(a)).limited).toBe(true); // a is now exhausted
    expect((await checkAndRecordRateLimit(b)).limited).toBe(false); // b is unaffected by a's usage
  });
});

describe("isLockedOut / recordFailedAttempt (failure-only lockout)", () => {
  const opts = { scope: "verify_scope", rawKey: "9.9.9.9", max: 10, windowMs: 60_000 };

  it("does not lock out until the failure threshold is reached", async () => {
    for (let i = 0; i < 9; i++) {
      expect((await isLockedOut(opts)).limited).toBe(false);
      await recordFailedAttempt(opts);
    }
    expect((await isLockedOut(opts)).limited).toBe(false);
  });

  it("locks out after the 10th failed attempt", async () => {
    for (let i = 0; i < 10; i++) {
      await recordFailedAttempt(opts);
    }
    const result = await isLockedOut(opts);
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("checking lockout status alone never itself counts as an attempt", async () => {
    for (let i = 0; i < 50; i++) {
      await isLockedOut(opts);
    }
    expect((await isLockedOut(opts)).limited).toBe(false);
  });
});

describe("getTrustedClientIp", () => {
  it("trusts Netlify's own client-connection-ip header", async () => {
    mockHeaders["x-nf-client-connection-ip"] = "203.0.113.42";
    expect(await getTrustedClientIp()).toBe("203.0.113.42");
  });

  it("does not trust a client-suppliable x-forwarded-for header on its own", async () => {
    mockHeaders["x-forwarded-for"] = "6.6.6.6"; // attacker-controllable in principle
    // No x-nf-client-connection-ip present — must not fall back to trusting XFF.
    expect(await getTrustedClientIp()).not.toBe("6.6.6.6");
    expect(await getTrustedClientIp()).toBe("unknown-ip");
  });

  it("falls back to a single shared bucket, not unlimited access, when no trusted header exists", async () => {
    expect(await getTrustedClientIp()).toBe("unknown-ip");
  });
});

describe("normalizeEmail", () => {
  it("trims whitespace and lowercases so casing/whitespace can't bypass an email-based limit", () => {
    expect(normalizeEmail("  Someone@Example.COM  ")).toBe("someone@example.com");
    expect(normalizeEmail("someone@example.com")).toBe("someone@example.com");
  });
});
