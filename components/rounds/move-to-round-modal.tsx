"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
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
import { moveToRoundAction } from "@/app/actions/rounds";

export function MoveToRoundModal({
  propertyId,
  customerName,
  currentRoundName,
  otherRounds,
}: {
  propertyId: string;
  customerName: string;
  currentRoundName: string;
  otherRounds: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [targetRoundId, setTargetRoundId] = useState(otherRounds[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleMove() {
    if (!targetRoundId) return;
    setError(null);
    startTransition(async () => {
      try {
        await moveToRoundAction({ propertyId, targetRoundId });
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move property");
      }
    });
  }

  if (otherRounds.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <ArrowRightLeft className="h-3.5 w-3.5" />
          Move to round&hellip;
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Move {customerName}
          </DialogTitle>
          <DialogDescription>
            Moves this property (and its jobs) out of &quot;{currentRoundName}&quot; onto the
            round you pick — useful when splitting a big area round into smaller day-sized
            rounds. This locks the assignment, so a later address edit won&apos;t move it back.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="move-target">Move to</Label>
          <select
            id="move-target"
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleMove} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Move property
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
