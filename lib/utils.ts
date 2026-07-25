import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parses a "YYYY-MM-DD" date input value into a Date at a fixed 9am local time. */
export function parseDateInput(value: string): Date {
  return new Date(`${value}T09:00:00`);
}

/**
 * Builds an `sms:` link that opens the device's own Messages app with the
 * number and body prefilled, so the text sends from the worker's own phone
 * number rather than a business SMS provider. iOS and Android disagree on
 * how the body param is delimited (iOS wants `&`, Android wants `?`).
 */
export function smsUri(phone: string, body: string): string {
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const separator = isIOS ? "&" : "?";
  return `sms:${phone}${separator}body=${encodeURIComponent(body)}`;
}

export function formatCurrency(amount: number | string, currency = "GBP") {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(value);
}

export function formatDate(date: Date | string, opts?: Intl.DateTimeFormatOptions) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(d);
}

export function addWeeks(date: Date, weeks: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + weeks * 7);
  return result;
}

export function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function initials(firstName: string, lastName: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

export function generateInvoiceNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${y}-${rand}`;
}

/**
 * Normalizes a city/area name so "preston", "Preston", and "PRESTON" all
 * resolve to the same round instead of creating case-duplicate rounds.
 * Genuinely different spellings (e.g. a typo) are not deduplicated —
 * only casing/whitespace differences are.
 */
export function normalizeAreaName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Derives the round-grouping key from a city/area field. When someone
 * enters "Ashton-on-Ribble, Preston" or "Fulwood, Preston", the round
 * should be "Preston" (the town the crew actually travels to), not a
 * separate round per neighbourhood — otherwise two customers a few
 * streets apart in the same town falsely conflict as different rounds.
 * A round only needs to be that granular once it's deliberately split
 * (via "Move to round"), which is a manual admin action, not automatic.
 */
export function areaRoundKey(cityRaw: string): string {
  const segments = cityRaw.split(",");
  const town = segments[segments.length - 1];
  return normalizeAreaName(town);
}

const ROUND_COLOR_PALETTE = ["#6366f1", "#0ea5e9", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6"];

/** Deterministic color per area name, so the same area always gets the same round color. */
export function colorForArea(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return ROUND_COLOR_PALETTE[Math.abs(hash) % ROUND_COLOR_PALETTE.length];
}
