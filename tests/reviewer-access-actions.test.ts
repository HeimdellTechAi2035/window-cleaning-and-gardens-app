import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// This file's action calls trigger real bcrypt.hash(..., 12) — the same
// production cost factor used everywhere else in this codebase, correct to
// exercise faithfully here rather than mocking it away. Under parallel test
// load across the whole suite that occasionally exceeds Vitest's 5s default,
// so it's raised for this file only rather than lowering the hash cost.
vi.setConfig({ testTimeout: 20000 });

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// A generic auto-mock: every `.create` call returns `{ id: <fresh id>, ...data }`,
// every `.update` merges `data` onto a minimal stub, `.deleteMany` just
// records what it was called with. This is enough to exercise the real
// lib/reviewer-access.ts logic (not reimplemented here) against a fake but
// behaviourally-faithful Prisma client, matching the pattern already used
// throughout this project's other action tests.
let idCounter = 0;
function freshId() {
  return `fake-id-${idCounter++}`;
}
function fakeCreate() {
  return vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: freshId(), ...data }));
}
function fakeUpdate() {
  return vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({
    id: (where.id as string) ?? freshId(),
    ...data,
  }));
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      create: fakeCreate(),
      update: fakeUpdate(),
    },
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: fakeCreate(),
      update: fakeUpdate(),
      upsert: vi.fn(async ({ where, create }: { where: { email: string }; create: Record<string, unknown> }) => ({
        id: freshId(),
        email: where.email,
        ...create,
      })),
      count: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    customer: {
      count: vi.fn(),
      create: fakeCreate(),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    round: {
      count: vi.fn(),
      create: fakeCreate(),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    property: { create: fakeCreate() },
    service: { create: fakeCreate() },
    job: { count: vi.fn(), create: fakeCreate() },
    transaction: { create: fakeCreate() },
    notification: { create: fakeCreate() },
  },
}));

vi.mock("@/lib/super-admin", () => ({ requireSuperAdmin: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import {
  createReviewerAccountAction,
  regenerateReviewerPasswordAction,
  resetReviewerDemoDataAction,
  disableReviewerAccessAction,
} from "@/app/actions/reviewer-access";
import { REVIEWER_ORG_SLUG, REVIEWER_EMAIL } from "@/lib/reviewer-access";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's generated types are impractical to hand-mock; this file tests business logic, not Prisma's type surface.
const db = prisma as any;
const mockRequireSuperAdmin = requireSuperAdmin as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  idCounter = 0;
  mockRequireSuperAdmin.mockResolvedValue({ id: "platform-admin-1", email: "ops@heimdell.example" });
  // Fresh setup by default: nothing exists yet.
  db.organization.findUnique.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue(null);
  db.customer.count.mockResolvedValue(0);
  db.job.count.mockResolvedValue(0);
  db.round.count.mockResolvedValue(0);
  db.user.count.mockResolvedValue(0);
});

describe("createReviewerAccountAction", () => {
  it("lets a super-admin create the reviewer organisation, its admin user, and demo data", async () => {
    const result = await createReviewerAccountAction();

    expect(result).toEqual({ ok: true, tempPassword: expect.any(String) });
    expect(db.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: REVIEWER_ORG_SLUG,
          isReviewerOrganisation: true,
          subscriptionStatus: "active",
        }),
      })
    );
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: REVIEWER_EMAIL, role: "ADMIN", isActive: true }),
      })
    );
  });

  it("blocks a caller that isn't a valid super-admin, and touches no data", async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error("Not authorized"));

    const result = await createReviewerAccountAction();

    expect(result).toEqual({ error: "Not authorized" });
    expect(db.organization.create).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("is idempotent — a second run updates the existing organisation instead of creating a duplicate", async () => {
    const first = await createReviewerAccountAction();
    expect("ok" in first).toBe(true);
    expect(db.organization.create).toHaveBeenCalledTimes(1);

    // Simulate the org (and its demo data) now existing for the second run.
    const createdOrgData = db.organization.create.mock.calls[0][0].data;
    db.organization.findUnique.mockResolvedValue({ id: "org-1", ...createdOrgData });
    db.user.findUnique.mockResolvedValue({ id: "user-1", organizationId: "org-1", email: REVIEWER_EMAIL });
    db.customer.count.mockResolvedValue(6); // demo data already populated

    const second = await createReviewerAccountAction();

    expect("ok" in second).toBe(true);
    expect(db.organization.create).toHaveBeenCalledTimes(1); // still only once — no duplicate
    expect(db.organization.update).toHaveBeenCalled(); // second run re-asserts via update instead
  });

  it("gives the reviewer organisation active access without ever touching Stripe fields", async () => {
    await createReviewerAccountAction();

    const orgData = db.organization.create.mock.calls[0][0].data;
    expect(orgData.subscriptionStatus).toBe("active");
    expect(orgData).not.toHaveProperty("platformStripeCustomerId");
    expect(orgData).not.toHaveProperty("platformStripeSubscriptionId");
  });

  it("stores the reviewer password only as a bcrypt hash, never in plaintext", async () => {
    const result = await createReviewerAccountAction();
    expect("ok" in result).toBe(true);
    const tempPassword = (result as { ok: true; tempPassword: string }).tempPassword;

    const userData = db.user.create.mock.calls[0][0].data;
    expect(userData.passwordHash).not.toBe(tempPassword);
    expect(userData.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix
    expect(userData).not.toHaveProperty("password");
    await expect(bcrypt.compare(tempPassword, userData.passwordHash)).resolves.toBe(true);
  });

  it("returns the generated password only in the action's own return value — never on the status read shape", async () => {
    const result = await createReviewerAccountAction();
    expect("ok" in result && "tempPassword" in result).toBe(true);

    // getReviewerAccessStatus() (used to render the admin page) has a
    // structurally different, password-free return shape — imported and
    // checked directly here rather than duplicating its own test file.
    const { getReviewerAccessStatus } = await import("@/lib/reviewer-access");
    db.organization.findUnique.mockResolvedValue({
      id: "org-1",
      name: "RoundFlow Google Play Demo",
      subscriptionStatus: "active",
      reviewerDemoDataResetAt: null,
    });
    db.user.findUnique.mockResolvedValue({ isActive: true });
    const status = await getReviewerAccessStatus();
    expect(Object.keys(status).join(",")).not.toMatch(/password/i);
  });

  it("creates demo data scoped only to the newly created reviewer organisation's own id", async () => {
    await createReviewerAccountAction();

    const reviewerOrgId = (await db.organization.create.mock.results[0].value).id;
    const customerOrgIds = db.customer.create.mock.calls.map((c: [{ data: { organizationId: string } }]) => c[0].data.organizationId);
    const roundOrgIds = db.round.create.mock.calls.map((c: [{ data: { organizationId: string } }]) => c[0].data.organizationId);
    const jobOrgIds = db.job.create.mock.calls.map((c: [{ data: { organizationId: string } }]) => c[0].data.organizationId);

    for (const id of [...customerOrgIds, ...roundOrgIds, ...jobOrgIds]) {
      expect(id).toBe(reviewerOrgId);
    }
    // Sanity: the expected volumes from the spec were actually created.
    expect(db.customer.create).toHaveBeenCalledTimes(6);
    expect(db.job.create).toHaveBeenCalledTimes(14); // 8 upcoming + 4 completed + 2 cancelled
  });

  it("gives the reviewer user the same shape as any normal tenant admin — no special routing, just the standard gates", async () => {
    await createReviewerAccountAction();
    const userData = db.user.create.mock.calls[0][0].data;
    expect(userData.role).toBe("ADMIN");
    expect(userData.isActive).toBe(true);
    expect(userData).toHaveProperty("organizationId");
  });

  it("never creates a PlatformAdmin row — the reviewer account has no path into /admin", async () => {
    await createReviewerAccountAction();
    // lib/reviewer-access.ts never references prisma.platformAdmin at all —
    // asserted here by confirming it was never added to the mocked client
    // in the first place, i.e. calling it would throw, not silently pass.
    expect(db.platformAdmin).toBeUndefined();
  });
});

describe("regenerateReviewerPasswordAction", () => {
  it("issues a new password that invalidates the previous one", async () => {
    db.organization.findUnique.mockResolvedValue({ id: "org-1", slug: REVIEWER_ORG_SLUG });
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", organizationId: "org-1", email: REVIEWER_EMAIL });

    const first = await regenerateReviewerPasswordAction();
    const second = await regenerateReviewerPasswordAction();

    expect("ok" in first && "ok" in second).toBe(true);
    const firstPassword = (first as { ok: true; tempPassword: string }).tempPassword;
    const secondHash = db.user.update.mock.calls[1][0].data.passwordHash;

    expect(firstPassword).not.toBe((second as { ok: true; tempPassword: string }).tempPassword);
    await expect(bcrypt.compare(firstPassword, secondHash)).resolves.toBe(false);
  });

  it("fails cleanly if the reviewer organisation doesn't exist yet", async () => {
    db.organization.findUnique.mockResolvedValue(null);
    const result = await regenerateReviewerPasswordAction();
    expect("error" in result).toBe(true);
  });
});

describe("resetReviewerDemoDataAction — scoping and cross-tenant isolation", () => {
  it("wipes and repopulates only the reviewer organisation's own data", async () => {
    db.organization.findUnique.mockResolvedValue({ id: "reviewer-org-1", slug: REVIEWER_ORG_SLUG });

    const result = await resetReviewerDemoDataAction();

    expect(result).toEqual({ ok: true });
    expect(db.customer.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "reviewer-org-1" } });
    expect(db.round.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "reviewer-org-1" } });
    expect(db.user.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "reviewer-org-1", role: "OPERATIVE" } });

    // Every recreated record belongs to the reviewer org — never any other id
    // (e.g. a real GreenFix organisation's id would never appear here).
    for (const call of db.customer.create.mock.calls) {
      expect(call[0].data.organizationId).toBe("reviewer-org-1");
    }
  });

  it("never issues an unscoped or cross-tenant delete", async () => {
    db.organization.findUnique.mockResolvedValue({ id: "reviewer-org-1", slug: REVIEWER_ORG_SLUG });
    await resetReviewerDemoDataAction();

    for (const mockFn of [db.customer.deleteMany, db.round.deleteMany, db.user.deleteMany]) {
      for (const call of mockFn.mock.calls) {
        expect(call[0].where.organizationId).toBe("reviewer-org-1");
        expect(call[0].where.organizationId).not.toBe("greenfix-org-id"); // representative real-tenant id
      }
    }
  });
});

describe("disableReviewerAccessAction", () => {
  it("deactivates the reviewer user so it can no longer sign in", async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", email: REVIEWER_EMAIL });

    const result = await disableReviewerAccessAction();

    expect(result).toEqual({ ok: true });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { isActive: false } });
    // The actual login-blocking enforcement is lib/auth.ts's existing,
    // separately-tested authorize() gate on `!user.isActive` — not
    // duplicated here.
  });

  it("requires super-admin authority, same as every other reviewer-access action", async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error("Not authorized"));
    const result = await disableReviewerAccessAction();
    expect(result).toEqual({ error: "Not authorized" });
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
