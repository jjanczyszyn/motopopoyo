// Booking-integrity rules shared by the Convex mutations and the admin UI.
// Pure functions only, so they're unit-tested without a database.

import { computeTotal } from "./pricing";
import { ratesForDaily } from "./season";

/** Statuses that hold a bike. Cancelled and returned bookings free it. */
export function holdsBike(status: string): boolean {
  return status !== "cancelled" && status !== "returned";
}

export interface BookingLike {
  _id?: string;
  bikeId: string;
  startDate: string; // ISO YYYY-MM-DD, inclusive
  endDate: string; // ISO YYYY-MM-DD, exclusive (the return day)
  status: string;
  code?: string;
}

/**
 * The first booking that holds `bikeId` for any day in [startDate, endDate).
 * A return day may be the next renter's start day (back-to-back is allowed).
 */
export function findOverlap<T extends BookingLike>(
  bookings: T[],
  want: { bikeId: string; startDate: string; endDate: string; excludeId?: string }
): T | null {
  for (const b of bookings) {
    if (b.bikeId !== want.bikeId) continue;
    if (want.excludeId && b._id === want.excludeId) continue;
    if (!holdsBike(b.status)) continue;
    if (b.startDate < want.endDate && b.endDate > want.startDate) return b;
  }
  return null;
}

export interface BlockLike {
  bikeId: string;
  date: string; // ISO YYYY-MM-DD
  status: string; // "maintenance" | "blocked"
}

/** Maintenance/blocked days for `bikeId` that fall inside [startDate, endDate). */
export function blockedDays(
  blocks: BlockLike[],
  bikeId: string,
  startDate: string,
  endDate: string
): string[] {
  return blocks
    .filter((b) => b.bikeId === bikeId && b.date >= startDate && b.date < endDate)
    .map((b) => b.date)
    .sort();
}

// Words printed on ID cards and passports that OCR sometimes reads as the
// holder's name ("REPUBLICA DE NICARAGUA", "PASSPORT", …).
const DOC_HEADER_WORDS = [
  "republica", "república", "republic", "nicaragua", "passport", "pasaporte",
  "passeport", "reisepass", "nacional", "national", "identidad", "identity",
  "cedula", "cédula", "documento", "document", "licencia", "licence", "license",
  "driver", "conducir", "united", "states", "america", "kingdom", "estados",
  "unidos", "federal", "bundesrepublik", "deutschland", "type", "tipo",
];
const HEADER_RE = new RegExp(`\\b(${DOC_HEADER_WORDS.join("|")})\\b`, "i");

/**
 * True when the scanned name is probably not a person's name: empty, too
 * short, made of ID-card heading words, or containing digits.
 */
export function nameNeedsReview(first: string, last: string): boolean {
  const full = `${first ?? ""} ${last ?? ""}`.trim();
  if (full.length < 3) return true;
  if (/\d/.test(full)) return true;
  if (HEADER_RE.test(full)) return true;
  // Single initials only ("G Ne") are almost always a bad read.
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.every((p) => p.replace(/[^\p{L}]/gu, "").length <= 2)) return true;
  return false;
}

/**
 * Re-prices a booking from its own stored daily rate, so editing an old
 * high-season booking during low season doesn't silently change its price.
 */
export function repriceTotal(days: number, dailyRateUSD: number, discount = 0): number {
  return Math.max(0, computeTotal(days, ratesForDaily(dailyRateUSD)) - discount);
}

/**
 * Splits bookings that still owe money into those whose rental has started
 * (overdue: money should already have changed hands) and those still ahead.
 */
export function splitAwaiting<T extends { startDate: string; status: string; balance: number }>(
  rows: T[],
  todayISO: string
): { overdue: T[]; upcoming: T[] } {
  const owing = rows
    .filter((r) => r.status !== "cancelled" && r.balance > 0)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return {
    overdue: owing.filter((r) => r.startDate <= todayISO),
    upcoming: owing.filter((r) => r.startDate > todayISO),
  };
}

/** Today's date in Nicaragua (UTC-6, no DST) as ISO YYYY-MM-DD. */
export function todayInNicaragua(nowMs: number = Date.now()): string {
  return new Date(nowMs - 6 * 3600 * 1000).toISOString().slice(0, 10);
}
