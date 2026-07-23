"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, CheckCircle2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { completeJobAction } from "@/app/actions/jobs";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function CompleteJobDialog({
  jobId,
  serviceTitle,
  open,
  onOpenChange,
}: {
  jobId: string;
  serviceTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setPhotoPreview(dataUrl);
  }

  function handleSubmit() {
    startTransition(async () => {
      await completeJobAction({
        jobId,
        afterPhotoUrl: photoPreview ?? undefined,
        workerNotes: notes || undefined,
      });
      onOpenChange(false);
      setPhotoPreview(null);
      setNotes("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Complete job
          </DialogTitle>
          <DialogDescription>{serviceTitle} — attach an after photo and any notes.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-36 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted"
          >
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="After photo" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-sm">
                <Camera className="h-6 w-6" />
                Attach after photo
              </span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoChange}
          />

          <Textarea
            placeholder="Worker notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={isPending} variant="success">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Mark completed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
