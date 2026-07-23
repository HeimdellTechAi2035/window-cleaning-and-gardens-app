"use client";

import { useState, useTransition } from "react";
import { Loader2, XCircle } from "lucide-react";
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
import { Input, Label, Textarea } from "@/components/ui/input";
import { skipJobAction } from "@/app/actions/jobs";
import { cn } from "@/lib/utils";
import type { SkipReason } from "@prisma/client";

const reasons: { value: SkipReason; label: string }[] = [
  { value: "WEATHER", label: "Weather / Heavy Rain" },
  { value: "CUSTOMER_HOLIDAY", label: "Customer on Holiday" },
  { value: "ACCESS_LOCKED", label: "Access Locked" },
  { value: "NON_PAYMENT", label: "Non-payment" },
  { value: "OTHER", label: "Other" },
];

export function SkipJobDialog({
  jobId,
  serviceTitle,
  defaultPrice,
  open,
  onOpenChange,
}: {
  jobId: string;
  serviceTitle: string;
  defaultPrice: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState<SkipReason>("WEATHER");
  const [note, setNote] = useState("");
  const [chargePartialFee, setChargePartialFee] = useState(false);
  const [partialFeeAmount, setPartialFeeAmount] = useState(String((defaultPrice / 2).toFixed(2)));
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      await skipJobAction({
        jobId,
        reason,
        note: note || undefined,
        chargePartialFee,
        partialFeeAmount: chargePartialFee ? Number(partialFeeAmount) : undefined,
      });
      onOpenChange(false);
      setNote("");
      setChargePartialFee(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-warning" />
            Skip job
          </DialogTitle>
          <DialogDescription>{serviceTitle} — log why this visit is being skipped.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Reason</Label>
            <div className="grid grid-cols-2 gap-2">
              {reasons.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    reason === r.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skip-note">Note (optional)</Label>
            <Textarea id="skip-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Charge partial fee?</p>
              <p className="text-xs text-muted-foreground">
                Otherwise this visit carries forward to the next cycle.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChargePartialFee((v) => !v)}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors",
                chargePartialFee ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  chargePartialFee ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
          </div>

          {chargePartialFee && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="partial-fee">Partial fee amount (£)</Label>
              <Input
                id="partial-fee"
                type="number"
                step="0.01"
                min="0"
                value={partialFeeAmount}
                onChange={(e) => setPartialFeeAmount(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={isPending} variant="destructive">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm skip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
