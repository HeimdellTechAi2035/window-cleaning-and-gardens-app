"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/route-optimizer";
import { upsertAreaRound, assignPropertyToRound, findConflictingRound } from "@/lib/rounds";
import { parseDateInput } from "@/lib/utils";
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
  startDate: z.string().min(1),
  services: z
    .array(
      z.object({
        title: z.string().min(1),
        price: z.number().positive(),
        defaultIntervalWeeks: z.number().int().min(0),
      })
    )
    .optional()
    .default([]),
});

// Thrown Errors from Server Actions don't reliably reach the client in
// production when the action also triggers a revalidation of the current
// route (the request comes back as a generic 500 instead of a catchable
// rejection) — so validation failures are returned as a typed result
// instead of thrown, and the caller checks for `.error`.
export async function createCustomerAction(
  formData: FormData
): Promise<{ customerId: string; areaName: string } | { error: string }> {
  try {
    return await createCustomerActionInner(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add customer" };
  }
}

async function createCustomerActionInner(formData: FormData) {
  const session = await requireSession();

  const rawServices = formData.get("services");
  const parsed = customerSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    preferredPaymentMethod: formData.get("preferredPaymentMethod"),
    addressLine1: formData.get("addressLine1"),
    city: formData.get("city"),
    postcode: formData.get("postcode"),
    startDate: formData.get("startDate"),
    services: rawServices ? JSON.parse(rawServices as string) : [],
  });

  let coords: { latitude: number; longitude: number } | null = null;
  try {
    coords = await geocodeAddress(
      `${parsed.addressLine1}, ${parsed.city}, ${parsed.postcode}, UK`
    );
  } catch {
    coords = null;
  }

  // Auto-assign to a round by area: every property in the same city shares
  // one round, created on first use, so nobody has to manually build rounds
  // or remember to add new customers to them.
  const round = await upsertAreaRound(session.user.organizationId, parsed.city);

  if (parsed.services.length > 0) {
    const conflict = await findConflictingRound({
      organizationId: session.user.organizationId,
      date: parseDateInput(parsed.startDate),
      roundId: round.id,
    });
    if (conflict) {
      throw new Error(
        `Can't schedule "${round.name}" on that date — "${conflict.name}" is already booked that day. Pick a different date, or reschedule ${conflict.name} first.`
      );
    }
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
          roundId: round.id,
          services: {
            create: parsed.services.map((s) => ({
              title: s.title,
              price: s.price,
              defaultIntervalWeeks: s.defaultIntervalWeeks,
            })),
          },
        },
      },
    },
    include: {
      properties: { include: { services: true } },
    },
  });

  const property = customer.properties[0];
  if (property && property.services.length > 0) {
    await prisma.job.createMany({
      data: property.services.map((service) => ({
        organizationId: session.user.organizationId,
        roundId: round.id,
        propertyId: property.id,
        serviceId: service.id,
        scheduledDate: parseDateInput(parsed.startDate),
        priceCharged: service.price,
        intervalWeeksAtCreation: service.defaultIntervalWeeks,
      })),
    });
  }

  revalidatePath("/customers");
  revalidatePath("/rounds");
  revalidatePath("/planner");
  revalidatePath("/dashboard");
  return { customerId: customer.id, areaName: round.name };
}

const updateCustomerSchema = z.object({
  customerId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  preferredPaymentMethod: z.enum(["DIRECT_DEBIT", "CARD", "CASH", "BANK_TRANSFER"]),
  propertyId: z.string().optional(),
  addressLine1: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  postcode: z.string().min(1).optional(),
});

export async function updateCustomerAction(formData: FormData) {
  const session = await requireSession();

  const parsed = updateCustomerSchema.parse({
    customerId: formData.get("customerId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    preferredPaymentMethod: formData.get("preferredPaymentMethod"),
    propertyId: formData.get("propertyId") || undefined,
    addressLine1: formData.get("addressLine1") || undefined,
    city: formData.get("city") || undefined,
    postcode: formData.get("postcode") || undefined,
  });

  await prisma.customer.update({
    where: { id: parsed.customerId, organizationId: session.user.organizationId },
    data: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email || null,
      phone: parsed.phone || null,
      preferredPaymentMethod: parsed.preferredPaymentMethod as PaymentMethod,
    },
  });

  if (parsed.propertyId && parsed.addressLine1 && parsed.city && parsed.postcode) {
    const existingProperty = await prisma.property.findFirstOrThrow({
      where: { id: parsed.propertyId, customerId: parsed.customerId },
      select: { roundLocked: true },
    });

    let coords: { latitude: number; longitude: number } | null = null;
    try {
      coords = await geocodeAddress(`${parsed.addressLine1}, ${parsed.city}, ${parsed.postcode}, UK`);
    } catch {
      coords = null;
    }

    await prisma.property.update({
      where: { id: parsed.propertyId, customerId: parsed.customerId },
      data: {
        addressLine1: parsed.addressLine1,
        city: parsed.city,
        postcode: parsed.postcode,
        ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
      },
    });

    // Keep the round in sync with the (possibly corrected) city — moves
    // this property's jobs onto the right round and cleans up an old
    // auto-generated round if it's now empty, so fixing a typo doesn't
    // leave a stale duplicate round behind. Skipped if the property has
    // been manually moved to a round (e.g. as part of splitting a big
    // area round into day-sized sub-rounds), so an address edit doesn't
    // silently undo that.
    if (!existingProperty.roundLocked) {
      const round = await upsertAreaRound(session.user.organizationId, parsed.city);
      await assignPropertyToRound(parsed.propertyId, round.id);
      revalidatePath("/rounds");
      revalidatePath("/planner");
      revalidatePath("/dashboard");
    }
  }

  revalidatePath(`/customers/${parsed.customerId}`);
  revalidatePath("/customers");
}

export async function addHazardAction(params: {
  propertyId: string;
  label: string;
  severity: HazardSeverity;
}) {
  const session = await requireSession();
  await prisma.property.findFirstOrThrow({
    where: { id: params.propertyId, customer: { organizationId: session.user.organizationId } },
  });
  await prisma.propertyHazard.create({ data: params });
  revalidatePath("/customers");
}

export async function removeHazardAction(hazardId: string) {
  const session = await requireSession();
  await prisma.propertyHazard.findFirstOrThrow({
    where: {
      id: hazardId,
      property: { customer: { organizationId: session.user.organizationId } },
    },
  });
  await prisma.propertyHazard.delete({ where: { id: hazardId } });
  revalidatePath("/customers");
}

export async function addServiceAction(params: {
  propertyId: string;
  title: string;
  price: number;
  defaultIntervalWeeks: number;
  scheduledDate: string;
}): Promise<{ ok: true } | { error: string }> {
  try {
    return await addServiceActionInner(params);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add service" };
  }
}

async function addServiceActionInner(params: {
  propertyId: string;
  title: string;
  price: number;
  defaultIntervalWeeks: number;
  scheduledDate: string;
}): Promise<{ ok: true }> {
  const session = await requireSession();

  const property = await prisma.property.findFirstOrThrow({
    where: { id: params.propertyId, customer: { organizationId: session.user.organizationId } },
    include: { round: true },
  });

  // Match the signup flow: adding a service also schedules its first job
  // (on the date the admin picked). Use the property's already-assigned
  // round if it has one (respects a manual "move to round" override);
  // otherwise fall back to deriving one from the city, same as signup.
  const round = property.round ?? (await upsertAreaRound(session.user.organizationId, property.city));
  if (!property.roundId) {
    await prisma.property.update({ where: { id: property.id }, data: { roundId: round.id } });
  }

  const conflict = await findConflictingRound({
    organizationId: session.user.organizationId,
    date: parseDateInput(params.scheduledDate),
    roundId: round.id,
  });
  if (conflict) {
    throw new Error(
      `Can't schedule "${round.name}" on that date — "${conflict.name}" is already booked that day. Pick a different date, or reschedule ${conflict.name} first.`
    );
  }

  const service = await prisma.service.create({
    data: {
      propertyId: params.propertyId,
      title: params.title,
      price: params.price,
      defaultIntervalWeeks: params.defaultIntervalWeeks,
    },
  });

  await prisma.job.create({
    data: {
      organizationId: session.user.organizationId,
      roundId: round.id,
      propertyId: property.id,
      serviceId: service.id,
      scheduledDate: parseDateInput(params.scheduledDate),
      priceCharged: service.price,
      intervalWeeksAtCreation: service.defaultIntervalWeeks,
    },
  });

  revalidatePath("/customers");
  revalidatePath("/rounds");
  revalidatePath("/planner");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateAccessNotesAction(params: { propertyId: string; accessNotes: string }) {
  const session = await requireSession();
  await prisma.property.update({
    where: {
      id: params.propertyId,
      customer: { organizationId: session.user.organizationId },
    },
    data: { accessNotes: params.accessNotes },
  });
  revalidatePath("/customers");
}
