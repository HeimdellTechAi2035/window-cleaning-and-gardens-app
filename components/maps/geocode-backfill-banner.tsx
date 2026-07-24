"use client";

import { useState, useTransition } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { backfillPropertyCoordinatesAction } from "@/app/actions/organization";

export function GeocodeBackfillBanner({ missingCount }: { missingCount: number }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ geocoded: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (missingCount === 0 && !result) return null;

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await backfillPropertyCoordinatesAction();
        setResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <MapPin className="h-4 w-4 shrink-0" />
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : result ? (
          <span>
            Placed {result.geocoded} address{result.geocoded === 1 ? "" : "es"} on the map
            {result.failed > 0
              ? `, ${result.failed} address${result.failed === 1 ? "" : "es"} couldn't be found — check they're spelled correctly.`
              : "."}
          </span>
        ) : (
          <span>
            {missingCount} customer address{missingCount === 1 ? "" : "es"} not on the map yet.
          </span>
        )}
      </div>
      {!result && (
        <Button size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {isPending ? "Placing pins…" : "Add missing pins"}
        </Button>
      )}
    </div>
  );
}
