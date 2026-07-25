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

type Summary = {
  totalRevenue: number;
  jjExpected: number;
  karenExpected: number;
  jjCollected: number;
  karenCollected: number;
  jjFinalBalance: number;
  label: string;
};

// Everything since day one, above the fold: what the business has taken, what
// each partner has earned of it, and who currently owes whom. The period cards
// below answer "how are we doing this month" — this answers "how are we doing".
function AllTimeCard({ summary }: { summary: Summary | undefined }) {
  const settled = summary ? Math.abs(summary.jjFinalBalance) < 0.01 : false;
  // Positive = Karen owes JJ, negative = JJ owes Karen (see lib/settlement).
  const owed = summary ? Math.abs(summary.jjFinalBalance) : 0;
  const creditor = summary && summary.jjFinalBalance > 0 ? "JJ" : "Karen";
  const debtor = creditor === "JJ" ? "Karen" : "JJ";

  return (
    <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: 16, borderBottom: "1px solid var(--line-2)" }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
          All-time revenue
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4, letterSpacing: -0.5 }}>
          {summary ? fmtUSD0(summary.totalRevenue) : "…"}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Every payment received, since the first rental
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <PartnerEarnings
          name="JJ"
          earned={summary?.jjExpected}
          collected={summary?.jjCollected}
          total={summary?.totalRevenue}
        />
        <PartnerEarnings
          name="Karen"
          earned={summary?.karenExpected}
          collected={summary?.karenCollected}
          total={summary?.totalRevenue}
          borderLeft
        />
      </div>

      <button
        // The tab bar reads the hash, so this is a real in-app link.
        onClick={() => { window.location.hash = "settlement"; }}
        aria-label="Go to partner settlement"
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 10, width: "100%", textAlign: "left",
          padding: 16, border: "none", borderTop: "1px solid var(--line-2)",
          background: settled ? "#f0fdf4" : "#fff7ed",
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
            Balance between partners
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4 }}>
            {!summary ? "…" : settled ? "All settled up" : `${debtor} owes ${creditor} ${fmtUSD(owed)}`}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            {summary && !settled
              ? `${debtor} has collected more than their share so far`
              : "Nothing outstanding between JJ and Karen"}
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap" }}>
          Settle →
        </span>
      </button>
    </div>
  );
}

// "Earned" is the partner's share of revenue; "collected" is the cash that
// physically passed through their hands. The gap between them is the balance.
function PartnerEarnings({
  name, earned, collected, total, borderLeft,
}: {
  name: string;
  earned: number | undefined;
  collected: number | undefined;
  total: number | undefined;
  borderLeft?: boolean;
}) {
  // Derived from the actual figures rather than the config setting, so a
  // booking saved under an older split still reads correctly.
  const sharePct =
    earned !== undefined && total ? Math.round((earned / total) * 100) : null;

  return (
    <div style={{
      padding: 16,
      borderLeft: borderLeft ? "1px solid var(--line-2)" : undefined,
    }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
        {name} earned{sharePct !== null ? ` · ${sharePct}%` : ""}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
        {earned === undefined ? "…" : fmtUSD0(earned)}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
        {collected === undefined ? "" : `Collected ${fmtUSD(collected)}`}
      </div>
    </div>
  );
}

export function Dashboard({ adminToken, year, monthIdx0, setYear, setMonth }: Props) {
  const { start, end } = monthBoundsISO(year, monthIdx0);
  const ym = `${start.slice(0, 7)}`;

  const dash = useQuery(api.metrics.dashboard, { adminToken, fromISO: start, toISO: end });
  const settle = useQuery(api.settlement.summary, { adminToken, settlementMonth: ym });
  const monthly = useQuery(api.metrics.monthlySeries, { adminToken, year });
  // No settlementMonth = every payment ever received.
  const allTime = useQuery(api.settlement.summary, { adminToken });

  const trailing = monthly
    ? monthly.slice(Math.max(0, monthIdx0 - 5), monthIdx0 + 1)
    : [];
  const trailingTotal = trailing.reduce((s, m) => s + m.revenue, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <AllTimeCard summary={allTime} />

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
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
            Partner settlement · {monthLabelLong[monthIdx0]}
          </div>
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
