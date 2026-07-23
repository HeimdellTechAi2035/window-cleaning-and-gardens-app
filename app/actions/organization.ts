"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const mapboxToken = formData.get("mapboxToken");
  const twilioFromNumber = formData.get("twilioFromNumber");
  const resendFromEmail = formData.get("resendFromEmail");

  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: {
      ...(gocardlessAccessToken ? { gocardlessAccessToken: String(gocardlessAccessToken) } : {}),
      ...(gocardlessEnv ? { gocardlessEnv: String(gocardlessEnv) } : {}),
      ...(stripeAccountId ? { stripeAccountId: String(stripeAccountId) } : {}),
      ...(mapboxToken ? { mapboxToken: String(mapboxToken) } : {}),
      ...(twilioFromNumber ? { twilioFromNumber: String(twilioFromNumber) } : {}),
      ...(resendFromEmail ? { resendFromEmail: String(resendFromEmail) } : {}),
    },
  });

  revalidatePath("/settings");
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
