"use client";

import { useMemo, useState } from "react";
import Map, { Source, Layer, NavigationControl } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { RefreshCw, Loader2, Navigation2 } from "lucide-react";
import { MapMarker } from "./map-marker";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { googleMapsNavigationUrl } from "@/lib/route-optimizer";
import type { JobStatus } from "@prisma/client";

export interface RouteStopData {
  id: string;
  latitude: number;
  longitude: number;
  sequenceOrder: number;
  status: JobStatus;
  serviceTitle: string;
  customerName: string;
}

export function RouteMap({ date, stops }: { date: string; stops: RouteStopData[] }) {
  const { theme } = useTheme();
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [selected, setSelected] = useState<RouteStopData | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const center = useMemo(() => {
    if (stops.length === 0) return { latitude: 53.7632, longitude: -2.7031 }; // Preston, UK fallback
    return {
      latitude: stops.reduce((s, p) => s + p.latitude, 0) / stops.length,
      longitude: stops.reduce((s, p) => s + p.longitude, 0) / stops.length,
    };
  }, [stops]);

  const lineGeoJson = useMemo(
    () => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [...stops]
          .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
          .map((s) => [s.longitude, s.latitude]),
      },
      properties: {},
    }),
    [stops]
  );

  async function handleOptimize() {
    setIsOptimizing(true);
    try {
      await fetch("/api/route-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      window.location.reload();
    } finally {
      setIsOptimizing(false);
    }
  }

  if (!token) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        Set NEXT_PUBLIC_MAPBOX_TOKEN to enable the route map.
      </div>
    );
  }

  return (
    <div className="relative h-[560px] overflow-hidden rounded-xl border border-border">
      <Map
        mapboxAccessToken={token}
        initialViewState={{ ...center, zoom: 11 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={
          theme === "dark"
            ? "mapbox://styles/mapbox/dark-v11"
            : "mapbox://styles/mapbox/light-v11"
        }
      >
        <NavigationControl position="top-right" />
        {stops.length > 1 && (
          <Source id="route" type="geojson" data={lineGeoJson}>
            <Layer
              id="route-line"
              type="line"
              paint={{ "line-color": "#6366f1", "line-width": 3, "line-dasharray": [1, 1.5] }}
            />
          </Source>
        )}
        {stops.map((stop) => (
          <div key={stop.id} onClick={() => setSelected(stop)}>
            <MapMarker
              latitude={stop.latitude}
              longitude={stop.longitude}
              sequenceOrder={stop.sequenceOrder}
              status={stop.status}
            />
          </div>
        ))}
      </Map>

      <div className="absolute left-3 top-3 flex gap-2">
        <Button size="sm" onClick={handleOptimize} disabled={isOptimizing} className="shadow-lg">
          {isOptimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Optimize route
        </Button>
      </div>

      {selected && (
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-lg border border-border bg-card p-3 shadow-lg sm:right-auto sm:w-80">
          <div>
            <p className="text-sm font-semibold">{selected.serviceTitle}</p>
            <p className="text-xs text-muted-foreground">{selected.customerName}</p>
          </div>
          <a
            href={googleMapsNavigationUrl({ latitude: selected.latitude, longitude: selected.longitude })}
            target="_blank"
            rel="noreferrer"
          >
            <Button size="sm" variant="outline">
              <Navigation2 className="h-4 w-4" />
              Navigate
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
