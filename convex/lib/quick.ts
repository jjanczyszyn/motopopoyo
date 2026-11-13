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

/** How long after adding a rental its author may still change it. */
export const QUICK_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Note written on payments recorded by the quick-add page. */
export const QUICK_PAYMENT_NOTE = "Marked paid on the quick link";

/** Who added a booking through the quick-add page, read from its note. */
export function quickAuthor(notes: string | undefined): "Karen" | "JJ" | null {
  const m = /^Added by (Karen|JJ) via quick (?:add|link)\b/.exec(notes ?? "");
  return m ? (m[1] as "Karen" | "JJ") : null;
}

/**
 * True when `who` may still edit this booking from the quick-add page: they
 * added it there, it isn't cancelled, and it was added under 24 hours ago.
 */
export function canQuickEdit(
  r: { notes?: string; createdAt: number; status: string },
  who: "Karen" | "JJ",
  now: number
): boolean {
  if (quickAuthor(r.notes) !== who) return false;
  if (r.status === "cancelled") return false;
  return now - r.createdAt < QUICK_EDIT_WINDOW_MS;
}
