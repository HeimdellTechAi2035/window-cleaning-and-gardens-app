"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { RouteStopData } from "./route-map-inner";

export type { RouteStopData };

const RouteMapInner = dynamic(() => import("./route-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] sm:h-[480px] lg:h-[560px] items-center justify-center rounded-xl border border-border">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

export function RouteMap(props: { date: string; stops: RouteStopData[]; showRoute?: boolean }) {
  return <RouteMapInner {...props} />;
}
