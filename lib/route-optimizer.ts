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
 * Calls the Mapbox Optimization API (v1, /optimized-trips) to compute the
 * minimum-distance ordering for a day's stops, starting from the depot/
 * first stop and not requiring a round trip back to start.
 */
export async function optimizeRouteWithMapbox(
  depot: RouteStop,
  stops: RouteStop[]
): Promise<OptimizeRouteResult> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) throw new Error("MAPBOX_ACCESS_TOKEN is not configured");

  const allPoints = [depot, ...stops];
  if (allPoints.length < 2) {
    return { stops: [], totalDistanceMeters: 0, totalDurationSeconds: 0 };
  }
  if (allPoints.length > 12) {
    return optimizeRouteNearestNeighbour(depot, stops);
  }

  const coordinates = allPoints.map((p) => `${p.longitude},${p.latitude}`).join(";");
  const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinates}?source=first&roundtrip=false&access_token=${token}`;

  const res = await fetch(url);
  if (!res.ok) {
    return optimizeRouteNearestNeighbour(depot, stops);
  }

  const data = (await res.json()) as {
    trips?: { distance: number; duration: number }[];
    waypoints?: { waypoint_index: number }[];
  };

  if (!data.trips?.length || !data.waypoints) {
    return optimizeRouteNearestNeighbour(depot, stops);
  }

  const orderedStops = data.waypoints
    .map((wp, originalIndex) => ({ wp, originalIndex }))
    .filter(({ originalIndex }) => originalIndex !== 0) // drop depot
    .sort((a, b) => a.wp.waypoint_index - b.wp.waypoint_index)
    .map(({ originalIndex }, sequenceOrder) => ({
      ...allPoints[originalIndex],
      sequenceOrder,
    }));

  return {
    stops: orderedStops,
    totalDistanceMeters: data.trips[0].distance,
    totalDurationSeconds: data.trips[0].duration,
  };
}

/**
 * Fallback / small-route optimizer using a simple nearest-neighbour
 * greedy heuristic on the haversine distance. Used when the Mapbox API
 * is unavailable or the stop count exceeds its coordinate limit.
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

export async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) throw new Error("MAPBOX_ACCESS_TOKEN is not configured");

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    address
  )}.json?country=GB&limit=1&access_token=${token}`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as { features?: { center: [number, number] }[] };
  const feature = data.features?.[0];
  if (!feature) return null;

  const [longitude, latitude] = feature.center;
  return { latitude, longitude };
}
