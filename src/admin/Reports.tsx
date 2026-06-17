import React from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  cardStyle, btnPrimary, monthBoundsISO, monthLabelLong,
  fmtPct, fmtUSD,
} from "./shared";
import { downloadCsv } from "./csv";

interface Props { adminToken: string; year: number; setYear: (y: number) => void; }

export function Reports({ adminToken, year, setYear }: Props) {
  const monthly = useQuery(api.metrics.monthlySeries, { adminToken, year });
  const performance = useQuery(api.metrics.motorcyclePerformance, {
    adminToken,
    fromISO: `${year}-01-01`,
    toISO: `${year + 1}-01-01`,
  });
  const paymentSummary = useQuery(api.metrics.paymentMethodSummary, {
    adminToken,
    fromISO: `${year}-01-01`,
    toISO: `${year + 1}-01-01`,
  });
  const settle = useQuery(api.settlement.summary, { adminToken });
  const sources = useQuery(api.metrics.sourcePerformance, {
    adminToken,
    fromISO: `${year}-01-01`,
    toISO: `${year + 1}-01-01`,
  });

  const monthlyCsv = () => {
    if (!monthly) return;
    downloadCsv(`monthly-performance-${year}.csv`, [
      ["Month", "Revenue", "Rentals", "Rental days", "Occupancy", "Avg daily rate"],
      ...monthly.map((m) => [
        monthLabelLong[m.month - 1],
        m.revenue,
        m.rentals,
        m.rentalDays,
        m.occupancy.toFixed(4),
        m.avgDailyRate ?? "",
      ]),
    ]);
  };

  const motorcycleCsv = () => {
    if (!performance) return;
    downloadCsv(`motorcycle-performance-${year}.csv`, [
      [
        "Motorcycle", "Status", "Revenue", "Rental days", "Bookings",
        "Maintenance days", "Blocked days", "Available days",
        "Occupancy", "Avg daily rate", "Revenue per available day",
      ],
      ...performance.map((p) => [
        p.name, p.status, p.revenue, p.rentalDays, p.bookings,
        p.maintenanceDays, p.blockedDays, p.availableDays,
        p.occupancy.toFixed(4),
        p.avgDailyRate ?? "",
        p.revenuePerAvailableDay ?? "",
      ]),
    ]);
  };

  const paymentCsv = () => {
    if (!paymentSummary) return;
    downloadCsv(`payment-methods-${year}.csv`, [
      ["Method", "Amount", "% of revenue", "JJ collected", "Karen collected", "Payments", "Default collector"],
      ...paymentSummary.rows.map((r) => [
        r.label, r.amount, r.percent.toFixed(4), r.jjAmount, r.karenAmount, r.count, r.defaultCollector ?? "",
      ]),
    ]);
  };

  const settlementCsv = () => {
    if (!settle) return;
    downloadCsv(`settlement-${year}.csv`, [
      ["Field", "Value"],
      ["Total revenue", settle.totalRevenue],
      ["JJ expected", settle.jjExpected],
      ["Karen expected", settle.karenExpected],
      ["JJ collected", settle.jjCollected],
      ["Karen collected", settle.karenCollected],
      ["JJ received transfers", settle.jjReceivedTransfers],
      ["JJ sent transfers", settle.jjSentTransfers],
      ["JJ final balance", settle.jjFinalBalance],
      ["Settlement", settle.label],
    ]);
  };

  const seasonalityCsv = () => {
    if (!monthly) return;
    downloadCsv(`seasonality-${year}.csv`, [
      ["Month", "Revenue", "Rentals", "Rental days", "Occupancy", "Available days"],
      ...monthly.map((m) => [
        monthLabelLong[m.month - 1],
        m.revenue, m.rentals, m.rentalDays, m.occupancy.toFixed(4), m.availableDays,
      ]),
    ]);
  };

  const sourceCsv = () => {
    if (!sources) return;
    downloadCsv(`booking-sources-${year}.csv`, [
      ["Source", "Bookings", "Revenue", "Rental days", "Avg booking value"],
      ...sources.map((s) => [s.source, s.bookings, s.revenue, s.rentalDays, s.avgBookingValue.toFixed(2)]),
    ]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Reports</h2>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, marginLeft: "auto" }}>
          {[year - 2, year - 1, year, year + 1].map((y) => (<option key={y} value={y}>{y}</option>))}
        </select>
      </header>

      <ReportCard title="Monthly performance"
        description="Revenue, rentals, rental days, occupancy and ADR per month."
        onExport={monthlyCsv} />
      <ReportCard title="Motorcycle performance"
        description="Per-bike revenue, days rented, bookings, occupancy, revenue per available day."
        onExport={motorcycleCsv} />
      <ReportCard title="Payment methods"
        description="Spend by method, JJ vs Karen collected totals and counts."
        onExport={paymentCsv} />
      <ReportCard title="Partner settlement"
        description="Year-to-date split, transfers and final balance."
        onExport={settlementCsv} />
      <ReportCard title="Seasonality"
        description="Monthly demand, occupancy and available days."
        onExport={seasonalityCsv} />
      <ReportCard title="Booking sources"
        description="Where bookings come from — counts, revenue, average booking value."
        onExport={sourceCsv} />
    </div>
  );
}

function ReportCard({
  title, description, onExport,
}: { title: string; description: string; onExport: () => void }) {
  return (
    <div style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{description}</div>
      </div>
      <button style={{ ...btnPrimary, flex: "0 0 auto" }} onClick={onExport}>Export CSV</button>
    </div>
  );
}
