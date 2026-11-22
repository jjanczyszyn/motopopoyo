import React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  ConfirmButton, EmptyState, RecordCard, StatCard, btnGhost, btnPrimary, fmtDay, fmtUSD, inputStyle, monthBoundsISO,
  monthLabelLong, tableStyle, tableWrap, tdStyle, thStyle, useIsMobile,
} from "./shared";
import { downloadCsv } from "./csv";

interface Props {
  adminToken: string;
  year: number;
  monthIdx0: number;
  setYear: (y: number) => void;
  setMonth: (m: number) => void;
}

const right: React.CSSProperties = { textAlign: "right" };

// Services sold on commission, logged on /new → "Servicio".
export function Services({ adminToken, year, monthIdx0, setYear, setMonth }: Props) {
  const { start, end } = monthBoundsISO(year, monthIdx0);
  const data = useQuery(api.services.list, { adminToken, fromISO: start, toISO: end });
  const del = useMutation(api.services.adminDelete);
  const mobile = useIsMobile();
  const rows = data?.rows ?? [];
  const t = data?.totals;

  const csv = () => downloadCsv(`services-${start.slice(0, 7)}.csv`, [
    ["Date", "Service", "Client", "Charged", "Cost", "Commission", "Added by"],
    ...rows.map((r) => [r.date, r.serviceName, r.clientName, r.priceUSD, r.costUSD, r.commissionUSD, r.addedBy]),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {!mobile && <h2 style={{ margin: 0, fontSize: 22 }}>Services</h2>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <select aria-label="Month" value={monthIdx0} onChange={(e) => setMonth(parseInt(e.target.value))} style={inputStyle}>
            {monthLabelLong.map((m, i) => (<option key={m} value={i}>{m}</option>))}
          </select>
          <select aria-label="Year" value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={inputStyle}>
            {[year - 1, year, year + 1].map((y) => (<option key={y} value={y}>{y}</option>))}
          </select>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 12 }}>
        <StatCard label="Commission" value={t ? fmtUSD(t.commissionUSD) : "…"}
          sub={data ? `${fmtUSD(data.allTime.commissionUSD)} all time` : "Loading…"} />
        <StatCard label="Services" value={t?.count ?? "…"} sub={data ? `${data.allTime.count} all time` : ""} />
        <StatCard label="Charged" value={t ? fmtUSD(t.priceUSD) : "…"} />
        <StatCard label="Cost" value={t ? fmtUSD(t.costUSD) : "…"} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--muted)", flex: "1 1 240px" }}>
          Commission = charged − cost. Not included in moto revenue or the partner settlement.
        </div>
        <div style={{ display: "flex", gap: 8, flex: mobile ? "1 1 100%" : "0 0 auto" }}>
          <a href="/new#servicio" style={{
            ...btnPrimary, textDecoration: "none", flex: 1, minHeight: 44, boxSizing: "border-box",
            display: "flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap",
          }}>+ Add service</a>
          <button style={{ ...btnGhost, flex: 1, whiteSpace: "nowrap" }} onClick={csv} disabled={rows.length === 0}>Export CSV</button>
        </div>
      </div>

      {data && rows.length === 0 ? (
        <EmptyState message={`No services in ${monthLabelLong[monthIdx0]} ${year}.`} />
      ) : mobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => (
            <RecordCard key={r._id} title={r.serviceName}
              subtitle={[fmtDay(r.date), r.clientName, `by ${r.addedBy}`].filter(Boolean).join(" · ")}
              fields={[
                { label: "Charged", value: fmtUSD(r.priceUSD) },
                { label: "Cost", value: fmtUSD(r.costUSD) },
                { label: "Commission", value: <strong>{fmtUSD(r.commissionUSD)}</strong> },
              ]}
              actions={<ConfirmButton label="Delete" confirmLabel="Sure?" onConfirm={() => del({ adminToken, id: r._id })} />}
            />
          ))}
        </div>
      ) : (
        <div style={tableWrap}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Service</th>
                <th style={thStyle}>Client</th>
                <th style={{ ...thStyle, ...right }}>Charged</th>
                <th style={{ ...thStyle, ...right }}>Cost</th>
                <th style={{ ...thStyle, ...right }}>Commission</th>
                <th style={thStyle}>Added by</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td style={tdStyle}>{fmtDay(r.date)}</td>
                  <td style={tdStyle}>{r.serviceName}</td>
                  <td style={tdStyle}>{r.clientName ?? "—"}</td>
                  <td style={{ ...tdStyle, ...right }}>{fmtUSD(r.priceUSD)}</td>
                  <td style={{ ...tdStyle, ...right }}>{fmtUSD(r.costUSD)}</td>
                  <td style={{ ...tdStyle, ...right, fontWeight: 700 }}>{fmtUSD(r.commissionUSD)}</td>
                  <td style={tdStyle}>{r.addedBy}</td>
                  <td style={tdStyle}>
                    <ConfirmButton label="Delete" confirmLabel="Sure?" onConfirm={() => del({ adminToken, id: r._id })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
