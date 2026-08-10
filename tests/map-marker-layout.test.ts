import { describe, it, expect } from "vitest";
import { spreadOverlappingPoints } from "@/lib/map-marker-layout";

describe("spreadOverlappingPoints", () => {
  it("leaves points with distinct coordinates untouched", () => {
    const points = [
      { id: "a", latitude: 53.76, longitude: -2.7 },
      { id: "b", latitude: 53.55, longitude: -2.17 },
    ];

    expect(spreadOverlappingPoints(points)).toEqual(points);
  });

  it("spreads points that share the exact same coordinates apart", () => {
    const points = [
      { id: "a", latitude: 53.76, longitude: -2.7 },
      { id: "b", latitude: 53.76, longitude: -2.7 },
      { id: "c", latitude: 53.76, longitude: -2.7 },
    ];

    const result = spreadOverlappingPoints(points);

    expect(result).toHaveLength(3);
    // No two results should land on the exact same coordinate anymore.
    const keys = result.map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`);
    expect(new Set(keys).size).toBe(3);
  });

  it("keeps every spread point close to the original shared location", () => {
    const points = [
      { id: "a", latitude: 53.76, longitude: -2.7 },
      { id: "b", latitude: 53.76, longitude: -2.7 },
    ];

    const result = spreadOverlappingPoints(points);
    for (const p of result) {
      expect(Math.abs(p.latitude - 53.76)).toBeLessThan(0.001);
      expect(Math.abs(p.longitude - -2.7)).toBeLessThan(0.001);
    }
  });

  it("treats coordinates within ~11m of each other as the same shared point", () => {
    const points = [
      { id: "a", latitude: 53.76001, longitude: -2.70001 },
      { id: "b", latitude: 53.76002, longitude: -2.70002 },
    ];

    const result = spreadOverlappingPoints(points);
    const keys = result.map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`);
    expect(new Set(keys).size).toBe(2);
  });

  it("preserves all other fields on each point unchanged", () => {
    const points = [
      { id: "a", latitude: 53.76, longitude: -2.7, customerName: "Dan Roberts" },
      { id: "b", latitude: 53.76, longitude: -2.7, customerName: "Kirsty Cust" },
    ];

    const result = spreadOverlappingPoints(points);
    expect(result.map((p) => p.customerName).sort()).toEqual(["Dan Roberts", "Kirsty Cust"]);
    expect(result.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("handles an empty list", () => {
    expect(spreadOverlappingPoints([])).toEqual([]);
  });

  it("handles a mix of unique and overlapping groups", () => {
    const points = [
      { id: "a", latitude: 53.76, longitude: -2.7 }, // group 1
      { id: "b", latitude: 53.76, longitude: -2.7 }, // group 1
      { id: "c", latitude: 53.55, longitude: -2.17 }, // unique
    ];

    const result = spreadOverlappingPoints(points);
    expect(result).toHaveLength(3);
    const unique = result.find((p) => p.id === "c");
    expect(unique).toEqual(points[2]); // untouched
  });
});
