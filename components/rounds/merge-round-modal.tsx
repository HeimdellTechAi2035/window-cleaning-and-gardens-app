"use client";

import { useState, useTransition } from "react";
import { Merge, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { mergeRoundsAction } from "@/app/actions/rounds";

export function MergeRoundModal({
  roundId,
  roundName,
  otherRounds,
}: {
  roundId: string;
  roundName: string;
  otherRounds: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [targetRoundId, setTargetRoundId] = useState(otherRounds[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();

  function handleMerge() {
    if (!targetRoundId) return;
    startTransition(async () => {
      await mergeRoundsAction({ sourceRoundId: roundId, targetRoundId });
      setOpen(false);
    });
  }

  if (otherRounds.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Merge className="h-3.5 w-3.5" />
          Merge into&hellip;
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5 text-primary" />
            Merge &quot;{roundName}&quot;
          </DialogTitle>
          <DialogDescription>
            Every job on &quot;{roundName}&quot; moves onto the round you pick below, then &quot;
            {roundName}&quot; is deleted. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="merge-target">Merge into</Label>
          <select
            id="merge-target"
            value={targetRoundId}
            onChange={(e) => setTargetRoundId(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
          >
            {otherRounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleMerge} disabled={isPending} variant="destructive">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Merge & delete &quot;{roundName}&quot;
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
