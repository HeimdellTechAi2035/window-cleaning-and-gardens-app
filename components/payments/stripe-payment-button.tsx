"use client";

import { useState, useTransition } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { payOutstandingBalanceAction } from "@/app/actions/portal";

export function StripePaymentButton({ token, amount }: { token: string; amount: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handlePay() {
    setError(null);
    startTransition(async () => {
      try {
        const { checkoutUrl } = await payOutstandingBalanceAction(token);
        if (checkoutUrl) window.location.href = checkoutUrl;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Payment failed");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handlePay} disabled={isPending || amount <= 0} size="lg" className="w-full">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        Pay outstanding balance
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
