import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn(), delete: vi.fn() },
    accountDeletionRequest: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    session: { deleteMany: vi.fn() },
    account: { deleteMany: vi.fn() },
    platformBillingRecord: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

vi.mock("@/lib/super-admin", () => ({ requireSuperAdmin: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import {
  processUserDeletionRequestAction,
  processOrganizationDeletionRequestAction,
  rejectDeletionRequestAction,
  cancelDeletionRequestAsAdminAction,
} from "@/app/actions/admin-deletion-queue";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's generated types are impractical to hand-mock; this file tests business logic, not Prisma's type surface.
const db = prisma as any;
const mockRequireSuperAdmin = requireSuperAdmin as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PLATFORM_STRIPE_SECRET_KEY;
  mockRequireSuperAdmin.mockResolvedValue({ id: "platform-admin-1", email: "ops@heimdell.example" });
});

describe("platform-admin gating", () => {
  it("refuses to process anything for a caller that isn't a valid platform admin", async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error("Not authorized"));

    const result = await processUserDeletionRequestAction("req-1");

    expect(result).toEqual({ error: "Not authorized" });
    expect(db.accountDeletionRequest.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe("processUserDeletionRequestAction", () => {
  it("anonymises the linked user and marks the request completed", async () => {
    db.accountDeletionRequest.findUniqueOrThrow.mockResolvedValue({
      id: "req-1",
      requestType: "USER",
      status: "VERIFIED",
      userId: "user-1",
      processingNotes: null,
    });
    db.user.findUnique.mockResolvedValue({ id: "user-1" });

    const result = await processUserDeletionRequestAction("req-1");

    expect(result).toEqual({ ok: true });
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" }, data: expect.objectContaining({ isActive: false }) })
    );
    expect(db.accountDeletionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "req-1" }, data: expect.objectContaining({ status: "COMPLETED" }) })
    );
  });

  it("is idempotent — re-processing an already-completed request is a no-op", async () => {
    db.accountDeletionRequest.findUniqueOrThrow.mockResolvedValue({
      id: "req-1",
      requestType: "USER",
      status: "COMPLETED",
      userId: "user-1",
    });

    const result = await processUserDeletionRequestAction("req-1");

    expect(result).toEqual({ ok: true });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.accountDeletionRequest.update).not.toHaveBeenCalled();
  });
});

describe("processOrganizationDeletionRequestAction", () => {
  const baseRequest = {
    id: "req-org-1",
    requestType: "ORGANIZATION" as const,
    status: "VERIFIED" as const,
    organizationId: "org-1",
    processingNotes: null,
  };

  it("deletes the organisation (cascading to its tenant operational data) and retains only a minimal billing record", async () => {
    db.accountDeletionRequest.findUniqueOrThrow.mockResolvedValue(baseRequest);
    db.organization.findUnique.mockResolvedValue({
      id: "org-1",
      name: "Acme Window Cleaning",
      slug: "acme",
      createdAt: new Date("2024-01-01"),
      platformStripeSubscriptionId: null,
      platformStripeCustomerId: null,
      subscriptionStatus: "canceled",
    });
    db.platformBillingRecord.create.mockResolvedValue({});
    db.organization.delete.mockResolvedValue({});

    const result = await processOrganizationDeletionRequestAction("req-org-1");

    expect(result).toEqual({ ok: true });
    // The org row itself is deleted — schema-level cascades (see
    // prisma/schema.prisma) take every customer, property, job, round,
    // transaction, and notification with it.
    expect(db.organization.delete).toHaveBeenCalledWith({ where: { id: "org-1" } });

    const billingRecordData = db.platformBillingRecord.create.mock.calls[0][0].data;
    const disallowedKeys = [
      "customerEmail",
      "customerName",
      "customerPhone",
      "customerAddress",
      "workerName",
      "jobNotes",
      "photo",
    ];
    for (const key of disallowedKeys) {
      expect(billingRecordData).not.toHaveProperty(key);
    }
    expect(Object.keys(billingRecordData).sort()).toEqual(
      [
        "deletionRequestId",
        "lastSubscriptionStatus",
        "organizationName",
        "organizationSlug",
        "platformStripeCustomerId",
        "platformStripeSubscriptionId",
        "retainedUntil",
        "subscriptionEndedAt",
        "subscriptionStartedAt",
      ].sort()
    );

    expect(db.accountDeletionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "req-org-1" }, data: expect.objectContaining({ status: "COMPLETED" }) })
    );
  });

  it("computes retainedUntil from the organisation's last billed period (currentPeriodEnd), rounded to the Heimdell financial year end (31 May) + 6 years", async () => {
    db.accountDeletionRequest.findUniqueOrThrow.mockResolvedValue(baseRequest);
    db.organization.findUnique.mockResolvedValue({
      id: "org-1",
      name: "Acme Window Cleaning",
      slug: "acme",
      createdAt: new Date("2024-01-01"),
      platformStripeSubscriptionId: null,
      platformStripeCustomerId: null,
      subscriptionStatus: "canceled",
      // 5 August falls in the financial year ending 31 May 2027 -> +6 years = 31 May 2033.
      currentPeriodEnd: new Date("2026-08-05T00:00:00.000Z"),
    });
    db.platformBillingRecord.create.mockResolvedValue({});
    db.organization.delete.mockResolvedValue({});

    await processOrganizationDeletionRequestAction("req-org-1");

    const billingRecordData = db.platformBillingRecord.create.mock.calls[0][0].data;
    const retainedUntil: Date = billingRecordData.retainedUntil;
    expect(retainedUntil.getUTCFullYear()).toBe(2033);
    expect(retainedUntil.getUTCMonth()).toBe(4); // May
    expect(retainedUntil.getUTCDate()).toBe(31);
  });

  it("falls back to the processing moment (not subscription cancellation date, per its own documented exception) only when no billed period was ever recorded", async () => {
    db.accountDeletionRequest.findUniqueOrThrow.mockResolvedValue(baseRequest);
    db.organization.findUnique.mockResolvedValue({
      id: "org-1",
      name: "Acme Window Cleaning",
      slug: "acme",
      createdAt: new Date("2024-01-01"),
      platformStripeSubscriptionId: null,
      platformStripeCustomerId: null,
      subscriptionStatus: "canceled",
      currentPeriodEnd: null, // never billed — no genuine transaction date exists to anchor to
    });
    db.platformBillingRecord.create.mockResolvedValue({});
    db.organization.delete.mockResolvedValue({});

    const before = new Date();
    await processOrganizationDeletionRequestAction("req-org-1");
    const after = new Date();

    const billingRecordData = db.platformBillingRecord.create.mock.calls[0][0].data;
    const subscriptionEndedAt: Date = billingRecordData.subscriptionEndedAt;
    // The fallback basis is "now" (processing time) — confirm it's within
    // the test's own execution window, then confirm retainedUntil is
    // whatever financial year *that* falls into, not an arbitrary value.
    expect(subscriptionEndedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(subscriptionEndedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    const retainedUntil: Date = billingRecordData.retainedUntil;
    expect(retainedUntil.getUTCMonth()).toBe(4);
    expect(retainedUntil.getUTCDate()).toBe(31);
  });

  it("is idempotent — re-processing an already-completed request never re-deletes or re-bills", async () => {
    db.accountDeletionRequest.findUniqueOrThrow.mockResolvedValue({ ...baseRequest, status: "COMPLETED" });

    const result = await processOrganizationDeletionRequestAction("req-org-1");

    expect(result).toEqual({ ok: true });
    expect(db.organization.delete).not.toHaveBeenCalled();
    expect(db.platformBillingRecord.create).not.toHaveBeenCalled();
  });

  it("is idempotent even when re-run after the organisation row is already gone (no duplicate billing record)", async () => {
    db.accountDeletionRequest.findUniqueOrThrow.mockResolvedValue(baseRequest);
    db.organization.findUnique.mockResolvedValue(null); // already deleted by a prior run

    const result = await processOrganizationDeletionRequestAction("req-org-1");

    expect(result).toEqual({ ok: true });
    expect(db.organization.delete).not.toHaveBeenCalled();
    expect(db.platformBillingRecord.create).not.toHaveBeenCalled();
    expect(db.accountDeletionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "COMPLETED",
          retentionSummary: expect.stringContaining("already"),
        }),
      })
    );
  });
});

describe("closed requests are immutable to admin actions", () => {
  it("refuses to reject a request that is already completed", async () => {
    db.accountDeletionRequest.findUniqueOrThrow.mockResolvedValue({ id: "req-1", status: "COMPLETED" });

    const formData = new FormData();
    formData.set("requestId", "req-1");
    formData.set("reason", "changed my mind");
    const result = await rejectDeletionRequestAction(formData);

    expect(result).toEqual({ error: "This request has already been closed." });
    expect(db.accountDeletionRequest.update).not.toHaveBeenCalled();
  });

  it("refuses to cancel a request that is already rejected", async () => {
    db.accountDeletionRequest.findUniqueOrThrow.mockResolvedValue({ id: "req-1", status: "REJECTED" });

    const result = await cancelDeletionRequestAsAdminAction("req-1");

    expect(result).toEqual({ error: "This request has already been closed." });
    expect(db.accountDeletionRequest.update).not.toHaveBeenCalled();
  });
});
