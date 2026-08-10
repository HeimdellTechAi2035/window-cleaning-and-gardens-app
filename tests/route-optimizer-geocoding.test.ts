import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { geocodeAddress } from "@/lib/route-optimizer";

// Preston, Lancashire (PR1) — real-world coordinates used as the "correct
// area" baseline in these tests, mirroring the actual bug report: Nominatim
// free-text search occasionally locks onto a same-named street/place
// elsewhere in the UK (e.g. Birmingham) instead of the postcode's real area.
const PRESTON_LANCASHIRE = { latitude: 53.7632, longitude: -2.7031 };
const WRONG_REGION_BIRMINGHAM = { latitude: 52.4835, longitude: -1.8975 };

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
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
});
