"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * One-time bootstrap: grants isPlatformSuperAdmin to whoever is currently
 * logged in, but only if (a) they supply the secret set in
 * SUPER_ADMIN_BOOTSTRAP_SECRET, known only to the account owner, and (b)
 * no user anywhere has the flag yet. Once any account has it, this always
 * refuses — further admins are granted from inside /admin by an existing
 * super-admin, not through this route again.
 */
export async function bootstrapSuperAdminAction(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    const expectedSecret = process.env.SUPER_ADMIN_BOOTSTRAP_SECRET;
    if (!expectedSecret) {
      return { error: "SUPER_ADMIN_BOOTSTRAP_SECRET is not configured — set it in Netlify first." };
    }

    const suppliedSecret = String(formData.get("secret") ?? "");
    if (suppliedSecret !== expectedSecret) {
      return { error: "Incorrect secret." };
    }

    const existingSuperAdmin = await prisma.user.findFirst({
      where: { isPlatformSuperAdmin: true },
    });
    if (existingSuperAdmin) {
      return { error: "A super-admin is already configured. Ask them to grant access from /admin instead." };
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { isPlatformSuperAdmin: true },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to bootstrap super-admin" };
  }

  redirect("/admin");
}
