"use client";

import { useState, useTransition } from "react";
import { Pencil, Loader2 } from "lucide-react";
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
import { Input, Label, Textarea } from "@/components/ui/input";
import { updateRoundAction } from "@/app/actions/rounds";

const presetColors = ["#6366f1", "#0ea5e9", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6"];

export function EditRoundDialog({
  roundId,
  name,
  description,
  colorCode,
}: {
  roundId: string;
  name: string;
  description: string | null;
  colorCode: string;
}) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(colorCode);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    formData.set("roundId", roundId);
    formData.set("colorCode", color);
    setError(null);
    startTransition(async () => {
      try {
        await updateRoundAction(formData);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update round");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5" />
          Edit round
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit round</DialogTitle>
          <DialogDescription>
            Renaming locks every property currently in this round, so a later address edit
            won&apos;t auto-move it back out.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="round-name">Round name</Label>
            <Input id="round-name" name="name" defaultValue={name} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="round-description">Description (optional)</Label>
            <Textarea id="round-description" name="description" defaultValue={description ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {presetColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition-shadow"
                  style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px ${c}` : "none" }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
