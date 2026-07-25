"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, ZoomControl, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
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
  /** Position within the day's route, or null when not tied to a specific day's run (e.g. the "all customers" view). */
  sequenceOrder: number | null;
  status: JobStatus;
  serviceTitle: string;
  customerName: string;
}

const TILE_URL = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

function FitBounds({ stops }: { stops: RouteStopData[] }) {
  const map = useMap();
  useEffect(() => {
    if (stops.length === 0) return;
    if (stops.length === 1) {
      map.setView([stops[0].latitude, stops[0].longitude], 13);
      return;
    }
    map.fitBounds(
      stops.map((s) => [s.latitude, s.longitude]),
      { padding: [40, 40] }
    );
  }, [map, stops]);
  return null;
}

export default function RouteMap({
  date,
  stops,
  showRoute = true,
}: {
  date: string;
  stops: RouteStopData[];
  /** Whether this is a day's ordered route (shows the route line + Optimize button) or a plain list of pins. */
  showRoute?: boolean;
}) {
  const { theme } = useTheme();
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [selected, setSelected] = useState<RouteStopData | null>(null);

  const center = useMemo((): [number, number] => {
    if (stops.length === 0) return [53.7632, -2.7031]; // Preston, UK fallback
    return [
      stops.reduce((s, p) => s + p.latitude, 0) / stops.length,
      stops.reduce((s, p) => s + p.longitude, 0) / stops.length,
    ];
  }, [stops]);

  const linePositions = useMemo(
    () =>
      [...stops]
        .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0))
        .map((s): [number, number] => [s.latitude, s.longitude]),
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

  return (
    <div className="relative h-[400px] sm:h-[480px] lg:h-[560px] overflow-hidden rounded-xl border border-border">
      <MapContainer center={center} zoom={11} zoomControl={false} style={{ width: "100%", height: "100%" }}>
        <TileLayer url={theme === "dark" ? TILE_URL.dark : TILE_URL.light} attribution={TILE_ATTRIBUTION} />
        <ZoomControl position="topright" />
        <FitBounds stops={stops} />
        {showRoute && stops.length > 1 && (
          <Polyline positions={linePositions} pathOptions={{ color: "#6366f1", weight: 3, dashArray: "1 6" }} />
        )}
        {stops.map((stop) => (
          <MapMarker
            key={stop.id}
            latitude={stop.latitude}
            longitude={stop.longitude}
            sequenceOrder={showRoute ? stop.sequenceOrder : null}
            status={stop.status}
            onClick={() => setSelected(stop)}
          />
        ))}
      </MapContainer>

      {showRoute && (
        <div className="absolute left-3 top-3 z-[1000] flex gap-2">
          <Button size="sm" onClick={handleOptimize} disabled={isOptimizing} className="shadow-lg">
            {isOptimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Optimize route
          </Button>
        </div>
      )}

      {selected && (
        <div className="absolute bottom-3 left-3 right-3 z-[1000] flex items-center justify-between rounded-lg border border-border bg-card p-3 shadow-lg sm:right-auto sm:w-80">
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
