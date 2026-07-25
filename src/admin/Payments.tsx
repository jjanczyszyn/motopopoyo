import React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  StatusPill, fmtUSD, fmtPct, fmtDate, btnPrimary, btnGhost, inputStyle,
  labelStyle, tableWrap, tableStyle, thStyle, tdStyle, monthBoundsISO,
  monthLabelLong, PARTNERS, PAYMENT_TYPES, PAYMENT_STATUSES, ConfirmButton,
  cardStyle, useIsMobile, mobileCard, mobileLabel, mobileValue, ModalShell,
  RecordCard, EmptyState,
} from "./shared";
import { Doc } from "../../convex/_generated/dataModel";

interface Props {
  adminToken: string;
  year: number;
  monthIdx0: number;
  setYear: (y: number) => void;
  setMonth: (m: number) => void;
}

// Money changes hands when the bike does, so the default action is a single
// tap that books the whole outstanding balance to the rental's start day.
// "Custom…" opens the full form for part payments, odd methods or dates.
function AwaitingPayment({
  adminToken, onCustom,
}: {
  adminToken: string;
  onCustom: (id: Id<"reservations">) => void;
}) {
  const rows = useQuery(api.reservations.listForAdmin, { adminToken });
  const markPaid = useMutation(api.payments.markPaid);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [err, setErr] = React.useState("");

  const outstanding = (rows ?? [])
    .filter((r) => r.status !== "cancelled" && r.balance > 0)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  if (rows && outstanding.length === 0) return null;

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        Awaiting payment ({outstanding.length})
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
        One tap records the balance as received on the rental's start date.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {outstanding.map((r) => (
          <div key={r._id} style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            padding: "10px 0", borderTop: "1px solid var(--line-2)",
          }}>
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {r.docFirstName} {r.docLastName}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {fmtDate(r.startDate)} · {r.code} · {r.payMethod}
              </div>
            </div>
            <button
              style={{ ...btnPrimary, background: "var(--ok)" }}
              disabled={busyId === r._id}
              onClick={async () => {
                setBusyId(r._id); setErr("");
                try {
                  await markPaid({ adminToken, reservationId: r._id });
                } catch (e) {
                  setErr((e as Error).message);
                } finally {
                  setBusyId(null);
                }
              }}
            >
              {busyId === r._id ? "Saving…" : `Mark paid · ${fmtUSD(r.balance)}`}
            </button>
            <button style={btnGhost} onClick={() => onCustom(r._id)}>Custom…</button>
          </div>
        ))}
      </div>
      {err && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>{err}</div>}
    </div>
  );
}

export function Payments({ adminToken, year, monthIdx0, setYear, setMonth }: Props) {
  const { start, end } = monthBoundsISO(year, monthIdx0);
  const summary = useQuery(api.metrics.paymentMethodSummary, { adminToken, fromISO: start, toISO: end });
  const allPayments = useQuery(api.payments.listAll, {
    adminToken,
    fromMs: Date.parse(start),
    toMs: Date.parse(end),
    onlyReceived: false,
  });
  const reservations = useQuery(api.reservations.list, { adminToken });
  const removePayment = useMutation(api.payments.remove);
  const updatePayment = useMutation(api.payments.update);
  const [recordFor, setRecordFor] = React.useState<Id<"reservations"> | null>(null);
  const [editing, setEditing] = React.useState<Doc<"payments"> | null>(null);
  const mobile = useIsMobile();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {/* The mobile shell already shows the section name in its header. */}
        {!mobile && <h2 style={{ margin: 0, fontSize: 22 }}>Payments</h2>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <select value={monthIdx0} onChange={(e) => setMonth(parseInt(e.target.value))} style={inputStyle}>
            {monthLabelLong.map((m, i) => (<option key={m} value={i}>{m}</option>))}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={inputStyle}>
            {[year - 1, year, year + 1].map((y) => (<option key={y} value={y}>{y}</option>))}
          </select>
        </div>
      </header>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Payment method summary</div>
        {mobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(summary?.rows ?? []).map((row) => (
              <RecordCard
                key={row.method}
                title={row.label}
                subtitle={`${fmtPct(row.percent)} of revenue · ${row.count} payment${row.count === 1 ? "" : "s"}`}
                fields={[
                  { label: "Amount", value: <strong>{fmtUSD(row.amount)}</strong> },
                  { label: "Default", value: row.defaultCollector ?? "—" },
                  { label: "JJ", value: fmtUSD(row.jjAmount) },
                  { label: "Karen", value: fmtUSD(row.karenAmount) },
                ]}
              />
            ))}
            {summary && summary.rows.length === 0 && (
              <EmptyState message="No payments this month." />
            )}
          </div>
        ) : (
        <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Method</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                <th style={{ ...thStyle, textAlign: "right" }}>%</th>
                <th style={{ ...thStyle, textAlign: "right" }}>JJ</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Karen</th>
                <th style={{ ...thStyle, textAlign: "right" }}>#</th>
                <th style={thStyle}>Default</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.rows ?? []).map((row) => (
                <tr key={row.method}>
                  <td style={tdStyle}><strong>{row.label}</strong></td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{fmtUSD(row.amount)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmtPct(row.percent)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmtUSD(row.jjAmount)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmtUSD(row.karenAmount)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{row.count}</td>
                  <td style={tdStyle}>{row.defaultCollector ?? "—"}</td>
                </tr>
              ))}
              {summary && summary.rows.length === 0 && (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "var(--muted)" }}>No payments this month.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>

      <AwaitingPayment adminToken={adminToken} onCustom={setRecordFor} />

      <div style={{ fontSize: 14, fontWeight: 600 }}>Payments this month</div>

      {mobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(allPayments ?? []).map((p) => {
            const r = (reservations ?? []).find((rr) => rr._id === p.reservationId);
            return (
              <div key={p._id} style={mobileCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtUSD(p.amount)}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {p.method} · {p.collectedBy}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <PaymentStatusEditor
                      payment={p}
                      onChange={(status) => updatePayment({ adminToken, paymentId: p._id, status })}
                    />
                    <StatusPill status={p.paymentType} />
                  </div>
                </div>
                {r && (
                  <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>{r.code}</span>
                    {" · "}
                    {r.docFirstName} {r.docLastName}
                  </div>
                )}
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {p.receivedAt ? fmtDate(new Date(p.receivedAt).toISOString()) : "—"}
                  {p.notes ? ` · ${p.notes}` : ""}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={btnGhost} onClick={() => setEditing(p)}>Edit</button>
                  <ConfirmButton label="Delete" confirmLabel="Sure?" onConfirm={() => removePayment({ adminToken, paymentId: p._id })} />
                </div>
              </div>
            );
          })}
          {allPayments && allPayments.length === 0 && (
            <div style={{ ...mobileCard, textAlign: "center", color: "var(--muted)" }}>
              No payments this month.
            </div>
          )}
        </div>
      ) : (
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Received</th>
              <th style={thStyle}>Booking</th>
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
            {(allPayments ?? []).map((p) => {
              const r = (reservations ?? []).find((rr) => rr._id === p.reservationId);
              return (
                <tr key={p._id}>
                  <td style={tdStyle}>{p.receivedAt ? fmtDate(new Date(p.receivedAt).toISOString()) : "—"}</td>
                  <td style={tdStyle}>
                    {r ? (
                      <>
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>{r.code}</span>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.docFirstName} {r.docLastName}</div>
                      </>
                    ) : "—"}
                  </td>
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
              );
            })}
            {allPayments && allPayments.length === 0 && (
              <tr><td colSpan={9} style={{ ...tdStyle, textAlign: "center", color: "var(--muted)" }}>No payments this month.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {recordFor && (
        <RecordPaymentModal
          reservationId={recordFor}
          adminToken={adminToken}
          onClose={() => setRecordFor(null)}
        />
      )}
      {editing && (
        <EditPaymentModal
          payment={editing}
          adminToken={adminToken}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export function RecordPaymentModal({
  reservationId, adminToken, onClose,
}: { reservationId: Id<"reservations">; adminToken: string; onClose: () => void }) {
  const cfg = useQuery(api.config.get);
  const reservation = useQuery(api.reservations.list, { adminToken });
  const r = reservation?.find((x) => x._id === reservationId);
  const record = useMutation(api.payments.record);

  const [amount, setAmount] = React.useState(r ? String(r.totalUSD) : "");
  const [method, setMethod] = React.useState<string>("cash");
  const [collectedBy, setCollectedBy] = React.useState<"JJ" | "Karen">("Karen");
  const [paymentType, setPaymentType] = React.useState<typeof PAYMENT_TYPES[number]>("full_payment");
  const [status, setStatus] = React.useState<typeof PAYMENT_STATUSES[number]>("received");
  const [receivedDate, setReceivedDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    if (!cfg) return;
    const m = cfg.paymentMethods.find((x) => x.id === method);
    if (m?.defaultCollector && m.defaultCollector !== "manual") {
      setCollectedBy(m.defaultCollector);
    }
  }, [method, cfg]);

  React.useEffect(() => {
    if (r && !amount) setAmount(String(r.totalUSD));
  }, [r, amount]);

  if (!r) return null;

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error("Amount must be greater than zero.");
      const receivedAt = status === "received"
        ? new Date(receivedDate + "T12:00:00").getTime()
        : undefined;
      await record({
        adminToken,
        reservationId,
        amount: amt,
        method,
        collectedBy,
        paymentType,
        status,
        receivedAt,
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
    <ModalShell
      title={`Record payment for ${r.code}`}
      onClose={onClose}
      footer={
        <>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button style={btnPrimary} onClick={submit} disabled={busy}>{busy ? "Saving…" : "Record"}</button>
        </>
      }
    >
      <div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
          {r.docFirstName} {r.docLastName} · {fmtUSD(r.totalUSD)} total · {r.days} days
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 10 }}>
          <Field label="Amount (USD)">
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Method">
            <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
              {(cfg?.paymentMethods ?? []).map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
            </select>
          </Field>
          <Field label="Collected by">
            <select value={collectedBy} onChange={(e) => setCollectedBy(e.target.value as any)} style={inputStyle}>
              {PARTNERS.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
          </Field>
          <Field label="Payment type">
            <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as any)} style={inputStyle}>
              {PAYMENT_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={inputStyle}>
              {PAYMENT_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </Field>
          <Field label="Received date">
            <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <Field label="Notes">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        </Field>
        {err && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>{err}</div>}
      </div>
    </ModalShell>
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

// Full edit dialog for an existing payment — same shape as Record but
// pre-filled and pointed at payments.update so a wrong amount, method,
// collector, type, status, date or note can be corrected without having to
// delete-and-rerecord (which would break the payment's audit trail).
export function EditPaymentModal({
  payment, adminToken, onClose,
}: {
  payment: Doc<"payments">;
  adminToken: string;
  onClose: () => void;
}) {
  const cfg = useQuery(api.config.get);
  const reservation = useQuery(api.reservations.list, { adminToken });
  const r = reservation?.find((x) => x._id === payment.reservationId);
  const update = useMutation(api.payments.update);

  const [amount, setAmount] = React.useState(String(payment.amount));
  const [method, setMethod] = React.useState<string>(payment.method);
  const [collectedBy, setCollectedBy] = React.useState<"JJ" | "Karen">(payment.collectedBy);
  const [paymentType, setPaymentType] = React.useState<typeof PAYMENT_TYPES[number]>(payment.paymentType);
  const [status, setStatus] = React.useState<typeof PAYMENT_STATUSES[number]>(payment.status);
  const [receivedDate, setReceivedDate] = React.useState(
    payment.receivedAt
      ? new Date(payment.receivedAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = React.useState(payment.notes ?? "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error("Amount must be greater than zero.");
      const receivedAt = status === "received"
        ? new Date(receivedDate + "T12:00:00").getTime()
        : undefined;
      await update({
        adminToken,
        paymentId: payment._id,
        amount: amt,
        method,
        collectedBy,
        paymentType,
        status,
        receivedAt,
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
    <ModalShell
      title={`Edit payment${r ? ` · ${r.code}` : ""}`}
      onClose={onClose}
      footer={
        <>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button style={btnPrimary} onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </>
      }
    >
      <div>
        {r && (
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
            {r.docFirstName} {r.docLastName} · {fmtUSD(r.totalUSD)} total · {r.days} days
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 10 }}>
          <Field label="Amount (USD)">
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Method">
            <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
              {(cfg?.paymentMethods ?? []).map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
            </select>
          </Field>
          <Field label="Collected by">
            <select value={collectedBy} onChange={(e) => setCollectedBy(e.target.value as any)} style={inputStyle}>
              {PARTNERS.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
          </Field>
          <Field label="Payment type">
            <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as any)} style={inputStyle}>
              {PAYMENT_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={inputStyle}>
              {PAYMENT_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </Field>
          <Field label="Received date">
            <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <Field label="Notes">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        </Field>
        {err && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>{err}</div>}
      </div>
    </ModalShell>
  );
}

// Inline status select. Wears the StatusPill colours so the table still
// reads at a glance, but lets the manager change "pending" → "received"
// (or "refunded", etc.) without leaving the page.
export function PaymentStatusEditor({
  payment, onChange,
}: {
  payment: Doc<"payments">;
  onChange: (status: typeof PAYMENT_STATUSES[number]) => Promise<unknown>;
}) {
  const [busy, setBusy] = React.useState(false);
  const colors: Record<string, [string, string]> = {
    received: ["#d1fae5", "#065f46"],
    pending: ["#fef3c7", "#92400e"],
    failed: ["#fee2e2", "#991b1b"],
    cancelled: ["#fee2e2", "#991b1b"],
    refunded: ["#fce7f3", "#9d174d"],
  };
  const [bg, fg] = colors[payment.status] ?? ["#f3f4f6", "#374151"];
  return (
    <select
      value={payment.status}
      disabled={busy}
      onChange={async (e) => {
        const next = e.target.value as typeof PAYMENT_STATUSES[number];
        if (next === payment.status) return;
        setBusy(true);
        try { await onChange(next); } finally { setBusy(false); }
      }}
      style={{
        padding: "2px 8px", borderRadius: 999,
        background: bg, color: fg,
        fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
        border: "1px solid transparent", cursor: busy ? "wait" : "pointer",
        appearance: "none", paddingRight: 18,
      }}
    >
      {PAYMENT_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
    </select>
  );
}
