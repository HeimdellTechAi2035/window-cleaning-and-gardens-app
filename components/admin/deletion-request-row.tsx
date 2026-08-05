"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";
import {
  startProcessingDeletionRequestAction,
  processUserDeletionRequestAction,
  processOrganizationDeletionRequestAction,
  rejectDeletionRequestAction,
  cancelDeletionRequestAsAdminAction,
} from "@/app/actions/admin-deletion-queue";

const STATUS_VARIANT: Record<string, "success" | "secondary" | "destructive" | "warning" | "default"> = {
  PENDING_VERIFICATION: "secondary",
  VERIFIED: "warning",
  IN_PROGRESS: "default",
  COMPLETED: "success",
  CANCELLED: "secondary",
  REJECTED: "destructive",
};

export interface DeletionRequestData {
  id: string;
  requestType: "USER" | "ORGANIZATION";
  source: "IN_APP" | "PUBLIC_WEB";
  status: "PENDING_VERIFICATION" | "VERIFIED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "REJECTED";
  requesterEmail: string;
  organizationNameSnapshot: string | null;
  userEmailSnapshot: string | null;
  requestedAt: Date;
  verifiedAt: Date | null;
  processingDeadline: Date | null;
  completedAt: Date | null;
  rejectionReason: string | null;
  processingNotes: string | null;
  retentionSummary: string | null;
}

export function DeletionRequestRow({ request }: { request: DeletionRequestData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const isActionable = request.status === "VERIFIED" || request.status === "IN_PROGRESS";

  function run(fn: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleStart() {
    run(() => startProcessingDeletionRequestAction(request.id));
  }

  function handleProcess() {
    if (
      !confirm(
        request.requestType === "ORGANIZATION"
          ? `Permanently delete ${request.organizationNameSnapshot ?? "this organisation"} and all of its data? This cannot be undone.`
          : `Permanently anonymise this user account? This cannot be undone.`
      )
    ) {
      return;
    }
    run(() =>
      request.requestType === "ORGANIZATION"
        ? processOrganizationDeletionRequestAction(request.id)
        : processUserDeletionRequestAction(request.id)
    );
  }

  function handleReject() {
    if (!rejectReason.trim()) {
      setError("Enter a reason for rejecting this request.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("requestId", request.id);
      formData.set("reason", rejectReason);
      const result = await rejectDeletionRequestAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleCancel() {
    if (!confirm("Cancel this deletion request?")) return;
    run(() => cancelDeletionRequestAsAdminAction(request.id));
  }

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">
            {request.requestType === "ORGANIZATION"
              ? request.organizationNameSnapshot ?? "Organisation"
              : request.userEmailSnapshot ?? request.requesterEmail}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {request.requestType === "ORGANIZATION" ? "Organisation deletion" : "User deletion"} ·{" "}
            {request.source === "IN_APP" ? "In-app" : "Public web"} · requested{" "}
            {formatDate(request.requestedAt)}
            {request.processingDeadline && ` · deadline ${formatDate(request.processingDeadline)}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[request.status]}>{request.status.replace(/_/g, " ")}</Badge>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border p-4 text-sm">
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Requester email</dt>
              <dd>{request.requesterEmail}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Verified</dt>
              <dd>{request.verifiedAt ? formatDate(request.verifiedAt) : "Not yet"}</dd>
            </div>
            {request.completedAt && (
              <div>
                <dt className="text-xs text-muted-foreground">Completed</dt>
                <dd>{formatDate(request.completedAt)}</dd>
              </div>
            )}
            {request.rejectionReason && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Rejection reason</dt>
                <dd>{request.rejectionReason}</dd>
              </div>
            )}
            {request.retentionSummary && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Retention summary</dt>
                <dd className="whitespace-pre-wrap text-xs">{request.retentionSummary}</dd>
              </div>
            )}
            {request.processingNotes && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Processing notes</dt>
                <dd className="whitespace-pre-wrap text-xs">{request.processingNotes}</dd>
              </div>
            )}
          </dl>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {request.status === "PENDING_VERIFICATION" && (
            <p className="text-xs text-muted-foreground">
              Awaiting email verification by the requester (or manual identity verification for
              requests where email isn&apos;t configured).
            </p>
          )}

          {isActionable && !showReject && (
            <div className="flex flex-wrap items-center gap-2">
              {request.status === "VERIFIED" && (
                <Button size="sm" variant="outline" onClick={handleStart} disabled={isPending}>
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Start processing
                </Button>
              )}
              <Button size="sm" onClick={handleProcess} disabled={isPending}>
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Process deletion
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowReject(true)} disabled={isPending}>
                Reject
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={isPending}>
                Cancel request
              </Button>
            </div>
          )}

          {isActionable && showReject && (
            <div className="flex flex-col gap-2">
              <Textarea
                placeholder="Reason for rejecting this request"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={handleReject} disabled={isPending}>
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Confirm rejection
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowReject(false)} disabled={isPending}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
