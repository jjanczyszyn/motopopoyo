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
  tokenMatches,
} from "./lib/quick";
import { assertBikeFree, genCode } from "./reservations";

// Quick "log a rental" link (the /new page). A partner opens a private link
// whose secret lives in the Convex env (QUICK_LINK_KAREN / QUICK_LINK_JJ) and
// can do exactly two things: see which bikes are free, and add a booking.
// It can't read customer data, edit or cancel anything. Rotating the env var
// kills the old link.

const LINKS = [
  { env: "QUICK_LINK_KAREN", who: "Karen" as const },
  { env: "QUICK_LINK_JJ", who: "JJ" as const },
];

function whoFor(token: string): "Karen" | "JJ" | null {
  for (const l of LINKS) {
    if (tokenMatches(token, process.env[l.env])) return l.who;
  }
  return null;
}

function assertLink(token: string): "Karen" | "JJ" {
  const who = whoFor(token);
  if (!who) throw new ConvexError("QUICK_LINK_INVALID: this link isn't valid any more.");
  return who;
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

/** Is the link valid, and whose is it. Lets the page show "not valid" early. */
export const check = query({
  args: { token: v.string() },
  handler: async (_ctx, { token }) => {
    const who = whoFor(token);
    return who ? { ok: true as const, who, today: todayNicaragua() } : { ok: false as const };
  },
});

/**
 * Active bikes and whether each is free for [startDate, startDate + days),
 * plus the list price for that many days. No customer data leaves here.
 */
export const options = query({
  args: { token: v.string(), startDate: v.string(), days: v.number() },
  handler: async (ctx, { token, startDate, days }) => {
    assertLink(token);
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
          !findOverlap(bookings, { bikeId: b._id, startDate, endDate }) &&
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
    token: v.string(),
    bikeId: v.id("bikes"),
    startDate: v.string(),
    days: v.number(),
    priceUSD: v.number(),
    name: v.optional(v.string()),
    paid: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const who = assertLink(args.token);
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
      notes: `Added by ${who} via quick link`,
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
        notes: "Marked paid on the quick link",
        createdAt: now,
        updatedAt: now,
      });
    }

    const bikeName = bike.plate ? `${bike.name} (${bike.plate})` : bike.name;
    return { code, startDate, endDate, days, totalUSD, bikeName, status };
  },
});
