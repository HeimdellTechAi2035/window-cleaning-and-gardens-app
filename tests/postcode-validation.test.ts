import { describe, it, expect } from "vitest";
import { normalizeUkPostcode } from "@/lib/utils";

describe("normalizeUkPostcode", () => {
  it("normalizes a lowercase, unspaced postcode to standard format", () => {
    expect(normalizeUkPostcode("pr11aa")).toBe("PR1 1AA");
  });

  it("normalizes an already-correctly-formatted postcode (idempotent)", () => {
    expect(normalizeUkPostcode("PR1 1AA")).toBe("PR1 1AA");
  });

  it("collapses extra/irregular whitespace", () => {
    expect(normalizeUkPostcode("  pr1   1aa  ")).toBe("PR1 1AA");
  });

  it("handles every UK postcode area-code shape (1 letter, 2 letters, 1 digit, 2 digits)", () => {
    expect(normalizeUkPostcode("m11ae")).toBe("M1 1AE"); // 1 letter + 1 digit
    expect(normalizeUkPostcode("sw1a1aa")).toBe("SW1A 1AA"); // 2 letters + 1 digit + 1 letter
    expect(normalizeUkPostcode("m601ae")).toBe("M60 1AE"); // 1 letter + 2 digits
    expect(normalizeUkPostcode("wn32bb")).toBe("WN3 2BB"); // 2 letters + 1 digit
  });

  it("rejects a partial postcode with no inward code (the outward-code-only case)", () => {
    expect(normalizeUkPostcode("PR1")).toBeNull();
    expect(normalizeUkPostcode("M24")).toBeNull();
    expect(normalizeUkPostcode("WN3")).toBeNull();
  });

  it("rejects an empty or whitespace-only string", () => {
    expect(normalizeUkPostcode("")).toBeNull();
    expect(normalizeUkPostcode("   ")).toBeNull();
  });

  it("rejects something that isn't postcode-shaped at all", () => {
    expect(normalizeUkPostcode("not a postcode")).toBeNull();
    expect(normalizeUkPostcode("12345")).toBeNull();
  });
});
