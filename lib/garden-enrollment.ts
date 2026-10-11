import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/route-optimizer";
import { upsertAreaRound } from "@/lib/rounds";

type GardenAddress = {
  customerId: string;
  organizationId: string;
  serviceAddressLine1: string;
  serviceAddressLine2: string | null;
  serviceCity: string;
  servicePostcode: string;
  accessNotes: string | null;
};

/** Register the service location once, preserving later manual round/pin edits. */
export async function enrollGardenProperty(subscription: GardenAddress) {
  const existing = await prisma.property.findFirst({
    where: { customerId: subscription.customerId }, select: { id: true },
  });
  if (existing) return existing;

  const coordinates = await geocodeAddress({
    addressLine1: subscription.serviceAddressLine1,
    city: subscription.serviceCity,
    postcode: subscription.servicePostcode,
  }).catch(() => null);
  const round = await upsertAreaRound(subscription.organizationId, subscription.serviceCity);

  return prisma.property.create({ data: {
    customerId: subscription.customerId,
    addressLine1: subscription.serviceAddressLine1,
    addressLine2: subscription.serviceAddressLine2,
    city: subscription.serviceCity,
    postcode: subscription.servicePostcode,
    accessNotes: subscription.accessNotes,
    roundId: round.id,
    latitude: coordinates?.latitude,
    longitude: coordinates?.longitude,
  } });
}
