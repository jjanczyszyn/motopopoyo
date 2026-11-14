import { describe, expect, it } from "vitest";
import { autoPaymentFor, isElectronic } from "./autoPay";

const now = Date.parse("2026-11-14T15:00:00Z");

describe("autoPaymentFor", () => {
  it("dates cash to the hand-off and collects it with Karen", () => {
    const p = autoPaymentFor({ payMethod: "cash", startDate: "2026-11-20", totalUSD: 54 }, "Karen", now);
    expect(p).toEqual({ amount: 54, collectedBy: "Karen", receivedAt: Date.parse("2026-11-20T12:00:00Z"), verification: undefined });
  });
  it("dates electronic money to now and leaves it unverified", () => {
    const p = autoPaymentFor({ payMethod: "paypal", startDate: "2026-11-20", totalUSD: 120 }, "JJ", now);
    expect(p.receivedAt).toBe(now);
    expect(p.collectedBy).toBe("JJ");
    expect(p.verification).toBe("unverified");
  });
  it("falls back to JJ when nobody is the standing collector", () => {
    expect(autoPaymentFor({ payMethod: "zelle", startDate: "2026-11-20", totalUSD: 1 }, "manual", now).collectedBy).toBe("JJ");
  });
  it("treats every method but cash as electronic", () => {
    expect(isElectronic("cash")).toBe(false);
    for (const m of ["venmo", "zelle", "paypal", "wise", "revolut", "card", "applepay"]) expect(isElectronic(m)).toBe(true);
  });
});
