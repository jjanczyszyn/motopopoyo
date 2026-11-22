// Pure helpers for services sold on commission (massages, pedicures, trips…):
// the customer is charged `priceUSD`, the provider is paid `costUSD`, and the
// difference is ours. No database access, so they're unit-tested directly.
import { QUICK_EDIT_WINDOW_MS, isISODate } from "./quick";

export type Partner = "JJ" | "Karen";

export const MAX_SERVICE_USD = 10000;
export const MAX_SERVICE_NAME = 60;
export const MAX_CLIENT_NAME = 80;

const cents = (n: number) => Math.round(n * 100);

/** Rounded to whole cents. */
export const roundUSD = (n: number) => cents(n) / 100;

/** What's left for us. Worked out in cents so 45.10 − 30.05 is exactly 15.05. */
export function commissionUSD(priceUSD: number, costUSD: number): number {
  return (cents(priceUSD) - cents(costUSD)) / 100;
}

/** One space between words, trimmed, capped. */
export function cleanText(s: string | undefined, max: number): string {
  return (s ?? "").trim().replace(/\s+/g, " ").slice(0, max).trim();
}

export interface ServiceInput {
  serviceName: string;
  date: string;
  priceUSD: number;
  costUSD: number;
}

/**
 * Why a service can't be saved, or null when it's fine. A cost above the price
 * is refused: it's nearly always the two amounts typed the wrong way round.
 */
export function serviceProblem(s: ServiceInput, today: string): string | null {
  if (!cleanText(s.serviceName, MAX_SERVICE_NAME)) return "SERVICE_NAME: enter the service.";
  if (!isISODate(s.date)) return "SERVICE_DATE: pick a date.";
  if (s.date > today) return "SERVICE_FUTURE: log a service on or after the day it happens.";
  const money = (n: number) => Number.isFinite(n) && n >= 0 && n <= MAX_SERVICE_USD;
  if (!money(s.priceUSD) || cents(s.priceUSD) <= 0) return "SERVICE_PRICE: enter the price charged.";
  if (!money(s.costUSD)) return "SERVICE_COST: enter what the service cost.";
  if (cents(s.costUSD) > cents(s.priceUSD)) {
    return "SERVICE_COST_OVER_PRICE: the cost is higher than the price charged.";
  }
  return null;
}

/** Same 24-hour rule as quick rentals: its author, not deleted, under a day old. */
export function canEditService(
  s: { addedBy: Partner; createdAt: number; deletedAt?: number },
  who: Partner,
  now: number
): boolean {
  return s.addedBy === who && s.deletedAt === undefined && now - s.createdAt < QUICK_EDIT_WINDOW_MS;
}

export interface ServiceTotals {
  count: number;
  priceUSD: number;
  costUSD: number;
  commissionUSD: number;
}

/** Totals over the rows that count (deleted ones never do). */
export function serviceTotals(
  rows: { priceUSD: number; costUSD: number; deletedAt?: number }[]
): ServiceTotals {
  let price = 0;
  let cost = 0;
  let count = 0;
  for (const r of rows) {
    if (r.deletedAt !== undefined) continue;
    count += 1;
    price += cents(r.priceUSD);
    cost += cents(r.costUSD);
  }
  return { count, priceUSD: price / 100, costUSD: cost / 100, commissionUSD: (price - cost) / 100 };
}

/** Service names already used, most recent first, without repeats in any casing. */
export function recentNames(
  rows: { serviceName: string; createdAt: number; deletedAt?: number }[],
  limit: number
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of [...rows].sort((a, b) => b.createdAt - a.createdAt)) {
    const key = r.serviceName.toLowerCase();
    if (r.deletedAt !== undefined || seen.has(key)) continue;
    seen.add(key);
    out.push(r.serviceName);
    if (out.length === limit) break;
  }
  return out;
}
