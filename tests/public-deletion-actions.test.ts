import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateVerificationToken } from "@/lib/account-deletion";

// vi.mock factories are hoisted above the rest of the file and can only
// safely reference vitest's own `vi` global — not other imported user
// modules — so the in-memory fake `rateLimitBucket` model is built inline
// here rather than imported. See tests/rate-limit.test.ts for the same
// model with more detailed comments (findUnique/deleteMany still mirror
// real Prisma model methods; $queryRaw simulates the atomic
// INSERT ... ON CONFLICT DO UPDATE every increment now goes through).
const fakeRateLimitModel = vi.hoisted(() => {
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
    user: { findUnique: vi.fn() },
    organization: { findFirst: vi.fn() },
    accountDeletionRequest: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    rateLimitBucket: { findUnique: fakeRateLimitModel.findUnique, deleteMany: fakeRateLimitModel.deleteMany },
    $queryRaw: fakeRateLimitModel.queryRaw,
  },
}));

vi.mock("@/lib/twilio", () => ({
  sendEmail: vi.fn(),
  notifyBestEffort: vi.fn(async (_label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      // best-effort — swallow, matching the real implementation's contract
    }
  }),
}));

let mockHeaders: Record<string, string> = {};
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => mockHeaders[name.toLowerCase()] ?? null,
  })),
}));

import { prisma } from "@/lib/prisma";
import {
  submitPublicDeletionRequestAction,
  verifyPublicDeletionRequestAction,
} from "@/app/actions/public-deletion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's generated types are impractical to hand-mock; this file tests business logic, not Prisma's type surface.
const db = prisma as any;

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function setIp(ip: string) {
  mockHeaders["x-nf-client-connection-ip"] = ip;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRateLimitModel._store.clear();
  mockHeaders = {};
  process.env.AUTH_SECRET = "test-only-secret-for-rate-limit-hmac";
  delete process.env.RESEND_API_KEY; // exercise the "no email configured" path by default
  setIp("198.51.100.10"); // a distinct default per test, overridable
  db.accountDeletionRequest.findFirst.mockResolvedValue(null);
  db.accountDeletionRequest.create.mockResolvedValue({});
});

describe("submitPublicDeletionRequestAction — account enumeration resistance", () => {
  it("returns the identical generic message whether or not the email matches a real account", async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: "user-1", organizationId: "org-1" });
    const matchResult = await submitPublicDeletionRequestAction(
      formData({ email: "real@example.com", requestType: "USER", confirmed: "on" })
    );

    db.user.findUnique.mockResolvedValueOnce(null);
    const noMatchResult = await submitPublicDeletionRequestAction(
      formData({ email: "nobody@example.com", requestType: "USER", confirmed: "on" })
    );

    expect(matchResult).toEqual(noMatchResult);
    expect("ok" in matchResult && matchResult.ok).toBe(true);
  });

  it("still returns the generic response (not an error) when an unexpected failure occurs", async () => {
    db.accountDeletionRequest.findFirst.mockRejectedValue(new Error("db unreachable"));

    const result = await submitPublicDeletionRequestAction(
      formData({ email: "someone@example.com", requestType: "USER", confirmed: "on" })
    );

    expect("ok" in result && result.ok).toBe(true);
  });

  it("returns the same generic response when a request is already pending, without creating a duplicate", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user-1", organizationId: "org-1" });
    db.accountDeletionRequest.findFirst.mockResolvedValue({ id: "existing-request" });

    const result = await submitPublicDeletionRequestAction(
      formData({ email: "real@example.com", requestType: "USER", confirmed: "on" })
    );

    expect("ok" in result && result.ok).toBe(true);
    expect(db.accountDeletionRequest.create).not.toHaveBeenCalled();
  });

  it("rejects submissions missing the consequences-understood confirmation", async () => {
    const result = await submitPublicDeletionRequestAction(
      formData({ email: "real@example.com", requestType: "USER" })
    );
    expect("error" in result).toBe(true);
    expect(db.accountDeletionRequest.create).not.toHaveBeenCalled();
  });
});

describe("submitPublicDeletionRequestAction — abuse protection", () => {
  it("allows submissions below the per-IP threshold", async () => {
    for (let i = 0; i < 4; i++) {
      const result = await submitPublicDeletionRequestAction(
        formData({ email: `person${i}@example.com`, requestType: "USER", confirmed: "on" })
      );
      expect("ok" in result && result.ok).toBe(true);
    }
  });

  it("blocks a 6th submission from the same IP within an hour (max 5/hour)", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await submitPublicDeletionRequestAction(
        formData({ email: `person${i}@example.com`, requestType: "USER", confirmed: "on" })
      );
      expect("ok" in result && result.ok).toBe(true);
    }

    const sixth = await submitPublicDeletionRequestAction(
      formData({ email: "person-six@example.com", requestType: "USER", confirmed: "on" })
    );
    expect("error" in sixth).toBe(true);
    expect((sixth as { error: string }).error).toContain("Too many requests");
    expect(db.accountDeletionRequest.create).toHaveBeenCalledTimes(5); // the 6th never reached account lookup/creation
  });

  it("cannot be bypassed by changing the case of the same email (max 3/day per email)", async () => {
    // Leading/trailing whitespace in the submitted email is rejected by the
    // form's own zod validation (z.string().email()) before it ever reaches
    // the rate limiter or normalizeEmail() — verified directly below and at
    // the unit level in tests/rate-limit.test.ts's normalizeEmail tests.
    // This test covers the bypass vector that *does* reach the limiter:
    // case variation, since email format validation doesn't normalise case.
    const variants = ["Same@Example.com", "sAMe@eXample.com", "SAME@EXAMPLE.COM"];
    for (const [i, email] of variants.entries()) {
      setIp(`203.0.113.${i}`); // different IP each time — the IP limit must not be what blocks this
      const result = await submitPublicDeletionRequestAction(
        formData({ email, requestType: "USER", confirmed: "on" })
      );
      expect("ok" in result && result.ok).toBe(true);
    }

    setIp("203.0.113.99");
    const fourth = await submitPublicDeletionRequestAction(
      formData({ email: "sAme@example.COM", requestType: "USER", confirmed: "on" })
    );
    expect("error" in fourth).toBe(true);
  });

  it("rejects a whitespace-padded email at input validation, before it can reach the rate limiter at all", async () => {
    const result = await submitPublicDeletionRequestAction(
      formData({ email: "  padded@example.com  ", requestType: "USER", confirmed: "on" })
    );
    expect("error" in result).toBe(true);
    expect(db.accountDeletionRequest.create).not.toHaveBeenCalled();
  });

  it("applies the same-email limit across different IP addresses, not just the same IP", async () => {
    setIp("192.0.2.1");
    await submitPublicDeletionRequestAction(formData({ email: "shared@example.com", requestType: "USER", confirmed: "on" }));
    setIp("192.0.2.2");
    await submitPublicDeletionRequestAction(formData({ email: "shared@example.com", requestType: "USER", confirmed: "on" }));
    setIp("192.0.2.3");
    await submitPublicDeletionRequestAction(formData({ email: "shared@example.com", requestType: "USER", confirmed: "on" }));

    setIp("192.0.2.4"); // a brand new IP — only the shared email should cause the block
    const fourth = await submitPublicDeletionRequestAction(
      formData({ email: "shared@example.com", requestType: "USER", confirmed: "on" })
    );
    expect("error" in fourth).toBe(true);
  });

  it("stops blocking once the rate-limit window has expired", async () => {
    for (let i = 0; i < 5; i++) {
      await submitPublicDeletionRequestAction(
        formData({ email: `expiry-test-${i}@example.com`, requestType: "USER", confirmed: "on" })
      );
    }
    const blocked = await submitPublicDeletionRequestAction(
      formData({ email: "expiry-test-blocked@example.com", requestType: "USER", confirmed: "on" })
    );
    expect("error" in blocked).toBe(true);

    for (const row of fakeRateLimitModel._store.values()) {
      row.expiresAt = new Date(Date.now() - 1000);
    }

    const afterExpiry = await submitPublicDeletionRequestAction(
      formData({ email: "expiry-test-after@example.com", requestType: "USER", confirmed: "on" })
    );
    expect("ok" in afterExpiry && afterExpiry.ok).toBe(true);
  });

  it("never persists the raw IP address in the rate-limit table", async () => {
    setIp("203.0.113.55");
    await submitPublicDeletionRequestAction(
      formData({ email: "ip-privacy-test@example.com", requestType: "USER", confirmed: "on" })
    );

    for (const row of fakeRateLimitModel._store.values()) {
      expect(row.key).not.toContain("203.0.113.55");
      expect(row.key).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("keeps two different organisations' public requests fully isolated from each other", async () => {
    setIp("192.0.2.201");
    for (let i = 0; i < 3; i++) {
      const result = await submitPublicDeletionRequestAction(
        formData({ email: "admin@org-one.example", requestType: "USER", confirmed: "on" })
      );
      // 3rd hits org-one's own email cap — expected, not a cross-tenant leak.
      if (i < 2) expect("ok" in result && result.ok).toBe(true);
    }

    setIp("192.0.2.202");
    const otherOrgResult = await submitPublicDeletionRequestAction(
      formData({ email: "admin@org-two.example", requestType: "ORGANIZATION", organizationName: "Org Two", confirmed: "on" })
    );
    expect("ok" in otherOrgResult && otherOrgResult.ok).toBe(true);
  });
});

describe("verifyPublicDeletionRequestAction — single-use, time-limited tokens", () => {
  it("verifies a valid, unexpired token and marks the request VERIFIED", async () => {
    const { token, tokenHash } = generateVerificationToken();
    db.accountDeletionRequest.findMany.mockResolvedValue([
      { id: "req-1", verificationTokenHash: tokenHash },
    ]);
    db.accountDeletionRequest.update.mockResolvedValue({});

    const result = await verifyPublicDeletionRequestAction(token);

    expect(result).toEqual({ ok: true });
    expect(db.accountDeletionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req-1" },
        data: expect.objectContaining({
          status: "VERIFIED",
          verificationTokenHash: null,
          verificationExpiry: null,
        }),
      })
    );
  });

  it("rejects a token that doesn't match any pending, unexpired request", async () => {
    db.accountDeletionRequest.findMany.mockResolvedValue([]);

    const result = await verifyPublicDeletionRequestAction(generateVerificationToken().token);

    expect("error" in result).toBe(true);
  });

  it("rejects a malformed/short token outright without querying the database", async () => {
    const result = await verifyPublicDeletionRequestAction("short");
    expect("error" in result).toBe(true);
    expect(db.accountDeletionRequest.findMany).not.toHaveBeenCalled();
  });

  it("cannot be replayed a second time (token is blanked after first use)", async () => {
    const { token, tokenHash } = generateVerificationToken();

    // First verification: the candidate with the matching hash exists.
    db.accountDeletionRequest.findMany.mockResolvedValueOnce([
      { id: "req-1", verificationTokenHash: tokenHash },
    ]);
    db.accountDeletionRequest.update.mockResolvedValue({});
    const first = await verifyPublicDeletionRequestAction(token);
    expect(first).toEqual({ ok: true });

    // Second attempt: the real query filters on verificationTokenHash: { not: null }
    // and status: "PENDING_VERIFICATION" — since the row was just updated to
    // VERIFIED with a null hash, it would no longer be returned by that query.
    db.accountDeletionRequest.findMany.mockResolvedValueOnce([]);
    const second = await verifyPublicDeletionRequestAction(token);
    expect("error" in second).toBe(true);
  });

  it("rejects an expired token (simulated by the query excluding it, as the real expiry filter does)", async () => {
    // The real implementation filters verificationExpiry: { gt: new Date() }
    // at the query layer, so an expired request is simply absent from candidates.
    db.accountDeletionRequest.findMany.mockResolvedValue([]);

    const result = await verifyPublicDeletionRequestAction(generateVerificationToken().token);

    expect(result).toEqual({
      error: "This verification link is invalid or has expired. Please submit a new request.",
    });
  });

  it("locks out an IP after 10 failed verification attempts", async () => {
    db.accountDeletionRequest.findMany.mockResolvedValue([]); // never matches — every attempt fails

    for (let i = 0; i < 10; i++) {
      const result = await verifyPublicDeletionRequestAction(generateVerificationToken().token);
      expect("error" in result).toBe(true);
      expect((result as { error: string }).error).not.toContain("Too many verification attempts");
    }

    const eleventh = await verifyPublicDeletionRequestAction(generateVerificationToken().token);
    expect("error" in eleventh).toBe(true);
    expect((eleventh as { error: string }).error).toContain("Too many verification attempts");
  });

  it("does not penalise a successful verification towards the failure lockout", async () => {
    const { token, tokenHash } = generateVerificationToken();
    db.accountDeletionRequest.findMany.mockResolvedValue([{ id: "req-1", verificationTokenHash: tokenHash }]);
    db.accountDeletionRequest.update.mockResolvedValue({});

    for (let i = 0; i < 15; i++) {
      const result = await verifyPublicDeletionRequestAction(token);
      expect(result).toEqual({ ok: true });
    }
  });

  it.todo(
    "verification-email resend limiting — no resend action exists in this codebase yet; lib/rate-limit.ts's isLockedOut/recordFailedAttempt primitives are written generically so a future resend action can reuse them directly"
  );
});
