import React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  StatusPill, btnPrimary, btnGhost, inputStyle, labelStyle,
  cardStyle, fmtUSD, isoToday,
} from "./shared";

interface Props { adminToken: string; }

const STATUSES = ["active", "inactive", "maintenance", "sold"] as const;

export function Motorcycles({ adminToken }: Props) {
  const bikes = useQuery(api.bikes.listAll, { adminToken }) ?? [];
  const cfg = useQuery(api.config.get);
  const setStatus = useMutation(api.bikes.setStatus);
  const updateBike = useMutation(api.bikes.updateBike);
  const setRange = useMutation(api.availability.setRange);
  const clearDay = useMutation(api.availability.clearDay);
  const availability = useQuery(api.availability.list, { adminToken });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 22 }}>Motorcycles</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12 }}>
        {bikes.map((b) => {
          const bikeAvail = (availability ?? []).filter((a) => a.bikeId === b._id);
          const status = b.status ?? (b.isActive ? "active" : "inactive");
          return (
            <div key={b._id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{b.name} <span style={{ color: "var(--muted)" }}>· {b.color}</span></div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{b.plate} · {b.range}</div>
                </div>
                <StatusPill status={status} />
              </div>
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label>
                  <span style={labelStyle}>Status</span>
                  <select
                    value={status}
                    onChange={(e) => setStatus({ adminToken, bikeId: b._id, status: e.target.value as any })}
                    style={inputStyle}
                  >
                    {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </label>
                <label>
                  <span style={labelStyle}>Daily rate</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder={String(cfg?.dailyRate ?? 20)}
                    defaultValue={b.dailyRate ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value === "" ? undefined : parseFloat(e.target.value);
                      updateBike({ adminToken, bikeId: b._id, dailyRate: v });
                    }}
                    style={inputStyle}
                  />
                </label>
              </div>
              <div style={{ marginTop: 10 }}>
                <label>
                  <span style={labelStyle}>Notes</span>
                  <input
                    defaultValue={b.notes ?? ""}
                    onBlur={(e) => updateBike({ adminToken, bikeId: b._id, notes: e.target.value })}
                    style={{ ...inputStyle, width: "100%" }}
                  />
                </label>
              </div>
              <MaintenanceBlock bikeId={b._id} adminToken={adminToken}
                onAdd={(from, to, status, notes) =>
                  setRange({ adminToken, bikeId: b._id, fromISO: from, toISO: to, status, notes })
                }
                rows={bikeAvail}
                onClear={(id) => clearDay({ adminToken, id })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MaintenanceBlock({
  bikeId, adminToken, onAdd, rows, onClear,
}: {
  bikeId: Id<"bikes">;
  adminToken: string;
  onAdd: (from: string, to: string, status: "maintenance" | "blocked", notes?: string) => void | Promise<unknown>;
  rows: { _id: Id<"motorcycleAvailability">; date: string; status: string; notes?: string }[];
  onClear: (id: Id<"motorcycleAvailability">) => void;
}) {
  const [from, setFrom] = React.useState(isoToday());
  const [to, setTo] = React.useState(isoToday());
  const [status, setStatus] = React.useState<"maintenance" | "blocked">("maintenance");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // Group consecutive same-status days for compact display.
  const grouped = React.useMemo(() => {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const out: { from: string; to: string; status: string; ids: Id<"motorcycleAvailability">[] }[] = [];
    for (const r of sorted) {
      const last = out[out.length - 1];
      if (last && last.status === r.status && nextDay(last.to) === r.date) {
        last.to = r.date;
        last.ids.push(r._id);
      } else {
        out.push({ from: r.date, to: r.date, status: r.status, ids: [r._id] });
      }
    }
    return out;
  }, [rows]);

  const submit = async () => {
    setBusy(true);
    try {
      const next = nextDay(to); // user enters inclusive end; mutation expects exclusive
      await onAdd(from, next, status, notes || undefined);
      setNotes("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line-2)" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Maintenance / blocked days</div>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 110px), 1fr))", gap: 6 }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={inputStyle}>
          <option value="maintenance">maintenance</option>
          <option value="blocked">blocked</option>
        </select>
        <input placeholder="notes" value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} />
        <button style={{ ...btnPrimary, gridColumn: "1 / -1" }} onClick={submit} disabled={busy}>Add</button>
      </div>
      {grouped.length > 0 && (
        <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", fontSize: 12 }}>
          {grouped.map((g) => (
            <li key={g.from + g.status} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "var(--ink-2)" }}>
              <span>
                <strong style={{ textTransform: "capitalize" }}>{g.status}</strong> · {g.from}
                {g.from !== g.to ? ` → ${g.to}` : ""}
              </span>
              <button style={{ ...btnGhost, padding: "2px 8px", fontSize: 11 }}
                onClick={() => g.ids.forEach((id) => onClear(id))}>
                Clear
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function nextDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
