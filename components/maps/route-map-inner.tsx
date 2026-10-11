"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { MapContainer, TileLayer, Polyline, ZoomControl, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { RefreshCw, Loader2, X, MapPin } from "lucide-react";
import { MapMarker } from "./map-marker";
import { Button } from "@/components/ui/button";
import { spreadOverlappingPoints } from "@/lib/map-marker-layout";
import { updatePropertyPinAction, resetPropertyPinToAutomaticAction } from "@/app/actions/customers";
import type { JobStatus } from "@prisma/client";

export interface RouteStopData {
  id: string;
  propertyId: string;
  latitude: number;
  longitude: number;
  /** Position within the day's route, or null when not tied to a specific day's run (e.g. the "all customers" view). */
  sequenceOrder: number | null;
  status: JobStatus;
  address: string;
  /** The job type (e.g. "Window Cleaning"), or null in the "all customers" view where there's no specific job. */
  serviceTitle: string | null;
  customerName: string;
  /** Whether this pin was manually dragged and saved — never overwritten by automatic geocoding again. */
  coordinatesLocked: boolean;
}

// Standard OSM tiles need no provider API key. Keep browser caching and
// referrer headers intact and request only tiles visible in the map.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [selected, setSelected] = useState<RouteStopData | null>(null);
  const [pendingMove, setPendingMove] = useState<{ propertyId: string; latitude: number; longitude: number } | null>(
    null
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const center = useMemo((): [number, number] => {
    if (stops.length === 0) return [53.7632, -2.7031]; // Preston, UK fallback
    return [
      stops.reduce((s, p) => s + p.latitude, 0) / stops.length,
      stops.reduce((s, p) => s + p.longitude, 0) / stops.length,
    ];
  }, [stops]);

  // The pin being dragged shows at its dropped position immediately (both
  // as a marker and, for an ordered route, in the route line) even before
  // it's saved — everything else keeps using the true stored coordinates.
  const stopsWithPendingMove = useMemo(() => {
    if (!pendingMove) return stops;
    return stops.map((s) =>
      s.propertyId === pendingMove.propertyId
        ? { ...s, latitude: pendingMove.latitude, longitude: pendingMove.longitude }
        : s
    );
  }, [stops, pendingMove]);

  const linePositions = useMemo(
    () =>
      [...stopsWithPendingMove]
        .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0))
        .map((s): [number, number] => [s.latitude, s.longitude]),
    [stopsWithPendingMove]
  );

  // Visual-only: several stops can legitimately share the same coordinates
  // (e.g. a street OpenStreetMap doesn't have falls back to its postcode
  // district's centroid) — spread just the on-screen pins apart so each one
  // stays visible and clickable. Centering/fit-bounds above still use the
  // true, unmodified stored coordinates so a drag doesn't re-centre the map.
  const markerPositions = useMemo(() => spreadOverlappingPoints(stopsWithPendingMove), [stopsWithPendingMove]);

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

  function handleDragEnd(stop: RouteStopData, position: { latitude: number; longitude: number }) {
    setSaveError(null);
    setPendingMove({ propertyId: stop.propertyId, ...position });
    setSelected(stop);
  }

  function handleSavePin() {
    if (!selected || !pendingMove) return;
    setSaveError(null);
    startSaving(async () => {
      const result = await updatePropertyPinAction(selected.propertyId, pendingMove.latitude, pendingMove.longitude);
      if ("error" in result) {
        setSaveError(result.error);
        return;
      }
      window.location.reload();
    });
  }

  function handleCancelMove() {
    setPendingMove(null);
    setSaveError(null);
  }

  function handleResetToAutomatic() {
    if (!selected) return;
    setSaveError(null);
    startSaving(async () => {
      const result = await resetPropertyPinToAutomaticAction(selected.propertyId);
      if ("error" in result) {
        setSaveError(result.error);
        return;
      }
      window.location.reload();
    });
  }

  const hasPendingMoveForSelected = !!(selected && pendingMove && pendingMove.propertyId === selected.propertyId);

  return (
    <div className="relative h-[400px] sm:h-[480px] lg:h-[560px] overflow-hidden rounded-xl border border-border">
      <MapContainer center={center} zoom={11} zoomControl={false} style={{ width: "100%", height: "100%" }}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <ZoomControl position="topright" />
        <FitBounds stops={stops} />
        {showRoute && stops.length > 1 && (
          <Polyline positions={linePositions} pathOptions={{ color: "#6366f1", weight: 3, dashArray: "1 6" }} />
        )}
        {markerPositions.map((stop) => (
          <MapMarker
            key={stop.id}
            latitude={stop.latitude}
            longitude={stop.longitude}
            sequenceOrder={showRoute ? stop.sequenceOrder : null}
            status={stop.status}
            locked={stop.coordinatesLocked}
            draggable
            onClick={() => {
              setSelected(stop);
              setSaveError(null);
            }}
            onDragEnd={(position) => handleDragEnd(stop, position)}
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
        <div className="absolute bottom-3 left-3 right-3 z-[1000] rounded-lg border border-border bg-card p-3 shadow-lg sm:right-auto sm:w-80">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{selected.address}</p>
              <p className="text-xs text-muted-foreground">
                {selected.customerName}
                {selected.serviceTitle ? ` · ${selected.serviceTitle}` : ""}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => {
                setSelected(null);
                setSaveError(null);
              }}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {saveError && <p className="mt-2 text-xs text-destructive">{saveError}</p>}

          {hasPendingMoveForSelected ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={handleSavePin} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                Save position
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancelMove} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Drag this pin to correct its position on the map.
              {selected.coordinatesLocked && (
                <>
                  {" "}
                  Manually placed —{" "}
                  <button
                    type="button"
                    onClick={handleResetToAutomatic}
                    disabled={isSaving}
                    className="underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                  >
                    reset to automatic
                  </button>
                  .
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
