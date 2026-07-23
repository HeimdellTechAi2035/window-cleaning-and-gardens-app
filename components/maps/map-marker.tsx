import { Marker } from "react-map-gl";
import { cn } from "@/lib/utils";

export function MapMarker({
  latitude,
  longitude,
  sequenceOrder,
  status,
}: {
  latitude: number;
  longitude: number;
  sequenceOrder: number;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "RESCHEDULED";
}) {
  const colors: Record<typeof status, string> = {
    SCHEDULED: "bg-primary",
    IN_PROGRESS: "bg-warning",
    COMPLETED: "bg-success",
    SKIPPED: "bg-muted-foreground",
    RESCHEDULED: "bg-muted-foreground",
  };

  return (
    <Marker latitude={latitude} longitude={longitude} anchor="bottom">
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-lg",
          colors[status]
        )}
      >
        {sequenceOrder + 1}
      </div>
    </Marker>
  );
}
