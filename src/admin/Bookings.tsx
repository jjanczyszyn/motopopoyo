import React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  StatusPill, fmtUSD, fmtDate, fmtDateShort, btnPrimary, btnGhost, inputStyle,
  labelStyle, tableWrap, tableStyle, thStyle, tdStyle, RESERVATION_STATUSES,
  SOURCE_OPTIONS, isoToday, ConfirmButton, useIsMobile, mobileCard, mobileLabel,
  mobileValue, cardStyle, MobileFab, ModalShell,
} from "./shared";
import { RecordPaymentModal, PaymentStatusEditor, EditPaymentModal } from "./Payments";
import type { Doc as ConvexDoc } from "../../convex/_generated/dataModel";

interface Props { adminToken: string; }

// Short, owner-friendly bike label. Maps the seeded fleet to the names the
// owners actually use day-to-day in Spanish ("Genesis Azul", "Genesis Roja").
function shortBikeLabel(bike: { name: string; color: string } | null | undefined): string {
  if (!bike) return "—";
  if (bike.name.startsWith("Yamaha")) return "Yamaha";
  if (bike.name.startsWith("Genesis")) {
    if (bike.color === "Blue") return "Genesis Azul";
    if (bike.color === "Red") return "Genesis Roja";
    return `Genesis ${bike.color}`;
  }
  return `${bike.name} ${bike.color}`;
}

const PAY_METHOD_LABELS: Record<string, string> = {
  cash: "Cash", paypal: "PayPal", wise: "Wise", zelle: "Zelle",
  venmo: "Venmo", revolut: "Revolut", card: "Card", applepay: "Apple Pay",
  "transfer-usd": "Bank (USD)", "transfer-eur": "Bank (EUR)",
};
function payMethodLabel(id: string | undefined | null): string {
  if (!id) return "—";
  return PAY_METHOD_LABELS[id] ?? id;
}

// Column metadata. id is the persisted key, accessor returns the raw value
// for sort comparisons, and render is the cell body for each row.
type Booking = {
  _id: Id<"reservations">;
  code: string;
  docFirstName: string;
  docLastName: string;
  phoneCC: string;
  phoneNum: string;
  startDate: string;
  endDate: string;
  days: number;
  totalUSD: number;
  paid: number;
  status: string;
  payStatus: string;
  payMethod: string;
  source?: string;
  bike: { name: string; color: string; plate: string } | null;
};

type ColumnId =
  | "code" | "customer" | "startDate" | "endDate" | "days"
  | "bike" | "total" | "paid" | "status" | "payMethod"
  | "payStatus" | "source";

interface BookingColumn {
  id: ColumnId;
  label: string;
  defaultVisible: boolean;
  align?: "right";
  sortable?: boolean;
  // Value used for sort comparisons (string or number).
  accessor: (r: Booking) => string | number;
  render: (r: Booking) => React.ReactNode;
}

const ALL_COLUMNS: BookingColumn[] = [
  { id: "code", label: "Code", defaultVisible: false, sortable: true,
    accessor: (r) => r.code,
    render: (r) => <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>{r.code}</span> },
  { id: "customer", label: "Customer", defaultVisible: true, sortable: true,
    accessor: (r) => `${r.docFirstName} ${r.docLastName}`.toLowerCase(),
    render: (r) => (
      <>
        <div style={{ fontWeight: 600 }}>{r.docFirstName} {r.docLastName}</div>
        {(r.phoneCC || r.phoneNum) && (
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.phoneCC} {r.phoneNum}</div>
        )}
      </>
    ) },
  { id: "startDate", label: "Start", defaultVisible: true, sortable: true,
    accessor: (r) => r.startDate,
    render: (r) => fmtDate(r.startDate) },
  { id: "endDate", label: "End", defaultVisible: true, sortable: true,
    accessor: (r) => r.endDate,
    render: (r) => fmtDate(r.endDate) },
  { id: "days", label: "Days", defaultVisible: false, align: "right", sortable: true,
    accessor: (r) => r.days,
    render: (r) => r.days },
  { id: "bike", label: "Moto", defaultVisible: true, sortable: true,
    accessor: (r) => shortBikeLabel(r.bike).toLowerCase(),
    render: (r) => shortBikeLabel(r.bike) },
  { id: "total", label: "Total", defaultVisible: true, align: "right", sortable: true,
    accessor: (r) => r.totalUSD,
    render: (r) => <span style={{ fontWeight: 600 }}>{fmtUSD(r.totalUSD)}</span> },
  { id: "paid", label: "Paid", defaultVisible: true, align: "right", sortable: true,
    accessor: (r) => r.paid,
    render: (r) => fmtUSD(r.paid) },
  { id: "status", label: "Status", defaultVisible: true, sortable: true,
    accessor: (r) => r.status,
    render: (r) => <StatusPill status={r.status} /> },
  { id: "payMethod", label: "Payment", defaultVisible: true, sortable: true,
    accessor: (r) => r.payMethod,
    render: (r) => payMethodLabel(r.payMethod) },
  { id: "payStatus", label: "Pay status", defaultVisible: false, sortable: true,
    accessor: (r) => r.payStatus,
    render: (r) => <StatusPill status={r.payStatus} /> },
  { id: "source", label: "Source", defaultVisible: false, sortable: true,
    accessor: (r) => r.source ?? "",
    render: (r) => (r.source ?? "—").replace("_", " ") },
];

const COLUMN_VISIBILITY_KEY = "kj-admin-bookings-visible-columns";
const DEFAULT_VISIBLE: ColumnId[] = ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);

function loadVisibleColumns(): Set<ColumnId> {
  try {
    const raw = window.localStorage.getItem(COLUMN_VISIBILITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ColumnId[];
      if (Array.isArray(parsed) && parsed.length > 0) return new Set(parsed);
    }
  } catch {
    // fall through
  }
  return new Set(DEFAULT_VISIBLE);
}

export function Bookings({ adminToken }: Props) {
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [sourceFilter, setSourceFilter] = React.useState<string>("");
  const [showNew, setShowNew] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);
  const [editing, setEditing] = React.useState<Id<"reservations"> | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const toggleExpanded = (id: Id<"reservations">) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Cancelled bookings clutter the working view. Default the toggle on so
  // the manager only sees bookings that still matter; flip off to audit
  // everything (and the explicit status="cancelled" filter still works).
  const [hideCancelled, setHideCancelled] = React.useState(true);

  const rawBookings = useQuery(
    api.reservations.listForAdmin,
    {
      adminToken,
      status: statusFilter || undefined,
      source: sourceFilter || undefined,
    }
  );
  const filteredBookings = React.useMemo(() => {
    if (!rawBookings) return rawBookings;
    if (!hideCancelled) return rawBookings;
    if (statusFilter === "cancelled") return rawBookings; // user asked for them
    return rawBookings.filter((r) => r.status !== "cancelled");
  }, [rawBookings, hideCancelled, statusFilter]);
  const cancelledHidden = (rawBookings?.length ?? 0) - (filteredBookings?.length ?? 0);

  // Sort + column-visibility state. Both persist across reloads via
  // localStorage so the manager sees the same view next time.
  const [sortBy, setSortBy] = React.useState<ColumnId>("startDate");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [visibleColumns, setVisibleColumns] = React.useState<Set<ColumnId>>(() => loadVisibleColumns());
  const [showColumnPicker, setShowColumnPicker] = React.useState(false);

  React.useEffect(() => {
    window.localStorage.setItem(
      COLUMN_VISIBILITY_KEY,
      JSON.stringify(Array.from(visibleColumns))
    );
  }, [visibleColumns]);

  const toggleColumn = (id: ColumnId) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const resetColumns = () => setVisibleColumns(new Set(DEFAULT_VISIBLE));

  const handleSort = (id: ColumnId) => {
    setSortBy((prev) => {
      if (prev === id) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return id;
    });
  };

  const bookings = React.useMemo(() => {
    if (!filteredBookings) return filteredBookings;
    const col = ALL_COLUMNS.find((c) => c.id === sortBy);
    if (!col) return filteredBookings;
    const arr = [...filteredBookings];
    arr.sort((a, b) => {
      const av = col.accessor(a as Booking);
      const bv = col.accessor(b as Booking);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredBookings, sortBy, sortDir]);

  const setStatus = useMutation(api.reservations.setStatus);
  const mobile = useIsMobile();
  const visibleCols = ALL_COLUMNS.filter((c) => visibleColumns.has(c.id));

  // On a phone the filter row used to push the actual bookings below the fold,
  // so it collapses behind a "Filters" disclosure that reports how many are on.
  const activeFilters =
    (statusFilter ? 1 : 0) + (sourceFilter ? 1 : 0) + (hideCancelled ? 1 : 0);

  const mobileList = (
    <>
      {(bookings ?? []).map((r) => {
        const isOpen = expanded.has(r._id);
        return (
          <div key={r._id} style={mobileCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{r.docFirstName} {r.docLastName}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "JetBrains Mono, monospace" }}>{r.code}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <StatusPill status={r.status} />
                <StatusPill status={r.payStatus} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={mobileLabel}>Moto</div>
                <div style={mobileValue}>{shortBikeLabel(r.bike)}</div>
              </div>
              <div>
                <div style={mobileLabel}>Dates</div>
                <div style={mobileValue}>{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</div>
              </div>
              <div>
                <div style={mobileLabel}>Total</div>
                <div style={mobileValue}>{fmtUSD(r.totalUSD)} <span style={{ color: "var(--muted)", fontSize: 11 }}>· {r.days}d</span></div>
              </div>
              <div>
                <div style={mobileLabel}>Paid</div>
                <div style={mobileValue}>{fmtUSD(r.paid)}</div>
              </div>
              <div>
                <div style={mobileLabel}>Payment</div>
                <div style={mobileValue}>{payMethodLabel(r.payMethod)}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <MarkPaidButton
                reservationId={r._id}
                outstanding={r.totalUSD - r.paid}
                adminToken={adminToken}
                full
              />
              <select
                value={r.status}
                onChange={(e) => setStatus({ id: r._id, status: e.target.value as any, adminToken })}
                style={{ ...inputStyle, flex: 1, minWidth: 120 }}
              >
                {RESERVATION_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
              <button style={btnGhost} onClick={() => setEditing(r._id)}>Edit</button>
              <button style={btnGhost} onClick={() => toggleExpanded(r._id)}>
                {isOpen ? "Hide payments" : "Payments"}
              </button>
            </div>
            {isOpen && (
              <div style={{ marginTop: 4, paddingTop: 10, borderTop: "1px solid var(--line-2)" }}>
                <BookingPaymentsPanel reservationId={r._id} adminToken={adminToken} />
              </div>
            )}
          </div>
        );
      })}
      {bookings && bookings.length === 0 && (
        <div style={{ ...mobileCard, textAlign: "center", color: "var(--muted)" }}>
          No bookings match these filters.
        </div>
      )}
    </>
  );

  if (mobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            style={{ ...(activeFilters ? btnPrimary : btnGhost), flex: "0 0 auto" }}
          >
            Filters{activeFilters ? ` (${activeFilters})` : ""}
          </button>
          <select
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [id, dir] = e.target.value.split(":") as [ColumnId, "asc" | "desc"];
              setSortBy(id);
              setSortDir(dir);
            }}
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
          >
            {ALL_COLUMNS.filter((c) => c.sortable).flatMap((c) => [
              <option key={`${c.id}:desc`} value={`${c.id}:desc`}>{c.label} (desc)</option>,
              <option key={`${c.id}:asc`} value={`${c.id}:asc`}>{c.label} (asc)</option>,
            ])}
          </select>
        </div>

        {showFilters && (
          <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
              <option value="">All statuses</option>
              {RESERVATION_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={inputStyle}>
              <option value="">All sources</option>
              {SOURCE_OPTIONS.map((s) => (<option key={s} value={s}>{s.replace("_", " ")}</option>))}
            </select>
            <button
              type="button"
              onClick={() => setHideCancelled((v) => !v)}
              aria-pressed={hideCancelled}
              style={hideCancelled ? btnPrimary : btnGhost}
            >
              {hideCancelled ? "✓ " : ""}Hide cancelled
              {hideCancelled && cancelledHidden > 0 ? ` (${cancelledHidden})` : ""}
            </button>
          </div>
        )}

        {/* Extra bottom room so the floating "+ New booking" button never
            sits on top of the last card's actions. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 72 }}>
          {mobileList}
        </div>

        <MobileFab label="+ New booking" onClick={() => setShowNew(true)} />

        {showNew && (
          <NewBookingForm adminToken={adminToken} onClose={() => setShowNew(false)} />
        )}
        {editing && (
          <EditBookingForm
            reservationId={editing}
            adminToken={adminToken}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Bookings</h2>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
          <option value="">All statuses</option>
          {RESERVATION_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={inputStyle}>
          <option value="">All sources</option>
          {SOURCE_OPTIONS.map((s) => (<option key={s} value={s}>{s.replace("_", " ")}</option>))}
        </select>
        <button
          type="button"
          onClick={() => setHideCancelled((v) => !v)}
          aria-pressed={hideCancelled}
          title={hideCancelled ? "Click to show cancelled bookings" : "Click to hide cancelled bookings"}
          style={{
            ...(hideCancelled ? btnPrimary : btnGhost),
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          {hideCancelled ? "✓ " : ""}Hide cancelled
          {hideCancelled && cancelledHidden > 0 && (
            <span style={{ opacity: 0.7, fontSize: 11 }}>({cancelledHidden})</span>
          )}
        </button>
        {!mobile && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowColumnPicker((v) => !v)}
              style={btnGhost}
              title="Choose visible columns"
            >
              Columns ({visibleColumns.size})
            </button>
            {showColumnPicker && (
              <>
                <div
                  onClick={() => setShowColumnPicker(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 20 }}
                />
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0,
                  zIndex: 30, background: "#fff", border: "1px solid var(--line)",
                  borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
                  padding: 12, minWidth: 200,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong style={{ fontSize: 13 }}>Visible columns</strong>
                    <button type="button" onClick={resetColumns} style={{ ...btnGhost, padding: "4px 8px", fontSize: 11 }}>Reset</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {ALL_COLUMNS.map((c) => (
                      <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 6px", cursor: "pointer", borderRadius: 6 }}>
                        <input
                          type="checkbox"
                          checked={visibleColumns.has(c.id)}
                          onChange={() => toggleColumn(c.id)}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        <button style={{ ...btnPrimary, marginLeft: "auto" }} onClick={() => setShowNew(true)}>+ New booking</button>
      </header>

      {showNew && (
        <NewBookingForm
          adminToken={adminToken}
          onClose={() => setShowNew(false)}
        />
      )}

      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 32 }}></th>
              {visibleCols.map((col) => {
                const active = sortBy === col.id;
                const arrow = active ? (sortDir === "asc" ? " ▲" : " ▼") : "";
                return (
                  <th
                    key={col.id}
                    onClick={() => col.sortable && handleSort(col.id)}
                    style={{
                      ...thStyle,
                      textAlign: col.align ?? "left",
                      cursor: col.sortable ? "pointer" : "default",
                      userSelect: "none",
                      color: active ? "var(--ink)" : (thStyle as React.CSSProperties).color,
                    }}
                  >
                    {col.label}{arrow}
                  </th>
                );
              })}
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {(bookings ?? []).map((r) => {
              const isOpen = expanded.has(r._id);
              const colSpan = visibleCols.length + 2;
              return (
                <React.Fragment key={r._id}>
                  <tr>
                    <td
                      style={{ ...tdStyle, cursor: "pointer", userSelect: "none", color: "var(--muted)", textAlign: "center" }}
                      onClick={() => toggleExpanded(r._id)}
                      title={isOpen ? "Hide payments" : "Show payments"}
                    >
                      {isOpen ? "▾" : "▸"}
                    </td>
                    {visibleCols.map((col) => (
                      <td
                        key={col.id}
                        style={{
                          ...tdStyle,
                          textAlign: col.align ?? "left",
                          ...(col.id === "source" ? { textTransform: "capitalize" } : {}),
                        }}
                      >
                        {col.render(r as Booking)}
                      </td>
                    ))}
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <MarkPaidButton
                          reservationId={r._id}
                          outstanding={r.totalUSD - r.paid}
                          adminToken={adminToken}
                        />
                        <button style={btnGhost} onClick={() => setEditing(r._id)}>Edit</button>
                        <StatusActions r={r} onChange={(s) => setStatus({ id: r._id, status: s, adminToken })} />
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={colSpan} style={{ padding: 0, background: "#fafafa", borderBottom: "1px solid var(--line-2)" }}>
                        <div style={{ padding: "12px 16px" }}>
                          <BookingPaymentsPanel reservationId={r._id} adminToken={adminToken} />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {bookings && bookings.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length + 2} style={{ ...tdStyle, textAlign: "center", color: "var(--muted)", padding: 24 }}>
                  No bookings match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditBookingForm
          reservationId={editing}
          adminToken={adminToken}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// One tap logs the whole outstanding balance as received on the rental's
// start day, using the booking's own payment method. Everything unusual is a
// second tap away in "Payments" on the row, where the entry can be edited.
function MarkPaidButton({
  reservationId, outstanding, adminToken, full,
}: {
  reservationId: Id<"reservations">;
  outstanding: number;
  adminToken: string;
  full?: boolean;
}) {
  const markPaid = useMutation(api.payments.markPaid);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  if (outstanding <= 0) return null;

  return (
    <>
      <button
        style={{
          ...btnPrimary,
          background: "var(--ok)",
          ...(full ? { flex: 1, minWidth: 140 } : {}),
        }}
        disabled={busy}
        onClick={async () => {
          setBusy(true); setErr("");
          try {
            await markPaid({ adminToken, reservationId });
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : `Mark paid · ${fmtUSD(outstanding)}`}
      </button>
      {err && <div style={{ color: "#b91c1c", fontSize: 11, width: "100%" }}>{err}</div>}
    </>
  );
}

function StatusActions({
  r, onChange,
}: {
  r: { status: string; _id: Id<"reservations"> };
  onChange: (s: "pending" | "confirmed" | "active" | "returned" | "cancelled") => void;
}) {
  return (
    <select
      value={r.status}
      onChange={(e) => onChange(e.target.value as any)}
      style={{ ...inputStyle, fontSize: 12, padding: "6px 8px" }}
    >
      {RESERVATION_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
    </select>
  );
}

function NewBookingForm({
  adminToken, onClose,
}: { adminToken: string; onClose: () => void }) {
  const bikes = useQuery(api.bikes.listAll, { adminToken }) ?? [];
  const create = useMutation(api.reservations.adminCreate);
  const today = isoToday();
  const [bikeId, setBikeId] = React.useState<string>("");
  const [startDate, setStartDate] = React.useState<string>(today);
  const [endDate, setEndDate] = React.useState<string>(today);
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [customerEmail, setCustomerEmail] = React.useState("");
  const [source, setSource] = React.useState<string>("walk_in");
  const [discount, setDiscount] = React.useState<string>("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      if (!bikeId) throw new Error("Pick a bike.");
      if (!customerName.trim()) throw new Error("Customer name required.");
      await create({
        adminToken,
        bikeId: bikeId as Id<"bikes">,
        startDate, endDate,
        customerName: customerName.trim(),
        customerPhone: customerPhone || undefined,
        customerEmail: customerEmail || undefined,
        source,
        discount: discount ? parseFloat(discount) : undefined,
        notes: notes || undefined,
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 16, border: "1px solid var(--line)", borderRadius: 12, background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <strong>New booking</strong>
        <button style={btnGhost} onClick={onClose}>Close</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <Field label="Bike">
          <select value={bikeId} onChange={(e) => setBikeId(e.target.value)} style={inputStyle}>
            <option value="">Pick…</option>
            {bikes.map((b: Doc<"bikes">) => (
              <option key={b._id} value={b._id}>{b.name} {b.color}</option>
            ))}
          </select>
        </Field>
        <Field label="Start"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} /></Field>
        <Field label="End"><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} /></Field>
        <Field label="Customer name"><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={inputStyle} /></Field>
        <Field label="Phone (+CC)"><input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} style={inputStyle} placeholder="+50589..." /></Field>
        <Field label="Email"><input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} style={inputStyle} /></Field>
        <Field label="Source">
          <select value={source} onChange={(e) => setSource(e.target.value)} style={inputStyle}>
            {SOURCE_OPTIONS.map((s) => (<option key={s} value={s}>{s.replace("_", " ")}</option>))}
          </select>
        </Field>
        <Field label="Discount (USD)"><input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} style={inputStyle} /></Field>
        <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} /></Field>
      </div>
      {err && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button style={btnGhost} onClick={onClose}>Cancel</button>
        <button style={btnPrimary} disabled={busy} onClick={submit}>{busy ? "Saving…" : "Create booking"}</button>
      </div>
    </div>
  );
}

function EditBookingForm({
  reservationId, adminToken, onClose,
}: { reservationId: Id<"reservations">; adminToken: string; onClose: () => void }) {
  const all = useQuery(api.reservations.listForAdmin, { adminToken });
  const r = all?.find((x) => x._id === reservationId);
  const update = useMutation(api.reservations.adminUpdate);
  const [customerName, setCustomerName] = React.useState("");
  const [customerEmail, setCustomerEmail] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [source, setSource] = React.useState("");
  const [discount, setDiscount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const initialised = React.useRef(false);

  React.useEffect(() => {
    if (!r || initialised.current) return;
    initialised.current = true;
    setCustomerName(`${r.docFirstName} ${r.docLastName}`.trim());
    setCustomerEmail(r.customerEmail ?? "");
    setCustomerPhone(`${r.phoneCC}${r.phoneNum}`);
    setSource(r.source ?? "");
    setDiscount(r.discount ? String(r.discount) : "");
    setNotes(r.notes ?? "");
    setStartDate(r.startDate);
    setEndDate(r.endDate);
  }, [r]);

  if (!r) return null;
  const submit = async () => {
    setBusy(true); setErr("");
    try {
      await update({
        adminToken, id: reservationId,
        customerName, customerEmail: customerEmail || undefined,
        customerPhone, source: source || undefined,
        discount: discount ? parseFloat(discount) : undefined,
        notes: notes || undefined,
        startDate, endDate,
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell
      title={`Edit booking ${r.code}`}
      onClose={onClose}
      footer={
        <>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button style={btnPrimary} onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </>
      }
    >
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 10 }}>
          <Field label="Customer name"><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={inputStyle} /></Field>
          <Field label="Phone (+CC)"><input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" style={inputStyle} /></Field>
          <Field label="Email"><input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" style={inputStyle} /></Field>
          <Field label="Start"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} /></Field>
          <Field label="End"><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} /></Field>
          <Field label="Source">
            <select value={source} onChange={(e) => setSource(e.target.value)} style={inputStyle}>
              <option value="">(none)</option>
              {SOURCE_OPTIONS.map((s) => (<option key={s} value={s}>{s.replace("_", " ")}</option>))}
            </select>
          </Field>
          <Field label="Discount (USD)"><input type="number" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} style={inputStyle} /></Field>
          <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} /></Field>
        </div>
        {err && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>{err}</div>}

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
          <BookingPaymentsPanel reservationId={reservationId} adminToken={adminToken} />
        </div>
      </div>
    </ModalShell>
  );
}

// Inline payments panel reused inside the booking-edit modal AND under each
// booking row in the main table. Lists existing payments, lets the manager
// flip status (and other fields via the deletion + re-record path), and
// gives one-click access to the record-payment modal scoped to this booking.
export function BookingPaymentsPanel({
  reservationId, adminToken,
}: { reservationId: Id<"reservations">; adminToken: string }) {
  const payments = useQuery(api.payments.listForReservation, { adminToken, reservationId });
  const removePayment = useMutation(api.payments.remove);
  const updatePayment = useMutation(api.payments.update);
  const [recording, setRecording] = React.useState(false);
  const [editing, setEditing] = React.useState<ConvexDoc<"payments"> | null>(null);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong>Payments ({payments?.length ?? 0})</strong>
        <button style={btnPrimary} onClick={() => setRecording(true)}>+ Record payment</button>
      </div>
      {payments && payments.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>No payments recorded for this booking yet.</div>
      )}
      {payments && payments.length > 0 && (
        <div style={tableWrap}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Received</th>
                <th style={thStyle}>Method</th>
                <th style={thStyle}>Type</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                <th style={thStyle}>Collected by</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Notes</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p._id}>
                  <td style={tdStyle}>{p.receivedAt ? fmtDate(new Date(p.receivedAt).toISOString()) : "—"}</td>
                  <td style={tdStyle}>{p.method}</td>
                  <td style={tdStyle}><StatusPill status={p.paymentType} /></td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{fmtUSD(p.amount)}</td>
                  <td style={tdStyle}>{p.collectedBy}</td>
                  <td style={tdStyle}>
                    <PaymentStatusEditor
                      payment={p}
                      onChange={(status) => updatePayment({ adminToken, paymentId: p._id, status })}
                    />
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: "var(--muted)" }}>{p.notes ?? ""}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button style={btnGhost} onClick={() => setEditing(p)}>Edit</button>
                      <ConfirmButton label="Delete" confirmLabel="Sure?" onConfirm={() => removePayment({ adminToken, paymentId: p._id })} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {recording && (
        <RecordPaymentModal
          reservationId={reservationId}
          adminToken={adminToken}
          onClose={() => setRecording(false)}
        />
      )}
      {editing && (
        <EditPaymentModal
          payment={editing}
          adminToken={adminToken}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}
