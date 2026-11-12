import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { computeTotal, daysBetweenISO } from "./lib/pricing";
import { outstanding, payStatusFor, receivedTotal } from "./lib/balance";
import { assertAdmin, assertAdminRead } from "./admin";
import { DEFAULT_JJ_PCT, DEFAULT_KAREN_PCT } from "./lib/settlement";
import {
  blockedDays,
  findOverlap,
  nameNeedsReview,
  repriceTotal,
} from "./lib/integrity";

// Error codes the renter UI maps to a translated message.
export const BIKE_UNAVAILABLE = "BIKE_UNAVAILABLE";

/**
 * Throws when `bikeId` is already held by another booking, or blocked for
 * maintenance, on any day of [startDate, endDate).
 */
export async function assertBikeFree(
  ctx: MutationCtx,
  want: {
    bikeId: Id<"bikes">;
    startDate: string;
    endDate: string;
    excludeId?: Id<"reservations">;
  }
): Promise<void> {
  const bookings = await ctx.db
    .query("reservations")
    .withIndex("by_bike_dates", (q) =>
      q.eq("bikeId", want.bikeId).lt("startDate", want.endDate)
    )
    .collect();
  const clash = findOverlap(bookings, want);
  if (clash) {
    throw new ConvexError(
      `${BIKE_UNAVAILABLE}: this bike is already booked ${clash.startDate} → ${clash.endDate} (${clash.code}).`
    );
  }
  const blocks = await ctx.db
    .query("motorcycleAvailability")
    .withIndex("by_bike_date", (q) =>
      q
        .eq("bikeId", want.bikeId)
        .gte("date", want.startDate)
        .lt("date", want.endDate)
    )
    .collect();
  const days = blockedDays(blocks, want.bikeId, want.startDate, want.endDate);
  if (days.length > 0) {
    throw new ConvexError(
      `${BIKE_UNAVAILABLE}: this bike is out of service on ${days.join(", ")}.`
    );
  }
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function genCode(): string {
  const pick = (n: number) =>
    Array.from(
      { length: n },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    ).join("");
  return `KJ-${pick(4)}-${Math.floor(Math.random() * 900 + 100)}`;
}

const reservationCreateArgs = v.object({
  bikeId: v.id("bikes"),
  startDate: v.string(),
  endDate: v.string(),

  docFirstName: v.string(),
  docLastName: v.string(),
  docNumber: v.string(),
  docExpiry: v.string(),
  docCountry: v.string(),
  docImageId: v.optional(v.id("_storage")),
  docOcrRawJson: v.optional(v.string()),

  phoneCC: v.string(),
  phoneNum: v.string(),
  phoneNote: v.optional(v.string()),

  payMethod: v.string(),

  signatureMode: v.union(v.literal("draw"), v.literal("type")),
  signaturePng: v.optional(v.id("_storage")),
  signatureTyped: v.optional(v.string()),

  deliveryAddr: v.string(),
  deliveryHour: v.number(),
  deliveryDate: v.optional(v.string()),
});

export const create = mutation({
  args: { input: reservationCreateArgs },
  handler: async (ctx, { input }) => {
    const cfg = await ctx.db.query("config").first();
    const rates = {
      daily: cfg?.dailyRate ?? 20,
      weekly: cfg?.weeklyRate ?? 120,
      monthly: cfg?.monthlyRate ?? 450,
    };
    const days = daysBetweenISO(input.startDate, input.endDate);
    if (days < 1) throw new Error("endDate must be after startDate");
    await assertBikeFree(ctx, {
      bikeId: input.bikeId,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const totalUSD = computeTotal(days, rates);

    // Try a few times in case of code collision.
    let code = genCode();
    for (let i = 0; i < 3; i++) {
      const dup = await ctx.db
        .query("reservations")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!dup) break;
      code = genCode();
    }

    const cfgForSplit = cfg;
    const jjPct = cfgForSplit?.jjSharePercentage ?? DEFAULT_JJ_PCT;
    const karenPct = cfgForSplit?.karenSharePercentage ?? DEFAULT_KAREN_PCT;

    const now = Date.now();
    const id = await ctx.db.insert("reservations", {
      code,
      status: "pending",
      bikeId: input.bikeId,
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      totalUSD,
      dailyRateUSD: rates.daily,
      jjSharePct: jjPct,
      karenSharePct: karenPct,

      docFirstName: input.docFirstName,
      docLastName: input.docLastName,
      docNumber: input.docNumber,
      docExpiry: input.docExpiry,
      docCountry: input.docCountry,
      docImageId: input.docImageId,
      docOcrRawJson: input.docOcrRawJson,
      needsReview: nameNeedsReview(input.docFirstName, input.docLastName) || undefined,

      phoneCC: input.phoneCC,
      phoneNum: input.phoneNum,
      phoneNote: input.phoneNote,

      payMethod: input.payMethod,

      signatureMode: input.signatureMode,
      signaturePng: input.signaturePng,
      signatureTyped: input.signatureTyped,

      deliveryAddr: input.deliveryAddr,
      deliveryHour: input.deliveryHour,
      deliveryDate: input.deliveryDate ?? input.startDate,

      createdAt: now,
      updatedAt: now,
    });

    return { id, code, totalUSD, days };
  },
});

export const byCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const r = await ctx.db
      .query("reservations")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!r) return null;
    const bike = await ctx.db.get(r.bikeId);
    return { ...r, bike };
  },
});

export const list = query({
  args: {
    adminToken: v.string(),
    status: v.optional(v.string()),
    fromISO: v.optional(v.string()),
    toISO: v.optional(v.string()),
  },
  handler: async (ctx, { adminToken, status, fromISO, toISO }) => {
    await assertAdminRead(ctx, adminToken);
    const all = await ctx.db.query("reservations").order("desc").collect();
    return all.filter((r) => {
      if (status && r.status !== status) return false;
      if (fromISO && r.endDate <= fromISO) return false;
      if (toISO && r.startDate >= toISO) return false;
      return true;
    });
  },
});

// Booking + bike + payments-summary view for the admin Bookings tab.
export const listForAdmin = query({
  args: {
    adminToken: v.string(),
    status: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { adminToken, status, source }) => {
    await assertAdminRead(ctx, adminToken);
    const reservations = await ctx.db.query("reservations").order("desc").collect();
    const bikes = await ctx.db.query("bikes").collect();
    const payments = await ctx.db.query("payments").collect();
    const bikeById = new Map(bikes.map((b) => [b._id, b]));
    return reservations
      .filter((r) => {
        if (status && r.status !== status) return false;
        if (source && (r.source ?? "other") !== source) return false;
        return true;
      })
      .map((r) => {
        const bike = bikeById.get(r.bikeId);
        const reservationPayments = payments.filter(
          (p) => p.reservationId === r._id
        );
        const paid = receivedTotal(reservationPayments);
        const signed = outstanding(r.totalUSD, reservationPayments);
        const balance = Math.max(0, signed);
        // Money received beyond the booking total: a refund owed or a typo.
        const credit = Math.max(0, -signed);
        const payStatus = payStatusFor(r.totalUSD, reservationPayments);
        return {
          ...r,
          bike: bike
            ? {
                _id: bike._id,
                name: bike.name,
                color: bike.color,
                plate: bike.plate,
              }
            : null,
          paid,
          balance,
          credit,
          payStatus,
          paymentCount: reservationPayments.length,
        };
      });
  },
});

// Admin manual booking creation — bypasses the customer flow's required
// fields (OCR doc, signature, phone) so the manager can record a walk-in or
// hotel partner booking quickly.
export const adminCreate = mutation({
  args: {
    adminToken: v.string(),
    bikeId: v.id("bikes"),
    startDate: v.string(),
    endDate: v.string(),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    source: v.optional(v.string()),
    discount: v.optional(v.number()),
    notes: v.optional(v.string()),
    // Book even if the bike looks taken (e.g. back-filling a past rental).
    force: v.optional(v.boolean()),
    // The price agreed with the renter, when it isn't the list price
    // (low-season deals, a returning customer). Replaces the computed total.
    agreedTotalUSD: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("active"),
        v.literal("returned"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminToken);
    const cfg = await ctx.db.query("config").first();
    const rates = {
      daily: cfg?.dailyRate ?? 20,
      weekly: cfg?.weeklyRate ?? 120,
      monthly: cfg?.monthlyRate ?? 450,
    };
    const days = daysBetweenISO(args.startDate, args.endDate);
    if (days < 1) throw new Error("endDate must be after startDate");
    const status = args.status ?? "confirmed";
    if (!args.force && status !== "returned" && status !== "cancelled") {
      await assertBikeFree(ctx, {
        bikeId: args.bikeId,
        startDate: args.startDate,
        endDate: args.endDate,
      });
    }
    const totalBeforeDiscount = computeTotal(days, rates);
    if (args.agreedTotalUSD !== undefined && args.agreedTotalUSD < 0) {
      throw new Error("The agreed price can't be negative.");
    }
    const totalUSD =
      args.agreedTotalUSD ?? Math.max(0, totalBeforeDiscount - (args.discount ?? 0));

    let code = genCode();
    for (let i = 0; i < 3; i++) {
      const dup = await ctx.db
        .query("reservations")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!dup) break;
      code = genCode();
    }

    const [first, ...rest] = (args.customerName ?? "").trim().split(/\s+/);
    const last = rest.join(" ");
    const cc = (args.customerPhone ?? "").replace(/[^+\d]/g, "").startsWith("+")
      ? (args.customerPhone ?? "").slice(0, 4)
      : "";
    const num = (args.customerPhone ?? "").replace(/[^\d]/g, "");

    const now = Date.now();
    const id = await ctx.db.insert("reservations", {
      code,
      status,
      bikeId: args.bikeId,
      startDate: args.startDate,
      endDate: args.endDate,
      days,
      totalUSD,
      dailyRateUSD: rates.daily,
      jjSharePct: cfg?.jjSharePercentage ?? DEFAULT_JJ_PCT,
      karenSharePct: cfg?.karenSharePercentage ?? DEFAULT_KAREN_PCT,

      docFirstName: first ?? "",
      docLastName: last,
      docNumber: "",
      docExpiry: "",
      docCountry: "",

      phoneCC: cc,
      phoneNum: num,

      payMethod: "cash",

      signatureMode: "type",

      deliveryAddr: "",
      deliveryHour: 10,

      customerEmail: args.customerEmail,
      source: args.source ?? "walk_in",
      discount: args.agreedTotalUSD !== undefined ? undefined : args.discount,
      agreedPrice: args.agreedTotalUSD !== undefined ? true : undefined,
      notes: args.notes,

      createdAt: now,
      updatedAt: now,
    });

    return { id, code, totalUSD, days };
  },
});

export const adminUpdate = mutation({
  args: {
    adminToken: v.string(),
    id: v.id("reservations"),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    source: v.optional(v.string()),
    discount: v.optional(v.number()),
    notes: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    bikeId: v.optional(v.id("bikes")),
    jjSharePct: v.optional(v.number()),
    karenSharePct: v.optional(v.number()),
    force: v.optional(v.boolean()),
    agreedTotalUSD: v.optional(v.number()),
  },
  handler: async (ctx, { adminToken, id, force, agreedTotalUSD, ...patch }) => {
    await assertAdmin(ctx, adminToken);
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Reservation not found.");

    const next: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.customerName !== undefined) {
      const [first, ...rest] = patch.customerName.trim().split(/\s+/);
      next.docFirstName = first ?? "";
      next.docLastName = rest.join(" ");
    }
    if (patch.customerEmail !== undefined) next.customerEmail = patch.customerEmail;
    if (patch.customerPhone !== undefined) {
      const cc = patch.customerPhone.startsWith("+")
        ? patch.customerPhone.slice(0, 4)
        : "";
      const num = patch.customerPhone.replace(/[^\d]/g, "");
      next.phoneCC = cc;
      next.phoneNum = num;
    }
    if (patch.source !== undefined) next.source = patch.source;
    if (patch.discount !== undefined) next.discount = patch.discount;
    if (patch.notes !== undefined) next.notes = patch.notes;
    if (patch.bikeId !== undefined) next.bikeId = patch.bikeId;
    if (patch.jjSharePct !== undefined) next.jjSharePct = patch.jjSharePct;
    if (patch.karenSharePct !== undefined) next.karenSharePct = patch.karenSharePct;

    // Re-price from the booking's own daily rate, never today's season.
    const dailyRate =
      existing.dailyRateUSD ?? (await ctx.db.query("config").first())?.dailyRate ?? 20;
    const discount =
      patch.discount !== undefined ? patch.discount : existing.discount ?? 0;

    const datesOrBikeChanged =
      patch.startDate !== undefined ||
      patch.endDate !== undefined ||
      patch.bikeId !== undefined;
    if (datesOrBikeChanged) {
      const newStart = patch.startDate ?? existing.startDate;
      const newEnd = patch.endDate ?? existing.endDate;
      const days = daysBetweenISO(newStart, newEnd);
      if (days < 1) throw new Error("endDate must be after startDate");
      if (!force && existing.status !== "returned" && existing.status !== "cancelled") {
        await assertBikeFree(ctx, {
          bikeId: patch.bikeId ?? existing.bikeId,
          startDate: newStart,
          endDate: newEnd,
          excludeId: id,
        });
      }
      next.startDate = newStart;
      next.endDate = newEnd;
      next.days = days;
      if (!existing.agreedPrice && (days !== existing.days || patch.discount !== undefined)) {
        next.totalUSD = repriceTotal(days, dailyRate, discount);
      }
    } else if (patch.discount !== undefined && !existing.agreedPrice) {
      next.totalUSD = repriceTotal(existing.days, dailyRate, discount);
    }
    if (agreedTotalUSD !== undefined) {
      if (agreedTotalUSD < 0) throw new Error("The agreed price can't be negative.");
      next.totalUSD = agreedTotalUSD;
      next.agreedPrice = true;
    }
    if (patch.customerName !== undefined) {
      next.needsReview = nameNeedsReview(
        next.docFirstName as string,
        next.docLastName as string
      ) || undefined;
    }

    await ctx.db.patch(id, next);
  },
});

export const attachDoc = mutation({
  args: {
    adminToken: v.string(),
    id: v.id("reservations"),
    storageId: v.optional(v.id("_storage")),
    ocrJson: v.optional(v.string()),
  },
  handler: async (ctx, { adminToken, id, storageId, ocrJson }) => {
    await assertAdmin(ctx, adminToken);
    await ctx.db.patch(id, {
      docImageId: storageId,
      docOcrRawJson: ocrJson,
      updatedAt: Date.now(),
    });
  },
});

export const attachSignature = mutation({
  args: {
    adminToken: v.string(),
    id: v.id("reservations"),
    mode: v.union(v.literal("draw"), v.literal("type")),
    storageId: v.optional(v.id("_storage")),
    typed: v.optional(v.string()),
  },
  handler: async (ctx, { adminToken, id, mode, storageId, typed }) => {
    await assertAdmin(ctx, adminToken);
    await ctx.db.patch(id, {
      signatureMode: mode,
      signaturePng: storageId,
      signatureTyped: typed,
      signedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const setDelivery = mutation({
  args: {
    adminToken: v.string(),
    id: v.id("reservations"),
    addr: v.string(),
    hour: v.number(),
    date: v.optional(v.string()),
  },
  handler: async (ctx, { adminToken, id, addr, hour, date }) => {
    await assertAdmin(ctx, adminToken);
    await ctx.db.patch(id, {
      deliveryAddr: addr,
      deliveryHour: hour,
      deliveryDate: date,
      updatedAt: Date.now(),
    });
  },
});

export const cancel = mutation({
  args: { adminToken: v.string(), id: v.id("reservations") },
  handler: async (ctx, { adminToken, id }) => {
    await assertAdmin(ctx, adminToken);
    await ctx.db.patch(id, { status: "cancelled", updatedAt: Date.now() });
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("reservations"),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("active"),
      v.literal("returned"),
      v.literal("cancelled")
    ),
    adminToken: v.string(),
  },
  handler: async (ctx, { id, status, adminToken }) => {
    await assertAdmin(ctx, adminToken);
    await ctx.db.patch(id, { status, updatedAt: Date.now() });
  },
});
