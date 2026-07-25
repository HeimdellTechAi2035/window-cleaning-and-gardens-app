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
import { smsUri } from "@/lib/utils";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// A phone camera photo is routinely 3-10MB — base64-encoded that comfortably
// exceeds the server action's payload limit and crashes the request with an
// opaque "server-side exception". Downscaling and re-compressing to a
// reasonable resolution/quality client-side keeps it a few hundred KB, well
// within limits, with no visible quality loss for a before/after reference photo.
async function compressImageToDataUrl(file: File, maxDimension = 1600, quality = 0.75): Promise<string> {
  const rawDataUrl = await fileToDataUrl(file);
  const img = await loadImage(rawDataUrl);

  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return rawDataUrl;

  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function CompleteJobDialog({
  jobId,
  serviceTitle,
  customerName,
  customerPhone,
  open,
  onOpenChange,
}: {
  jobId: string;
  serviceTitle: string;
  customerName: string;
  customerPhone: string | null;
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
    const dataUrl = await compressImageToDataUrl(file);
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

      // Opens the worker's own Messages app with the customer's number and
      // a prefilled "job done" text — sent from their own phone number,
      // no SMS provider involved. They can still edit or cancel before
      // sending.
      if (customerPhone) {
        const firstName = customerName.split(" ")[0];
        const body = `Hi ${firstName}, your ${serviceTitle} has been completed today. Thank you!`;
        window.location.href = smsUri(customerPhone, body);
      }
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
