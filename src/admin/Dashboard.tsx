import React from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  StatCard, fmtUSD0, fmtPct, fmtUSD, monthBoundsISO, monthLabelLong,
  cardStyle,
} from "./shared";

interface Props {
  adminToken: string;
  year: number;
  monthIdx0: number;
  setYear: (y: number) => void;
  setMonth: (m: number) => void;
}

export function Dashboard({ adminToken, year, monthIdx0, setYear, setMonth }: Props) {
  const { start, end } = monthBoundsISO(year, monthIdx0);
  const ym = `${start.slice(0, 7)}`;

  const dash = useQuery(api.metrics.dashboard, { adminToken, fromISO: start, toISO: end });
  const settle = useQuery(api.settlement.summary, { adminToken, settlementMonth: ym });
  const monthly = useQuery(api.metrics.monthlySeries, { adminToken, year });

  const trailing = monthly
    ? monthly.slice(Math.max(0, monthIdx0 - 5), monthIdx0 + 1)
    : [];
  const trailingTotal = trailing.reduce((s, m) => s + m.revenue, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Period</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{monthLabelLong[monthIdx0]} {year}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <select value={monthIdx0} onChange={(e) => setMonth(parseInt(e.target.value))}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13 }}>
            {monthLabelLong.map((m, i) => (<option key={m} value={i}>{m}</option>))}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13 }}>
            {[year - 1, year, year + 1].map((y) => (<option key={y} value={y}>{y}</option>))}
          </select>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12 }}>
        <StatCard label="Revenue" value={fmtUSD0(dash?.revenue ?? 0)}
          sub={dash ? `${fmtUSD(trailingTotal)} trailing 6 mo` : "Loading…"} />
        <StatCard label="Rentals" value={dash?.rentalCount ?? 0}
          sub={dash ? `${dash.rentalDaysSold} rental days sold` : "Loading…"} />
        <StatCard label="Occupancy" value={fmtPct(dash?.occupancy ?? 0)}
          sub={dash ? `${dash.availableBikeDays} bike-days available` : "Loading…"} />
        <StatCard label="Average daily rate" value={fmtUSD(dash?.avgDailyRate ?? null)}
          sub={dash?.rentalDaysSold ? `${dash.rentalDaysSold} days @ avg` : "No rentals"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Top motorcycle</div>
          {dash?.topBike ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{dash.topBike.name}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{fmtUSD0(dash.topBike.revenue)} revenue this period</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>No revenue yet.</div>
          )}
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Top payment method</div>
          {dash?.topMethod ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6, textTransform: "capitalize" }}>{dash.topMethod.method}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{fmtUSD0(dash.topMethod.amount)} received</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>No payments yet.</div>
          )}
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Partner settlement</div>
          {settle ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{settle.label}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                Expected JJ {fmtUSD(settle.jjExpected)} · collected {fmtUSD(settle.jjCollected)}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}
