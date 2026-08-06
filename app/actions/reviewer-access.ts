"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin";
import {
  createOrEnsureReviewerAccount,
  regenerateReviewerPassword,
  disableReviewerAccess,
  resetReviewerDemoData,
} from "@/lib/reviewer-access";

// Every action here is gated by requireSuperAdmin() — the same standalone
// PlatformAdmin session used throughout /admin, never the tenant NextAuth
// session. This means a tenant user (including the reviewer account
// itself) can never reach any of these actions: PlatformAdmin is a wholly
// separate model with no relation to Organization/User at all.
//
// None of these actions accept an organizationId from the caller — the
// reviewer organisation is always located internally by its own fixed
// slug (see lib/reviewer-access.ts), so there is no way for a browser-
// submitted value to redirect these actions at a different, real
// organisation.

export async function createReviewerAccountAction(): Promise<
  { ok: true; tempPassword: string } | { error: string }
> {
  try {
    await requireSuperAdmin();
    const { tempPassword } = await createOrEnsureReviewerAccount();
    revalidatePath("/admin/google-play-reviewer");
    return { ok: true, tempPassword };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create reviewer account" };
  }
}

export async function regenerateReviewerPasswordAction(): Promise<
  { ok: true; tempPassword: string } | { error: string }
> {
  try {
    await requireSuperAdmin();
    const { tempPassword } = await regenerateReviewerPassword();
    revalidatePath("/admin/google-play-reviewer");
    return { ok: true, tempPassword };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to regenerate reviewer password" };
  }
}

export async function resetReviewerDemoDataAction(): Promise<{ ok: true } | { error: string }> {
  try {
    await requireSuperAdmin();
    await resetReviewerDemoData();
    revalidatePath("/admin/google-play-reviewer");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to reset reviewer demo data" };
  }
}

export async function disableReviewerAccessAction(): Promise<{ ok: true } | { error: string }> {
  try {
    await requireSuperAdmin();
    await disableReviewerAccess();
    revalidatePath("/admin/google-play-reviewer");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to disable reviewer access" };
  }
}
