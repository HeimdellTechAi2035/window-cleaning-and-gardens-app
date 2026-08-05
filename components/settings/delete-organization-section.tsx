"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  requestOrganizationDeletionAction,
  cancelOrganizationDeletionRequestAction,
} from "@/app/actions/account-deletion";

const AFFECTED_CATEGORIES = [
  "Staff accounts",
  "Customers",
  "Properties",
  "Jobs and rounds",
  "Photos",
  "Notifications",
  "Routes",
  "Connected payment settings (Stripe/GoCardless)",
  "Operational financial records (transactions, invoice numbers)",
];

interface PendingRequest {
  id: string;
  processingDeadline: Date | null;
  requestedAt: Date;
}

export function DeleteOrganizationSection({
  organizationName,
  pendingRequest,
}: {
  organizationName: string;
  pendingRequest: PendingRequest | null;
}) {
  if (pendingRequest) {
    return <PendingDeletionNotice organizationName={organizationName} request={pendingRequest} />;
  }
  return <RequestDeletionDialog organizationName={organizationName} />;
}

function PendingDeletionNotice({
  organizationName,
  request,
}: {
  organizationName: string;
  request: PendingRequest;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrganizationDeletionRequestAction(request.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" />
        Deletion requested for {organizationName}
      </p>
      <p className="text-sm text-muted-foreground">
        Requested {formatDate(request.requestedAt)}. Your subscription has already been cancelled, so
        you will not be charged again. A Heimdell administrator will process the deletion by{" "}
        <strong>
          {request.processingDeadline ? formatDate(request.processingDeadline) : "within one month"}
        </strong>
        . You can cancel this request at any time before it&apos;s processed.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button variant="outline" size="sm" className="w-fit" onClick={handleCancel} disabled={isPending}>
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Cancel deletion request
      </Button>
    </div>
  );
}

function RequestDeletionDialog({ organizationName }: { organizationName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("password", password);
      formData.set("confirmName", confirmName);
      const result = await requestOrganizationDeletionAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDeadline(result.processingDeadline);
      router.refresh();
    });
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    setOpen(next);
    if (!next) {
      setPassword("");
      setConfirmName("");
      setError(null);
      setDeadline(null);
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <AlertTriangle className="h-3.5 w-3.5" />
        Delete this organisation
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete {organizationName}?</DialogTitle>
            <DialogDescription>
              {deadline
                ? `Deletion requested. It will be processed by ${new Date(deadline).toLocaleDateString("en-GB")}. Your subscription has already been cancelled.`
                : "This permanently deletes your organisation and everything in it. This cannot be undone once processed."}
            </DialogDescription>
          </DialogHeader>

          {!deadline && (
            <>
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">This will delete:</p>
                <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                  {AFFECTED_CATEGORIES.map((c) => (
                    <li key={c}>• {c}</li>
                  ))}
                </ul>
              </div>

              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <strong>Before you continue:</strong> export any customer invoices or job records you
                are legally required to keep. Once this request is processed, they cannot be
                recovered.
              </p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="delete-org-password">Confirm your password</Label>
                <Input
                  id="delete-org-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="delete-org-confirm-name">
                  Type <strong>{organizationName}</strong> to confirm
                </Label>
                <Input
                  id="delete-org-confirm-name"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  autoComplete="off"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{deadline ? "Close" : "Cancel"}</Button>
            </DialogClose>
            {!deadline && (
              <Button
                variant="destructive"
                onClick={handleSubmit}
                disabled={isPending || confirmName.trim() !== organizationName}
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Request deletion
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
