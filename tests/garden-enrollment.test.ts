import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: { property: { findFirst: vi.fn(), create: vi.fn() } } }));
vi.mock("@/lib/route-optimizer", () => ({ geocodeAddress: vi.fn() }));
vi.mock("@/lib/rounds", () => ({ upsertAreaRound: vi.fn() }));
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/route-optimizer";
import { upsertAreaRound } from "@/lib/rounds";
import { enrollGardenProperty } from "@/lib/garden-enrollment";

const subscription = {
  customerId: "customer", organizationId: "greenfix",
  serviceAddressLine1: "1 Example Street", serviceAddressLine2: null,
  serviceCity: "Penwortham", servicePostcode: "PR1 9DJ", accessNotes: "Side gate",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(geocodeAddress).mockResolvedValue({ latitude: 53.7, longitude: -2.7 });
  vi.mocked(upsertAreaRound).mockResolvedValue({ id: "area-round" } as never);
});
describe("garden service property enrollment", () => {
  it("saves the service address, map coordinates and the organization area's round", async () => {
    await enrollGardenProperty(subscription);
    expect(upsertAreaRound).toHaveBeenCalledWith("greenfix", "Penwortham");
    expect(prisma.property.create).toHaveBeenCalledWith({ data: {
      customerId: "customer", addressLine1: "1 Example Street", addressLine2: null,
      city: "Penwortham", postcode: "PR1 9DJ", accessNotes: "Side gate",
      roundId: "area-round", latitude: 53.7, longitude: -2.7,
    } });
  });
  it("preserves an existing property, manual pin and round on callback retries", async () => {
    vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: "existing-property" } as never);
    expect(await enrollGardenProperty(subscription)).toEqual({ id: "existing-property" });
    expect(geocodeAddress).not.toHaveBeenCalled();
    expect(upsertAreaRound).not.toHaveBeenCalled();
    expect(prisma.property.create).not.toHaveBeenCalled();
  });
  it("retains the service location and round when geocoding is temporarily unavailable", async () => {
    vi.mocked(geocodeAddress).mockRejectedValue(new Error("network unavailable"));
    await enrollGardenProperty(subscription);
    expect(prisma.property.create).toHaveBeenCalledWith({ data: expect.objectContaining({ roundId: "area-round", latitude: undefined, longitude: undefined }) });
  });
});
