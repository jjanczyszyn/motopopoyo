import { describe, it, expect } from "vitest";
import { buildReport, renderReportEmail, ReportInput, localDateISO } from "./report";
import type { PaymentLike } from "./settlement";

const TZ = "America/Managua"; // UTC-6, no DST

function pay(receivedAt: number, amount: number, collectedBy: "JJ" | "Karen", reservationId: string): PaymentLike {
  return { amount, paymentType: "full_payment", status: "received", collectedBy, receivedAt, method: "cash", reservationId };
}

// "now" = 2026-06-16 03:00 UTC = 2026-06-15 21:00 in Managua (the cron time).
const NOW = Date.UTC(2026, 5, 16, 3, 0, 0);

const input: ReportInput = {
  nowMs: NOW,
  timezone: TZ,
  currency: "USD",
  businessName: "Popoyo Moto",
  fallbackJjPct: 70,
  fallbackKarenPct: 30,
  bikeNames: { bike1: "Yamaha XTZ Blue" },
  transfers: [],
  payments: [
    pay(Date.UTC(2026, 5, 15, 18), 100, "JJ", "A"),    // today (local 06-15)
    pay(Date.UTC(2026, 5, 12, 18), 200, "Karen", "B"), // 06-12 → week + month
    pay(Date.UTC(2026, 5, 2, 18), 50, "JJ", "C"),      // 06-02 → month only
    pay(Date.UTC(2026, 4, 20, 18), 80, "Karen", "D"),  // 05-20 → prior month
  ],
  reservations: [
    { _id: "A", code: "A1", status: "active", bikeId: "bike1", startDate: "2026-06-14", endDate: "2026-06-17", days: 3, totalUSD: 100, docFirstName: "Ada", docLastName: "Lovelace" },
    { _id: "B", code: "B1", status: "returned", bikeId: "bike1", startDate: "2026-06-11", endDate: "2026-06-13", days: 2, totalUSD: 200, docFirstName: "Bo", docLastName: "Diaz" },
    { _id: "C", code: "C1", status: "returned", bikeId: "bike1", startDate: "2026-06-02", endDate: "2026-06-03", days: 1, totalUSD: 50, docFirstName: "Cy", docLastName: "Roe" },
    { _id: "D", code: "D1", status: "returned", bikeId: "bike1", startDate: "2026-05-19", endDate: "2026-05-21", days: 2, totalUSD: 80, docFirstName: "Di", docLastName: "Ng" },
  ],
};

describe("buildReport", () => {
  const r = buildReport(input);

  it("uses the business timezone for 'today' (UTC 16th → Managua 15th)", () => {
    expect(localDateISO(NOW, TZ)).toBe("2026-06-15");
    expect(r.dateISO).toBe("2026-06-15");
  });

  it("today: only the 06-15 payment", () => {
    expect(r.day.revenue).toBe(100);
    expect(r.day.jjShare).toBe(70);
    expect(r.day.karenShare).toBe(30);
    expect(r.day.jjCollected).toBe(100);
    expect(r.day.rentalCount).toBe(1);
  });

  it("last 7 days: 06-15 + 06-12", () => {
    expect(r.week.revenue).toBe(300);
    expect(r.week.jjShare).toBe(210);
    expect(r.week.rentalCount).toBe(2);
  });

  it("month to date: 06-15 + 06-12 + 06-02 (not May)", () => {
    expect(r.month.revenue).toBe(350);
    expect(r.month.jjShare).toBe(245);
    expect(r.month.rentalCount).toBe(3);
  });

  it("pending balance nets ALL received payments (incl. May): 70% of 430 − JJ collected 150 = 151", () => {
    expect(r.pendingBalance).toBeCloseTo(151, 2);
    expect(r.pendingBalanceLabel).toBe("Karen owes JJ $151.00");
  });

  it("lists rentals active today", () => {
    expect(r.todaysRentals).toHaveLength(1);
    expect(r.todaysRentals[0]).toMatchObject({ code: "A1", customer: "Ada Lovelace", bike: "Yamaha XTZ Blue" });
  });
});

describe("renderReportEmail", () => {
  const { subject, text, html } = renderReportEmail(buildReport(input));
  it("subject has date + today's revenue", () => {
    expect(subject).toContain("2026-06-15");
    expect(subject).toContain("$100.00");
  });
  it("body carries the pending balance and a rental", () => {
    expect(text).toContain("Karen owes JJ $151.00");
    expect(html).toContain("Karen owes JJ $151.00");
    expect(html).toContain("Ada Lovelace");
  });
});
