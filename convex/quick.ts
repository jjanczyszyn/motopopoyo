import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { computeTotal } from "./lib/pricing";
import { blockedDays, findOverlap } from "./lib/integrity";
import { DEFAULT_JJ_PCT, DEFAULT_KAREN_PCT } from "./lib/settlement";
import {
  MAX_QUICK_DAYS,
  addDaysISO,
  isISODate,
  statusForDates,
  canQuickEdit,
  QUICK_PAYMENT_NOTE,
} from "./lib/quick";
import type { Id } from "./_generated/dataModel";
import { assertAdmin, assertAdminRead } from "./admin";
import { assertBikeFree, genCode } from "./reservations";

// Quick "log a rental" page (/new). Behind the same owner login as /admin:
// every call needs a live admin session token, and the booking is credited
// to whoever is signed in.

function whoFor(username: string | undefined): "Karen" | "JJ" {
  return username === "karen" ? "Karen" : "JJ";
}

/** Today in Popoyo (UTC-6, no DST). */
function todayNicaragua(): string {
  return new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
}

async function ratesFor(ctx: QueryCtx | MutationCtx) {
  const cfg = await ctx.db.query("config").first();
  return {
    cfg,
    rates: {
      daily: cfg?.dailyRate ?? 20,
      weekly: cfg?.weeklyRate ?? 120,
      monthly: cfg?.monthlyRate ?? 450,
    },
  };
}

/** Who is signed in and today's date in Popoyo, for the page header. */
export const me = query({
  args: { adminToken: v.string() },
  handler: async (ctx, { adminToken }) => {
    const session = await assertAdminRead(ctx, adminToken);
    return { who: whoFor(session.username), today: todayNicaragua() };
  },
});

/**
 * Active bikes and whether each is free for [startDate, startDate + days),
 * plus the list price for that many days. No customer data leaves here.
 */
export const options = query({
  args: {
    adminToken: v.string(),
    startDate: v.string(),
    days: v.number(),
    // The booking being edited: its own dates don't count as "taken".
    excludeId: v.optional(v.id("reservations")),
  },
  handler: async (ctx, { adminToken, startDate, days, excludeId }) => {
    await assertAdminRead(ctx, adminToken);
    const { rates } = await ratesFor(ctx);
    const n = Math.max(1, Math.min(MAX_QUICK_DAYS, Math.round(days)));
    const valid = isISODate(startDate);
    const endDate = valid ? addDaysISO(startDate, n) : startDate;
    const bikes = (await ctx.db.query("bikes").collect()).filter((b) => b.isActive);
    const out = [];
    for (const b of bikes) {
      let free = true;
      if (valid) {
        const bookings = await ctx.db
          .query("reservations")
          .withIndex("by_bike_dates", (q) => q.eq("bikeId", b._id).lt("startDate", endDate))
          .collect();
        const blocks = await ctx.db
          .query("motorcycleAvailability")
          .withIndex("by_bike_date", (q) =>
            q.eq("bikeId", b._id).gte("date", startDate).lt("date", endDate)
          )
          .collect();
        free =
          !findOverlap(bookings, { bikeId: b._id, startDate, endDate, excludeId }) &&
          blockedDays(blocks, b._id, startDate, endDate).length === 0;
      }
      out.push({ _id: b._id, name: b.name, color: b.color, type: b.type, plate: b.plate, free });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return { bikes: out, endDate, listPriceUSD: computeTotal(n, rates) };
  },
});

export const create = mutation({
  args: {
    adminToken: v.string(),
    bikeId: v.id("bikes"),
    startDate: v.string(),
    days: v.number(),
    priceUSD: v.number(),
    name: v.optional(v.string()),
    paid: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const who = whoFor((await assertAdmin(ctx, args.adminToken)).username);
    if (!isISODate(args.startDate)) throw new ConvexError("Pick a start date.");
    const days = Math.round(args.days);
    if (!(days >= 1 && days <= MAX_QUICK_DAYS)) {
      throw new ConvexError(`Days must be between 1 and ${MAX_QUICK_DAYS}.`);
    }
    if (!Number.isFinite(args.priceUSD) || args.priceUSD < 0 || args.priceUSD > 10000) {
      throw new ConvexError("Enter a price in dollars.");
    }
    const bike = await ctx.db.get(args.bikeId);
    if (!bike) throw new ConvexError("That bike doesn't exist.");

    const startDate = args.startDate;
    const endDate = addDaysISO(startDate, days);
    const status = statusForDates(startDate, endDate, todayNicaragua());
    // A past rental (back-fill) has already given the bike back, so it can't
    // clash; anything current or ahead must not double-book.
    if (status !== "returned") {
      await assertBikeFree(ctx, { bikeId: args.bikeId, startDate, endDate });
    }

    const { cfg, rates } = await ratesFor(ctx);
    const listPrice = computeTotal(days, rates);
    const totalUSD = Math.round(args.priceUSD * 100) / 100;

    let code = genCode();
    for (let i = 0; i < 3; i++) {
      const dup = await ctx.db
        .query("reservations")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!dup) break;
      code = genCode();
    }

    const name = (args.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const [first = "", ...rest] = name ? name.split(" ") : [];
    const now = Date.now();
    const jjPct = cfg?.jjSharePercentage ?? DEFAULT_JJ_PCT;
    const karenPct = cfg?.karenSharePercentage ?? DEFAULT_KAREN_PCT;

    const id = await ctx.db.insert("reservations", {
      code,
      status,
      bikeId: args.bikeId,
      startDate,
      endDate,
      days,
      totalUSD,
      dailyRateUSD: rates.daily,
      jjSharePct: jjPct,
      karenSharePct: karenPct,
      docFirstName: first,
      docLastName: rest.join(" "),
      docNumber: "",
      docExpiry: "",
      docCountry: "",
      // No name yet → shows up under "Check name" in the admin.
      needsReview: name ? undefined : true,
      agreedPrice: totalUSD !== listPrice ? true : undefined,
      phoneCC: "",
      phoneNum: "",
      payMethod: "cash",
      signatureMode: "type",
      deliveryAddr: "",
      deliveryHour: 10,
      source: "walk_in",
      notes: `Added by ${who} via quick add`,
      createdAt: now,
      updatedAt: now,
    });

    if (args.paid && totalUSD > 0) {
      const startMs = Date.parse(`${startDate}T12:00:00Z`);
      await ctx.db.insert("payments", {
        reservationId: id,
        amount: totalUSD,
        currency: "USD",
        method: "cash",
        collectedBy: who,
        paymentType: "full_payment",
        status: "received",
        receivedAt: Math.min(startMs, now),
        notes: QUICK_PAYMENT_NOTE,
        createdAt: now,
        updatedAt: now,
      });
    }

    const bikeName = bike.plate ? `${bike.name} (${bike.plate})` : bike.name;
    return { code, startDate, endDate, days, totalUSD, bikeName, status };
  },
});

/** Payments the quick-add page recorded for a booking (the only ones it touches). */
async function quickPayments(ctx: MutationCtx | QueryCtx, id: Id<"reservations">) {
  const rows = await ctx.db
    .query("payments")
    .withIndex("by_reservation", (q) => q.eq("reservationId", id))
    .collect();
  return rows.filter((p) => p.notes === QUICK_PAYMENT_NOTE);
}

async function editableBooking(
  ctx: MutationCtx,
  adminToken: string,
  id: Id<"reservations">
) {
  const who = whoFor((await assertAdmin(ctx, adminToken)).username);
  const r = await ctx.db.get(id);
  if (!r || !canQuickEdit(r, who, Date.now())) {
    throw new ConvexError(
      "QUICK_EDIT_CLOSED: this rental can only be changed by whoever added it, within 24 hours."
    );
  }
  return { who, r };
}

/**
 * Rentals the signed-in partner added on this page that they can still
 * change (added under 24 hours ago, not cancelled), newest first.
 */
export const mine = query({
  args: { adminToken: v.string() },
  handler: async (ctx, { adminToken }) => {
    const who = whoFor((await assertAdminRead(ctx, adminToken)).username);
    const now = Date.now();
    const rows = (await ctx.db.query("reservations").collect())
      .filter((r) => canQuickEdit(r, who, now))
      .sort((a, b) => b.createdAt - a.createdAt);
    const out = [];
    for (const r of rows) {
      const bike = await ctx.db.get(r.bikeId);
      const paidRows = await ctx.db
        .query("payments")
        .withIndex("by_reservation", (q) => q.eq("reservationId", r._id))
        .collect();
      out.push({
        _id: r._id,
        code: r.code,
        bikeId: r.bikeId,
        bikeName: bike ? bike.name : "?",
        bikePlate: bike?.plate ?? "",
        bikeColor: bike?.color ?? "#ccc",
        startDate: r.startDate,
        endDate: r.endDate,
        days: r.days,
        totalUSD: r.totalUSD,
        name: `${r.docFirstName} ${r.docLastName}`.trim(),
        paid: paidRows.some((p) => p.notes === QUICK_PAYMENT_NOTE && p.status === "received"),
        editableUntil: r.createdAt + 24 * 3600 * 1000,
      });
    }
    return out;
  },
});

export const update = mutation({
  args: {
    adminToken: v.string(),
    id: v.id("reservations"),
    bikeId: v.id("bikes"),
    startDate: v.string(),
    days: v.number(),
    priceUSD: v.number(),
    name: v.optional(v.string()),
    paid: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { who, r } = await editableBooking(ctx, args.adminToken, args.id);
    if (!isISODate(args.startDate)) throw new ConvexError("Pick a start date.");
    const days = Math.round(args.days);
    if (!(days >= 1 && days <= MAX_QUICK_DAYS)) {
      throw new ConvexError(`Days must be between 1 and ${MAX_QUICK_DAYS}.`);
    }
    if (!Number.isFinite(args.priceUSD) || args.priceUSD < 0 || args.priceUSD > 10000) {
      throw new ConvexError("Enter a price in dollars.");
    }
    const bike = await ctx.db.get(args.bikeId);
    if (!bike) throw new ConvexError("That bike doesn't exist.");

    const startDate = args.startDate;
    const endDate = addDaysISO(startDate, days);
    const status = statusForDates(startDate, endDate, todayNicaragua());
    if (status !== "returned") {
      await assertBikeFree(ctx, { bikeId: args.bikeId, startDate, endDate, excludeId: r._id });
    }
    const { rates } = await ratesFor(ctx);
    const totalUSD = Math.round(args.priceUSD * 100) / 100;
    const name = (args.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const [first = "", ...rest] = name ? name.split(" ") : [];
    const now = Date.now();

    await ctx.db.patch(r._id, {
      bikeId: args.bikeId,
      startDate,
      endDate,
      days,
      status,
      totalUSD,
      agreedPrice: totalUSD !== computeTotal(days, rates) ? true : undefined,
      docFirstName: first,
      docLastName: rest.join(" "),
      needsReview: name ? undefined : true,
      updatedAt: now,
    });

    // Keep the page's own payment in step with the price and the toggle.
    // Payments recorded anywhere else are left alone.
    const existing = await quickPayments(ctx, r._id);
    const receivedAt = Math.min(Date.parse(`${startDate}T12:00:00Z`), now);
    if (args.paid && totalUSD > 0) {
      const [keep, ...extra] = existing;
      if (keep) {
        await ctx.db.patch(keep._id, { amount: totalUSD, receivedAt, status: "received", collectedBy: who, updatedAt: now });
      } else {
        await ctx.db.insert("payments", {
          reservationId: r._id, amount: totalUSD, currency: "USD", method: "cash",
          collectedBy: who, paymentType: "full_payment", status: "received",
          receivedAt, notes: QUICK_PAYMENT_NOTE, createdAt: now, updatedAt: now,
        });
      }
      for (const p of extra) await ctx.db.delete(p._id);
    } else {
      for (const p of existing) await ctx.db.delete(p._id);
    }

    const bikeName = bike.plate ? `${bike.name} (${bike.plate})` : bike.name;
    return { code: r.code, startDate, endDate, days, totalUSD, bikeName, status };
  },
});

/** Delete (cancel) a rental added by mistake, within the same 24 hours. */
export const remove = mutation({
  args: { adminToken: v.string(), id: v.id("reservations") },
  handler: async (ctx, { adminToken, id }) => {
    const { r } = await editableBooking(ctx, adminToken, id);
    for (const p of await quickPayments(ctx, r._id)) await ctx.db.delete(p._id);
    await ctx.db.patch(r._id, {
      status: "cancelled",
      notes: `${r.notes ?? ""} · deleted on the quick-add page`,
      updatedAt: Date.now(),
    });
    return { code: r.code };
  },
});
