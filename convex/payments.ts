import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertAdmin, assertAdminRead } from "./admin";
import { DEFAULT_JJ_PCT, DEFAULT_KAREN_PCT } from "./lib/settlement";

const collectorValidator = v.union(v.literal("JJ"), v.literal("Karen"));
const paymentTypeValidator = v.union(
  v.literal("deposit"),
  v.literal("balance"),
  v.literal("full_payment"),
  v.literal("refund")
);
const paymentStatusValidator = v.union(
  v.literal("received"),
  v.literal("pending"),
  v.literal("failed"),
  v.literal("cancelled"),
  v.literal("refunded")
);

export const listForReservation = query({
  args: { adminToken: v.string(), reservationId: v.id("reservations") },
  handler: async (ctx, { adminToken, reservationId }) => {
    await assertAdminRead(ctx, adminToken);
    const rows = await ctx.db
      .query("payments")
      .withIndex("by_reservation", (q) => q.eq("reservationId", reservationId))
      .collect();
    return rows.sort((a, b) => (b.receivedAt ?? b.createdAt) - (a.receivedAt ?? a.createdAt));
  },
});

export const listAll = query({
  args: {
    adminToken: v.string(),
    fromMs: v.optional(v.number()),
    toMs: v.optional(v.number()),
    onlyReceived: v.optional(v.boolean()),
  },
  handler: async (ctx, { adminToken, fromMs, toMs, onlyReceived }) => {
    await assertAdminRead(ctx, adminToken);
    const all = await ctx.db.query("payments").collect();
    return all.filter((p) => {
      if (onlyReceived && p.status !== "received") return false;
      const t = p.receivedAt ?? p.createdAt;
      if (fromMs !== undefined && t < fromMs) return false;
      if (toMs !== undefined && t >= toMs) return false;
      return true;
    });
  },
});

export const record = mutation({
  args: {
    adminToken: v.string(),
    reservationId: v.id("reservations"),
    amount: v.number(),
    method: v.string(),
    collectedBy: collectorValidator,
    paymentType: paymentTypeValidator,
    status: paymentStatusValidator,
    receivedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminToken);
    if (args.amount <= 0) throw new Error("Amount must be greater than zero.");
    if (args.status === "received" && !args.receivedAt) {
      throw new Error("receivedAt is required for received payments.");
    }

    // Make sure the booking carries a split — back-fill defaults the first
    // time we record a payment so historical reports don't move when the
    // global config changes later.
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation) throw new Error("Reservation not found.");
    const cfg = await ctx.db.query("config").first();
    const jjPct =
      reservation.jjSharePct ??
      cfg?.jjSharePercentage ??
      DEFAULT_JJ_PCT;
    const karenPct =
      reservation.karenSharePct ??
      cfg?.karenSharePercentage ??
      DEFAULT_KAREN_PCT;
    if (
      reservation.jjSharePct === undefined ||
      reservation.karenSharePct === undefined
    ) {
      await ctx.db.patch(reservation._id, {
        jjSharePct: jjPct,
        karenSharePct: karenPct,
        updatedAt: Date.now(),
      });
    }

    const now = Date.now();
    return await ctx.db.insert("payments", {
      reservationId: args.reservationId,
      amount: args.amount,
      currency: args.currency ?? "USD",
      method: args.method,
      collectedBy: args.collectedBy,
      paymentType: args.paymentType,
      status: args.status,
      receivedAt: args.receivedAt,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    adminToken: v.string(),
    paymentId: v.id("payments"),
    amount: v.optional(v.number()),
    method: v.optional(v.string()),
    collectedBy: v.optional(collectorValidator),
    paymentType: v.optional(paymentTypeValidator),
    status: v.optional(paymentStatusValidator),
    receivedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { adminToken, paymentId, ...patch }) => {
    await assertAdmin(ctx, adminToken);
    const existing = await ctx.db.get(paymentId);
    if (!existing) throw new Error("Payment not found.");
    const next: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) next[k] = val;
    }
    // Flipping a payment to "received" without a timestamp would silently
    // drop it from period-bound revenue queries (those filter on
    // receivedAt). Default to now if the admin didn't pass one.
    if (
      patch.status === "received" &&
      existing.receivedAt === undefined &&
      patch.receivedAt === undefined
    ) {
      next.receivedAt = Date.now();
    }
    await ctx.db.patch(paymentId, next);
  },
});

export const remove = mutation({
  args: { adminToken: v.string(), paymentId: v.id("payments") },
  handler: async (ctx, { adminToken, paymentId }) => {
    await assertAdmin(ctx, adminToken);
    await ctx.db.delete(paymentId);
  },
});
