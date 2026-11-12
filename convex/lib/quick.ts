// Pure helpers for the quick "log a rental" link (convex/quick.ts, /new).
// No database access, so they're unit-tested directly.

/** ISO YYYY-MM-DD plus `n` days (UTC, so no DST surprises). */
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const isISODate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/**
 * Where a booking stands given today's date: already over → returned,
 * running now → active, still ahead → confirmed. `end` is the return day.
 */
export function statusForDates(
  start: string,
  end: string,
  today: string
): "confirmed" | "active" | "returned" {
  if (end <= today) return "returned";
  if (start <= today) return "active";
  return "confirmed";
}

/** Longest rental the quick link accepts. Anything longer goes via the admin. */
export const MAX_QUICK_DAYS = 120;
