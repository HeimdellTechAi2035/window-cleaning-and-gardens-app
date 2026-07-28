"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAdminSession, clearAdminSession } from "@/lib/admin-auth";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export async function adminLoginAction(formData: FormData): Promise<{ error: string } | { ok: true }> {
  try {
    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const admin = await prisma.platformAdmin.findUnique({ where: { email: parsed.data.email } });
    if (!admin) return { error: "Incorrect email or password" };

    const valid = await bcrypt.compare(parsed.data.password, admin.passwordHash);
    if (!valid) return { error: "Incorrect email or password" };

    await createAdminSession({ id: admin.id, email: admin.email });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to sign in" };
  }

  redirect("/admin");
}

export async function adminSignOutAction() {
  await clearAdminSession();
  redirect("/admin-login");
}
