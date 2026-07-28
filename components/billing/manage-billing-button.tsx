"use client";

import { useState, useTransition } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openBillingPortalAction } from "@/app/actions/billing";

export function ManageBillingButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await openBillingPortalAction();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      window.location.href = result.portalUrl;
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending} className="w-fit">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        Manage billing
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
