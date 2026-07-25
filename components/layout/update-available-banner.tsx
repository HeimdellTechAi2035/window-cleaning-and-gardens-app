"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * A tab left open across a deploy keeps running the JS bundle it loaded
 * with — client-side navigations never re-fetch it, so it can eventually
 * try to load a chunk from a build that no longer exists on the server and
 * crash outright. This polls for the currently-live build and prompts a
 * refresh before that happens, rather than leaving people to guess why the
 * app broke.
 */
export function UpdateAvailableBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const currentBuildId = process.env.NEXT_PUBLIC_BUILD_ID;

  useEffect(() => {
    if (!currentBuildId) return;

    async function check() {
      try {
        const res = await fetch("/api/build-id", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId: string };
        if (data.buildId && data.buildId !== currentBuildId) {
          setUpdateAvailable(true);
        }
      } catch {
        // Offline or a transient network hiccup — not worth surfacing.
      }
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [currentBuildId]);

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[2000] flex items-center justify-center gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground shadow-md">
      <span>A new version of RoundFlow is available.</span>
      <Button
        size="sm"
        variant="secondary"
        className="h-7 px-2.5 text-xs"
        onClick={() => window.location.reload()}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </Button>
    </div>
  );
}
