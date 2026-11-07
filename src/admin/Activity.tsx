import React from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { cardStyle, btnGhost, EmptyState } from "./shared";

// What people do on the site and admin, and what breaks. Fed by
// convex/events.ts; times are shown in Nicaragua time.

const STEP_LABEL: Record<string, string> = {
  home: "Opened site", calendar: "Picked dates", bike: "Chose bike", ocr: "ID scan",
  phone: "Phone", pay: "Payment method", contract: "Contract", delivery: "Delivery",
  done: "Booked",
};

function fmtWhen(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/Managua", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

type Filter = "all" | "errors" | "site" | "admin";

export function Activity({ adminToken }: { adminToken: string }) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const summary = useQuery(api.events.summary, { adminToken, days: 30 });
  const events = useQuery(api.events.list, {
    adminToken,
    onlyErrors: filter === "errors" ? true : undefined,
    area: filter === "site" || filter === "admin" ? filter : undefined,
    limit: 200,
  });

  const top = summary?.funnel[0]?.sessions ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <Stat label="Site visitors (30 days)" value={summary?.sessions} />
        <Stat label="Bookings completed" value={summary?.funnel.find((f) => f.step === "done")?.sessions} />
        <Stat label="Errors (30 days)" value={summary?.errors} warn={(summary?.errors ?? 0) > 0} />
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Booking funnel (30 days)</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
          Visitors who reached each step. A big drop shows where renters give up.
        </div>
        {summary?.funnel.map((f) => (
          <div key={f.step} style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
            <div style={{ width: 120, fontSize: 13, flexShrink: 0 }}>{STEP_LABEL[f.step] ?? f.step}</div>
            <div style={{ flex: 1, background: "var(--line-2)", borderRadius: 4, height: 18, overflow: "hidden" }}>
              <div style={{
                width: `${top ? (f.sessions / top) * 100 : 0}%`, height: "100%",
                background: f.step === "done" ? "var(--ok)" : "var(--ink-2)",
              }} />
            </div>
            <div style={{ width: 36, textAlign: "right", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{f.sessions}</div>
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {(["all", "errors", "site", "admin"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              ...btnGhost,
              background: filter === f ? "var(--ink)" : undefined,
              color: filter === f ? "#fff" : undefined,
            }}>
              {f === "all" ? "Everything" : f === "errors" ? "Errors" : f === "site" ? "Renter site" : "Admin"}
            </button>
          ))}
        </div>
        {events && events.length === 0 && <EmptyState message="Nothing logged yet." />}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {(events ?? []).map((e) => (
            <div key={e._id} style={{
              padding: "8px 0", borderTop: "1px solid var(--line-2)", fontSize: 13,
              color: e.kind === "error" ? "#b91c1c" : undefined,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>{e.name}</strong>
                <span style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>{fmtWhen(e.at)}</span>
              </div>
              {e.detail && <div style={{ wordBreak: "break-word" }}>{e.detail}</div>}
              <div style={{ color: "var(--muted)", fontSize: 11 }}>
                {e.area} · {e.device ?? "?"}{e.user ? ` · ${e.user}` : ""}
                {e.bookingCode ? ` · ${e.bookingCode}` : ""} · session {e.sessionId.slice(0, 6)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | undefined; warn?: boolean }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: warn ? "#b91c1c" : undefined }}>
        {value ?? "…"}
      </div>
    </div>
  );
}
