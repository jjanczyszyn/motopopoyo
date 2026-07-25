import React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Dashboard } from "../admin/Dashboard";
import { Bookings } from "../admin/Bookings";
import { Motorcycles } from "../admin/Motorcycles";
import { Revenue } from "../admin/Revenue";
import { Payments } from "../admin/Payments";
import { Seasonality } from "../admin/Seasonality";
import { Settlement } from "../admin/Settlement";
import { Reports } from "../admin/Reports";
import { Settings } from "../admin/Settings";
import { SectionErrorBoundary, useIsMobile } from "../admin/shared";

// Server-side auth: each owner has their own password env var
// (ADMIN_KAREN_PASSWORD / ADMIN_JJ_PASSWORD). Login submits the typed
// username + password pair; verifyPassword returns a session token that's
// required by every admin-only mutation.
const TOKEN_KEY = "kj-admin-token";

function useAdminAuth() {
  const [token, setToken] = React.useState<string | null>(() =>
    sessionStorage.getItem(TOKEN_KEY)
  );
  const session = useQuery(api.admin.checkSession, token ? { token } : "skip");
  const verifyPassword = useMutation(api.admin.verifyPassword);
  const logoutMutation = useMutation(api.admin.logout);

  // If the server reports the session is no longer valid (expired, deleted),
  // drop our cached token so the login gate shows again.
  React.useEffect(() => {
    if (token && session && !session.ok) {
      sessionStorage.removeItem(TOKEN_KEY);
      setToken(null);
    }
  }, [token, session]);

  const tryPassword = async (
    username: "karen" | "jj",
    pw: string
  ): Promise<boolean> => {
    try {
      const result = await verifyPassword({ username, password: pw });
      sessionStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      return true;
    } catch {
      return false;
    }
  };
  const logout = async () => {
    if (token) await logoutMutation({ token }).catch(() => {});
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };
  // Authed iff we have a token AND the latest server check confirms it (or
  // is still loading — useQuery returns undefined while in-flight, treat as
  // optimistic-allowed so the panel doesn't flash on every page load).
  const authed = !!token && (session === undefined || session.ok);
  return { authed, token, tryPassword, logout, session };
}

// Detects whether the page is already running as an installed PWA, so we
// don't pester users to install something they already installed.
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iOS = (window.navigator as { standalone?: boolean }).standalone;
  return !!iOS || window.matchMedia("(display-mode: standalone)").matches;
}

const INSTALL_DISMISSED_KEY = "kj-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function InstallHint() {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = React.useState<boolean>(() =>
    typeof window !== "undefined" && localStorage.getItem(INSTALL_DISMISSED_KEY) === "1"
  );
  const [standalone, setStandalone] = React.useState(isStandalone);

  React.useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => setStandalone(true);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (standalone || dismissed) return null;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
  // Only show on iOS Safari or when we have a real beforeinstallprompt event
  // — otherwise (e.g. desktop Firefox) the user can't actually install.
  if (!isIOS && !deferred) return null;

  const dismiss = () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    setDismissed(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === "dismissed") dismiss();
  };

  return (
    <div style={{
      maxWidth: 360, margin: "16px auto 0", padding: 14,
      border: "1px solid var(--line)", borderRadius: 12, background: "#fff8f6",
      fontSize: 13, color: "var(--ink-2)", lineHeight: 1.4,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <strong style={{ color: "var(--ink)" }}>Install this as an app</strong>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            border: "none", background: "transparent", color: "var(--muted)",
            cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0,
          }}
        >×</button>
      </div>
      {deferred ? (
        <>
          <div style={{ marginTop: 6 }}>
            Add Karen & JJ Moto to your home screen for an app-style icon and full-screen experience.
          </div>
          <button onClick={install} style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 8, border: "none",
            background: "var(--accent)", color: "var(--accent-ink)",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Install app</button>
        </>
      ) : (
        <div style={{ marginTop: 6 }}>
          In Safari, tap the <strong>Share</strong> icon, then <strong>Add to Home Screen</strong>.
        </div>
      )}
    </div>
  );
}

function LoginGate({
  onSubmit,
}: {
  onSubmit: (username: "karen" | "jj", pw: string) => Promise<boolean>;
}) {
  const [usernameRaw, setUsernameRaw] = React.useState<string>(() =>
    sessionStorage.getItem("kj-admin-user") ?? ""
  );
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: "var(--muted)", letterSpacing: 0.6,
    textTransform: "uppercase", fontWeight: 600, marginBottom: 6,
  };
  const inputStyle = (hasErr: boolean): React.CSSProperties => ({
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: `1px solid ${hasErr ? "#dc2626" : "var(--line)"}`,
    fontSize: 14, marginBottom: 12, outline: "none", boxSizing: "border-box",
  });

  return (
    <div style={{ maxWidth: 360, margin: "100px auto", padding: 24, border: "1px solid var(--line)", borderRadius: 16 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 22 }}>Admin login</h2>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>
        Enter your owner credentials.
      </p>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const u = usernameRaw.trim().toLowerCase();
        if (!u) return;
        setBusy(true); setErr(null);
        sessionStorage.setItem("kj-admin-user", u);
        const ok = await onSubmit(u as "karen" | "jj", pw);
        setBusy(false);
        // Generic message — never reveal whether the username or password was
        // the wrong half. Only owners know which usernames are valid.
        if (!ok) setErr("Invalid credentials.");
      }}>
        <div style={labelStyle}>Username</div>
        <input
          type="text"
          value={usernameRaw}
          onChange={(e) => { setUsernameRaw(e.target.value); setErr(null); }}
          autoFocus
          placeholder="Username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={inputStyle(!!err)}
        />
        <div style={labelStyle}>Password</div>
        <input
          type="password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(null); }}
          placeholder="Password"
          autoComplete="current-password"
          style={inputStyle(!!err)}
        />
        {err && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 12 }}>{err}</div>}
        {/* Server already returns a generic "Invalid username or password."
            so the response status doesn't leak which half was wrong either. */}
        <button type="submit" disabled={busy || !pw || !usernameRaw.trim()} style={{
          width: "100%", padding: 12, borderRadius: 10, border: "none",
          background: "var(--ink)", color: "#fff", fontSize: 14, fontWeight: 600,
          opacity: (busy || !pw || !usernameRaw.trim()) ? 0.6 : 1,
          cursor: (busy || !pw || !usernameRaw.trim()) ? "default" : "pointer",
        }}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}

const TABS = [
  "dashboard", "bookings", "motorcycles", "revenue", "payments",
  "seasonality", "settlement", "reports", "settings",
] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  dashboard: "Dashboard",
  bookings: "Bookings",
  motorcycles: "Motorcycles",
  revenue: "Revenue",
  payments: "Payments",
  seasonality: "Seasonality",
  settlement: "Partner settlement",
  reports: "Reports",
  settings: "Settings",
};

// Phone nav: the four daily jobs get a permanent bottom tab, everything else
// lives behind "More". A 9-tab horizontal scroller meant the active tab could
// start off-screen and nothing was ever in thumb reach.
const PRIMARY_TABS: Tab[] = ["dashboard", "bookings", "payments", "motorcycles"];
const MORE_TABS: Tab[] = TABS.filter((t) => !PRIMARY_TABS.includes(t));

const SHORT_LABELS: Partial<Record<Tab, string>> = {
  dashboard: "Home",
  motorcycles: "Motos",
  settlement: "Settlement",
};
const shortLabel = (t: Tab) => SHORT_LABELS[t] ?? TAB_LABELS[t];

const TAB_ICONS: Record<Tab, string> = {
  dashboard: "◈",
  bookings: "▤",
  payments: "$",
  motorcycles: "◍",
  revenue: "◔",
  seasonality: "▦",
  settlement: "⇄",
  reports: "⇩",
  settings: "⚙",
};

function BottomNav({
  tab, setTab,
}: { tab: Tab; setTab: (t: Tab) => void }) {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreActive = MORE_TABS.includes(tab);

  const item = (t: Tab | "more", active: boolean, onClick: () => void) => (
    <button
      key={t}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      // Explicit name: the visible label is abbreviated ("Motos") and sits
      // next to a decorative glyph, which makes a poor accessible name.
      aria-label={t === "more" ? "More sections" : TAB_LABELS[t]}
      style={{
        flex: 1,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 3, padding: "8px 2px", border: "none", background: "transparent",
        color: active ? "var(--ink)" : "var(--muted)",
        fontSize: 10.5, fontWeight: 600, letterSpacing: 0.2,
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 17, lineHeight: 1 }}>
        {t === "more" ? "⋯" : TAB_ICONS[t]}
      </span>
      <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {t === "more" ? (moreActive ? shortLabel(tab) : "More") : shortLabel(t)}
      </span>
      <span style={{
        height: 2, width: 18, borderRadius: 2,
        background: active ? "var(--accent)" : "transparent",
      }} />
    </button>
  );

  return (
    <>
      {moreOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setMoreOpen(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40,
            display: "flex", alignItems: "flex-end",
          }}
        >
          <div style={{
            background: "#fff", width: "100%", borderRadius: "16px 16px 0 0",
            padding: 12,
            paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          }}>
            <div style={{
              width: 36, height: 4, borderRadius: 2, background: "var(--line)",
              margin: "0 auto 12px",
            }} />
            {MORE_TABS.map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setMoreOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  padding: "14px 12px", border: "none", borderRadius: 10,
                  background: tab === t ? "#f5f5f5" : "transparent",
                  color: "var(--ink)", fontSize: 15, fontWeight: 600, textAlign: "left",
                }}
              >
                <span style={{ fontSize: 18, width: 22 }}>{TAB_ICONS[t]}</span>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}
      <nav style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 45,
        display: "flex", alignItems: "stretch",
        background: "#fff", borderTop: "1px solid var(--line)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {PRIMARY_TABS.map((t) => item(t, tab === t, () => { setMoreOpen(false); setTab(t); }))}
        {item("more", moreActive, () => setMoreOpen((v) => !v))}
      </nav>
    </>
  );
}

export function AdminScreen() {
  const { authed, token, tryPassword, logout, session } = useAdminAuth();
  const [tab, setTab] = React.useState<Tab>(() => {
    const fromHash = window.location.hash.replace(/^#/, "");
    return (TABS as readonly string[]).includes(fromHash) ? (fromHash as Tab) : "dashboard";
  });

  React.useEffect(() => {
    if (tab) window.location.hash = tab;
  }, [tab]);

  // Follow the hash when it changes underneath us — browser Back/Forward, a
  // deep link pasted into the address bar, or another tab's link. Without
  // this the URL and the visible section drift apart, and in PWA standalone
  // mode (no browser chrome) there is no other way back to a section.
  React.useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash.replace(/^#/, "");
      if ((TABS as readonly string[]).includes(next)) setTab(next as Tab);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const today = new Date();
  const [year, setYear] = React.useState(today.getFullYear());
  const [monthIdx0, setMonthIdx0] = React.useState(today.getMonth());
  const mobile = useIsMobile();

  if (!authed || !token) {
    // Mirror the scroll-container treatment so the gate is centred and
    // scrollable on short viewports.
    return (
      <div className="admin-root" style={{
        height: "100dvh", overflowY: "auto", overflowX: "hidden",
        WebkitOverflowScrolling: "touch", background: "#fff",
      }}>
        <LoginGate onSubmit={tryPassword} />
        <InstallHint />
      </div>
    );
  }

  const sectionProps = { adminToken: token, year, monthIdx0, setYear, setMonth: setMonthIdx0 };
  let inner: React.ReactNode;
  switch (tab) {
    case "dashboard":   inner = <Dashboard {...sectionProps} />; break;
    case "bookings":    inner = <Bookings adminToken={token} />; break;
    case "motorcycles": inner = <Motorcycles adminToken={token} />; break;
    case "revenue":     inner = <Revenue adminToken={token} year={year} setYear={setYear} />; break;
    case "payments":    inner = <Payments {...sectionProps} />; break;
    case "seasonality": inner = <Seasonality adminToken={token} year={year} setYear={setYear} />; break;
    case "settlement":  inner = <Settlement {...sectionProps} />; break;
    case "reports":     inner = <Reports adminToken={token} year={year} setYear={setYear} />; break;
    case "settings":    inner = <Settings adminToken={token} />; break;
  }
  // `key={tab}` resets the boundary each time the user switches tabs so a
  // recovered error on one tab doesn't carry over to the next.
  const body = (
    <SectionErrorBoundary key={tab} sectionName={TAB_LABELS[tab]}>
      {inner}
    </SectionErrorBoundary>
  );

  const username = (session && session.ok && session.username) ? session.username : null;

  return (
    // index.html locks <body> to overflow:hidden + 100dvh for the fullscreen
    // customer flow. The admin panel is a normal long-scroll page, so we
    // force this container to be the scroll context: full viewport height
    // with internal overflow-y auto + iOS momentum scrolling.
    <div className="admin-root" style={{
      height: "100dvh",
      overflowY: "auto",
      overflowX: "hidden",
      WebkitOverflowScrolling: "touch",
      background: "#fafafa",
      // Room for the fixed bottom tab bar on phones.
      paddingBottom: mobile
        ? "calc(84px + env(safe-area-inset-bottom, 0px))"
        : "calc(60px + env(safe-area-inset-bottom, 0px))",
    }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: mobile ? "12px 16px" : "16px 24px",
        paddingTop: mobile
          ? "calc(12px + env(safe-area-inset-top, 0px))"
          : undefined,
        borderBottom: "1px solid var(--line)",
        background: "#fff", flexWrap: "wrap", gap: 12,
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: mobile ? 18 : 22, fontWeight: 700 }}>
            {mobile ? TAB_LABELS[tab] : "Karen & JJ Admin"}
          </div>
          {!mobile && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Business cockpit</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {username && !mobile && (
            <span style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Signed in as <strong style={{ color: "var(--ink)" }}>{username}</strong>
            </span>
          )}
          <button onClick={logout} style={{
            padding: "7px 12px", borderRadius: 8, border: "1px solid var(--line)",
            background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>{mobile && username ? `Sign out (${username})` : "Sign out"}</button>
        </div>
      </header>
      {!mobile && (
        <nav style={{
          display: "flex", gap: 4,
          padding: "8px 24px",
          borderBottom: "1px solid var(--line)", background: "#fff",
          overflowX: "auto", whiteSpace: "nowrap",
          position: "sticky", top: 70, zIndex: 9,
        }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "none",
                background: tab === t ? "var(--ink)" : "transparent",
                color: tab === t ? "#fff" : "var(--ink-2)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                flex: "0 0 auto",
              }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
      )}
      <main style={{
        maxWidth: 1180, margin: "0 auto",
        padding: mobile ? "16px 12px" : "24px 20px",
      }}>
        {body}
      </main>
      {mobile && <BottomNav tab={tab} setTab={setTab} />}
    </div>
  );
}
