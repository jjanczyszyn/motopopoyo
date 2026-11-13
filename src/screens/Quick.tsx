import React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { errorText } from "../lib/convexError";
import { track } from "../lib/telemetry";
import { spanishError } from "../lib/quickText";
import { LoginGate, useAdminAuth } from "./Admin";

// /new — the partner's one-screen "log a rental" page, behind the same
// owner login as /admin (same session, so signing in on one signs in both).
// Pick a bike, pick the days, check the price, save. Nothing else.

const DAY_CHIPS = [1, 2, 3, 5, 7, 14, 30];

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nice(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-NI", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

const page: React.CSSProperties = {
  height: "100%", overflowY: "auto", overflowX: "hidden", background: "#fafafa",
  WebkitOverflowScrolling: "touch",
};
const wrap: React.CSSProperties = { maxWidth: 480, margin: "0 auto", padding: "16px 16px 120px" };
const label: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase",
  letterSpacing: 0.6, margin: "22px 0 10px",
};
const chip = (on: boolean): React.CSSProperties => ({
  minHeight: 48, minWidth: 48, padding: "0 16px", borderRadius: 999, fontSize: 16, fontWeight: 600,
  border: on ? "2px solid var(--ink)" : "1px solid var(--line)",
  background: on ? "var(--ink)" : "#fff", color: on ? "#fff" : "var(--ink)",
});
const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", minHeight: 52, padding: "0 14px", fontSize: 17,
  borderRadius: 14, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)",
};

export function QuickScreen() {
  const { authed, token, tryPassword, logout } = useAdminAuth();
  const me = useQuery(api.quick.me, authed && token ? { adminToken: token } : "skip");

  if (!authed || !token) {
    return <div className="admin-root" style={page}><LoginGate onSubmit={tryPassword} lang="es" /></div>;
  }
  if (me === undefined) return <div style={page}><div style={wrap}><p>Cargando…</p></div></div>;
  return <QuickForm token={token} who={me.who} today={me.today} onLogout={logout} />;
}

function QuickForm({ token, who, today, onLogout }: { token: string; who: string; today: string; onLogout: () => void }) {
  const [start, setStart] = React.useState(today);
  const [days, setDays] = React.useState(1);
  const [bikeId, setBikeId] = React.useState<Id<"bikes"> | null>(null);
  const [price, setPrice] = React.useState("");
  const [priceTouched, setPriceTouched] = React.useState(false);
  const [name, setName] = React.useState("");
  // On by default: most rentals are paid in cash at handover (owner's call,
  // 2026-11-13). Karen unticks it when someone hasn't paid yet.
  const [paid, setPaid] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<null | {
    code: string; bikeName: string; startDate: string; endDate: string; days: number; totalUSD: number;
    kind: "new" | "edit" | "deleted";
  }>(null);
  // Set while changing one of her own recent rentals (see "Tus motos").
  const [editId, setEditId] = React.useState<Id<"reservations"> | null>(null);
  const mine = useQuery(api.quick.mine, { adminToken: token });
  const update = useMutation(api.quick.update);
  const remove = useMutation(api.quick.remove);

  // Keep showing the last answer while new dates load, so the bike list
  // doesn't blank out (and shift the page) on every tap.
  const fresh = useQuery(api.quick.options, { adminToken: token, startDate: start, days, excludeId: editId ?? undefined });
  const last = React.useRef(fresh);
  if (fresh !== undefined) last.current = fresh;
  const opts = fresh ?? last.current;
  const loading = fresh === undefined;
  const create = useMutation(api.quick.create);
  const endDate = addDays(start, days);
  const isPast = endDate <= today;
  const listPrice = opts?.listPriceUSD;

  // Follow the list price until she types her own.
  React.useEffect(() => {
    if (!priceTouched && listPrice !== undefined) setPrice(String(listPrice));
  }, [listPrice, priceTouched]);

  // Drop the selected bike if it's taken for the new dates.
  React.useEffect(() => {
    if (!bikeId || !opts || loading || isPast) return;
    const b = opts.bikes.find((x) => x._id === bikeId);
    if (b && !b.free) setBikeId(null);
  }, [opts, bikeId, isPast, loading]);

  const priceNum = Number(price.replace(",", "."));
  const canSave = !loading && !!bikeId && days >= 1 && price.trim() !== "" && Number.isFinite(priceNum) && priceNum >= 0 && !saving;

  const reset = () => {
    setSaved(null); setEditId(null); setBikeId(null); setDays(1); setStart(today);
    setPriceTouched(false); setName(""); setPaid(true); setError(null);
  };

  const save = async () => {
    if (!canSave || !bikeId) return;
    setSaving(true); setError(null);
    try {
      const input = { adminToken: token, bikeId, startDate: start, days, priceUSD: priceNum, name: name.trim() || undefined, paid };
      if (editId) {
        const r = await update({ ...input, id: editId });
        track("action", "quick:edited", { bookingCode: r.code });
        setSaved({ ...r, kind: "edit" });
      } else {
        const r = await create(input);
        track("action", "quick:saved", { bookingCode: r.code });
        setSaved({ ...r, kind: "new" });
      }
    } catch (e) {
      const raw = errorText(e);
      track("error", "quick:save_failed", { detail: raw });
      setError(spanishError(raw));
    } finally {
      setSaving(false);
    }
  };

  type Mine = NonNullable<typeof mine>[number];
  const startEdit = (m: Mine) => {
    setEditId(m._id); setStart(m.startDate); setDays(m.days); setBikeId(m.bikeId);
    setPrice(String(m.totalUSD)); setPriceTouched(true); setName(m.name); setPaid(m.paid);
    setError(null);
    track("action", "quick:edit_open", { bookingCode: m.code });
    document.getElementById("quick-top")?.scrollIntoView();
  };

  const del = async () => {
    if (!editId) return;
    const m = mine?.find((x) => x._id === editId);
    if (!window.confirm("¿Borrar esta moto alquilada?")) return;
    setSaving(true); setError(null);
    try {
      const r = await remove({ adminToken: token, id: editId });
      track("action", "quick:deleted", { bookingCode: r.code });
      setSaved({
        code: r.code, bikeName: m ? m.bikeName : "", startDate: start, endDate, days,
        totalUSD: priceNum, kind: "deleted",
      });
    } catch (e) {
      const raw = errorText(e);
      track("error", "quick:delete_failed", { detail: raw });
      setError(spanishError(raw));
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div style={page}>
        <div style={{ ...wrap, textAlign: "center", paddingTop: 60 }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%", background: saved.kind === "deleted" ? "#6b7280" : "#16a34a", color: "#fff",
            fontSize: 38, display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>{saved.kind === "deleted" ? "🗑️" : "✓"}</div>
          <h1 style={{ fontSize: 24, margin: "16px 0 6px" }}>
            {saved.kind === "deleted" ? "Borrado" : saved.kind === "edit" ? "Cambiado" : "Guardado"}
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0 }}>
            <b>{saved.bikeName}</b> · {saved.days} {saved.days === 1 ? "día" : "días"} · <b>${saved.totalUSD}</b>
          </p>
          <p style={{ fontSize: 15, color: "var(--muted)", margin: "4px 0 0" }}>
            {nice(saved.startDate)} → vuelve {nice(saved.endDate)}
          </p>
          <p style={{ fontSize: 13, color: "var(--muted)", fontFamily: "JetBrains Mono, monospace" }}>{saved.code}</p>
          <button onClick={reset} style={{ ...bigBtn, marginTop: 28 }}>+ Otra moto</button>
        </div>
      </div>
    );
  }

  return (
    <div style={page} lang="es">
      <div style={wrap} id="quick-top">
        <h1 style={{ fontSize: 26, margin: "4px 0 2px" }}>{editId ? "✏️ Cambiar moto alquilada" : "🛵 Nueva moto alquilada"}</h1>
        <div style={{ fontSize: 14, color: "var(--muted)" }}>
          Hola {who} 👋 · <button onClick={onLogout} style={linkBtn}>Salir</button>
        </div>

        <div style={label}>📅 ¿Qué día empieza?</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button style={chip(start === today)} onClick={() => setStart(today)}>Hoy</button>
          <button style={chip(start === addDays(today, 1))} onClick={() => setStart(addDays(today, 1))}>Mañana</button>
          <input
            type="date" aria-label="Día que empieza" value={start}
            onChange={(e) => e.target.value && setStart(e.target.value)}
            style={{ ...field, width: "auto", flex: "1 1 150px", minHeight: 48 }}
          />
        </div>

        <div style={label}>🔢 ¿Cuántos días?</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <button aria-label="Un día menos" style={{ ...chip(false), fontSize: 24, width: 56 }} onClick={() => setDays((d) => Math.max(1, d - 1))}>−</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div data-testid="quick-days" style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{days}</div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>
              {nice(start)} → vuelve {nice(endDate)}
            </div>
          </div>
          <button aria-label="Un día más" style={{ ...chip(false), fontSize: 24, width: 56 }} onClick={() => setDays((d) => Math.min(120, d + 1))}>+</button>
        </div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {DAY_CHIPS.map((n) => (
            <button key={n} style={{ ...chip(days === n), flex: "0 0 auto" }} onClick={() => setDays(n)}>{n}</button>
          ))}
        </div>

        <div style={label}>🛵 ¿Qué moto?</div>
        {!opts ? (
          <p style={{ color: "var(--muted)" }}>Cargando motos…</p>
        ) : (
          <div data-testid="quick-bikes" data-loading={loading ? "true" : "false"} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {opts.bikes.map((b) => {
              const usable = b.free || isPast;
              const on = bikeId === b._id;
              return (
                <button
                  key={b._id}
                  data-testid="quick-bike"
                  disabled={!usable}
                  onClick={() => setBikeId(b._id)}
                  aria-pressed={on}
                  style={{
                    minHeight: 72, padding: 12, borderRadius: 16, textAlign: "left",
                    border: on ? "2px solid var(--ink)" : "1px solid var(--line)",
                    background: on ? "#f4f4f4" : "#fff", opacity: usable ? 1 : 0.4,
                    display: "flex", alignItems: "center", gap: 10, color: "var(--ink)",
                  }}
                >
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: b.color, border: "1px solid rgba(0,0,0,.15)", flex: "0 0 auto" }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
                    <span style={{ display: "block", fontSize: 13, color: usable ? "var(--muted)" : "#b91c1c" }}>
                      {usable ? (on ? "Esta ✓" : b.plate || b.type) : "Ocupada"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div style={label}>💵 ¿Cuánto paga? (dólares)</div>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 22, fontWeight: 700 }}>$</span>
          <input
            inputMode="decimal" aria-label="Precio en dólares" value={price}
            onChange={(e) => { setPrice(e.target.value); setPriceTouched(true); }}
            style={{ ...field, paddingLeft: 36, fontSize: 24, fontWeight: 700, minHeight: 60 }}
          />
        </div>
        <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6 }}>
          {listPrice !== undefined && (
            priceTouched && priceNum !== listPrice
              ? <>Normal: ${listPrice} <button onClick={() => setPriceTouched(false)} style={linkBtn}>poner normal</button></>
              : <>Precio normal. Puedes cambiarlo.</>
          )}
        </div>

        <div style={label}>Si quieres (no es necesario)</div>
        <input
          placeholder="Nombre del cliente" aria-label="Nombre del cliente" value={name}
          onChange={(e) => setName(e.target.value)} autoComplete="off" style={field}
        />
        <button
          onClick={() => setPaid((p) => !p)} aria-pressed={paid} data-testid="quick-paid"
          style={{
            ...field, marginTop: 10, display: "flex", alignItems: "center", gap: 12, textAlign: "left",
            border: paid ? "2px solid #16a34a" : field.border,
          }}
        >
          <span style={{
            width: 26, height: 26, borderRadius: 8, flex: "0 0 auto",
            border: paid ? "none" : "2px solid var(--line)", background: paid ? "#16a34a" : "#fff",
            color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>{paid ? "✓" : ""}</span>
          <span>💵 Ya me pagó</span>
        </button>

        {error && (
          <div role="alert" style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#fef2f2", color: "#991b1b", fontSize: 15 }}>
            {error}
          </div>
        )}

        {editId && (
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={reset} style={{ ...field, flex: 1, fontWeight: 600 }}>↩️ No cambiar</button>
            <button onClick={del} disabled={saving} style={{ ...field, flex: 1, fontWeight: 600, color: "#b91c1c", borderColor: "#fecaca" }}>🗑️ Borrar</button>
          </div>
        )}

        {!editId && mine && mine.length > 0 && (
          <div data-testid="quick-mine">
            <div style={label}>✏️ Tus motos · puedes cambiarlas 24 horas</div>
            {mine.map((m) => (
              <div key={m._id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: 12, marginBottom: 8,
                background: "#fff", border: "1px solid var(--line)", borderRadius: 14,
              }}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", background: m.bikeColor, border: "1px solid rgba(0,0,0,.15)", flex: "0 0 auto" }} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 1.35 }}>
                  <div style={{ fontWeight: 700 }}>{m.bikeName} <span style={{ fontWeight: 400, color: "var(--muted)" }}>{m.bikePlate}</span></div>
                  <div>{nice(m.startDate)} → {nice(m.endDate)} · <b>${m.totalUSD}</b> {m.paid ? "· 💵 pagado" : "· no pagado"}</div>
                  {m.name && <div style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>}
                </div>
                <button onClick={() => startEdit(m)} style={{ ...chip(false), flex: "0 0 auto" }}>Cambiar</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
        background: "rgba(255,255,255,.96)", borderTop: "1px solid var(--line)",
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <button onClick={save} disabled={!canSave} style={{ ...bigBtn, opacity: canSave ? 1 : 0.4 }}>
            {saving ? "Guardando…" : !bikeId ? "Toca una moto 👆" : `✅ ${editId ? "Guardar cambios" : "Guardar"} · $${Number.isFinite(priceNum) ? priceNum : 0}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const bigBtn: React.CSSProperties = {
  width: "100%", minHeight: 58, borderRadius: 16, border: "none", fontSize: 18, fontWeight: 700,
  background: "var(--accent)", color: "var(--accent-ink)",
};
const linkBtn: React.CSSProperties = {
  border: "none", background: "none", padding: "0 4px", color: "var(--ink)", textDecoration: "underline", fontSize: 14,
};
