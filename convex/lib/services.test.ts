import { describe, expect, it } from "vitest";
import {
  canEditService, cleanText, commissionUSD, recentNames, roundUSD, serviceProblem, serviceTotals,
} from "./services";

const today = "2026-11-22";
const ok = { serviceName: "Masaje", date: today, priceUSD: 60, costUSD: 40 };

describe("commissionUSD", () => {
  it("is the price minus the cost", () => {
    expect(commissionUSD(60, 40)).toBe(20);
    expect(commissionUSD(35, 35)).toBe(0);
  });
  it("is exact to the cent", () => {
    expect(commissionUSD(45.1, 30.05)).toBe(15.05);
    expect(commissionUSD(0.3, 0.1)).toBe(0.2);
    expect(roundUSD(19.999)).toBe(20);
  });
});

describe("serviceProblem", () => {
  it("accepts today, a past day, a free cost and a zero commission", () => {
    expect(serviceProblem(ok, today)).toBeNull();
    expect(serviceProblem({ ...ok, date: "2026-10-01" }, today)).toBeNull();
    expect(serviceProblem({ ...ok, costUSD: 0 }, today)).toBeNull();
    expect(serviceProblem({ ...ok, costUSD: 60 }, today)).toBeNull();
  });
  it("needs a name and a real, non-future date", () => {
    expect(serviceProblem({ ...ok, serviceName: "   " }, today)).toMatch(/SERVICE_NAME/);
    expect(serviceProblem({ ...ok, date: "22/11/2026" }, today)).toMatch(/SERVICE_DATE/);
    expect(serviceProblem({ ...ok, date: "2026-11-23" }, today)).toMatch(/SERVICE_FUTURE/);
  });
  it("needs sensible amounts", () => {
    for (const priceUSD of [0, -5, NaN, Infinity, 10001, 0.001]) {
      expect(serviceProblem({ ...ok, priceUSD, costUSD: 0 }, today)).toMatch(/SERVICE_PRICE/);
    }
    for (const costUSD of [-1, NaN, Infinity]) {
      expect(serviceProblem({ ...ok, costUSD }, today)).toMatch(/SERVICE_COST:/);
    }
  });
  it("refuses a cost above the price", () => {
    expect(serviceProblem({ ...ok, priceUSD: 40, costUSD: 60 }, today)).toMatch(/COST_OVER_PRICE/);
  });
});

describe("canEditService", () => {
  const now = Date.parse("2026-11-22T12:00:00Z");
  const hour = 3600 * 1000;
  const mine = { addedBy: "Karen" as const, createdAt: now - 2 * hour };
  it("lets the author change it for 24 hours", () => {
    expect(canEditService(mine, "Karen", now)).toBe(true);
    expect(canEditService({ ...mine, createdAt: now - 24 * hour }, "Karen", now)).toBe(false);
  });
  it("refuses the other partner and deleted rows", () => {
    expect(canEditService(mine, "JJ", now)).toBe(false);
    expect(canEditService({ ...mine, deletedAt: now }, "Karen", now)).toBe(false);
  });
});

describe("serviceTotals", () => {
  it("adds up everything except deleted rows", () => {
    expect(serviceTotals([
      { priceUSD: 60, costUSD: 40 },
      { priceUSD: 35.1, costUSD: 20.05 },
      { priceUSD: 999, costUSD: 1, deletedAt: 5 },
    ])).toEqual({ count: 2, priceUSD: 95.1, costUSD: 60.05, commissionUSD: 35.05 });
  });
  it("is zero with no rows", () => {
    expect(serviceTotals([])).toEqual({ count: 0, priceUSD: 0, costUSD: 0, commissionUSD: 0 });
  });
});

describe("recentNames", () => {
  it("lists newest first, once each whatever the casing, skipping deleted", () => {
    expect(recentNames([
      { serviceName: "Masaje", createdAt: 1 },
      { serviceName: "Pedicure", createdAt: 2 },
      { serviceName: "masaje", createdAt: 3 },
      { serviceName: "Error", createdAt: 4, deletedAt: 5 },
    ], 6)).toEqual(["masaje", "Pedicure"]);
  });
  it("stops at the limit", () => {
    const rows = [1, 2, 3].map((n) => ({ serviceName: `S${n}`, createdAt: n }));
    expect(recentNames(rows, 2)).toEqual(["S3", "S2"]);
  });
});

describe("cleanText", () => {
  it("trims, collapses spaces and caps the length", () => {
    expect(cleanText("  Masaje   en  pareja ", 60)).toBe("Masaje en pareja");
    expect(cleanText("abcdef", 3)).toBe("abc");
    expect(cleanText(undefined, 3)).toBe("");
  });
});
