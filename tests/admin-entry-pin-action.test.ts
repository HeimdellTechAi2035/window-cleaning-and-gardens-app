import { describe, it, expect, vi, beforeEach } from "vitest";

// Same in-memory fake Postgres rate-limit store as tests/rate-limit.test.ts
// — verifyAdminEntryPin uses the real lib/rate-limit.ts (not mocked) so
// this exercises genuine lockout behaviour, only faking the lowest-level
// Prisma calls it makes.
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

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

import { verifyAdminEntryPin } from "@/app/actions/admin-entry";

const TEST_IP = "203.0.113.55";

beforeEach(() => {
  fakeModel._store.clear();
  mockHeaders = { "x-nf-client-connection-ip": TEST_IP };
  process.env.AUTH_SECRET = "test-only-secret-for-rate-limit-hmac";
  process.env.ADMIN_ENTRY_PIN = "4821";
  consoleErrorSpy.mockClear();
});

describe("verifyAdminEntryPin — hidden navigation gate, not authentication", () => {
  it("returns ok:true for the correct PIN", async () => {
    const result = await verifyAdminEntryPin("4821");
    expect(result).toEqual({ ok: true });
  });

  it("returns a generic ok:false for the wrong PIN, without revealing which digit was wrong", async () => {
    const result = await verifyAdminEntryPin("1234");
    expect(result).toEqual({ ok: false });
  });

  it("rejects fewer than 4 digits", async () => {
    expect(await verifyAdminEntryPin("482")).toEqual({ ok: false });
  });

  it("rejects more than 4 digits", async () => {
    expect(await verifyAdminEntryPin("48212")).toEqual({ ok: false });
  });

  it("rejects non-numeric input", async () => {
    expect(await verifyAdminEntryPin("48a1")).toEqual({ ok: false });
    expect(await verifyAdminEntryPin("abcd")).toEqual({ ok: false });
  });

  it("never reveals that ADMIN_ENTRY_PIN is missing — same generic failure shape", async () => {
    delete process.env.ADMIN_ENTRY_PIN;
    const result = await verifyAdminEntryPin("4821");
    expect(result).toEqual({ ok: false });
    // Logging the misconfiguration server-side is fine — just never in the response.
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("never reveals that ADMIN_ENTRY_PIN is misconfigured (wrong length) — same generic failure shape", async () => {
    process.env.ADMIN_ENTRY_PIN = "12"; // misconfigured: not 4 digits
    const result = await verifyAdminEntryPin("12");
    expect(result).toEqual({ ok: false });
  });

  it("never returns the configured PIN value in any shape", async () => {
    const result = await verifyAdminEntryPin("0000");
    expect(JSON.stringify(result)).not.toContain("4821");
  });

  it("locks out after 5 failed attempts from the same IP", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await verifyAdminEntryPin("0000");
      expect(result.ok).toBe(false);
    }
    const sixth = await verifyAdminEntryPin("4821"); // correct PIN, but locked out
    expect(sixth).toMatchObject({ ok: false, lockedOut: true });
    expect((sixth as { retryAfterSeconds?: number }).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("does not count a successful attempt toward the failure lockout", async () => {
    for (let i = 0; i < 4; i++) {
      await verifyAdminEntryPin("0000");
    }
    expect(await verifyAdminEntryPin("4821")).toEqual({ ok: true }); // correct, doesn't add a failure
    // Only 4 failures recorded — one more wrong guess should not lock out yet.
    const result = await verifyAdminEntryPin("0000");
    expect(result).toEqual({ ok: false });
  });

  it("allows attempts again once the lockout window has expired", async () => {
    for (let i = 0; i < 5; i++) {
      await verifyAdminEntryPin("0000");
    }
    expect((await verifyAdminEntryPin("4821")).ok).toBe(false); // locked out

    // Simulate the 15-minute window elapsing, rather than sleeping in the test.
    for (const row of fakeModel._store.values()) {
      row.expiresAt = new Date(Date.now() - 1000);
    }

    expect(await verifyAdminEntryPin("4821")).toEqual({ ok: true });
  });

  it("never stores the raw PIN anywhere in the rate-limit backing store", async () => {
    await verifyAdminEntryPin("4821");
    await verifyAdminEntryPin("0000");

    for (const row of fakeModel._store.values()) {
      expect(row.key).not.toContain("4821");
      expect(row.key).not.toContain("0000");
      expect(row.key).toMatch(/^[0-9a-f]{64}$/); // sha256 hex digest, not a raw value
    }
  });

  it("never stores the raw IP address — only a keyed-HMAC hash of it", async () => {
    await verifyAdminEntryPin("0000");

    const rows = [...fakeModel._store.values()];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.key).not.toBe(TEST_IP);
      expect(row.key).not.toContain(TEST_IP);
      expect(row.key).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("keeps different IPs isolated from each other's lockout state", async () => {
    for (let i = 0; i < 5; i++) {
      await verifyAdminEntryPin("0000");
    }
    expect((await verifyAdminEntryPin("4821")).ok).toBe(false); // this IP locked out

    mockHeaders = { "x-nf-client-connection-ip": "198.51.100.9" };
    expect(await verifyAdminEntryPin("4821")).toEqual({ ok: true }); // different IP, unaffected
  });
});
