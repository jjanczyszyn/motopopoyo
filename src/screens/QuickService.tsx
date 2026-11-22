import React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { commissionUSD } from "../../convex/lib/services";
import { errorText } from "../lib/convexError";
import { track } from "../lib/telemetry";
import { parseMoney, spanishError } from "../lib/quickText";
import { MoneyField, addDays, bigBtn, chip, field, label, linkBtn, nice, page, wrap } from "./quickUi";

// /new → "Servicio": log a service we earn commission on. What it was, what
// the customer paid, what it cost us; the commission works itself out.

const COMMON = ["Masaje", "Pedicure", "Manicure", "Pelo", "Niñera", "Transporte"];
const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

export function QuickServiceForm({
  token, who, today, onLogout, top,
}: { token: string; who: string; today: string; onLogout: () => void; top: React.ReactNode }) {
  const [name, setName] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [price, setPrice] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [client, setClient] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editId, setEditId] = React.useState<Id<"serviceSales"> | null>(null);
  const [saved, setSaved] = React.useState<null | {
    serviceName: string; date: string; priceUSD: number; costUSD: number; commissionUSD: number;
    kind: "new" | "edit" | "deleted";
  }>(null);

  const mine = useQuery(api.services.mine, { adminToken: token });
  const create = useMutation(api.services.create);
  const update = useMutation(api.services.update);
  const remove = useMutation(api.services.remove);

  // Names she has used before come first, then the common ones.
  const used = mine?.names ?? [];
  const names = [...used, ...COMMON.filter((c) => !used.some((u) => u.toLowerCase() === c.toLowerCase()))].slice(0, 8);

  const priceNum = parseMoney(price);
  const costNum = parseMoney(cost);
  const commission = priceNum !== null && costNum !== null ? commissionUSD(priceNum, costNum) : null;
  const swapped = commission !== null && commission < 0;
  const canSave = !!name.trim() && !!priceNum && commission !== null && !swapped && date <= today && !saving;

  const reset = () => {
    setSaved(null); setEditId(null); setName(""); setDate(today); setPrice(""); setCost("");
    setClient(""); setError(null);
  };

  const run = async (kind: "new" | "edit" | "deleted") => {
    setSaving(true); setError(null);
    try {
      let r;
      if (kind === "deleted") {
        r = await remove({ adminToken: token, id: editId! });
      } else {
        const input = {
          adminToken: token, serviceName: name, date, priceUSD: priceNum!, costUSD: costNum!,
          clientName: client.trim() || undefined,
        };
        r = editId ? await update({ ...input, id: editId }) : await create(input);
      }
      track("action", `quick:service_${kind === "new" ? "saved" : kind === "edit" ? "edited" : "deleted"}`);
      setSaved({ ...r, kind });
    } catch (e) {
      const raw = errorText(e);
      track("error", "quick:service_failed", { detail: raw });
      setError(spanishError(raw));
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    const gone = saved.kind === "deleted";
    return (
      <div style={page} lang="es">
        <div style={{ ...wrap, textAlign: "center", paddingTop: 60 }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%", background: gone ? "#6b7280" : "#16a34a", color: "#fff",
            fontSize: 38, display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>{gone ? "🗑️" : "✓"}</div>
          <h1 style={{ fontSize: 24, margin: "16px 0 6px" }}>
            {gone ? "Borrado" : saved.kind === "edit" ? "Cambiado" : "Guardado"}
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0 }}><b>{saved.serviceName}</b> · {nice(saved.date)}</p>
          <p style={{ fontSize: 15, color: "var(--muted)", margin: "4px 0 0" }}>
            {usd(saved.priceUSD)} − {usd(saved.costUSD)}
          </p>
          {!gone && (
            <p style={{ fontSize: 20, fontWeight: 800, color: "#166534", margin: "8px 0 0" }}>
              Comisión {usd(saved.commissionUSD)}
            </p>
          )}
          <button onClick={reset} style={{ ...bigBtn, marginTop: 28 }}>+ Otro servicio</button>
        </div>
      </div>
    );
  }

  return (
    <div style={page} lang="es">
      <div style={wrap} id="quick-top">
        {!editId && top}
        <h1 style={{ fontSize: 26, margin: "4px 0 2px" }}>{editId ? "✏️ Cambiar servicio" : "💆 Nuevo servicio"}</h1>
        <div style={{ fontSize: 14, color: "var(--muted)" }}>
          Hola {who} 👋 · <button onClick={onLogout} style={linkBtn}>Salir</button>
        </div>

        <div style={label}>✨ ¿Qué servicio fue?</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {names.map((n) => (
            <button key={n} data-testid="service-name" aria-pressed={name.trim().toLowerCase() === n.toLowerCase()}
              style={{ ...chip(name.trim().toLowerCase() === n.toLowerCase()), maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              onClick={() => setName(n)}>{n}</button>
          ))}
        </div>
        <input
          placeholder="Otro: escribe aquí" aria-label="Nombre del servicio" value={name} maxLength={60}
          onChange={(e) => setName(e.target.value)} autoComplete="off" style={field}
        />

        <div style={label}>📅 ¿Qué día fue?</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button style={chip(date === today)} onClick={() => setDate(today)}>Hoy</button>
          <button style={chip(date === addDays(today, -1))} onClick={() => setDate(addDays(today, -1))}>Ayer</button>
          <input
            type="date" aria-label="Día del servicio" value={date} max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            style={{ ...field, width: "auto", flex: "1 1 150px", minHeight: 48 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={label}>💵 Cliente pagó</div>
            <MoneyField ariaLabel="Cuánto pagó el cliente" value={price} onChange={setPrice} />
          </div>
          <div>
            <div style={label}>🧾 Costo</div>
            <MoneyField ariaLabel="Cuánto costó el servicio" value={cost} onChange={setCost} />
          </div>
        </div>
        <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6 }}>
          En dólares. Costo = lo que se paga a quien lo hizo.
        </div>

        <div data-testid="service-commission" style={{
          marginTop: 14, padding: "14px 16px", borderRadius: 14, display: "flex",
          justifyContent: "space-between", alignItems: "center", gap: 10,
          background: swapped ? "#fef2f2" : "#f0fdf4", color: swapped ? "#991b1b" : "#166534",
        }}>
          {swapped ? (
            <span style={{ fontSize: 15 }}>El costo es más que lo que pagó el cliente. Revisa los números.</span>
          ) : (
            <>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Comisión</span>
              <span style={{ fontSize: 26, fontWeight: 800 }}>{commission === null ? "—" : usd(commission)}</span>
            </>
          )}
        </div>

        <div style={label}>Si quieres (no es necesario)</div>
        <input
          placeholder="Nombre del cliente" aria-label="Nombre del cliente" value={client} maxLength={80}
          onChange={(e) => setClient(e.target.value)} autoComplete="off" style={field}
        />

        {error && (
          <div role="alert" style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#fef2f2", color: "#991b1b", fontSize: 15 }}>
            {error}
          </div>
        )}

        {editId && (
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={reset} style={{ ...field, flex: 1, fontWeight: 600 }}>↩️ No cambiar</button>
            <button
              onClick={() => { if (window.confirm("¿Borrar este servicio?")) void run("deleted"); }}
              disabled={saving} style={{ ...field, flex: 1, fontWeight: 600, color: "#b91c1c", borderColor: "#fecaca" }}
            >🗑️ Borrar</button>
          </div>
        )}

        {!editId && mine && mine.rows.length > 0 && (
          <div data-testid="service-mine">
            <div style={label}>✏️ Tus servicios · puedes cambiarlos 24 horas</div>
            {mine.rows.map((m) => (
              <div key={m._id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: 12, marginBottom: 8,
                background: "#fff", border: "1px solid var(--line)", borderRadius: 14,
              }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 1.35 }}>
                  <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.serviceName}</div>
                  <div>{nice(m.date)} · {usd(m.priceUSD)} − {usd(m.costUSD)} = <b>{usd(m.commissionUSD)}</b></div>
                  {m.clientName && <div style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.clientName}</div>}
                </div>
                <button
                  onClick={() => {
                    setEditId(m._id); setName(m.serviceName); setDate(m.date); setPrice(String(m.priceUSD));
                    setCost(String(m.costUSD)); setClient(m.clientName); setError(null);
                    document.getElementById("quick-top")?.scrollIntoView();
                  }}
                  style={{ ...chip(false), flex: "0 0 auto" }}
                >Cambiar</button>
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
          <button onClick={() => void run(editId ? "edit" : "new")} disabled={!canSave} style={{ ...bigBtn, opacity: canSave ? 1 : 0.4 }}>
            {saving ? "Guardando…"
              : !name.trim() ? "Elige el servicio 👆"
              : !priceNum || costNum === null ? "Pon los precios 👆"
              : swapped ? "Revisa los números 👆"
              : `✅ ${editId ? "Guardar cambios" : "Guardar"} · comisión ${usd(commission ?? 0)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
