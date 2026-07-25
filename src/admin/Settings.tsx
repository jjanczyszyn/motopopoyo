import React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  btnPrimary, btnGhost, inputStyle, labelStyle, cardStyle, tableWrap, tableStyle,
  thStyle, tdStyle, useIsMobile,
} from "./shared";
import {
  DEFAULT_SEASON, DEFAULT_SEASON_RATES, SEASONS, SEASON_LABEL,
  ratesForDaily, type Season,
} from "../../convex/lib/season";

interface Props { adminToken: string; }

export function Settings({ adminToken }: Props) {
  const cfg = useQuery(api.config.get);
  const update = useMutation(api.config.updateBusiness);
  const setCollector = useMutation(api.config.setPaymentMethodCollector);

  const [businessName, setBusinessName] = React.useState("");
  const [currency, setCurrency] = React.useState("USD");
  const [timezone, setTimezone] = React.useState("");
  const [deposit, setDeposit] = React.useState("");
  const [jjShare, setJjShare] = React.useState("");
  const [karenShare, setKarenShare] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");
  const initialised = React.useRef(false);
  const mobile = useIsMobile();

  React.useEffect(() => {
    if (!cfg || initialised.current) return;
    initialised.current = true;
    setBusinessName(cfg.businessName ?? "");
    setCurrency(cfg.currency ?? "USD");
    setTimezone(cfg.timezone ?? "");
    setDeposit(String(cfg.deposit));
    setJjShare(String(cfg.jjSharePercentage ?? 70));
    setKarenShare(String(cfg.karenSharePercentage ?? 30));
  }, [cfg]);

  const save = async () => {
    setBusy(true); setMsg(""); setErr("");
    try {
      await update({
        adminToken,
        businessName: businessName || undefined,
        currency: currency || undefined,
        timezone: timezone || undefined,
        deposit: deposit ? parseFloat(deposit) : undefined,
        jjSharePercentage: jjShare ? parseFloat(jjShare) : undefined,
        karenSharePercentage: karenShare ? parseFloat(karenShare) : undefined,
      });
      setMsg("Saved.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {!mobile && <h2 style={{ margin: 0, fontSize: 22 }}>Settings</h2>}

      <SeasonPricing adminToken={adminToken} cfg={cfg} />

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Business</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 10 }}>
          <Field label="Business name"><input value={businessName} onChange={(e) => setBusinessName(e.target.value)} style={inputStyle} /></Field>
          <Field label="Currency"><input value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle} /></Field>
          <Field label="Timezone"><input value={timezone} onChange={(e) => setTimezone(e.target.value)} style={inputStyle} /></Field>
          <Field label="Deposit"><input type="number" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} style={inputStyle} /></Field>
          <Field label="JJ share %"><input type="number" inputMode="decimal" value={jjShare} onChange={(e) => setJjShare(e.target.value)} style={inputStyle} /></Field>
          <Field label="Karen share %"><input type="number" inputMode="decimal" value={karenShare} onChange={(e) => setKarenShare(e.target.value)} style={inputStyle} /></Field>
        </div>
        {msg && <div style={{ color: "#065f46", fontSize: 12, marginTop: 8 }}>{msg}</div>}
        {err && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>{err}</div>}
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <button style={btnPrimary} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>

      {mobile ? (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
            Default payment-method collector
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(cfg?.paymentMethods ?? []).map((m) => (
              <div key={m.id} style={{ borderTop: "1px solid var(--line-2)", paddingTop: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.label}</div>
                <select
                  value={m.defaultCollector ?? "manual"}
                  onChange={(e) =>
                    setCollector({ adminToken, methodId: m.id, defaultCollector: e.target.value as any })
                  }
                  style={{ ...inputStyle, width: "100%", marginTop: 6 }}
                >
                  <option value="JJ">JJ</option>
                  <option value="Karen">Karen</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      ) : (
      <div style={tableWrap}>
        <div style={{ padding: "10px 12px", background: "#fafafa", borderBottom: "1px solid var(--line)", fontWeight: 600, fontSize: 13 }}>
          Default payment-method collector
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Method</th>
              <th style={thStyle}>Default collector</th>
            </tr>
          </thead>
          <tbody>
            {(cfg?.paymentMethods ?? []).map((m) => (
              <tr key={m.id}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{m.id}</div>
                </td>
                <td style={tdStyle}>
                  <select
                    value={m.defaultCollector ?? "manual"}
                    onChange={(e) =>
                      setCollector({ adminToken, methodId: m.id, defaultCollector: e.target.value as any })
                    }
                    style={inputStyle}
                  >
                    <option value="JJ">JJ</option>
                    <option value="Karen">Karen</option>
                    <option value="manual">Manual</option>
                  </select>
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

// Season switch — one click swaps the live price list on the public site.
// Each season keeps its own daily/weekly/monthly preset; editing the daily
// rate re-derives the weekly/monthly ones proportionally unless overridden.
function SeasonPricing({
  adminToken, cfg,
}: {
  adminToken: string;
  cfg: { season?: Season; seasonRates?: Record<Season, { daily: number; weekly: number; monthly: number }> } | null | undefined;
}) {
  const switchSeason = useMutation(api.config.setSeason);
  const saveRates = useMutation(api.config.setSeasonRates);

  const active: Season = cfg?.season ?? DEFAULT_SEASON;
  const presets = cfg?.seasonRates ?? DEFAULT_SEASON_RATES;

  const [draft, setDraft] = React.useState<Record<Season, { daily: string; weekly: string; monthly: string }> | null>(null);
  const [busy, setBusy] = React.useState<string>("");
  const [err, setErr] = React.useState("");
  const initialised = React.useRef(false);

  React.useEffect(() => {
    if (!cfg || initialised.current) return;
    initialised.current = true;
    setDraft({
      high: strRates(presets.high),
      low: strRates(presets.low),
    });
  }, [cfg, presets]);

  if (!cfg || !draft) return <div style={cardStyle}>Loading pricing…</div>;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setErr("");
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };

  const onDaily = (s: Season, value: string) => {
    // Keep the discounts proportional as you type, unless the operator has
    // already typed a bespoke weekly/monthly figure.
    const d = parseFloat(value);
    const derived = Number.isFinite(d) && d > 0 ? ratesForDaily(d) : null;
    setDraft((prev) => {
      if (!prev) return prev;
      const wasDerived = isDerived(prev[s]);
      return {
        ...prev,
        [s]: {
          daily: value,
          weekly: derived && wasDerived ? String(derived.weekly) : prev[s].weekly,
          monthly: derived && wasDerived ? String(derived.monthly) : prev[s].monthly,
        },
      };
    });
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Season pricing</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Live on the site now: <b>{SEASON_LABEL[active]}</b> · ${presets[active].daily}/day
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        Switching seasons changes the price shown on the website and used for new
        bookings. Existing reservations keep the rate they were booked at.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
        {SEASONS.map((s) => {
          const isActive = s === active;
          const d = draft[s];
          const daily = parseFloat(d.daily);
          const weekly = parseFloat(d.weekly);
          const monthly = parseFloat(d.monthly);
          return (
            <div
              key={s}
              style={{
                padding: 14,
                borderRadius: 12,
                border: `1px solid ${isActive ? "var(--ink)" : "var(--line)"}`,
                background: isActive ? "#f8fafc" : "#fff",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{SEASON_LABEL[s]}</div>
                {isActive ? (
                  <span style={{ padding: "2px 8px", borderRadius: 999, background: "#d1fae5", color: "#065f46", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Active
                  </span>
                ) : (
                  <button
                    style={btnGhost}
                    disabled={busy !== ""}
                    onClick={() => run(`switch-${s}`, () => switchSeason({ adminToken, season: s }))}
                  >
                    {busy === `switch-${s}` ? "Switching…" : "Make active"}
                  </button>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                <Field label="Per day">
                  <input type="number" inputMode="decimal" value={d.daily} style={inputStyle}
                    onChange={(e) => onDaily(s, e.target.value)} />
                </Field>
                <Field label="Per week">
                  <input type="number" inputMode="decimal" value={d.weekly} style={inputStyle}
                    onChange={(e) => setDraft((p) => p && ({ ...p, [s]: { ...p[s], weekly: e.target.value } }))} />
                </Field>
                <Field label="Per month">
                  <input type="number" inputMode="decimal" value={d.monthly} style={inputStyle}
                    onChange={(e) => setDraft((p) => p && ({ ...p, [s]: { ...p[s], monthly: e.target.value } }))} />
                </Field>
              </div>

              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                Week: {pctOff(weekly / 7, daily)} off · ${fmtRate(weekly / 7)}/day<br />
                Month: {pctOff(monthly / 30, daily)} off · ${fmtRate(monthly / 30)}/day
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  style={btnGhost}
                  onClick={() => {
                    const base = parseFloat(d.daily);
                    if (!Number.isFinite(base) || base <= 0) return;
                    const r = ratesForDaily(base);
                    setDraft((p) => p && ({ ...p, [s]: strRates(r) }));
                  }}
                >
                  Reset discounts
                </button>
                <button
                  style={btnPrimary}
                  disabled={busy !== "" || !(daily > 0)}
                  onClick={() => run(`save-${s}`, () => saveRates({
                    adminToken,
                    season: s,
                    daily,
                    weekly: Number.isFinite(weekly) ? weekly : undefined,
                    monthly: Number.isFinite(monthly) ? monthly : undefined,
                  }))}
                >
                  {busy === `save-${s}` ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {err && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 10 }}>{err}</div>}
    </div>
  );
}

const strRates = (r: { daily: number; weekly: number; monthly: number }) => ({
  daily: String(r.daily), weekly: String(r.weekly), monthly: String(r.monthly),
});

// True when weekly/monthly still match what the daily rate implies — i.e. the
// operator hasn't hand-tuned them, so we may keep re-deriving as they type.
function isDerived(d: { daily: string; weekly: string; monthly: string }): boolean {
  const base = parseFloat(d.daily);
  if (!Number.isFinite(base) || base <= 0) return true;
  const r = ratesForDaily(base);
  return parseFloat(d.weekly) === r.weekly && parseFloat(d.monthly) === r.monthly;
}

const fmtRate = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "—");

function pctOff(perDay: number, daily: number): string {
  if (!Number.isFinite(perDay) || !Number.isFinite(daily) || daily <= 0) return "—";
  return `${Math.round((1 - perDay / daily) * 100)}%`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}
