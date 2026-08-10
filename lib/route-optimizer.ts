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
 * A transient network hiccup or a 429/5xx from either geocoding service
 * previously looked identical to "no result" and was never retried —
 * discarding a lookup that would very likely have succeeded a moment
 * later. One retry after a short backoff, only for genuinely transient
 * failures (not a clean 404/"not found" response), fixes that without
 * risking hammering either service.
 */
async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || res.status === 404) return res;
      // 429 (rate limited) or 5xx — worth one retry after a short pause.
    } catch {
      // Network error — worth one retry.
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

async function nominatimSearch(query: string): Promise<{ latitude: number; longitude: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(
    query
  )}`;

  const res = await fetchWithRetry(url, {
    headers: {
      "User-Agent": `RoundFlow/1.0 (${process.env.NEXT_PUBLIC_APP_URL ?? "https://roundflow.app"})`,
    },
  });
  if (!res || !res.ok) return null;

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

  const fullRes = await fetchWithRetry(`https://api.postcodes.io/postcodes/${encodeURIComponent(normalized)}`);
  if (fullRes?.ok) {
    const data = (await fullRes.json()) as { result?: { latitude: number; longitude: number } };
    if (data.result) return { latitude: data.result.latitude, longitude: data.result.longitude };
  }

  const outwardCode = extractOutwardCode(normalized);
  if (!outwardCode) return null;

  const outcodeRes = await fetchWithRetry(`https://api.postcodes.io/outcodes/${encodeURIComponent(outwardCode)}`);
  if (!outcodeRes?.ok) return null;
  const data = (await outcodeRes.json()) as { result?: { latitude: number; longitude: number } };
  return data.result ? { latitude: data.result.latitude, longitude: data.result.longitude } : null;
}

/**
 * Looks up many postcodes in as few requests as possible — used by the
 * bulk "re-check all addresses" action, where a naive one-request-per-
 * property loop (even with no artificial delay) risks exceeding a
 * serverless function's execution time limit once an organisation has
 * more than a handful of properties.
 *
 * postcodes.io's bulk endpoint accepts up to 100 full postcodes in a
 * single request. Whatever doesn't resolve there (partial/invalid
 * postcodes) falls back to the outward-code-only endpoint — deduplicated,
 * since many properties in the same postcode district collapse to the
 * same single follow-up request rather than one each.
 */
export async function bulkPostcodesIoLookup(
  postcodes: string[]
): Promise<Map<string, { latitude: number; longitude: number } | null>> {
  const results = new Map<string, { latitude: number; longitude: number } | null>();
  const normalizedByOriginal = new Map<string, string>();
  for (const postcode of postcodes) {
    const normalized = postcode.trim().toUpperCase().replace(/\s+/g, "");
    normalizedByOriginal.set(postcode, normalized);
    if (!results.has(postcode)) results.set(postcode, null);
  }

  const uniqueNormalized = [...new Set(normalizedByOriginal.values())].filter(Boolean);
  const fullByNormalized = new Map<string, { latitude: number; longitude: number }>();

  const BATCH_SIZE = 100;
  for (let i = 0; i < uniqueNormalized.length; i += BATCH_SIZE) {
    const batch = uniqueNormalized.slice(i, i + BATCH_SIZE);
    const res = await fetchWithRetry("https://api.postcodes.io/postcodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcodes: batch }),
    });
    if (!res?.ok) continue;
    const data = (await res.json()) as {
      result?: { query: string; result: { latitude: number; longitude: number } | null }[];
    };
    for (const entry of data.result ?? []) {
      if (entry.result) fullByNormalized.set(entry.query, { latitude: entry.result.latitude, longitude: entry.result.longitude });
    }
  }

  // Whatever the bulk endpoint couldn't match (partial postcodes, typos),
  // fall back to outward-code centroids — deduplicated, since e.g. thirty
  // properties in "PR1" only need that one extra request between them.
  const outcodeByNormalized = new Map<string, string>();
  for (const normalized of uniqueNormalized) {
    if (fullByNormalized.has(normalized)) continue;
    const outcode = extractOutwardCode(normalized);
    if (outcode) outcodeByNormalized.set(normalized, outcode);
  }
  const uniqueOutcodes = [...new Set(outcodeByNormalized.values())];
  const centroidByOutcode = new Map<string, { latitude: number; longitude: number }>();
  for (const outcode of uniqueOutcodes) {
    const res = await fetchWithRetry(`https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`);
    if (!res?.ok) continue;
    const data = (await res.json()) as { result?: { latitude: number; longitude: number } };
    if (data.result) centroidByOutcode.set(outcode, { latitude: data.result.latitude, longitude: data.result.longitude });
  }

  for (const [original, normalized] of normalizedByOriginal) {
    const full = fullByNormalized.get(normalized);
    if (full) {
      results.set(original, full);
      continue;
    }
    const outcode = outcodeByNormalized.get(normalized);
    const centroid = outcode ? centroidByOutcode.get(outcode) : undefined;
    if (centroid) results.set(original, centroid);
  }

  return results;
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
