"use client";

import { useState, useTransition } from "react";
import { Landmark, Loader2, Copy, Check } from "lucide-react";
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
import { sendDirectDebitInviteAction } from "@/app/actions/payments";

export function DirectDebitInviteModal({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [mandateUrl, setMandateUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSend() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await sendDirectDebitInviteAction(customerId);
        setMandateUrl(result.mandateUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send invite");
      }
    });
  }

  function handleCopy() {
    if (!mandateUrl) return;
    navigator.clipboard.writeText(mandateUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Landmark className="h-4 w-4" />
          Direct Debit invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            Send Direct Debit mandate
          </DialogTitle>
          <DialogDescription>
            Generates a GoCardless mandate signup link and sends it to the customer by email/SMS.
          </DialogDescription>
        </DialogHeader>

        {mandateUrl ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <span className="flex-1 truncate">{mandateUrl}</span>
            <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground">
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <Button onClick={handleSend} disabled={isPending} className="w-full">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Generate & send invite
          </Button>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
