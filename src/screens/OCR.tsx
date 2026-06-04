import React from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ReservationDraft } from "../hooks/useReservationDraft";
import { StepHeader, ProgressBar, PrimaryButton, Field } from "../components/Common";
import { ExpiryField } from "../components/ExpiryField";
import { CountrySelect } from "../components/CountrySelect";
import { IconCheck, IconUpload, IconRefresh } from "../components/Icons";
import { recognizeDocument } from "../lib/ocrEngine";
import { useI18n } from "../i18n/I18nContext";

type Phase = "idle" | "scanning" | "manual" | "done";

const uploadCard: React.CSSProperties = {
  width: "100%", border: "1.5px dashed #d8d8d8", borderRadius: 16,
  background: "#fff", padding: "32px 16px", display: "flex", flexDirection: "column",
  alignItems: "center", gap: 10, cursor: "pointer",
};

export function OCRScreen({
  state, set, onBack, onNext,
}: {
  state: ReservationDraft;
  set: (p: Partial<ReservationDraft>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = React.useState<Phase>(state.docFirstName ? "done" : "idle");
  const [progress, setProgress] = React.useState(0);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhase("scanning");
    setProgress(0);

    try {
      // Run OCR client-side. Upload to Convex storage in parallel for audit.
      const uploadPromise = (async () => {
        const url = await generateUploadUrl({});
        const res = await fetch(url, { method: "POST", body: f });
        if (!res.ok) return null;
        const { storageId } = (await res.json()) as { storageId: string };
        return storageId;
      })();

      // Two-pass on-device pipeline (preprocess → OCR-B MRZ pass → eng visual
      // pass → parse). See src/lib/ocrEngine.ts.
      const { text, parsed } = await recognizeDocument(f, setProgress);
      const storageId = await uploadPromise;

      if (!parsed.firstName && !parsed.docNumber && !parsed.expiryISO) {
        // OCR didn't find anything useful — let the user fill fields manually.
        set({ docImageStorageId: storageId, docOcrRawJson: JSON.stringify({ text }) });
        setPhase("manual");
        return;
      }

      set({
        docFirstName: parsed.firstName,
        docLastName: parsed.lastName,
        docNumber: parsed.docNumber,
        docExpiry: parsed.expiryISO,
        docCountry: parsed.country,
        docImageStorageId: storageId,
        docOcrRawJson: JSON.stringify({ text, parsed }),
      });
      setPhase("done");
    } catch (err) {
      console.error("OCR failed", err);
      setPhase("manual");
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>
      <StepHeader onBack={onBack} title={t("ocr.title")} step={3} total={7} />
      <ProgressBar step={3} total={7} />
      <div className="phone-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 16px 100px" }}>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5, margin: "8px 0 16px" }}>
          {t("ocr.intro")}
        </p>

        {phase === "idle" && (
          <button onClick={() => fileRef.current?.click()} style={uploadCard}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--line)" }}>
              <IconUpload size={26} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{t("ocr.uploadCta")}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{t("ocr.uploadHint")}</div>
          </button>
        )}

        {phase === "scanning" && (
          <div style={{ ...uploadCard, cursor: "default", borderStyle: "solid" }}>
            <div style={{ position: "relative", width: 220, height: 140, background: "#0a0a0a", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, transparent 0 8px, rgba(255,255,255,0.04) 8px 9px)" }} />
              <div style={{
                position: "absolute", left: 0, right: 0, height: 2, background: "var(--accent)",
                boxShadow: "0 0 12px var(--accent)",
                animation: "scan 1.6s ease-in-out infinite",
              }} />
              <div style={{ position: "absolute", top: 8, left: 8, color: "#fff", fontSize: 10, fontFamily: "JetBrains Mono, monospace", opacity: 0.7 }}>
                {t("ocr.scanning")} {progress}%
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t("ocr.reading")}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{t("ocr.readingHint")}</div>
            <style>{`@keyframes scan { 0% { top: 4%; } 50% { top: 92%; } 100% { top: 4%; } }`}</style>
          </div>
        )}

        {phase === "manual" && (
          <div>
            <div style={{ padding: 12, background: "#fff8f1", border: "1px solid #f5c89e", borderRadius: 12, marginBottom: 14, fontSize: 12.5, color: "#9a4a07" }}>
              {t("ocr.manualHint")}
            </div>
            <Field label={t("ocr.firstName")} value={state.docFirstName} onChange={(v) => set({ docFirstName: v })} />
            <Field label={t("ocr.lastName")} value={state.docLastName} onChange={(v) => set({ docLastName: v })} />
            <Field label={t("ocr.docNumber")} value={state.docNumber} onChange={(v) => set({ docNumber: v })} mono />
            <ExpiryField iso={state.docExpiry} onIsoChange={(v) => set({ docExpiry: v })} />
            <CountrySelect value={state.docCountry} onChange={(v) => set({ docCountry: v })} />
          </div>
        )}

        {phase === "done" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#16a34a", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
              <IconCheck size={18} color="#16a34a" /> {t("ocr.extracted")}
            </div>
            <Field label={t("ocr.firstName")} value={state.docFirstName} onChange={(v) => set({ docFirstName: v })} />
            <Field label={t("ocr.lastName")} value={state.docLastName} onChange={(v) => set({ docLastName: v })} />
            <Field label={t("ocr.docNumber")} value={state.docNumber} onChange={(v) => set({ docNumber: v })} mono />
            <ExpiryField iso={state.docExpiry} onIsoChange={(v) => set({ docExpiry: v })} />
            <CountrySelect value={state.docCountry} onChange={(v) => set({ docCountry: v })} />
            <button
              onClick={() => {
                setPhase("idle");
                set({ docFirstName: "", docLastName: "", docNumber: "", docExpiry: "", docCountry: "" });
              }}
              style={{
                marginTop: 4, background: "transparent", border: "none", color: "var(--muted)",
                fontSize: 12, padding: 6, display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              <IconRefresh size={13} /> {t("ocr.rescan")}
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
      </div>
      <div style={{ padding: 16, borderTop: "1px solid var(--line)", background: "#fff" }}>
        <PrimaryButton
          disabled={
            !state.docFirstName.trim() ||
            !state.docLastName.trim() ||
            !state.docNumber.trim() ||
            !state.docExpiry.trim() ||
            !state.docCountry.trim()
          }
          onClick={onNext}
        >
          {t("common.continue")}
        </PrimaryButton>
      </div>
    </div>
  );
}
