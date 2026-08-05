import { describe, it, expect } from "vitest";
import {
  generateVerificationToken,
  hashToken,
  tokenMatchesHash,
  calculateProcessingDeadline,
  calculateBillingRetentionDate,
} from "@/lib/account-deletion";

describe("verification token hashing and expiry", () => {
  it("never stores the raw token — the hash is a different value from the token itself", () => {
    const { token, tokenHash } = generateVerificationToken();
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toHaveLength(64); // sha256 hex digest
  });

  it("generates a token long enough to resist guessing (32 random bytes = 64 hex chars)", () => {
    const { token } = generateVerificationToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it("sets an expiry roughly 48 hours in the future", () => {
    const { expiry } = generateVerificationToken();
    const hoursFromNow = (expiry.getTime() - Date.now()) / (1000 * 60 * 60);
    expect(hoursFromNow).toBeGreaterThan(47.9);
    expect(hoursFromNow).toBeLessThan(48.1);
  });

  it("two different tokens hash to two different values (no collisions in practice)", () => {
    const a = generateVerificationToken();
    const b = generateVerificationToken();
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it("tokenMatchesHash correctly verifies the matching token", () => {
    const { token, tokenHash } = generateVerificationToken();
    expect(tokenMatchesHash(token, tokenHash)).toBe(true);
  });

  it("tokenMatchesHash rejects a wrong token against a real hash", () => {
    const { tokenHash } = generateVerificationToken();
    const wrongToken = generateVerificationToken().token;
    expect(tokenMatchesHash(wrongToken, tokenHash)).toBe(false);
  });

  it("tokenMatchesHash rejects a tampered/malformed token without throwing", () => {
    const { tokenHash } = generateVerificationToken();
    expect(tokenMatchesHash("not-a-real-token", tokenHash)).toBe(false);
    expect(tokenMatchesHash("", tokenHash)).toBe(false);
  });

  it("hashToken is deterministic for the same input", () => {
    const token = generateVerificationToken().token;
    expect(hashToken(token)).toBe(hashToken(token));
  });
});

describe("processing deadline (one calendar month)", () => {
  it("is exactly one calendar month after the given date", () => {
    const from = new Date("2026-08-05T10:00:00.000Z");
    const deadline = calculateProcessingDeadline(from);
    expect(deadline.getUTCFullYear()).toBe(2026);
    expect(deadline.getUTCMonth()).toBe(8); // September (0-indexed)
    expect(deadline.getUTCDate()).toBe(5);
  });

  it("defaults to one month from now when no date is given", () => {
    const before = Date.now();
    const deadline = calculateProcessingDeadline();
    const daysAhead = (deadline.getTime() - before) / (1000 * 60 * 60 * 24);
    // Anywhere from 28-31 days depending on the month — just confirm it's
    // roughly a month out, not e.g. a week or a year.
    expect(daysAhead).toBeGreaterThan(27);
    expect(daysAhead).toBeLessThan(32);
  });
});

describe("Heimdell platform-billing retention date (financial year end 31 May + 6 years)", () => {
  // Every expected value below is 31 May, 23:59:59.999 UTC — the
  // documented UTC boundary this function always returns.
  function expectRetainedUntil(input: string, expectedYear: number) {
    const retainedUntil = calculateBillingRetentionDate(new Date(input));
    expect(retainedUntil.getUTCFullYear()).toBe(expectedYear);
    expect(retainedUntil.getUTCMonth()).toBe(4); // May, 0-indexed
    expect(retainedUntil.getUTCDate()).toBe(31);
    expect(retainedUntil.getUTCHours()).toBe(23);
    expect(retainedUntil.getUTCMinutes()).toBe(59);
    expect(retainedUntil.getUTCSeconds()).toBe(59);
    expect(retainedUntil.getUTCMilliseconds()).toBe(999);
  }

  it("20 May 2026 (within the FY) retains until 31 May 2032", () => {
    expectRetainedUntil("2026-05-20T12:00:00.000Z", 2032);
  });

  it("5 August 2026 (after the FY end) retains until 31 May 2033", () => {
    expectRetainedUntil("2026-08-05T12:00:00.000Z", 2033);
  });

  it("31 May 2027 (exactly on the FY end) retains until 31 May 2033", () => {
    expectRetainedUntil("2027-05-31T12:00:00.000Z", 2033);
  });

  it("1 June 2027 (the day after the FY end) retains until 31 May 2034", () => {
    expectRetainedUntil("2027-06-01T12:00:00.000Z", 2034);
  });

  it("30 May falls in the same FY as 31 May (both before the June rollover)", () => {
    expectRetainedUntil("2026-05-30T12:00:00.000Z", 2032);
  });

  it("31 May at the very last instant of the day still belongs to that year's FY", () => {
    expectRetainedUntil("2026-05-31T23:59:59.999Z", 2032);
  });

  it("1 June at the very first instant of the day already belongs to the next FY", () => {
    expectRetainedUntil("2026-06-01T00:00:00.000Z", 2033);
  });

  it("31 December (end-of-calendar-year boundary) belongs to the FY ending the following May", () => {
    expectRetainedUntil("2026-12-31T23:59:59.999Z", 2033);
  });

  it("1 January (start-of-calendar-year boundary) belongs to the FY ending that same May", () => {
    expectRetainedUntil("2027-01-01T00:00:00.000Z", 2033);
  });

  it("handles a leap-year transaction date (29 February) with no effect on the 31 May result", () => {
    // 2028 is a leap year — confirms 29 Feb doesn't break the month/year
    // arithmetic, even though 31 May is entirely unaffected by leap years.
    expectRetainedUntil("2028-02-29T12:00:00.000Z", 2034);
  });

  it("a financial-year-end date landing on a leap-year 31 May computes cleanly", () => {
    // 2032 is a leap year; 31 May 2032 (FY end) must still resolve exactly
    // to itself + 6 years with no drift from the intervening leap day.
    expectRetainedUntil("2032-05-31T00:00:00.000Z", 2038);
  });

  it("is computed from UTC calendar fields, not local time — a UTC date one instant before/after midnight resolves by its UTC calendar day", () => {
    // 31 May 23:59:59.999 UTC and 1 June 00:00:00.000 UTC are 1ms apart in
    // real time but fall in different financial years — proves the
    // function reads getUTCMonth/getUTCFullYear, not a locale-dependent
    // local-time reading that could disagree with the UTC calendar date.
    const justBeforeMidnightUtc = calculateBillingRetentionDate(new Date("2026-05-31T23:59:59.999Z"));
    const justAfterMidnightUtc = calculateBillingRetentionDate(new Date("2026-06-01T00:00:00.000Z"));
    expect(justBeforeMidnightUtc.getUTCFullYear()).toBe(2032);
    expect(justAfterMidnightUtc.getUTCFullYear()).toBe(2033);
  });

  it("defaults to today's date when no transaction date is given", () => {
    const retainedUntil = calculateBillingRetentionDate();
    expect(retainedUntil.getUTCMonth()).toBe(4);
    expect(retainedUntil.getUTCDate()).toBe(31);
    expect(retainedUntil.getUTCFullYear()).toBeGreaterThanOrEqual(new Date().getUTCFullYear() + 6);
  });
});
