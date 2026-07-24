export interface RouteStop {
  id: string;
  latitude: number;
  longitude: number;
}

export interface OptimizedStop extends RouteStop {
  sequenceOrder: number;
}

export interface OptimizeRouteResult {
  stops: OptimizedStop[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}

/**
 * Route optimizer using a simple nearest-neighbour greedy heuristic on
 * haversine distance. No external routing API or API key required.
 */
export function optimizeRouteNearestNeighbour(
  depot: RouteStop,
  stops: RouteStop[]
): OptimizeRouteResult {
  const remaining = [...stops];
  const ordered: OptimizedStop[] = [];
  let current = depot;
  let totalDistanceMeters = 0;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineDistanceMeters(current, remaining[i]);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearestIndex = i;
      }
    }
    const next = remaining.splice(nearestIndex, 1)[0];
    totalDistanceMeters += nearestDistance;
    ordered.push({ ...next, sequenceOrder: ordered.length });
    current = next;
  }

  const averageSpeedMetersPerSecond = 8.9; // ~20mph average urban driving
  return {
    stops: ordered,
    totalDistanceMeters,
    totalDurationSeconds: totalDistanceMeters / averageSpeedMetersPerSecond,
  };
}

function haversineDistanceMeters(a: RouteStop, b: RouteStop): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export function googleMapsNavigationUrl(destination: { latitude: number; longitude: number }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}&travelmode=driving`;
}

export function wazeNavigationUrl(destination: { latitude: number; longitude: number }) {
  return `https://waze.com/ul?ll=${destination.latitude},${destination.longitude}&navigate=yes`;
}

/**
 * Geocodes a UK address via OpenStreetMap's Nominatim service (free, no
 * API key). Nominatim's usage policy asks for a descriptive User-Agent
 * and at most ~1 request/second — callers doing bulk geocoding should
 * space out requests themselves.
 */
export async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(
    address
  )}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": `RoundFlow/1.0 (${process.env.NEXT_PUBLIC_APP_URL ?? "https://roundflow.app"})`,
    },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { lat: string; lon: string }[];
  const feature = data[0];
  if (!feature) return null;

  return { latitude: parseFloat(feature.lat), longitude: parseFloat(feature.lon) };
}
