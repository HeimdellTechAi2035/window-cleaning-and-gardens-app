"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";

const SUBSCRIPTION_STATUSES = ["incomplete", "trialing", "active", "past_due", "canceled", "unpaid"] as const;

function randomPassword() {
  // Human-typeable temp password: e.g. "bright-otter-4821".
  const words = ["bright", "quiet", "swift", "amber", "coral", "misty", "otter", "cedar", "lunar", "ember"];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// Every action here deliberately has NO organizationId scoping on its
// where-clauses — this is the one part of the app that intentionally
// crosses tenant boundaries, gated entirely by requireSuperAdmin().

export async function updateOrganizationAsAdminAction(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireSuperAdmin();

    const organizationId = String(formData.get("organizationId") ?? "");
    const name = String(formData.get("name") ?? "");
    const timezone = String(formData.get("timezone") ?? "Europe/London");
    const subscriptionStatus = String(formData.get("subscriptionStatus") ?? "");

    if (!SUBSCRIPTION_STATUSES.includes(subscriptionStatus as (typeof SUBSCRIPTION_STATUSES)[number])) {
      return { error: "Invalid subscription status" };
    }

    await prisma.organization.update({
      where: { id: organizationId },
      data: { name, timezone, subscriptionStatus },
    });

    revalidatePath(`/admin/organizations/${organizationId}`);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update organization" };
  }
}

const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(["ADMIN", "OPERATIVE"]),
  isActive: z.boolean(),
  isPlatformSuperAdmin: z.boolean(),
});

export async function updateUserAsAdminAction(formData: FormData): Promise<{ ok: true } | { error: string }> {
  try {
    const session = await requireSuperAdmin();

    const parsed = updateUserSchema.parse({
      userId: formData.get("userId"),
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone") || undefined,
      role: formData.get("role"),
      isActive: formData.get("isActive") === "on",
      isPlatformSuperAdmin: formData.get("isPlatformSuperAdmin") === "on",
    });

    // A super-admin can grant the flag to others, but can't remove their
    // own — otherwise a lone admin could lock themselves out with a typo.
    if (parsed.userId === session!.user.id && !parsed.isPlatformSuperAdmin) {
      return { error: "You can't remove your own super-admin access." };
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: parsed.userId } });

    await prisma.user.update({
      where: { id: parsed.userId },
      data: {
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone || null,
        role: parsed.role,
        isActive: parsed.isActive,
        isPlatformSuperAdmin: parsed.isPlatformSuperAdmin,
      },
    });

    revalidatePath(`/admin/organizations/${user.organizationId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update user" };
  }
}

export async function resetUserPasswordAsAdminAction(
  userId: string
): Promise<{ tempPassword: string } | { error: string }> {
  try {
    await requireSuperAdmin();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const tempPassword = randomPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    revalidatePath(`/admin/organizations/${user.organizationId}`);
    return { tempPassword };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to reset password" };
  }
}
