"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
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
import { deleteOrganizationAsAdminAction } from "@/app/actions/super-admin";

export function DeleteOrgButton({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim() === organizationName;

  function handleDelete() {
    if (!canDelete) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteOrganizationAsAdminAction(organizationId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push("/admin");
      router.refresh();
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setConfirmText("");
      setError(null);
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" />
        Delete company
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {organizationName}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the company, every user in it, and all of its customers, rounds,
              and jobs. This cannot be undone. Type the company name below to confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-org-name">Type &quot;{organizationName}&quot; to confirm</Label>
            <Input
              id="confirm-org-name"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={!canDelete || isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
