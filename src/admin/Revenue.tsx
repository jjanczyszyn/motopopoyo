import React from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  BarChart, fmtPct, fmtUSD, fmtUSD0, tableWrap, tableStyle, thStyle, tdStyle,
  cardStyle, monthLabelLong,
} from "./shared";

interface Props { adminToken: string; year: number; setYear: (y: number) => void; }

export function Revenue({ adminToken, year, setYear }: Props) {
  const monthly = useQuery(api.metrics.monthlySeries, { adminToken, year });
  const performance = useQuery(api.metrics.motorcyclePerformance, {
    adminToken,
    fromISO: `${year}-01-01`,
    toISO: `${year + 1}-01-01`,
  });
  const ytdRevenue = (monthly ?? []).reduce((s, m) => s + m.revenue, 0);
  const ytdRentals = (monthly ?? []).reduce((s, m) => s + m.rentals, 0);
  const ytdRentalDays = (monthly ?? []).reduce((s, m) => s + m.rentalDays, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Revenue</h2>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, marginLeft: "auto" }}>
          {[year - 2, year - 1, year, year + 1].map((y) => (<option key={y} value={y}>{y}</option>))}
        </select>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>YTD revenue</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{fmtUSD0(ytdRevenue)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Rentals</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{ytdRentals}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Rental days</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{ytdRentalDays}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Avg daily rate</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{ytdRentalDays > 0 ? fmtUSD(ytdRevenue / ytdRentalDays) : "—"}</div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Monthly revenue</div>
        {monthly ? (
          <BarChart data={monthly.map((m) => ({ label: m.label, value: m.revenue }))} />
        ) : (
          <div style={{ color: "var(--muted)" }}>Loading…</div>
        )}
      </div>

      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Month</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Revenue</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Rentals</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Rental days</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Occupancy</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Avg daily rate</th>
            </tr>
          </thead>
          <tbody>
            {(monthly ?? []).map((m) => (
              <tr key={m.month}>
                <td style={tdStyle}>{monthLabelLong[m.month - 1]}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{fmtUSD(m.revenue)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{m.rentals}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{m.rentalDays}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmtPct(m.occupancy)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmtUSD(m.avgDailyRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Revenue by motorcycle ({year})</div>
        {performance ? (
          <BarChart data={performance.map((p) => ({ label: p.name.slice(0, 6), value: p.revenue }))} />
        ) : (
          <div style={{ color: "var(--muted)" }}>Loading…</div>
        )}
      </div>
    </div>
  );
}
