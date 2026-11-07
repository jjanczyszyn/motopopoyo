import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { assertAdminRead } from "./admin";
import { daily, funnel, RETENTION_DAYS, scrub } from "./lib/events";

const kind = v.union(
  v.literal("visit"),
  v.literal("step"),
  v.literal("action"),
  v.literal("error")
);

const eventArg = v.object({
  at: v.optional(v.number()),
  sessionId: v.string(),
  area: v.union(v.literal("site"), v.literal("admin")),
  kind,
  name: v.string(),
  detail: v.optional(v.string()),
  path: v.optional(v.string()),
  locale: v.optional(v.string()),
  device: v.optional(v.union(v.literal("mobile"), v.literal("desktop"))),
  user: v.optional(v.string()),
  bookingCode: v.optional(v.string()),
});

// Public: the site logs anonymously. Inputs are clamped and scrubbed so the
// table can't be used to store customer data or grow without bound per call.
export const log = mutation({
  args: { events: v.array(eventArg) },
  handler: async (ctx, { events }) => {
    const now = Date.now();
    for (const e of events.slice(0, 25)) {
      const at = e.at && Math.abs(e.at - now) < 24 * 3600 * 1000 ? e.at : now;
      await ctx.db.insert("events", {
        at,
        sessionId: e.sessionId.slice(0, 40),
        area: e.area,
        kind: e.kind,
        name: e.name.slice(0, 80),
        detail: scrub(e.detail),
        path: e.path?.slice(0, 120),
        locale: e.locale?.slice(0, 10),
        device: e.device,
        user: e.area === "admin" ? e.user?.slice(0, 20) : undefined,
        bookingCode: e.bookingCode && /^KJ-[A-Z0-9]{4}-\d{3}$/.test(e.bookingCode) ? e.bookingCode : undefined,
      });
    }
  },
});

export const list = query({
  args: {
    adminToken: v.string(),
    sinceMs: v.optional(v.number()),
    onlyErrors: v.optional(v.boolean()),
    area: v.optional(v.union(v.literal("site"), v.literal("admin"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { adminToken, sinceMs, onlyErrors, area, limit }) => {
    await assertAdminRead(ctx, adminToken);
    const since = sinceMs ?? Date.now() - 7 * 24 * 3600 * 1000;
    const rows = onlyErrors
      ? await ctx.db
          .query("events")
          .withIndex("by_kind_at", (q) => q.eq("kind", "error").gte("at", since))
          .order("desc")
          .take(500)
      : await ctx.db
          .query("events")
          .withIndex("by_at", (q) => q.gte("at", since))
          .order("desc")
          .take(500);
    return rows.filter((r) => !area || r.area === area).slice(0, Math.min(limit ?? 200, 500));
  },
});

export const summary = query({
  args: { adminToken: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, { adminToken, days }) => {
    await assertAdminRead(ctx, adminToken);
    const since = Date.now() - (days ?? 30) * 24 * 3600 * 1000;
    const rows = await ctx.db
      .query("events")
      .withIndex("by_at", (q) => q.gte("at", since))
      .collect();
    return {
      funnel: funnel(rows),
      daily: daily(rows),
      errors: rows.filter((r) => r.kind === "error").length,
      sessions: new Set(rows.filter((r) => r.area === "site").map((r) => r.sessionId)).size,
    };
  },
});

// Daily cron: keep the log small and bounded.
export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;
    const old = await ctx.db
      .query("events")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(2000);
    for (const e of old) await ctx.db.delete(e._id);
    return old.length;
  },
});
