"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAdminSession } from "@/lib/admin-auth";

/**
 * One-time bootstrap: creates the very first PlatformAdmin, gated only by
 * SUPER_ADMIN_BOOTSTRAP_SECRET — known only to the account owner. No prior
 * login of any kind is required (there is nothing to log into yet), and
 * this always refuses once any PlatformAdmin already exists. Further admins
 * are created from inside /admin by an existing one, not through here again.
 */
const bootstrapSchema = z.object({
  secret: z.string().min(1),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function bootstrapAdminAction(formData: FormData): Promise<{ error: string } | { ok: true }> {
  try {
    const expectedSecret = process.env.SUPER_ADMIN_BOOTSTRAP_SECRET;
    if (!expectedSecret) {
      return { error: "SUPER_ADMIN_BOOTSTRAP_SECRET is not configured — set it in Netlify first." };
    }

    const parsed = bootstrapSchema.safeParse({
      secret: formData.get("secret"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    if (parsed.data.secret !== expectedSecret) {
      return { error: "Incorrect secret." };
    }

    const existing = await prisma.platformAdmin.findFirst();
    if (existing) {
      return { error: "A platform admin is already configured. Ask them to grant you access from within /admin instead." };
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const admin = await prisma.platformAdmin.create({
      data: { email: parsed.data.email, passwordHash },
    });

    await createAdminSession({ id: admin.id, email: admin.email });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to bootstrap admin" };
  }

  redirect("/admin");
}
