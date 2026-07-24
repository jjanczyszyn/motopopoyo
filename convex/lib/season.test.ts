import { describe, it, expect } from "vitest";
import {
  DEFAULT_SEASON,
  DEFAULT_SEASON_RATES,
  SEASONS,
  ratesForDaily,
} from "./season";
import { computeTotal, perDay } from "./pricing";

describe("season rates", () => {
  it("high season is $20/day, low season is $18/day", () => {
    expect(DEFAULT_SEASON_RATES.high.daily).toBe(20);
    expect(DEFAULT_SEASON_RATES.low.daily).toBe(18);
  });

  it("keeps the current high-season price list unchanged", () => {
    expect(DEFAULT_SEASON_RATES.high).toEqual({
      daily: 20,
      weekly: 120,
      monthly: 450,
    });
  });

  it("low season discounts are proportional to high season", () => {
    expect(DEFAULT_SEASON_RATES.low).toEqual({
      daily: 18,
      weekly: 108,
      monthly: 405,
    });
  });

  it("both seasons give the same percentage discount", () => {
    const pct = (r: { daily: number; weekly: number; monthly: number }) => ({
      week: 1 - r.weekly / 7 / r.daily,
      month: 1 - r.monthly / 30 / r.daily,
    });
    const high = pct(DEFAULT_SEASON_RATES.high);
    const low = pct(DEFAULT_SEASON_RATES.low);
    expect(low.week).toBeCloseTo(high.week, 6);
    expect(low.month).toBeCloseTo(high.month, 6);
    expect(high.week).toBeCloseTo(1 / 7, 6); // a week bills as 6 days
    expect(high.month).toBeCloseTo(0.25, 6); // a month bills as 22.5 days
  });

  it("ratesForDaily derives whole-dollar weekly/monthly rates", () => {
    expect(ratesForDaily(25)).toEqual({ daily: 25, weekly: 150, monthly: 563 });
    expect(ratesForDaily(18)).toEqual(DEFAULT_SEASON_RATES.low);
  });

  it("defaults to high season", () => {
    expect(DEFAULT_SEASON).toBe("high");
    expect(SEASONS).toEqual(["high", "low"]);
  });
});

describe("pricing stays sane in both seasons", () => {
  for (const season of SEASONS) {
    const rates = DEFAULT_SEASON_RATES[season];

    it(`${season}: longer rentals never cost less`, () => {
      let prev = 0;
      for (let n = 1; n <= 90; n++) {
        const total = computeTotal(n, rates);
        expect(total).toBeGreaterThanOrEqual(prev);
        prev = total;
      }
    });

    it(`${season}: longer rentals never cost more per day`, () => {
      expect(perDay(7, rates)).toBeLessThan(perDay(1, rates));
      expect(perDay(30, rates)).toBeLessThan(perDay(7, rates));
    });
  }

  it("low season is cheaper than high season at every length", () => {
    for (const n of [1, 3, 7, 11, 14, 30, 45, 60]) {
      expect(computeTotal(n, DEFAULT_SEASON_RATES.low)).toBeLessThan(
        computeTotal(n, DEFAULT_SEASON_RATES.high)
      );
    }
  });

  it("low season headline prices", () => {
    const low = DEFAULT_SEASON_RATES.low;
    expect(computeTotal(1, low)).toBe(18);
    expect(computeTotal(7, low)).toBe(108);
    expect(computeTotal(14, low)).toBe(216);
    expect(computeTotal(30, low)).toBe(405);
  });
});
