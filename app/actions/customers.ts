"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/route-optimizer";
import type { PaymentMethod, HazardSeverity } from "@prisma/client";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  return session;
}

const customerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  preferredPaymentMethod: z.enum(["DIRECT_DEBIT", "CARD", "CASH", "BANK_TRANSFER"]),
  addressLine1: z.string().min(1),
  city: z.string().min(1),
  postcode: z.string().min(1),
});

export async function createCustomerAction(formData: FormData) {
  const session = await requireSession();

  const parsed = customerSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    preferredPaymentMethod: formData.get("preferredPaymentMethod"),
    addressLine1: formData.get("addressLine1"),
    city: formData.get("city"),
    postcode: formData.get("postcode"),
  });

  let coords: { latitude: number; longitude: number } | null = null;
  try {
    coords = await geocodeAddress(
      `${parsed.addressLine1}, ${parsed.city}, ${parsed.postcode}, UK`
    );
  } catch {
    coords = null;
  }

  const customer = await prisma.customer.create({
    data: {
      organizationId: session.user.organizationId,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email || undefined,
      phone: parsed.phone,
      preferredPaymentMethod: parsed.preferredPaymentMethod as PaymentMethod,
      properties: {
        create: {
          addressLine1: parsed.addressLine1,
          city: parsed.city,
          postcode: parsed.postcode,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
        },
      },
    },
  });

  revalidatePath("/customers");
  return { customerId: customer.id };
}

export async function addHazardAction(params: {
  propertyId: string;
  label: string;
  severity: HazardSeverity;
}) {
  await requireSession();
  await prisma.propertyHazard.create({ data: params });
  revalidatePath("/customers");
}

export async function removeHazardAction(hazardId: string) {
  await requireSession();
  await prisma.propertyHazard.delete({ where: { id: hazardId } });
  revalidatePath("/customers");
}

export async function addServiceAction(params: {
  propertyId: string;
  title: string;
  price: number;
  defaultIntervalWeeks: number;
}) {
  await requireSession();
  await prisma.service.create({
    data: {
      propertyId: params.propertyId,
      title: params.title,
      price: params.price,
      defaultIntervalWeeks: params.defaultIntervalWeeks,
    },
  });
  revalidatePath("/customers");
}

export async function updateAccessNotesAction(params: { propertyId: string; accessNotes: string }) {
  await requireSession();
  await prisma.property.update({
    where: { id: params.propertyId },
    data: { accessNotes: params.accessNotes },
  });
  revalidatePath("/customers");
}
