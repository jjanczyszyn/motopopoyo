import React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  StatCard, btnPrimary, btnGhost, fmtUSD, fmtUSD0, inputStyle, labelStyle,
  cardStyle, tableWrap, tableStyle, thStyle, tdStyle, monthLabelLong,
  PARTNERS, ConfirmButton, isoToday, useIsMobile, ModalShell, RecordCard,
  EmptyState,
} from "./shared";

interface Props {
  adminToken: string;
  year: number;
  monthIdx0: number;
  setYear: (y: number) => void;
  setMonth: (m: number) => void;
}

export function Settlement({ adminToken, year, monthIdx0, setYear, setMonth }: Props) {
  const ym = `${year}-${String(monthIdx0 + 1).padStart(2, "0")}`;
  const summary = useQuery(api.settlement.summary, { adminToken, settlementMonth: ym });
  const transfers = useQuery(api.settlement.listTransfers, { adminToken, settlementMonth: ym });
  const removeTransfer = useMutation(api.settlement.removeTransfer);
  const [showTransfer, setShowTransfer] = React.useState(false);

  const monthly12 = useQuery(api.metrics.monthlySeries, { adminToken, year });
  const yearly = useQuery(api.settlement.summary, { adminToken });
  const mobile = useIsMobile();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {!mobile && <h2 style={{ margin: 0, fontSize: 22 }}>Partner settlement</h2>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <select value={monthIdx0} onChange={(e) => setMonth(parseInt(e.target.value))} style={inputStyle}>
            {monthLabelLong.map((m, i) => (<option key={m} value={i}>{m}</option>))}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={inputStyle}>
            {[year - 1, year, year + 1].map((y) => (<option key={y} value={y}>{y}</option>))}
          </select>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12 }}>
        <StatCard label="Total received" value={fmtUSD0(summary?.totalRevenue ?? 0)} />
        <StatCard label="JJ expected (70%)" value={fmtUSD(summary?.jjExpected ?? 0)}
          sub={`Collected ${fmtUSD(summary?.jjCollected ?? 0)}`} />
        <StatCard label="Karen expected (30%)" value={fmtUSD(summary?.karenExpected ?? 0)}
          sub={`Collected ${fmtUSD(summary?.karenCollected ?? 0)}`} />
        <StatCard label="Settlement balance" value={summary?.label ?? "—"}
          sub={summary && summary.jjReceivedTransfers + summary.jjSentTransfers > 0
            ? `${fmtUSD0(summary.jjReceivedTransfers + summary.jjSentTransfers)} transferred`
            : "No transfers yet"} />
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>By payment method · {monthLabelLong[monthIdx0]} {year}</div>
        {mobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(summary?.paymentMethodBreakdown ?? []).map((row) => (
              <RecordCard
                key={row.method}
                title={row.method}
                subtitle={`${row.count} payment${row.count === 1 ? "" : "s"}`}
                fields={[
                  { label: "Amount", value: fmtUSD(row.amount) },
                  { label: "JJ collected", value: fmtUSD(row.collectedBy.JJ) },
                  { label: "Karen collected", value: fmtUSD(row.collectedBy.Karen) },
                ]}
              />
            ))}
            {summary && summary.paymentMethodBreakdown.length === 0 && (
              <EmptyState message="No payments this month." />
            )}
          </div>
        ) : (
        <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px", WebkitOverflowScrolling: "touch" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Method</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
              <th style={{ ...thStyle, textAlign: "right" }}>JJ collected</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Karen collected</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Payments</th>
            </tr>
          </thead>
          <tbody>
            {(summary?.paymentMethodBreakdown ?? []).map((row) => (
              <tr key={row.method}>
                <td style={tdStyle}>{row.method}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmtUSD(row.amount)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmtUSD(row.collectedBy.JJ)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmtUSD(row.collectedBy.Karen)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{row.count}</td>
              </tr>
            ))}
            {summary && summary.paymentMethodBreakdown.length === 0 && (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--muted)" }}>No payments this month.</td></tr>
            )}
          </tbody>
        </table>
        </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Transfers ({monthLabelLong[monthIdx0]} {year})</div>
        <button
          style={{ ...btnPrimary, ...(mobile ? { width: "100%", padding: "12px 16px", fontSize: 15 } : {}) }}
          onClick={() => setShowTransfer(true)}
        >
          + Record settlement transfer
        </button>
      </div>
      {mobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(transfers ?? []).map((t) => (
            <RecordCard
              key={t._id}
              title={`${t.fromPartner} → ${t.toPartner}`}
              subtitle={t.notes ? `${t.date} · ${t.notes}` : t.date}
              fields={[
                { label: "Amount", value: <strong>{fmtUSD(t.amount)}</strong> },
                { label: "Method", value: t.method },
              ]}
              actions={
                <ConfirmButton label="Delete" confirmLabel="Sure?"
                  onConfirm={() => removeTransfer({ adminToken, id: t._id })} />
              }
            />
          ))}
          {transfers && transfers.length === 0 && (
            <EmptyState message="No transfers yet." />
          )}
        </div>
      ) : (
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>From</th>
              <th style={thStyle}>To</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
              <th style={thStyle}>Method</th>
              <th style={thStyle}>Notes</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {(transfers ?? []).map((t) => (
              <tr key={t._id}>
                <td style={tdStyle}>{t.date}</td>
                <td style={tdStyle}>{t.fromPartner}</td>
                <td style={tdStyle}>{t.toPartner}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{fmtUSD(t.amount)}</td>
                <td style={tdStyle}>{t.method}</td>
                <td style={{ ...tdStyle, fontSize: 12, color: "var(--muted)" }}>{t.notes ?? ""}</td>
                <td style={tdStyle}>
                  <ConfirmButton label="Delete" confirmLabel="Sure?" onConfirm={() => removeTransfer({ adminToken, id: t._id })} />
                </td>
              </tr>
            ))}
            {transfers && transfers.length === 0 && (
              <tr><td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "var(--muted)" }}>No transfers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {showTransfer && (
        <RecordTransferModal
          adminToken={adminToken}
          settlementMonth={ym}
          onClose={() => setShowTransfer(false)}
        />
      )}

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Year-to-date · {year}</div>
        <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px", WebkitOverflowScrolling: "touch" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Month</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Revenue</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Rentals</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Days</th>
            </tr>
          </thead>
          <tbody>
            {(monthly12 ?? []).map((m) => (
              <tr key={m.month}>
                <td style={tdStyle}>{monthLabelLong[m.month - 1]}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{fmtUSD0(m.revenue)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{m.rentals}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{m.rentalDays}</td>
              </tr>
            ))}
            {yearly && (
              <tr>
                <td style={{ ...tdStyle, fontWeight: 700 }}>Total</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{fmtUSD0(yearly.totalRevenue)}</td>
                <td colSpan={2} style={{ ...tdStyle, textAlign: "right", color: "var(--muted)", fontSize: 12 }}>
                  Settlement so far: {yearly.label}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function RecordTransferModal({
  adminToken, settlementMonth, onClose,
}: { adminToken: string; settlementMonth: string; onClose: () => void }) {
  const record = useMutation(api.settlement.recordTransfer);
  const [from, setFrom] = React.useState<"JJ" | "Karen">("Karen");
  const [to, setTo] = React.useState<"JJ" | "Karen">("JJ");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(isoToday());
  const [method, setMethod] = React.useState("bank_transfer");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error("Amount must be greater than zero.");
      if (from === to) throw new Error("From and To must differ.");
      await record({
        adminToken,
        fromPartner: from, toPartner: to,
        amount: amt, date, method,
        settlementMonth, notes: notes || undefined,
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
      title="Record settlement transfer"
      onClose={onClose}
      footer={
        <>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button style={btnPrimary} onClick={submit} disabled={busy}>{busy ? "Saving…" : "Record"}</button>
        </>
      }
    >
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 10 }}>
          <Field label="From">
            <select value={from} onChange={(e) => setFrom(e.target.value as any)} style={inputStyle}>
              {PARTNERS.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
          </Field>
          <Field label="To">
            <select value={to} onChange={(e) => setTo(e.target.value as any)} style={inputStyle}>
              {PARTNERS.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
          </Field>
          <Field label="Amount (USD)">
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Method">
            <input value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Settlement month">
            <input value={settlementMonth} disabled style={{ ...inputStyle, color: "var(--muted)" }} />
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
