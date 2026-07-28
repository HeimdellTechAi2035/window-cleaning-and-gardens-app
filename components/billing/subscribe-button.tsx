"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startSubscriptionCheckoutAction } from "@/app/actions/billing";

export function SubscribeButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await startSubscriptionCheckoutAction();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      window.location.href = result.checkoutUrl;
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button size="lg" onClick={handleClick} disabled={isPending} className="w-full">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Start 14-day free trial
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
