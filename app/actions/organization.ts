"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/route-optimizer";

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  if (session.user.role !== "ADMIN") throw new Error("Admin access required");
  return session;
}

export async function updateOrganizationProfileAction(formData: FormData) {
  const session = await requireAdminSession();

  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: {
      name: String(formData.get("name") ?? ""),
      timezone: String(formData.get("timezone") ?? "Europe/London"),
    },
  });

  revalidatePath("/settings");
}

export async function updateIntegrationSettingsAction(formData: FormData) {
  const session = await requireAdminSession();

  const gocardlessAccessToken = formData.get("gocardlessAccessToken");
  const gocardlessEnv = formData.get("gocardlessEnv");
  const stripeAccountId = formData.get("stripeAccountId");
  const twilioFromNumber = formData.get("twilioFromNumber");
  const resendFromEmail = formData.get("resendFromEmail");

  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: {
      ...(gocardlessAccessToken ? { gocardlessAccessToken: String(gocardlessAccessToken) } : {}),
      ...(gocardlessEnv ? { gocardlessEnv: String(gocardlessEnv) } : {}),
      ...(stripeAccountId ? { stripeAccountId: String(stripeAccountId) } : {}),
      ...(twilioFromNumber ? { twilioFromNumber: String(twilioFromNumber) } : {}),
      ...(resendFromEmail ? { resendFromEmail: String(resendFromEmail) } : {}),
    },
  });

  revalidatePath("/settings");
}

export async function backfillPropertyCoordinatesAction(): Promise<{ geocoded: number; failed: number }> {
  const session = await requireAdminSession();

  const properties = await prisma.property.findMany({
    where: {
      customer: { organizationId: session.user.organizationId },
      OR: [{ latitude: null }, { longitude: null }],
    },
    select: { id: true, addressLine1: true, city: true, postcode: true },
  });

  let geocoded = 0;
  let failed = 0;

  for (const property of properties) {
    try {
      const coords = await geocodeAddress({
        addressLine1: property.addressLine1,
        city: property.city,
        postcode: property.postcode,
      });
      if (coords) {
        await prisma.property.update({ where: { id: property.id }, data: coords });
        geocoded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    // Nominatim's usage policy asks for at most ~1 request/second.
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  revalidatePath("/route-map");
  return { geocoded, failed };
}

export async function inviteTeamMemberAction(formData: FormData) {
  const session = await requireAdminSession();

  const email = String(formData.get("email") ?? "");
  const name = String(formData.get("name") ?? "");
  const role = String(formData.get("role") ?? "OPERATIVE") as "ADMIN" | "OPERATIVE";

  await prisma.user.create({
    data: {
      organizationId: session.user.organizationId,
      email,
      name,
      role,
      isActive: true,
    },
  });

  revalidatePath("/settings");
}
