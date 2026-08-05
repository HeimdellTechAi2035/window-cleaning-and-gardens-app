"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  anonymizeUser,
  isSoleActiveAdmin,
  calculateProcessingDeadline,
  cancelFutureBillingForOrganization,
} from "@/lib/account-deletion";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  return session;
}

/**
 * Re-checks the requester's role and organization fresh from the database
 * rather than trusting the JWT's session.user.role claim — the same
 * "never trust a client-held claim for a security-critical decision"
 * pattern this app already uses for platform-admin access (see
 * lib/super-admin.ts). A role change or deactivation elsewhere shouldn't
 * be bypassable just because an existing session's JWT hasn't refreshed.
 */
async function requireFreshAdmin(userId: string, organizationId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true, organizationId: true },
  });
  if (!user || !user.isActive || user.role !== "ADMIN" || user.organizationId !== organizationId) {
    throw new Error("Admin access required");
  }
}

const ACTIVE_DELETION_STATUSES = ["PENDING_VERIFICATION", "VERIFIED", "IN_PROGRESS"] as const;

// ------------------------------------------------------------------
// Individual user deletion — processed immediately (not queued), since
// anonymising one user is far less destructive/irreversible than deleting
// a whole organization's data, and the requester has already proven who
// they are by being authenticated + re-entering their password.
// ------------------------------------------------------------------

const requestUserDeletionSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm"),
});

export async function requestUserDeletionAction(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  try {
    const session = await requireSession();
    const parsed = requestUserDeletionSchema.parse({ password: formData.get("password") });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
    if (!user.passwordHash) {
      return { error: "This account has no password set — contact support to delete it." };
    }
    const passwordValid = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!passwordValid) {
      return { error: "Incorrect password." };
    }

    if (await isSoleActiveAdmin(session.user.id, session.user.organizationId)) {
      return {
        error:
          "You're the only administrator for this organisation. Promote another team member to Admin first, or delete the whole organisation instead — deleting just your own account would leave it without an owner.",
      };
    }

    await anonymizeUser(session.user.id);

    await prisma.accountDeletionRequest.create({
      data: {
        requestType: "USER",
        source: "IN_APP",
        status: "COMPLETED",
        userId: null, // the user row itself is anonymised, not deleted — deliberately not linked
        userEmailSnapshot: user.email,
        organizationId: session.user.organizationId,
        requesterEmail: user.email,
        requestedAt: new Date(),
        verifiedAt: new Date(),
        completedAt: new Date(),
        retentionSummary:
          "User account anonymised (name, email, phone, image, password cleared; account deactivated). Sessions revoked. Historical job assignments retained showing 'Former user'.",
      },
    });

    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to process account deletion" };
  }
}

// ------------------------------------------------------------------
// Organization deletion — a REQUEST, never processed immediately here.
// Billing is cancelled right away so nothing is charged after a verified
// request, but the actual destructive cascade only runs when a platform
// admin processes it from the queue (see app/actions/admin-deletion-queue.ts).
// ------------------------------------------------------------------

const requestOrgDeletionSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm"),
  confirmName: z.string().min(1, "Type the organisation name to confirm"),
});

export async function requestOrganizationDeletionAction(
  formData: FormData
): Promise<{ ok: true; processingDeadline: string } | { error: string }> {
  try {
    const session = await requireSession();
    await requireFreshAdmin(session.user.id, session.user.organizationId);

    const parsed = requestOrgDeletionSchema.parse({
      password: formData.get("password"),
      confirmName: formData.get("confirmName"),
    });

    const [user, org] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
      prisma.organization.findUniqueOrThrow({ where: { id: session.user.organizationId } }),
    ]);

    if (!user.passwordHash) {
      return { error: "This account has no password set — contact support." };
    }
    const passwordValid = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!passwordValid) {
      return { error: "Incorrect password." };
    }
    if (parsed.confirmName.trim() !== org.name) {
      return { error: `Type "${org.name}" exactly to confirm.` };
    }

    const existingActive = await prisma.accountDeletionRequest.findFirst({
      where: {
        organizationId: org.id,
        requestType: "ORGANIZATION",
        status: { in: [...ACTIVE_DELETION_STATUSES] },
      },
    });
    if (existingActive) {
      return { error: "A deletion request for this organisation is already pending." };
    }

    const verifiedAt = new Date();
    const processingDeadline = calculateProcessingDeadline(verifiedAt);

    await prisma.accountDeletionRequest.create({
      data: {
        requestType: "ORGANIZATION",
        source: "IN_APP",
        status: "VERIFIED", // already authenticated + password-confirmed — no separate email-verification loop needed
        organizationId: org.id,
        organizationNameSnapshot: org.name,
        userId: user.id,
        userEmailSnapshot: user.email,
        requesterEmail: user.email,
        requestedAt: verifiedAt,
        verifiedAt,
        processingDeadline,
      },
    });

    // Stop future charges immediately — don't wait for the destructive
    // cascade to actually run.
    await cancelFutureBillingForOrganization(org.id);

    revalidatePath("/settings");
    return { ok: true, processingDeadline: processingDeadline.toISOString() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to request organisation deletion" };
  }
}

export async function cancelOrganizationDeletionRequestAction(
  requestId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const session = await requireSession();
    await requireFreshAdmin(session.user.id, session.user.organizationId);

    const request = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (request.organizationId !== session.user.organizationId) {
      throw new Error("Not authorized");
    }
    if (!(["PENDING_VERIFICATION", "VERIFIED"] as const).includes(
      request.status as "PENDING_VERIFICATION" | "VERIFIED"
    )) {
      return { error: "This request can no longer be cancelled." };
    }

    await prisma.accountDeletionRequest.update({
      where: { id: requestId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to cancel deletion request" };
  }
}

// ------------------------------------------------------------------
// Transfer admin — needed so a sole admin has a real way out of the
// "you can't delete yourself and leave the org ownerless" block, without
// forcing them straight to deleting the whole organisation.
// ------------------------------------------------------------------

export async function transferAdminRoleAction(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  try {
    const session = await requireSession();
    await requireFreshAdmin(session.user.id, session.user.organizationId);

    const targetUserId = String(formData.get("userId") ?? "");
    const target = await prisma.user.findUniqueOrThrow({ where: { id: targetUserId } });
    if (target.organizationId !== session.user.organizationId) {
      throw new Error("Not authorized");
    }
    if (!target.isActive) {
      return { error: "Can't promote an inactive team member." };
    }

    await prisma.user.update({ where: { id: targetUserId }, data: { role: "ADMIN" } });

    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update role" };
  }
}
