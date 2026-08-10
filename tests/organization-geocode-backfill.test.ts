import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/route-optimizer", () => ({ geocodeAddress: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findMany: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { geocodeAddress } from "@/lib/route-optimizer";
import { backfillPropertyCoordinatesAction } from "@/app/actions/organization";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's generated types are impractical to hand-mock; these tests cover action logic, not Prisma's type surface.
const db = prisma as any;
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockGeocode = geocodeAddress as unknown as ReturnType<typeof vi.fn>;

const ADMIN_SESSION = { user: { id: "admin-1", organizationId: "org-1", role: "ADMIN" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
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

  it("queries every property for the organisation — not only ones with missing coordinates", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    db.property.findMany.mockResolvedValue([]);

    const promise = backfillPropertyCoordinatesAction();
    await vi.runAllTimersAsync();
    await promise;

    // Regression guard: a property that already has (possibly wrong)
    // coordinates must still be re-checked — this is the whole point of the
    // fix. The query must not filter on latitude/longitude at all.
    expect(db.property.findMany).toHaveBeenCalledWith({
      where: { customer: { organizationId: "org-1" } },
      select: { id: true, addressLine1: true, city: true, postcode: true },
    });
  });

  it("re-geocodes and overwrites a property that already had coordinates", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    db.property.findMany.mockResolvedValue([
      { id: "prop-1", addressLine1: "59 Kingsfold Drive", city: "Preston", postcode: "PR1 1AA" },
    ]);
    mockGeocode.mockResolvedValue({ latitude: 53.7632, longitude: -2.7031 });

    const promise = backfillPropertyCoordinatesAction();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(db.property.update).toHaveBeenCalledWith({
      where: { id: "prop-1" },
      data: { latitude: 53.7632, longitude: -2.7031 },
    });
    expect(result).toEqual({ geocoded: 1, failed: 0 });
  });

  it("counts a property as failed when geocoding returns nothing, without updating it", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    db.property.findMany.mockResolvedValue([
      { id: "prop-1", addressLine1: "Nowhere Road", city: "Nowhereton", postcode: "" },
    ]);
    mockGeocode.mockResolvedValue(null);

    const promise = backfillPropertyCoordinatesAction();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(db.property.update).not.toHaveBeenCalled();
    expect(result).toEqual({ geocoded: 0, failed: 1 });
  });

  it("counts a property as failed rather than throwing when geocoding itself errors", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    db.property.findMany.mockResolvedValue([
      { id: "prop-1", addressLine1: "1 Road", city: "Town", postcode: "AA1 1AA" },
    ]);
    mockGeocode.mockRejectedValue(new Error("network error"));

    const promise = backfillPropertyCoordinatesAction();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ geocoded: 0, failed: 1 });
  });
});
