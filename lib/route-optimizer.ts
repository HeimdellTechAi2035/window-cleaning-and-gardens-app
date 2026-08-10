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

async function nominatimSearch(query: string): Promise<{ latitude: number; longitude: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(
    query
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

/** Extracts the outward code (e.g. "PR1", "M24", "WN3") from a full or partial UK postcode. */
function extractOutwardCode(postcode: string): string | null {
  const normalized = postcode.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return null;
  const match = normalized.match(/^[A-Z]{1,2}\d[A-Z0-9]?/);
  return match ? match[0] : null;
}

/**
 * Looks up a UK postcode via postcodes.io — a free, no-API-key service
 * backed by Royal Mail/ONS data, purpose-built for exactly this lookup
 * (unlike Nominatim's free-text search, it can't accidentally match a
 * same-named street/place in a different part of the country). Tries the
 * full postcode first for the most precise centroid, then falls back to
 * the outward code alone (e.g. "PR1") so even a partial postcode still
 * resolves to the correct postal district rather than nothing at all.
 */
async function postcodesIoLookup(postcode: string): Promise<{ latitude: number; longitude: number } | null> {
  const normalized = postcode.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return null;

  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(normalized)}`);
    if (res.ok) {
      const data = (await res.json()) as { result?: { latitude: number; longitude: number } };
      if (data.result) return { latitude: data.result.latitude, longitude: data.result.longitude };
    }
  } catch {
    // Fall through to the outward-code-only lookup below.
  }

  const outwardCode = extractOutwardCode(normalized);
  if (!outwardCode) return null;

  try {
    const res = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(outwardCode)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: { latitude: number; longitude: number } };
    return data.result ? { latitude: data.result.latitude, longitude: data.result.longitude } : null;
  } catch {
    return null;
  }
}

function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// A street-level match this far from the postcode's own known location is
// almost certainly a mismatched place/street name, not a real address in
// that postcode — reject it rather than pin the wrong region entirely.
const MAX_PLAUSIBLE_DISTANCE_FROM_POSTCODE_KM = 15;

/**
 * Geocodes a UK address. Nominatim's free-text search gives the most
 * precise street-level result when it works, but — being a fuzzy full-text
 * match — it can occasionally lock onto a similarly-named street/place in
 * a completely different part of the UK (e.g. a "Preston" match nowhere
 * near the Preston, Lancashire the postcode actually refers to). postcodes.io
 * is authoritative for the postcode itself but only ever precise to
 * postcode/outward-code level, not the individual street.
 *
 * So both are checked, and a Nominatim result implausibly far from where
 * the postcode itself resolves to is discarded in favour of the postcode's
 * own (less precise, but reliably-in-the-right-area) coordinates.
 */
export async function geocodeAddress(address: {
  addressLine1: string;
  city: string;
  postcode: string;
}): Promise<{ latitude: number; longitude: number } | null> {
  const [fullAddress, postcodeCoords] = await Promise.all([
    nominatimSearch(`${address.addressLine1}, ${address.city}, ${address.postcode}, UK`),
    postcodesIoLookup(address.postcode),
  ]);

  if (fullAddress) {
    const isImplausible =
      postcodeCoords && haversineKm(fullAddress, postcodeCoords) > MAX_PLAUSIBLE_DISTANCE_FROM_POSTCODE_KM;
    if (!isImplausible) return fullAddress;
  }

  if (postcodeCoords) return postcodeCoords;

  await new Promise((resolve) => setTimeout(resolve, 1100));
  return nominatimSearch(`${address.city}, UK`);
}
