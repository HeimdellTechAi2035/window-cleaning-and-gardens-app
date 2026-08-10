import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/route-optimizer", () => ({ bulkPostcodesIoLookup: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { bulkPostcodesIoLookup } from "@/lib/route-optimizer";
import { backfillPropertyCoordinatesAction } from "@/app/actions/organization";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's generated types are impractical to hand-mock; these tests cover action logic, not Prisma's type surface.
const db = prisma as any;
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockBulkLookup = bulkPostcodesIoLookup as unknown as ReturnType<typeof vi.fn>;

const ADMIN_SESSION = { user: { id: "admin-1", organizationId: "org-1", role: "ADMIN" } };

beforeEach(() => {
  vi.clearAllMocks();
  db.property.count.mockResolvedValue(0);
  mockBulkLookup.mockResolvedValue(new Map());
});

describe("backfillPropertyCoordinatesAction", () => {
  it("rejects when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(backfillPropertyCoordinatesAction()).rejects.toThrow("Not authenticated");
    expect(db.property.findMany).not.toHaveBeenCalled();
  });

  it("rejects a non-admin (OPERATIVE) session", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", organizationId: "org-1", role: "OPERATIVE" } });
    await expect(backfillPropertyCoordinatesAction()).rejects.toThrow("Admin access required");
    expect(db.property.findMany).not.toHaveBeenCalled();
  });

  it("only queries properties that are not coordinate-locked", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    db.property.findMany.mockResolvedValue([]);

    await backfillPropertyCoordinatesAction();

    expect(db.property.findMany).toHaveBeenCalledWith({
      where: { customer: { organizationId: "org-1" }, coordinatesLocked: false },
      select: { id: true, postcode: true },
    });
  });

  it("uses the fast bulk lookup rather than one request per property", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    db.property.findMany.mockResolvedValue([
      { id: "prop-1", postcode: "PR1 1AA" },
      { id: "prop-2", postcode: "M1 1AA" },
    ]);
    mockBulkLookup.mockResolvedValue(
      new Map([
        ["PR1 1AA", { latitude: 53.76, longitude: -2.7 }],
        ["M1 1AA", { latitude: 53.48, longitude: -2.24 }],
      ])
    );

    const result = await backfillPropertyCoordinatesAction();

    expect(mockBulkLookup).toHaveBeenCalledTimes(1);
    expect(mockBulkLookup).toHaveBeenCalledWith(["PR1 1AA", "M1 1AA"]);
    expect(db.property.update).toHaveBeenCalledWith({
      where: { id: "prop-1" },
      data: { latitude: 53.76, longitude: -2.7 },
    });
    expect(db.property.update).toHaveBeenCalledWith({
      where: { id: "prop-2" },
      data: { latitude: 53.48, longitude: -2.24 },
    });
    expect(result.geocoded).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("counts a property as failed, without updating it, when the bulk lookup has no result for it", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    db.property.findMany.mockResolvedValue([{ id: "prop-1", postcode: "ZZ99 9ZZ" }]);
    mockBulkLookup.mockResolvedValue(new Map([["ZZ99 9ZZ", null]]));

    const result = await backfillPropertyCoordinatesAction();

    expect(db.property.update).not.toHaveBeenCalled();
    expect(result).toEqual({ geocoded: 0, failed: 1, skippedLocked: 0 });
  });

  it("reports how many properties were skipped because their pin is manually locked", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    db.property.findMany.mockResolvedValue([]);
    db.property.count.mockResolvedValue(3);

    const result = await backfillPropertyCoordinatesAction();

    expect(db.property.count).toHaveBeenCalledWith({
      where: { customer: { organizationId: "org-1" }, coordinatesLocked: true },
    });
    expect(result.skippedLocked).toBe(3);
  });

  it("never queries or updates a locked property at all", async () => {
    // The findMany mock itself is what enforces "coordinatesLocked: false"
    // in the where clause (asserted in a separate test) — this test checks
    // that a locked property genuinely never reaches bulkPostcodesIoLookup
    // or property.update, by simulating findMany already excluding it.
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    db.property.findMany.mockResolvedValue([{ id: "prop-unlocked", postcode: "PR1 1AA" }]);
    db.property.count.mockResolvedValue(1); // the locked one
    mockBulkLookup.mockResolvedValue(new Map([["PR1 1AA", { latitude: 53.76, longitude: -2.7 }]]));

    await backfillPropertyCoordinatesAction();

    expect(mockBulkLookup).toHaveBeenCalledWith(["PR1 1AA"]);
    expect(db.property.update).toHaveBeenCalledTimes(1);
  });
});
