import React from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  cardStyle, fmtPct, fmtUSD0, monthLabels, monthLabelLong,
  tableWrap, tableStyle, thStyle, tdStyle,
} from "./shared";

interface Props { adminToken: string; year: number; setYear: (y: number) => void; }

export function Seasonality({ adminToken, year, setYear }: Props) {
  const heat = useQuery(api.metrics.seasonalityHeatmap, { adminToken, year });
  const monthly = useQuery(api.metrics.monthlySeries, { adminToken, year });

  const sortedMonths = React.useMemo(
    () => (monthly ?? []).slice().sort((a, b) => b.revenue - a.revenue),
    [monthly]
  );
  const bestMonths = sortedMonths.slice(0, 3);
  const worstMonths = sortedMonths.slice().reverse().slice(0, 3);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Seasonality</h2>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, marginLeft: "auto" }}>
          {[year - 2, year - 1, year, year + 1].map((y) => (<option key={y} value={y}>{y}</option>))}
        </select>
      </header>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Monthly demand heatmap</div>
        <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px", WebkitOverflowScrolling: "touch" }}>
          <table style={{ ...tableStyle, minWidth: 640 }}>
            <thead>
              <tr>
                <th style={thStyle}>Motorcycle</th>
                {monthLabels.map((m) => (
                  <th key={m} style={{ ...thStyle, textAlign: "center" }}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(heat ?? []).map((row) => (
                <tr key={row.bikeId}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{row.name}</td>
                  {row.months.map((c) => (
                    <td
                      key={c.month}
                      title={`${c.rentalDays}/${c.availableDays} days`}
                      style={{
                        ...tdStyle,
                        textAlign: "center",
                        background: heatColor(c.occupancy),
                        color: c.occupancy > 0.6 ? "#fff" : "var(--ink)",
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      {c.availableDays > 0 ? fmtPct(c.occupancy) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
        <div style={tableWrap}>
          <div style={{ padding: "10px 12px", background: "#fafafa", borderBottom: "1px solid var(--line)", fontWeight: 600, fontSize: 13 }}>Best months</div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Rank</th>
                <th style={thStyle}>Month</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Revenue</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Occupancy</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Days</th>
              </tr>
            </thead>
            <tbody>
              {bestMonths.map((m, i) => (
                <tr key={m.month}>
                  <td style={tdStyle}>{i + 1}</td>
                  <td style={tdStyle}>{monthLabelLong[m.month - 1]}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{fmtUSD0(m.revenue)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmtPct(m.occupancy)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{m.rentalDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={tableWrap}>
          <div style={{ padding: "10px 12px", background: "#fafafa", borderBottom: "1px solid var(--line)", fontWeight: 600, fontSize: 13 }}>Lowest demand</div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Rank</th>
                <th style={thStyle}>Month</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Revenue</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Occupancy</th>
                <th style={thStyle}>Suggested action</th>
              </tr>
            </thead>
            <tbody>
              {worstMonths.map((m, i) => (
                <tr key={m.month}>
                  <td style={tdStyle}>{i + 1}</td>
                  <td style={tdStyle}>{monthLabelLong[m.month - 1]}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{fmtUSD0(m.revenue)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmtPct(m.occupancy)}</td>
                  <td style={{ ...tdStyle, fontSize: 12, color: "var(--muted)" }}>{lowSeasonAction(i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {monthly && monthly.some((m) => m.revenue > 0) && (
        <Insights monthly={monthly} heat={heat ?? []} />
      )}
    </div>
  );
}

function Insights({ monthly, heat }: {
  monthly: { month: number; revenue: number; occupancy: number }[];
  heat: { name: string; months: { rentalDays: number }[] }[];
}) {
  const insights: string[] = [];
  const top = monthly.slice().sort((a, b) => b.revenue - a.revenue)[0];
  if (top && top.revenue > 0) {
    insights.push(
      `${monthLabelLong[top.month - 1]} is your strongest month — ${fmtPct(top.occupancy)} occupancy, ${fmtUSD0(top.revenue)} revenue.`
    );
  }
  const bottom = monthly.slice().sort((a, b) => a.revenue - b.revenue)[0];
  if (bottom && bottom.revenue >= 0 && bottom !== top) {
    insights.push(
      `${monthLabelLong[bottom.month - 1]} is your weakest month — ${fmtPct(bottom.occupancy)} occupancy, ${fmtUSD0(bottom.revenue)} revenue.`
    );
  }
  if (heat.length >= 2) {
    const totals = heat.map((h) => ({
      name: h.name,
      total: h.months.reduce((s, m) => s + m.rentalDays, 0),
    }));
    totals.sort((a, b) => b.total - a.total);
    const [hi, lo] = [totals[0], totals[totals.length - 1]];
    if (hi && lo && lo.total > 0 && hi.total > lo.total) {
      const ratio = (hi.total / lo.total).toFixed(1);
      insights.push(`${hi.name} is rented ${ratio}× more often than ${lo.name}.`);
    }
  }
  insights.push(
    "Low-demand months are the best time for maintenance, content creation, and partner outreach."
  );

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Insights</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
        {insights.map((s, i) => (<li key={i}>{s}</li>))}
      </ul>
    </div>
  );
}

function lowSeasonAction(i: number): string {
  return [
    "Offer longer rental discounts",
    "Schedule maintenance",
    "Partner with hotels and hostels",
  ][i] ?? "—";
}

function heatColor(frac: number): string {
  if (frac <= 0) return "#fafafa";
  // Interpolate between #f5f5f5 and a deep teal-ish colour.
  const t = Math.min(1, frac);
  const r = Math.round(245 - (245 - 17) * t);
  const g = Math.round(245 - (245 - 94) * t);
  const b = Math.round(245 - (245 - 89) * t);
  return `rgb(${r}, ${g}, ${b})`;
}
