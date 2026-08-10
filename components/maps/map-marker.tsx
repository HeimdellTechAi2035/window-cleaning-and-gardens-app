import L, { type DragEndEvent } from "leaflet";
import { Marker } from "react-leaflet";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@prisma/client";

const statusClass: Record<JobStatus, string> = {
  SCHEDULED: "bg-primary",
  IN_PROGRESS: "bg-warning",
  COMPLETED: "bg-success",
  SKIPPED: "bg-muted-foreground",
  RESCHEDULED: "bg-muted-foreground",
};

function buildIcon(label: string, status: JobStatus, locked: boolean) {
  const html = `<div class="${cn(
    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold text-white shadow-lg",
    locked ? "border-amber-400" : "border-white",
    statusClass[status]
  )}">${label}</div>`;

  return L.divIcon({
    html,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

export function MapMarker({
  latitude,
  longitude,
  sequenceOrder,
  status,
  locked = false,
  draggable = false,
  onClick,
  onDragEnd,
}: {
  latitude: number;
  longitude: number;
  /** A day's route position (shown as a number), or null for a plain, unordered pin. */
  sequenceOrder: number | null;
  status: JobStatus;
  /** Whether this pin was manually placed and saved — shown with a gold border instead of white. */
  locked?: boolean;
  /** Whether this pin can be dragged to a new position. */
  draggable?: boolean;
  onClick?: () => void;
  onDragEnd?: (position: { latitude: number; longitude: number }) => void;
}) {
  return (
    <Marker
      position={[latitude, longitude]}
      icon={buildIcon(sequenceOrder === null ? "•" : String(sequenceOrder + 1), status, locked)}
      draggable={draggable}
      eventHandlers={{
        ...(onClick ? { click: onClick } : {}),
        ...(onDragEnd
          ? {
              dragend: (event: DragEndEvent) => {
                const marker = event.target as L.Marker;
                const position = marker.getLatLng();
                onDragEnd({ latitude: position.lat, longitude: position.lng });
              },
            }
          : {}),
      }}
    />
  );
}
