// Usage/error log helpers shared by convex/events.ts and the admin UI.
// Pure functions so they're unit-tested without a database.

export const EVENT_KINDS = ["visit", "step", "action", "error"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const MAX_DETAIL = 500;
export const RETENTION_DAYS = 90;

// The renter journey, in order. Used to build the booking funnel.
export const FUNNEL_STEPS = [
  "home", "calendar", "bike", "ocr", "phone", "pay", "contract", "delivery", "done",
] as const;

/**
 * Strips things that could identify a person from free text before it is
 * stored: emails, phone/ID-like digit runs, and long tokens. Event detail is
 * meant for our own messages (error text, screen names), not customer data.
 */
export function scrub(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  let s = String(text);
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]");
  s = s.replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]");
  s = s.replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]");
  s = s.replace(/\s+/g, " ").trim();
  return s.length > MAX_DETAIL ? `${s.slice(0, MAX_DETAIL - 1)}…` : s;
}

export interface EventLike {
  at: number;
  sessionId: string;
  area: string;
  kind: string;
  name: string;
}

/**
 * How many distinct sessions reached each renter step. A session counts for
 * a step if it ever logged `step` with name `screen:<step>`.
 */
export function funnel(events: EventLike[]): { step: string; sessions: number }[] {
  const reached = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.area !== "site" || e.kind !== "step" || !e.name.startsWith("screen:")) continue;
    const step = e.name.slice("screen:".length);
    if (!reached.has(step)) reached.set(step, new Set());
    reached.get(step)!.add(e.sessionId);
  }
  return FUNNEL_STEPS.map((step) => ({ step, sessions: reached.get(step)?.size ?? 0 }));
}

/** Counts per Nicaragua-local day (UTC-6) for visits, sessions and errors. */
export function daily(events: EventLike[]): {
  day: string; visits: number; sessions: number; errors: number;
}[] {
  const byDay = new Map<string, { visits: number; sessions: Set<string>; errors: number }>();
  for (const e of events) {
    const day = new Date(e.at - 6 * 3600 * 1000).toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, { visits: 0, sessions: new Set(), errors: 0 });
    const d = byDay.get(day)!;
    d.sessions.add(e.sessionId);
    if (e.kind === "visit") d.visits++;
    if (e.kind === "error") d.errors++;
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, d]) => ({ day, visits: d.visits, sessions: d.sessions.size, errors: d.errors }));
}
