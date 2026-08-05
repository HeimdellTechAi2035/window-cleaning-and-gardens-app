import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    accountDeletionRequest: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    session: { deleteMany: vi.fn() },
    account: { deleteMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

// processOrganizationDeletion pulls in @/lib/platform-billing, which throws
// at call-time (not import-time) when PLATFORM_STRIPE_SECRET_KEY is unset —
// none of these tests set it, so the real lib/account-deletion module can
// run unmocked against the mocked prisma above.

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  requestUserDeletionAction,
  requestOrganizationDeletionAction,
  cancelOrganizationDeletionRequestAction,
} from "@/app/actions/account-deletion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's generated types are impractical to hand-mock; this file tests business logic, not Prisma's type surface.
const db = prisma as any;
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const PASSWORD = "correct-horse-battery-staple";
let passwordHash: string;

beforeEach(async () => {
  vi.clearAllMocks();
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

describe("requestUserDeletionAction — normal user (not sole admin)", () => {
  it("anonymises the user and records a completed deletion request", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", organizationId: "org-1", email: "worker@example.com" },
    });
    db.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      email: "worker@example.com",
      passwordHash,
    });
    // isSoleActiveAdmin() checks: not an admin, so short-circuits to false.
    db.user.findUnique.mockResolvedValue({ role: "WORKER", isActive: true });

    const result = await requestUserDeletionAction(formData({ password: PASSWORD }));

    expect(result).toEqual({ ok: true });
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ name: "Former user", passwordHash: null, isActive: false }),
      })
    );
    expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(db.accountDeletionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED", requestType: "USER" }) })
    );
  });

  it("rejects an incorrect password without touching any data", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", organizationId: "org-1", email: "worker@example.com" } });
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", email: "worker@example.com", passwordHash });

    const result = await requestUserDeletionAction(formData({ password: "wrong-password" }));

    expect(result).toEqual({ error: "Incorrect password." });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.accountDeletionRequest.create).not.toHaveBeenCalled();
  });
});

describe("requestUserDeletionAction — sole administrator", () => {
  it("blocks self-deletion and does not anonymise anything, leaving a recovery path", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "admin-1", organizationId: "org-1", email: "boss@example.com" },
    });
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "admin-1", email: "boss@example.com", passwordHash });
    // isSoleActiveAdmin(): the requester IS an active admin, and count of
    // active admins in the org is 1 — so it's blocking, not the count call.
    db.user.findUnique.mockResolvedValue({ role: "ADMIN", isActive: true });
    db.user.count.mockResolvedValue(1);

    const result = await requestUserDeletionAction(formData({ password: PASSWORD }));

    expect(result).toEqual({
      error: expect.stringContaining("only administrator"),
    });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.accountDeletionRequest.create).not.toHaveBeenCalled();
  });

  it("allows self-deletion once a second active admin exists", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "admin-1", organizationId: "org-1", email: "boss@example.com" },
    });
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "admin-1", email: "boss@example.com", passwordHash });
    db.user.findUnique.mockResolvedValue({ role: "ADMIN", isActive: true });
    db.user.count.mockResolvedValue(2); // another active admin now exists

    const result = await requestUserDeletionAction(formData({ password: PASSWORD }));

    expect(result).toEqual({ ok: true });
    expect(db.user.update).toHaveBeenCalled();
  });
});

describe("requestOrganizationDeletionAction", () => {
  const adminSession = { user: { id: "admin-1", organizationId: "org-1", email: "boss@example.com" } };

  it("blocks a non-admin from requesting organisation deletion", async () => {
    mockAuth.mockResolvedValue({ user: { id: "worker-1", organizationId: "org-1", email: "w@example.com" } });
    // requireFreshAdmin() re-checks role fresh from the DB — a non-admin fails here.
    db.user.findUnique.mockResolvedValue({ role: "WORKER", isActive: true, organizationId: "org-1" });

    const result = await requestOrganizationDeletionAction(formData({ password: PASSWORD, confirmName: "Acme" }));

    expect(result).toEqual({ error: "Admin access required" });
    expect(db.accountDeletionRequest.create).not.toHaveBeenCalled();
  });

  it("blocks a non-admin even if the browser-supplied session claims ADMIN (server re-checks role from DB)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "worker-1", organizationId: "org-1", role: "ADMIN", email: "w@example.com" } });
    db.user.findUnique.mockResolvedValue({ role: "WORKER", isActive: true, organizationId: "org-1" });

    const result = await requestOrganizationDeletionAction(formData({ password: PASSWORD, confirmName: "Acme" }));

    expect(result).toEqual({ error: "Admin access required" });
  });

  it("lets an admin request organisation deletion with correct password + exact name match", async () => {
    mockAuth.mockResolvedValue(adminSession);
    db.user.findUnique.mockResolvedValue({ role: "ADMIN", isActive: true, organizationId: "org-1" });
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "admin-1", email: "boss@example.com", passwordHash });
    db.organization.findUniqueOrThrow.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      platformStripeSubscriptionId: null,
      subscriptionStatus: "active",
    });
    db.accountDeletionRequest.findFirst.mockResolvedValue(null); // no existing active request

    const result = await requestOrganizationDeletionAction(formData({ password: PASSWORD, confirmName: "Acme" }));

    expect(result).toEqual({ ok: true, processingDeadline: expect.any(String) });
    expect(db.accountDeletionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestType: "ORGANIZATION", status: "VERIFIED", organizationId: "org-1" }),
      })
    );
  });

  it("rejects a confirmation name that doesn't exactly match the organisation name", async () => {
    mockAuth.mockResolvedValue(adminSession);
    db.user.findUnique.mockResolvedValue({ role: "ADMIN", isActive: true, organizationId: "org-1" });
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "admin-1", email: "boss@example.com", passwordHash });
    db.organization.findUniqueOrThrow.mockResolvedValue({ id: "org-1", name: "Acme", subscriptionStatus: "active" });

    const result = await requestOrganizationDeletionAction(formData({ password: PASSWORD, confirmName: "acme" }));

    expect(result).toEqual({ error: 'Type "Acme" exactly to confirm.' });
    expect(db.accountDeletionRequest.create).not.toHaveBeenCalled();
  });

  it("prevents a duplicate active deletion request for the same organisation", async () => {
    mockAuth.mockResolvedValue(adminSession);
    db.user.findUnique.mockResolvedValue({ role: "ADMIN", isActive: true, organizationId: "org-1" });
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "admin-1", email: "boss@example.com", passwordHash });
    db.organization.findUniqueOrThrow.mockResolvedValue({ id: "org-1", name: "Acme", subscriptionStatus: "active" });
    db.accountDeletionRequest.findFirst.mockResolvedValue({ id: "existing-req", status: "VERIFIED" });

    const result = await requestOrganizationDeletionAction(formData({ password: PASSWORD, confirmName: "Acme" }));

    expect(result).toEqual({ error: "A deletion request for this organisation is already pending." });
    expect(db.accountDeletionRequest.create).not.toHaveBeenCalled();
  });
});

describe("authenticated in-app deletion is unaffected by the public endpoint's rate limiter", () => {
  it("allows many consecutive authenticated organisation-deletion requests with no rate-limit interference", async () => {
    // The mocked prisma client above deliberately has no `rateLimitBucket`
    // model — if this action were ever accidentally wired into the public
    // rate limiter (lib/rate-limit.ts), calling it would throw immediately
    // rather than silently pass, since that model would be undefined here.
    for (let i = 0; i < 8; i++) {
      mockAuth.mockResolvedValue({
        user: { id: `admin-${i}`, organizationId: `org-${i}`, email: `boss${i}@example.com` },
      });
      db.user.findUnique.mockResolvedValue({ role: "ADMIN", isActive: true, organizationId: `org-${i}` });
      db.user.findUniqueOrThrow.mockResolvedValue({ id: `admin-${i}`, email: `boss${i}@example.com`, passwordHash });
      db.organization.findUniqueOrThrow.mockResolvedValue({
        id: `org-${i}`,
        name: `Org ${i}`,
        platformStripeSubscriptionId: null,
        subscriptionStatus: "active",
      });
      db.accountDeletionRequest.findFirst.mockResolvedValue(null);

      const result = await requestOrganizationDeletionAction(formData({ password: PASSWORD, confirmName: `Org ${i}` }));
      expect(result).toEqual({ ok: true, processingDeadline: expect.any(String) });
    }
  });
});

describe("cancelOrganizationDeletionRequestAction", () => {
  it("prevents cancelling a request that belongs to a different organisation (cross-tenant access)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1", organizationId: "org-1", email: "boss@example.com" } });
    db.user.findUnique.mockResolvedValue({ role: "ADMIN", isActive: true, organizationId: "org-1" });
    db.accountDeletionRequest.findUniqueOrThrow.mockResolvedValue({
      id: "req-1",
      organizationId: "org-2", // belongs to a different org
      status: "VERIFIED",
    });

    const result = await cancelOrganizationDeletionRequestAction("req-1");

    expect(result).toEqual({ error: "Not authorized" });
    expect(db.accountDeletionRequest.update).not.toHaveBeenCalled();
  });

  it("cancels a pending request for the caller's own organisation", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1", organizationId: "org-1", email: "boss@example.com" } });
    db.user.findUnique.mockResolvedValue({ role: "ADMIN", isActive: true, organizationId: "org-1" });
    db.accountDeletionRequest.findUniqueOrThrow.mockResolvedValue({
      id: "req-1",
      organizationId: "org-1",
      status: "VERIFIED",
    });

    const result = await cancelOrganizationDeletionRequestAction("req-1");

    expect(result).toEqual({ ok: true });
    expect(db.accountDeletionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "req-1" }, data: expect.objectContaining({ status: "CANCELLED" }) })
    );
  });

  it("refuses to cancel a request that has already completed (completed requests are immutable)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1", organizationId: "org-1", email: "boss@example.com" } });
    db.user.findUnique.mockResolvedValue({ role: "ADMIN", isActive: true, organizationId: "org-1" });
    db.accountDeletionRequest.findUniqueOrThrow.mockResolvedValue({
      id: "req-1",
      organizationId: "org-1",
      status: "COMPLETED",
    });

    const result = await cancelOrganizationDeletionRequestAction("req-1");

    expect(result).toEqual({ error: "This request can no longer be cancelled." });
    expect(db.accountDeletionRequest.update).not.toHaveBeenCalled();
  });
});
