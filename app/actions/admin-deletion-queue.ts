"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import { anonymizeUser, processOrganizationDeletion } from "@/lib/account-deletion";

// Every action here is gated by requireSuperAdmin() — the same standalone
// PlatformAdmin session used throughout /admin, never the tenant NextAuth
// session. This queue must never be reachable by a tenant user.

export async function startProcessingDeletionRequestAction(
  requestId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const admin = await requireSuperAdmin();
    const request = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (request.status !== "VERIFIED") {
      return { error: "Only verified requests can be started." };
    }

    await prisma.accountDeletionRequest.update({
      where: { id: requestId },
      data: { status: "IN_PROGRESS", processingNotes: appendNote(request.processingNotes, `Processing started by ${admin.email}`) },
    });

    revalidatePath("/admin/deletion-requests");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to start processing" };
  }
}

export async function processUserDeletionRequestAction(
  requestId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const admin = await requireSuperAdmin();
    const request = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: requestId } });

    if (request.requestType !== "USER") return { error: "Not a user-deletion request." };
    if (request.status === "COMPLETED") return { ok: true }; // idempotent re-click
    if (!(["VERIFIED", "IN_PROGRESS"] as const).includes(request.status as "VERIFIED" | "IN_PROGRESS")) {
      return { error: "This request isn't ready to be processed." };
    }
    if (!request.userId) {
      return { error: "No linked user account was found for this request — reject it with a note instead." };
    }

    const user = await prisma.user.findUnique({ where: { id: request.userId } });
    if (user) {
      await anonymizeUser(request.userId);
    }
    // If the user is already gone (e.g. their org was deleted separately in
    // the meantime), there's nothing left to anonymise — still complete
    // the request rather than error, since the outcome (no personal data
    // remains) is the same either way.

    await prisma.accountDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        processingNotes: appendNote(request.processingNotes, `Completed by ${admin.email}`),
        retentionSummary:
          "User account anonymised (name, email, phone, image, password cleared; account deactivated). Sessions revoked. No personal data retained.",
      },
    });

    revalidatePath("/admin/deletion-requests");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to process user deletion" };
  }
}

export async function processOrganizationDeletionRequestAction(
  requestId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const admin = await requireSuperAdmin();
    const request = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: requestId } });

    if (request.requestType !== "ORGANIZATION") return { error: "Not an organization-deletion request." };
    if (request.status === "COMPLETED") return { ok: true }; // idempotent re-click
    if (!(["VERIFIED", "IN_PROGRESS"] as const).includes(request.status as "VERIFIED" | "IN_PROGRESS")) {
      return { error: "This request isn't ready to be processed." };
    }
    if (!request.organizationId) {
      return { error: "No linked organisation was found for this request — reject it with a note instead." };
    }

    const result = await processOrganizationDeletion({
      organizationId: request.organizationId,
      deletionRequestId: request.id,
    });

    await prisma.accountDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        processingNotes: appendNote(
          request.processingNotes,
          result.alreadyDeleted
            ? `Completed by ${admin.email} (organisation was already deleted)`
            : `Completed by ${admin.email}`
        ),
        retentionSummary: result.alreadyDeleted
          ? "Organisation and all tenant operational/customer data were already deleted."
          : `Organisation and all tenant operational/customer data deleted (users, customers, properties, rounds, jobs, services, transactions, notifications). A minimal, anonymised platform-billing accounting record was retained until ${result.retainedUntil?.toISOString()} per Heimdell's own accounting obligations — it contains no tenant customer personal data.`,
      },
    });

    revalidatePath("/admin/deletion-requests");
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to process organisation deletion" };
  }
}

export async function rejectDeletionRequestAction(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  try {
    const admin = await requireSuperAdmin();
    const requestId = String(formData.get("requestId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) return { error: "A rejection reason is required." };

    const request = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (["COMPLETED", "CANCELLED", "REJECTED"].includes(request.status)) {
      return { error: "This request has already been closed." };
    }

    await prisma.accountDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectionReason: reason,
        processingNotes: appendNote(request.processingNotes, `Rejected by ${admin.email}`),
      },
    });

    revalidatePath("/admin/deletion-requests");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to reject request" };
  }
}

export async function cancelDeletionRequestAsAdminAction(
  requestId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const admin = await requireSuperAdmin();
    const request = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (["COMPLETED", "CANCELLED", "REJECTED"].includes(request.status)) {
      return { error: "This request has already been closed." };
    }

    await prisma.accountDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        processingNotes: appendNote(request.processingNotes, `Cancelled by ${admin.email}`),
      },
    });

    revalidatePath("/admin/deletion-requests");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to cancel request" };
  }
}

function appendNote(existing: string | null, note: string): string {
  const stamped = `[${new Date().toISOString()}] ${note}`;
  return existing ? `${existing}\n${stamped}` : stamped;
}
