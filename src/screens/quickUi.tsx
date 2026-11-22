import React from "react";

// Shared look of the /new page (rentals and services).

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nice(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-NI", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

export const page: React.CSSProperties = {
  height: "100%", overflowY: "auto", overflowX: "hidden", background: "#fafafa",
  WebkitOverflowScrolling: "touch",
};
export const wrap: React.CSSProperties = { maxWidth: 480, margin: "0 auto", padding: "16px 16px 120px" };
export const label: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase",
  letterSpacing: 0.6, margin: "22px 0 10px",
};
export const chip = (on: boolean): React.CSSProperties => ({
  minHeight: 48, minWidth: 48, padding: "0 16px", borderRadius: 999, fontSize: 16, fontWeight: 600,
  border: on ? "2px solid var(--ink)" : "1px solid var(--line)",
  background: on ? "var(--ink)" : "#fff", color: on ? "#fff" : "var(--ink)",
});
export const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", minHeight: 52, padding: "0 14px", fontSize: 17,
  borderRadius: 14, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)",
};
export const bigBtn: React.CSSProperties = {
  width: "100%", minHeight: 58, borderRadius: 16, border: "none", fontSize: 18, fontWeight: 700,
  background: "var(--accent)", color: "var(--accent-ink)",
};
export const linkBtn: React.CSSProperties = {
  border: "none", background: "none", padding: "0 4px", color: "var(--ink)", textDecoration: "underline", fontSize: 14,
};

export type QuickMode = "moto" | "service";

/** "Moto / Servicio" at the top of the page. */
export function ModeSwitch({ mode, setMode }: { mode: QuickMode; setMode: (m: QuickMode) => void }) {
  const item = (m: QuickMode, text: string) => (
    <button
      data-testid={`quick-mode-${m}`} aria-pressed={mode === m} onClick={() => setMode(m)}
      style={{
        flex: 1, minHeight: 50, borderRadius: 12, border: "none", fontSize: 17, fontWeight: 700,
        background: mode === m ? "#fff" : "transparent", color: "var(--ink)",
        boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,.15)" : "none",
      }}
    >{text}</button>
  );
  return (
    <div style={{ display: "flex", gap: 4, padding: 4, marginBottom: 16, borderRadius: 16, background: "#ececec" }}>
      {item("moto", "🛵 Moto")}
      {item("service", "💆 Servicio")}
    </div>
  );
}

/** Dollar amount field with a "$" in front. */
export function MoneyField({
  ariaLabel, value, onChange,
}: { ariaLabel: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 22, fontWeight: 700 }}>$</span>
      <input
        inputMode="decimal" aria-label={ariaLabel} value={value} autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        style={{ ...field, paddingLeft: 36, fontSize: 24, fontWeight: 700, minHeight: 60 }}
      />
    </div>
  );
}
