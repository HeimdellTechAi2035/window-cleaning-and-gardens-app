import L from "leaflet";
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

function buildIcon(label: string, status: JobStatus) {
  const html = `<div class="${cn(
    "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-lg",
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
  onClick,
}: {
  latitude: number;
  longitude: number;
  /** A day's route position (shown as a number), or null for a plain, unordered pin. */
  sequenceOrder: number | null;
  status: JobStatus;
  onClick?: () => void;
}) {
  return (
    <Marker
      position={[latitude, longitude]}
      icon={buildIcon(sequenceOrder === null ? "•" : String(sequenceOrder + 1), status)}
      eventHandlers={onClick ? { click: onClick } : undefined}
    />
  );
}
