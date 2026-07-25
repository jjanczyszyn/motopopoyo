import React from "react";

export const fmtUSD = (n: number | null | undefined): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
};

export const fmtUSD0 = (n: number | null | undefined): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n))}`;
};

export const fmtPct = (frac: number | null | undefined): string => {
  if (frac === null || frac === undefined || Number.isNaN(frac)) return "—";
  return `${Math.round(frac * 100)}%`;
};

export const fmtDateShort = (iso: string | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const fmtDate = (iso: string | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const monthLabels = [
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
];

export const monthLabelLong = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// 'YYYY-MM-DD' day arithmetic without TZ drift.
export function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthBoundsISO(year: number, monthIdx0: number): {
  start: string;
  end: string;
} {
  const startY = year;
  const startM = monthIdx0 + 1;
  const endY = monthIdx0 === 11 ? year + 1 : year;
  const endM = monthIdx0 === 11 ? 1 : monthIdx0 + 2;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${startY}-${pad(startM)}-01`,
    end: `${endY}-${pad(endM)}-01`,
  };
}

export const PARTNERS = ["JJ", "Karen"] as const;
export type Partner = typeof PARTNERS[number];

export const SOURCE_OPTIONS = [
  "whatsapp",
  "website",
  "referral",
  "hotel_partner",
  "walk_in",
  "instagram",
  "facebook",
  "other",
] as const;

export const RESERVATION_STATUSES = [
  "pending", "confirmed", "active", "returned", "cancelled",
] as const;

export const PAYMENT_TYPES = [
  "deposit", "balance", "full_payment", "refund",
] as const;

export const PAYMENT_STATUSES = [
  "received", "pending", "failed", "cancelled", "refunded",
] as const;

// Visual primitives ----------------------------------------------------

export const cardStyle: React.CSSProperties = {
  padding: 16,
  border: "1px solid var(--line)",
  borderRadius: 14,
  background: "#fff",
};

export const tableWrap: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 12,
  overflowX: "auto",
  overflowY: "hidden",
  background: "#fff",
  WebkitOverflowScrolling: "touch",
};

// Mobile-first detection. Admin sections render card layouts under this
// breakpoint and tables above it.
export function useIsMobile(breakpoint = 760): boolean {
  const [mob, setMob] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
  });
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = (e: MediaQueryListEvent) => setMob(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return mob;
}

// Card row used inside the mobile views — one record per card with a
// header row of label/value pairs.
export const mobileCard: React.CSSProperties = {
  padding: 14,
  border: "1px solid var(--line)",
  borderRadius: 12,
  background: "#fff",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

export const mobileLabel: React.CSSProperties = {
  fontSize: 10,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  fontWeight: 600,
};

export const mobileValue: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  marginTop: 2,
};

export const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

export const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  background: "#fafafa",
  borderBottom: "1px solid var(--line)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "var(--muted)",
  fontWeight: 600,
};

export const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--line-2)",
  verticalAlign: "top",
};

export const btnPrimary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "none",
  background: "var(--ink)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

export const btnGhost: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "#fff",
  color: "var(--ink)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

export const btnDanger: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #fecaca",
  background: "#fff",
  color: "#b91c1c",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

export const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  fontSize: 13,
  outline: "none",
  background: "#fff",
  color: "var(--ink)",
};

export const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  fontWeight: 600,
  display: "block",
  marginBottom: 4,
};

// Pill -----------------------------------------------------------------

export function StatusPill({ status }: { status: string }) {
  const colors: Record<string, [string, string]> = {
    pending: ["#fef3c7", "#92400e"],
    confirmed: ["#d1fae5", "#065f46"],
    active: ["#dbeafe", "#1e3a8a"],
    returned: ["#f3f4f6", "#374151"],
    cancelled: ["#fee2e2", "#991b1b"],
    received: ["#d1fae5", "#065f46"],
    failed: ["#fee2e2", "#991b1b"],
    refunded: ["#fce7f3", "#9d174d"],
    paid: ["#d1fae5", "#065f46"],
    partial: ["#fef3c7", "#92400e"],
    unpaid: ["#fee2e2", "#991b1b"],
    overpaid: ["#e0e7ff", "#3730a3"],
    maintenance: ["#fde68a", "#92400e"],
    blocked: ["#fee2e2", "#991b1b"],
    inactive: ["#f3f4f6", "#374151"],
    sold: ["#f3f4f6", "#374151"],
  };
  const [bg, fg] = colors[status] ?? ["#f3f4f6", "#374151"];
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 999, background: bg, color: fg,
      fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
      whiteSpace: "nowrap",
    }}>{status}</span>
  );
}

// Stat card ------------------------------------------------------------

export function StatCard({
  label, value, sub,
}: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// Inline horizontal bar chart for monthly revenue.
export function BarChart({
  data, valueFormat,
}: {
  data: { label: string; value: number }[];
  valueFormat?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = valueFormat ?? ((n: number) => fmtUSD0(n));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map((d) => (
        <div key={d.label} style={{ display: "grid", gridTemplateColumns: "40px 1fr 80px", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{d.label}</div>
          <div style={{ background: "var(--line-2)", height: 18, borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              width: `${(d.value / max) * 100}%`,
              height: "100%",
              background: "var(--ink)",
              transition: "width 0.3s",
            }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, textAlign: "right" }}>{fmt(d.value)}</div>
        </div>
      ))}
    </div>
  );
}

// Catches Convex query/mutation errors so a single broken tab doesn't blank
// out the whole admin shell. Most useful in prod right after a frontend
// deploy that landed before `npx convex deploy` — the new function exists
// in the bundle but not on the Convex deployment yet, so useQuery throws.
export class SectionErrorBoundary extends React.Component<
  { children: React.ReactNode; sectionName: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[admin]", error);
  }
  reset = () => this.setState({ error: null });
  render() {
    if (this.state.error) {
      const msg = this.state.error.message ?? String(this.state.error);
      const isMissingFunction = /Could not find|FunctionNotFound|Server Error/i.test(msg);
      return (
        <div style={{ ...cardStyle, borderColor: "#fecaca", background: "#fef2f2" }}>
          <div style={{ fontWeight: 600, color: "#991b1b", marginBottom: 6 }}>
            {this.props.sectionName} couldn’t load
          </div>
          <div style={{ fontSize: 13, color: "#7f1d1d", lineHeight: 1.5 }}>
            {isMissingFunction
              ? "This section needs a Convex backend update. Run `npx convex deploy` against prod, then reload."
              : msg}
          </div>
          <button onClick={this.reset} style={{ ...btnGhost, marginTop: 12 }}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Responsive modal. On a phone it fills the screen as a sheet with its own
// sticky header and footer, so the primary action sits under the thumb and
// there is always a visible way out (PWA standalone has no browser Back).
// On desktop it stays a centred dialog.
export function ModalShell({
  title, onClose, children, footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const mobile = useIsMobile();

  // Escape closes on desktop; the sheet header handles it on touch.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60,
        display: "flex",
        alignItems: mobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: mobile ? 0 : 20,
      }}
    >
      <div style={{
        background: "#fff",
        width: "100%",
        maxWidth: mobile ? "none" : 480,
        maxHeight: mobile ? "100dvh" : "calc(100dvh - 40px)",
        height: mobile ? "100dvh" : undefined,
        borderRadius: mobile ? 0 : 14,
        display: "flex",
        flexDirection: "column",
        paddingTop: mobile ? "env(safe-area-inset-top, 0px)" : 0,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 12, padding: mobile ? "12px 16px" : "18px 20px 12px",
          borderBottom: mobile ? "1px solid var(--line)" : "none",
          flex: "0 0 auto",
        }}>
          <strong style={{ fontSize: mobile ? 17 : 15 }}>{title}</strong>
          <button style={btnGhost} onClick={onClose} aria-label="Close">Close</button>
        </div>

        <div style={{
          flex: "1 1 auto", overflowY: "auto", WebkitOverflowScrolling: "touch",
          padding: mobile ? "14px 16px" : "0 20px",
        }}>
          {children}
        </div>

        {footer && (
          <div style={{
            flex: "0 0 auto",
            display: "flex", gap: 8, justifyContent: "flex-end",
            padding: mobile ? "12px 16px" : "12px 20px 18px",
            borderTop: mobile ? "1px solid var(--line)" : "none",
            paddingBottom: mobile
              ? "calc(12px + env(safe-area-inset-bottom, 0px))"
              : undefined,
            background: "#fff",
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Floating primary action for phones — sits above the bottom tab bar, within
// thumb reach, instead of in the far top-right corner.
export function MobileFab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed",
        right: 16,
        bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
        zIndex: 20,
        padding: "14px 20px",
        borderRadius: 999,
        border: "none",
        background: "var(--accent)",
        color: "var(--accent-ink)",
        fontSize: 15,
        fontWeight: 700,
        boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
      }}
    >
      {label}
    </button>
  );
}

// One record rendered as a label/value card — the mobile stand-in for a table
// row. `fields` keeps the column order readable at 360px wide.
export function RecordCard({
  title, subtitle, fields, actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  fields: { label: string; value: React.ReactNode }[];
  actions?: React.ReactNode;
}) {
  return (
    <div style={mobileCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        {actions}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {fields.map((f) => (
          <div key={f.label}>
            <div style={mobileLabel}>{f.label}</div>
            <div style={mobileValue}>{f.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ ...mobileCard, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
      {message}
    </div>
  );
}

// Confirmable button — reduces accidental destructive clicks.
export function ConfirmButton({
  label, confirmLabel = "Confirm?", onConfirm, style,
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  style?: React.CSSProperties;
}) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      style={{ ...(armed ? btnDanger : btnGhost), ...(style ?? {}) }}
      onClick={(e) => {
        e.stopPropagation();
        if (!armed) {
          setArmed(true);
        } else {
          setArmed(false);
          onConfirm();
        }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
