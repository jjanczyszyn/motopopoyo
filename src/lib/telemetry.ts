// Usage and error logging. Events are batched and sent to `events.log`.
// Never pass customer data (names, phones, ID numbers) as `detail`: the
// server scrubs obvious patterns, but the rule is not to send them at all.
import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import { api } from "../../convex/_generated/api";

type Kind = "visit" | "step" | "action" | "error";
type Area = "site" | "admin";

interface PendingEvent {
  at: number;
  sessionId: string;
  area: Area;
  kind: Kind;
  name: string;
  detail?: string;
  path?: string;
  locale?: string;
  device?: "mobile" | "desktop";
  user?: string;
  bookingCode?: string;
}

let client: ConvexReactClient | null = null;
let queue: PendingEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let adminUser: string | undefined;

function sessionId(): string {
  try {
    let id = sessionStorage.getItem("kj-session");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      sessionStorage.setItem("kj-session", id);
    }
    return id;
  } catch {
    return "nostorage";
  }
}

const area = (): Area => (location.pathname.startsWith("/admin") ? "admin" : "site");
const device = (): "mobile" | "desktop" =>
  matchMedia("(max-width: 760px)").matches ? "mobile" : "desktop";

function flush() {
  timer = null;
  if (!client || queue.length === 0) return;
  const batch = queue.splice(0, 25);
  // Call the raw mutation so a logging failure never loops back into logging.
  rawMutation?.(api.events.log, { events: batch }).catch(() => {});
  if (queue.length) timer = setTimeout(flush, 500);
}

export function track(
  kind: Kind,
  name: string,
  extra: { detail?: string; bookingCode?: string } = {}
): void {
  try {
    // Automated browsers (our own e2e tests, crawlers) aren't visitors.
    if (navigator.webdriver) return;
    queue.push({
      at: Date.now(),
      sessionId: sessionId(),
      area: area(),
      kind,
      name,
      detail: extra.detail,
      bookingCode: extra.bookingCode,
      path: location.pathname + location.hash,
      locale: document.documentElement.lang || navigator.language,
      device: device(),
      user: area() === "admin" ? adminUser : undefined,
    });
    if (kind === "error") flush();
    else if (!timer) timer = setTimeout(flush, 2000);
  } catch {
    /* logging must never break the app */
  }
}

/** Sets the signed-in admin's username so admin events carry it. */
export function setAdminUser(user: string | undefined): void {
  adminUser = user;
}

let rawMutation: ConvexReactClient["mutation"] | null = null;

/**
 * Wires logging into the app: global error handlers, a visit event, and a
 * wrapper around every Convex mutation/action so failed server calls are
 * logged with the function name.
 */
export function initTelemetry(c: ConvexReactClient): void {
  client = c;
  rawMutation = c.mutation.bind(c);
  const rawAction = c.action.bind(c);

  const wrap = <F extends (...a: never[]) => Promise<unknown>>(fn: F) =>
    ((ref: Parameters<F>[0], ...rest: unknown[]) =>
      (fn as unknown as (r: unknown, ...x: unknown[]) => Promise<unknown>)(ref, ...rest).catch((e: unknown) => {
        let fname = "unknown";
        try { fname = getFunctionName(ref as never); } catch { /* ignore */ }
        const msg = e && typeof e === "object" && "data" in e
          ? String((e as { data: unknown }).data)
          : String((e as Error)?.message ?? e);
        track("error", "server_error", { detail: `${fname}: ${msg}` });
        throw e;
      })) as unknown as F;

  c.mutation = wrap(rawMutation) as typeof c.mutation;
  c.action = wrap(rawAction) as typeof c.action;

  window.addEventListener("error", (e) => {
    track("error", "js_error", { detail: `${e.message} @ ${e.filename?.split("/").pop()}:${e.lineno}` });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    // Server errors are already logged by the wrapper above.
    if (r && typeof r === "object" && ("data" in r || String(r.message ?? "").includes("[CONVEX"))) return;
    track("error", "unhandled_rejection", { detail: String(r?.message ?? r) });
  });
  window.addEventListener("pagehide", flush);

  const ref = document.referrer ? new URL(document.referrer).hostname : "direct";
  track("visit", area() === "admin" ? "admin_open" : "site_open", { detail: `from ${ref}` });
}
