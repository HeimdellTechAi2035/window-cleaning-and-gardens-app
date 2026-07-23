"use client";

import { useState, useTransition } from "react";
import { CreditCard, Loader2, Copy, Check } from "lucide-react";
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
import { Input, Label } from "@/components/ui/input";
import { sendPaymentLinkAction } from "@/app/actions/payments";

export function SendPaymentLinkModal({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Window cleaning invoice");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ paymentUrl: string; qrCodeDataUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSend() {
    const amountNumber = Number(amount);
    if (!amountNumber || amountNumber <= 0) {
      setError("Enter an amount greater than £0");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await sendPaymentLinkAction({ customerId, amount: amountNumber, description });
        setResult(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send payment link");
      }
    });
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result.paymentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleClose(next: boolean) {
    setOpen(next);
    if (!next) {
      setResult(null);
      setAmount("");
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CreditCard className="h-4 w-4" />
          Send payment link
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Send Stripe payment link
          </DialogTitle>
          <DialogDescription>
            Generates a secure Stripe Checkout link and QR code, and texts/emails it to the
            customer.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.qrCodeDataUrl}
              alt="Payment QR code"
              className="h-48 w-48 rounded-lg border border-border p-2"
            />
            <p className="text-center text-xs text-muted-foreground">
              Scan to pay, or share the link below. Already sent to the customer.
            </p>
            <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <span className="flex-1 truncate">{result.paymentUrl}</span>
              <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-description">Description</Label>
              <Input
                id="payment-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-amount">Amount (£)</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25.00"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{result ? "Close" : "Cancel"}</Button>
          </DialogClose>
          {!result && (
            <Button onClick={handleSend} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Generate & send
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
