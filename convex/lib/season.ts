// Seasonal pricing. The business runs two price lists — high season and low
// season — and switches between them from the admin Settings page.
//
// Only the daily rate really moves; the weekly/monthly discounts keep the same
// shape in both seasons so the "longer = cheaper" ladder stays proportional:
//   • a week bills as 6 days   → ~14% off the daily rate
//   • a month bills as 22.5 days → 25% off the daily rate
//
// config.dailyRate / weeklyRate / monthlyRate always hold the *effective*
// rates for the active season, so every consumer (site, contract, bookings)
// reads them exactly as before and needs no season awareness.

export const SEASONS = ["high", "low"] as const;
export type Season = (typeof SEASONS)[number];

export interface SeasonRates {
  daily: number;
  weekly: number;
  monthly: number;
}

export const WEEKLY_DAYS_BILLED = 6;
export const MONTHLY_DAYS_BILLED = 22.5;

/** Derives the proportional weekly/monthly rates from a daily rate. */
export function ratesForDaily(daily: number): SeasonRates {
  return {
    daily,
    weekly: Math.round(daily * WEEKLY_DAYS_BILLED),
    monthly: Math.round(daily * MONTHLY_DAYS_BILLED),
  };
}

export const DEFAULT_SEASON: Season = "high";

export const DEFAULT_SEASON_RATES: Record<Season, SeasonRates> = {
  high: ratesForDaily(20), // $20 / $120 / $450
  low: ratesForDaily(18), //  $18 / $108 / $405
};

export const SEASON_LABEL: Record<Season, string> = {
  high: "High season",
  low: "Low season",
};

export function isSeason(x: unknown): x is Season {
  return x === "high" || x === "low";
}
