export interface Positioned {
  latitude: number;
  longitude: number;
}

// Rounding to 4 decimal places groups points within roughly 11m of each
// other at UK latitudes — close enough that they're visually the same pin
// on the map at any zoom level a user would actually look at.
function coordinateKey(point: Positioned): string {
  return `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`;
}

// ~65m at UK latitudes — enough to visually separate overlapping pins into
// a small, clearly-clickable cluster, not enough to look like a different
// street or area.
const SPREAD_RADIUS_DEGREES = 0.0006;

/**
 * Offsets markers that share the same (or near-identical) coordinates into
 * a small circle around that point, so every one is visible and clickable.
 *
 * This happens legitimately, not just from a bug: free geocoding can only
 * ever be as precise as its data allows, so several customers in the same
 * postcode district whose exact street isn't in OpenStreetMap's data (e.g.
 * a newly-built road, or a typo) all correctly fall back to the same
 * postcode-district centroid — accurate at that level, but otherwise
 * indistinguishable as map pins without this spread.
 */
export function spreadOverlappingPoints<T extends Positioned>(points: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const point of points) {
    const key = coordinateKey(point);
    const group = groups.get(key);
    if (group) group.push(point);
    else groups.set(key, [point]);
  }

  const result: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    group.forEach((point, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      result.push({
        ...point,
        latitude: point.latitude + SPREAD_RADIUS_DEGREES * Math.cos(angle),
        longitude: point.longitude + SPREAD_RADIUS_DEGREES * Math.sin(angle),
      });
    });
  }
  return result;
}
