import React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { useReservationDraft, toISODate } from "./hooks/useReservationDraft";
import { HomeScreen } from "./screens/Home";
import { CalendarScreen } from "./screens/Calendar";
import { BikePickScreen } from "./screens/BikePick";
import { OCRScreen } from "./screens/OCR";
import { PhoneScreen } from "./screens/Phone";
import { PaymentScreen } from "./screens/Payment";
import { ContractScreen } from "./screens/Contract";
import { DeliveryScreen } from "./screens/Delivery";
import { DoneScreen } from "./screens/Done";
import { AdminScreen } from "./screens/Admin";
import { QuickScreen } from "./screens/Quick";
import { useI18n } from "./i18n/I18nContext";
import { errorText } from "./lib/convexError";
import { track } from "./lib/telemetry";

type Screen = "home" | "calendar" | "bike" | "ocr" | "phone" | "pay" | "contract" | "delivery" | "done";
const SCREENS: Screen[] = ["home", "calendar", "bike", "ocr", "phone", "pay", "contract", "delivery", "done"];


export default function App() {
  // Tiny client-side router. /admin is a real path now (not a hash) — works
  // on Pages because the build also emits dist/admin/index.html as a copy of
  // the SPA entry, so a request to /admin lands here too.
  const [path, setPath] = React.useState<string>(() => window.location.pathname);
  React.useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Also support the legacy hash URL so existing bookmarks keep working.
  const isAdmin =
    /\/admin\/?$/.test(path) || window.location.hash === "#/admin";
  if (isAdmin) return <AdminScreen />;
  // Partner quick-add page: /new#t=<secret>.
  if (/\/new\/?$/.test(path)) return <QuickScreen />;
  return <RentalFlow />;
}

function RentalFlow() {
  const { state, set, reset } = useReservationDraft();
  const config = useQuery(api.config.get);
  const rates = {
    daily: config?.dailyRate ?? 20,
    weekly: config?.weeklyRate ?? 120,
    monthly: config?.monthlyRate ?? 450,
  };

  const [screen, setScreen] = React.useState<Screen>("home");
  const [submitting, setSubmitting] = React.useState(false);
  const [doneCode, setDoneCode] = React.useState<string | null>(null);

  const createReservation = useMutation(api.reservations.create);
  const { t } = useI18n();
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);

  const go = (s: Screen) => setScreen(s);
  // One "step" event per screen the renter reaches: this is the booking funnel.
  React.useEffect(() => {
    if (window.location.pathname.startsWith("/admin")) return;
    track("step", `screen:${screen}`);
  }, [screen]);
  const next = () => {
    const i = SCREENS.indexOf(screen);
    if (i < SCREENS.length - 1) go(SCREENS[i + 1]);
  };
  const back = () => {
    const i = SCREENS.indexOf(screen);
    if (i > 0) go(SCREENS[i - 1]);
  };

  const handleHome = () => {
    reset();
    setDoneCode(null);
    go("home");
  };

  const handleConfirm = async () => {
    if (!state.startDate || !state.endDate || !state.bikeId) return;
    setSubmitting(true);
    try {
      // Upload signature canvas to Convex storage if drawn.
      let signaturePngId: Id<"_storage"> | undefined;
      if (state.signature?.mode === "draw") {
        const canvas = (window as unknown as { __sigCanvas?: HTMLCanvasElement }).__sigCanvas;
        if (canvas) {
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), "image/png")
          );
          if (blob) {
            const url = await generateUploadUrl({});
            const res = await fetch(url, { method: "POST", body: blob });
            if (res.ok) {
              const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
              signaturePngId = storageId;
            }
          }
        }
      }

      const result = await createReservation({
        input: {
          bikeId: state.bikeId as Id<"bikes">,
          startDate: toISODate(state.startDate),
          endDate: toISODate(state.endDate),

          docFirstName: state.docFirstName,
          docLastName: state.docLastName,
          docNumber: state.docNumber,
          docExpiry: state.docExpiry,
          docCountry: state.docCountry,
          docImageId: state.docImageStorageId
            ? (state.docImageStorageId as Id<"_storage">)
            : undefined,
          docOcrRawJson: state.docOcrRawJson ?? undefined,

          phoneCC: state.phoneCC,
          phoneNum: state.phoneNum,
          phoneNote: state.phoneNote,

          payMethod: state.payMethod ?? "cash",

          signatureMode: state.signature?.mode ?? "type",
          signaturePng: signaturePngId,
          signatureTyped: state.signature?.typed,

          deliveryAddr: state.deliveryAddr,
          deliveryHour: state.deliveryHour ?? 10,
          deliveryDate: toISODate(state.startDate),
        },
      });
      setDoneCode(result.code);
      track("action", "booking_created", {
        bookingCode: result.code,
        detail: `${result.days} days, $${result.totalUSD}, ${state.payMethod ?? "cash"}`,
      });
      go("done");
    } catch (err) {
      console.error("createReservation failed", err);
      track("action", "booking_failed", {
        detail: errorText(err).includes("BIKE_UNAVAILABLE") ? "bike taken" : "error",
      });
      if (errorText(err).includes("BIKE_UNAVAILABLE")) {
        // Someone else booked this bike while the renter was filling in the
        // form: send them back to pick dates or another bike.
        alert(t("error.bikeTaken"));
        go("calendar");
      } else {
        alert(t("error.generic"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  let content: React.ReactNode;
  switch (screen) {
    case "home":
      content = <HomeScreen onStart={() => go("calendar")} />;
      break;
    case "calendar":
      content = <CalendarScreen state={state} set={set} onBack={() => go("home")} onNext={next} rates={rates} />;
      break;
    case "bike":
      content = <BikePickScreen state={state} set={set} onBack={back} onNext={next} rates={rates} />;
      break;
    case "ocr":
      content = <OCRScreen state={state} set={set} onBack={back} onNext={next} />;
      break;
    case "phone":
      content = <PhoneScreen state={state} set={set} onBack={back} onNext={next} />;
      break;
    case "pay":
      content = <PaymentScreen state={state} set={set} onBack={back} onNext={next} />;
      break;
    case "contract":
      content = <ContractScreen state={state} set={set} onBack={back} onNext={next} />;
      break;
    case "delivery":
      content = (
        <DeliveryScreen
          state={state}
          set={set}
          onBack={back}
          onConfirm={handleConfirm}
          submitting={submitting}
        />
      );
      break;
    case "done":
      content = doneCode ? <DoneScreen code={doneCode} onHome={handleHome} /> : null;
      break;
  }

  const isMobile = useIsMobile();

  // Mobile: edge-to-edge, no max-width — phone-shaped UX with horizontally
  // scrollable carousels for bikes and reviews.
  if (isMobile) {
    return (
      <div style={{
        width: "100%",
        height: "100dvh",
        background: "#fff",
        position: "relative",
        overflow: "hidden",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
          {content}
        </div>
      </div>
    );
  }

  // Desktop: fill the full viewport, content centred in a reading column so
  // carousels don't stretch into empty space.
  return (
    <div style={{
      width: "100%",
      height: "100dvh",
      background: "#fff",
      display: "flex",
      justifyContent: "center",
      overflow: "hidden",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 720,
        height: "100%",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
          {content}
        </div>
      </div>
    </div>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches
  );
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}
