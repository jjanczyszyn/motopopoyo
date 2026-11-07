import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import { I18nProvider } from "./i18n/I18nContext";
import { initTelemetry, track } from "./lib/telemetry";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);
initTelemetry(convex);

// Last-resort crash screen: log the error and offer a reload instead of a
// blank page.
class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    track("error", "app_crash", { detail: String(error?.message ?? error) });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", textAlign: "center" }}>
        <p style={{ fontSize: 16 }}>Something went wrong. / Algo salió mal.</p>
        <button style={{ minHeight: 44, padding: "0 20px", fontSize: 16 }} onClick={() => location.reload()}>
          Reload / Recargar
        </button>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
    <ConvexProvider client={convex}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ConvexProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);

// PWA service worker. Registered after window load so it doesn't compete
// with the initial paint. Skipped under `vite dev` since the SW is served
// from /public/ only in builds.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch((err) => console.warn("SW register failed:", err));
  });
}
