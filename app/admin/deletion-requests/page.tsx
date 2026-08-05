import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import { DeletionRequestRow } from "@/components/admin/deletion-request-row";

export default async function AdminDeletionRequestsPage() {
  await requireSuperAdmin();

  const requests = await prisma.accountDeletionRequest.findMany({
    orderBy: { requestedAt: "desc" },
    select: {
      id: true,
      requestType: true,
      source: true,
      status: true,
      requesterEmail: true,
      organizationNameSnapshot: true,
      userEmailSnapshot: true,
      requestedAt: true,
      verifiedAt: true,
      processingDeadline: true,
      completedAt: true,
      rejectionReason: true,
      processingNotes: true,
      retentionSummary: true,
    },
  });

  const actionable = requests.filter((r) => r.status === "VERIFIED" || r.status === "IN_PROGRESS");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Deletion requests</h1>
        <p className="text-sm text-muted-foreground">
          {actionable.length} awaiting action · {requests.length} total
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {requests.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No deletion requests yet.
          </p>
        )}
        {requests.map((request) => (
          <DeletionRequestRow key={request.id} request={request} />
        ))}
      </div>
    </div>
  );
}
