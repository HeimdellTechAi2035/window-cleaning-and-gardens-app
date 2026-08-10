import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { geocodeAddress, bulkPostcodesIoLookup } from "@/lib/route-optimizer";

// Preston, Lancashire (PR1) — real-world coordinates used as the "correct
// area" baseline in these tests, mirroring the actual bug report: Nominatim
// free-text search occasionally locks onto a same-named street/place
// elsewhere in the UK (e.g. Birmingham) instead of the postcode's real area.
const PRESTON_LANCASHIRE = { latitude: 53.7632, longitude: -2.7031 };
const WRONG_REGION_BIRMINGHAM = { latitude: 52.4835, longitude: -1.8975 };

// status defaults to 404 ("cleanly not found", no retry) — pass a
// different status explicitly to simulate a transient failure that should
// be retried once.
function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 404) {
  return { ok, status, json: async () => body } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("geocodeAddress", () => {
  it("uses Nominatim's full-address result when it agrees with the postcode's known area", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("nominatim.openstreetmap.org")) {
        return jsonResponse([{ lat: String(PRESTON_LANCASHIRE.latitude), lon: String(PRESTON_LANCASHIRE.longitude) }]);
      }
      if (url.includes("api.postcodes.io/postcodes/")) {
        return jsonResponse({ result: PRESTON_LANCASHIRE });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await geocodeAddress({ addressLine1: "59 Kingsfold Drive", city: "Preston", postcode: "PR1 1AA" });

    expect(result).toEqual(PRESTON_LANCASHIRE);
  });

  it("rejects a Nominatim match implausibly far from the postcode's real location (the reported Birmingham bug)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("nominatim.openstreetmap.org")) {
        // Nominatim's free-text search wrongly resolves to Birmingham.
        return jsonResponse([{ lat: String(WRONG_REGION_BIRMINGHAM.latitude), lon: String(WRONG_REGION_BIRMINGHAM.longitude) }]);
      }
      if (url.includes("api.postcodes.io/postcodes/")) {
        return jsonResponse({ result: PRESTON_LANCASHIRE });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await geocodeAddress({ addressLine1: "59 Kingsfold Drive", city: "Preston", postcode: "PR1 1AA" });

    // Falls back to the authoritative postcode location, not the wrong region.
    expect(result).toEqual(PRESTON_LANCASHIRE);
    expect(result).not.toEqual(WRONG_REGION_BIRMINGHAM);
  });

  it("falls back to the outward-code-only lookup when only a partial postcode (e.g. 'PR1') is available", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("nominatim.openstreetmap.org")) {
        return jsonResponse([]); // no street-level match
      }
      if (url.includes("api.postcodes.io/postcodes/PR1")) {
        // Not a full postcode, so postcodes.io's full lookup 404s.
        return jsonResponse({ result: null }, false);
      }
      if (url.includes("api.postcodes.io/outcodes/PR1")) {
        return jsonResponse({ result: PRESTON_LANCASHIRE });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await geocodeAddress({ addressLine1: "59 Kingsfold Drive", city: "Preston", postcode: "PR1" });

    expect(result).toEqual(PRESTON_LANCASHIRE);
  });

  it("extracts the outward code correctly for M24 and WN3-style postcodes", async () => {
    const MANCHESTER_M24 = { latitude: 53.5547, longitude: -2.1746 };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("nominatim.openstreetmap.org")) return jsonResponse([]);
      if (url.includes("api.postcodes.io/postcodes/M24")) return jsonResponse({ result: null }, false);
      if (url.includes("api.postcodes.io/outcodes/M24")) return jsonResponse({ result: MANCHESTER_M24 });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await geocodeAddress({ addressLine1: "1 Some Road", city: "Manchester", postcode: "m24" });

    expect(result).toEqual(MANCHESTER_M24);
  });

  it("trusts a Nominatim full-address match when there is no postcode to sanity-check it against", async () => {
    // An empty postcode means postcodesIoLookup() returns null without
    // making any HTTP call at all, so only the Nominatim URL needs handling.
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("nominatim.openstreetmap.org")) {
        return jsonResponse([{ lat: String(PRESTON_LANCASHIRE.latitude), lon: String(PRESTON_LANCASHIRE.longitude) }]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await geocodeAddress({ addressLine1: "1 Some Road", city: "Preston", postcode: "" });

    expect(result).toEqual(PRESTON_LANCASHIRE);
  });

  it("falls back to city-level Nominatim search when both address and postcode lookups fail", async () => {
    const CITY_CENTRE = { latitude: 53.76, longitude: -2.7 };
    let nominatimCallCount = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("nominatim.openstreetmap.org")) {
        nominatimCallCount++;
        if (nominatimCallCount === 1) return jsonResponse([]); // full address: no match
        return jsonResponse([{ lat: String(CITY_CENTRE.latitude), lon: String(CITY_CENTRE.longitude) }]); // city-only: match
      }
      if (url.includes("api.postcodes.io")) {
        return jsonResponse({ result: null }, false);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await geocodeAddress({ addressLine1: "Nonexistent Road", city: "Preston", postcode: "ZZ99 9ZZ" });

    expect(result).toEqual(CITY_CENTRE);
    expect(nominatimCallCount).toBe(2);
  });

  it("returns null when every lookup fails", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("nominatim.openstreetmap.org")) return jsonResponse([]);
      if (url.includes("api.postcodes.io")) return jsonResponse({ result: null }, false);
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await geocodeAddress({ addressLine1: "Nowhere Road", city: "Nowhereton", postcode: "" });

    expect(result).toBeNull();
  });

  it("retries once on a transient failure (429/5xx) instead of treating it as not-found", async () => {
    let nominatimAttempts = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("nominatim.openstreetmap.org")) {
        nominatimAttempts++;
        if (nominatimAttempts === 1) return jsonResponse(null, false, 429); // rate limited
        return jsonResponse([{ lat: String(PRESTON_LANCASHIRE.latitude), lon: String(PRESTON_LANCASHIRE.longitude) }]);
      }
      if (url.includes("api.postcodes.io/postcodes/")) return jsonResponse({ result: PRESTON_LANCASHIRE });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await geocodeAddress({ addressLine1: "59 Kingsfold Drive", city: "Preston", postcode: "PR1 1AA" });

    expect(nominatimAttempts).toBe(2);
    expect(result).toEqual(PRESTON_LANCASHIRE);
  });

  it("retries once on a network error and still recovers", async () => {
    let attempts = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("nominatim.openstreetmap.org")) {
        attempts++;
        if (attempts === 1) throw new Error("network down");
        return jsonResponse([{ lat: String(PRESTON_LANCASHIRE.latitude), lon: String(PRESTON_LANCASHIRE.longitude) }]);
      }
      if (url.includes("api.postcodes.io/postcodes/")) return jsonResponse({ result: PRESTON_LANCASHIRE });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await geocodeAddress({ addressLine1: "59 Kingsfold Drive", city: "Preston", postcode: "PR1 1AA" });

    expect(attempts).toBe(2);
    expect(result).toEqual(PRESTON_LANCASHIRE);
  });

  it("gives up after one retry and falls through the fallback chain", async () => {
    let nominatimAttempts = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("nominatim.openstreetmap.org")) {
        nominatimAttempts++;
        return jsonResponse(null, false, 500); // always fails
      }
      if (url.includes("api.postcodes.io/postcodes/")) return jsonResponse({ result: PRESTON_LANCASHIRE });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await geocodeAddress({ addressLine1: "59 Kingsfold Drive", city: "Preston", postcode: "PR1 1AA" });

    // Exactly 2 attempts for the full-address lookup (1 try + 1 retry), then
    // falls back to the postcode's own coordinates.
    expect(nominatimAttempts).toBe(2);
    expect(result).toEqual(PRESTON_LANCASHIRE);
  });
});

describe("bulkPostcodesIoLookup", () => {
  it("resolves every postcode in a single batch request", async () => {
    const a = { latitude: 53.76, longitude: -2.7 };
    const b = { latitude: 53.55, longitude: -2.17 };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.postcodes.io/postcodes");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init!.body as string) as { postcodes: string[] };
      expect(body.postcodes).toHaveLength(2);
      const [first, second] = body.postcodes;
      return jsonResponse({
        result: [
          { query: first, result: a },
          { query: second, result: b },
        ],
      });
    });

    const result = await bulkPostcodesIoLookup(["PR1 1AA", "M1 1AA"]);

    expect(result.get("PR1 1AA")).toEqual(a);
    expect(result.get("M1 1AA")).toEqual(b);
  });

  it("falls back to a deduplicated outward-code lookup for postcodes the bulk endpoint couldn't match", async () => {
    const outcodeCentroid = { latitude: 53.7632, longitude: -2.7031 };
    let outcodeRequests = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "https://api.postcodes.io/postcodes") {
        const body = JSON.parse(init!.body as string) as { postcodes: string[] };
        return jsonResponse({
          result: body.postcodes.map((query) => ({ query, result: null })), // none match as full postcodes
        });
      }
      if (url.includes("api.postcodes.io/outcodes/PR1")) {
        outcodeRequests++;
        return jsonResponse({ result: outcodeCentroid });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    // Three different properties, all in the same "PR1" district.
    const result = await bulkPostcodesIoLookup(["PR1", "PR1", "pr1"]);

    expect(result.get("PR1")).toEqual(outcodeCentroid);
    expect(result.get("pr1")).toEqual(outcodeCentroid);
    // Only one outcode request needed for all three, since they normalize
    // to the same district.
    expect(outcodeRequests).toBe(1);
  });

  it("maps results back to the exact original (non-normalized) postcode strings given as input", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "https://api.postcodes.io/postcodes") {
        const body = JSON.parse(init!.body as string) as { postcodes: string[] };
        return jsonResponse({
          result: body.postcodes.map((query) => ({ query, result: { latitude: 1, longitude: 2 } })),
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await bulkPostcodesIoLookup([" pr1 1aa "]);

    expect(result.get(" pr1 1aa ")).toEqual({ latitude: 1, longitude: 2 });
  });

  it("returns null for a postcode that resolves nowhere at all", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "https://api.postcodes.io/postcodes") return jsonResponse({ result: [{ query: "ZZ99 9ZZ", result: null }] });
      if (url.includes("api.postcodes.io/outcodes/ZZ99")) return jsonResponse(null, false);
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await bulkPostcodesIoLookup(["ZZ99 9ZZ"]);

    expect(result.get("ZZ99 9ZZ")).toBeNull();
  });

  it("handles an empty input list without making any request", async () => {
    const result = await bulkPostcodesIoLookup([]);
    expect(result.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("batches more than 100 postcodes into multiple requests", async () => {
    const postcodes = Array.from({ length: 150 }, (_, i) => `PR1 ${i}AA`);
    let batchRequestCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "https://api.postcodes.io/postcodes") {
        batchRequestCount++;
        const body = JSON.parse(init!.body as string) as { postcodes: string[] };
        expect(body.postcodes.length).toBeLessThanOrEqual(100);
        return jsonResponse({
          result: body.postcodes.map((query) => ({ query, result: { latitude: 1, longitude: 2 } })),
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await bulkPostcodesIoLookup(postcodes);

    expect(batchRequestCount).toBe(2); // 100 + 50
    expect(result.size).toBe(150);
  });
});
