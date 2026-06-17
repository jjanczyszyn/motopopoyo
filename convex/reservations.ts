import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { computeTotal, daysBetweenISO } from "./lib/pricing";
import { assertAdmin, assertAdminRead } from "./admin";
import { DEFAULT_JJ_PCT, DEFAULT_KAREN_PCT } from "./lib/settlement";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(): string {
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
        let paid = 0;
        for (const p of reservationPayments) {
          if (p.status !== "received") continue;
          paid += p.paymentType === "refund" ? -p.amount : p.amount;
        }
        const balance = Math.max(0, r.totalUSD - paid);
        let payStatus: "unpaid" | "partial" | "paid" | "overpaid" | "refunded";
        if (paid <= 0) payStatus = "unpaid";
        else if (paid < r.totalUSD) payStatus = "partial";
        else if (paid > r.totalUSD) payStatus = "overpaid";
        else payStatus = "paid";
        if (
          reservationPayments.some(
            (p) => p.status === "received" && p.paymentType === "refund"
          ) &&
          paid <= 0
        ) {
          payStatus = "refunded";
        }
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
    const totalBeforeDiscount = computeTotal(days, rates);
    const totalUSD = Math.max(0, totalBeforeDiscount - (args.discount ?? 0));

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
      status: args.status ?? "confirmed",
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
      discount: args.discount,
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
  },
  handler: async (ctx, { adminToken, id, ...patch }) => {
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

    if (patch.startDate || patch.endDate) {
      const newStart = patch.startDate ?? existing.startDate;
      const newEnd = patch.endDate ?? existing.endDate;
      const days = daysBetweenISO(newStart, newEnd);
      if (days < 1) throw new Error("endDate must be after startDate");
      next.startDate = newStart;
      next.endDate = newEnd;
      next.days = days;

      const cfg = await ctx.db.query("config").first();
      const rates = {
        daily: cfg?.dailyRate ?? 20,
        weekly: cfg?.weeklyRate ?? 120,
        monthly: cfg?.monthlyRate ?? 450,
      };
      const before = computeTotal(days, rates);
      const discount =
        patch.discount !== undefined ? patch.discount : existing.discount ?? 0;
      next.totalUSD = Math.max(0, before - discount);
    } else if (patch.discount !== undefined) {
      const cfg = await ctx.db.query("config").first();
      const rates = {
        daily: cfg?.dailyRate ?? 20,
        weekly: cfg?.weeklyRate ?? 120,
        monthly: cfg?.monthlyRate ?? 450,
      };
      const before = computeTotal(existing.days, rates);
      next.totalUSD = Math.max(0, before - patch.discount);
    }

    await ctx.db.patch(id, next);
  },
});

export const attachDoc = mutation({
  args: {
    id: v.id("reservations"),
    storageId: v.optional(v.id("_storage")),
    ocrJson: v.optional(v.string()),
  },
  handler: async (ctx, { id, storageId, ocrJson }) => {
    await ctx.db.patch(id, {
      docImageId: storageId,
      docOcrRawJson: ocrJson,
      updatedAt: Date.now(),
    });
  },
});

export const attachSignature = mutation({
  args: {
    id: v.id("reservations"),
    mode: v.union(v.literal("draw"), v.literal("type")),
    storageId: v.optional(v.id("_storage")),
    typed: v.optional(v.string()),
  },
  handler: async (ctx, { id, mode, storageId, typed }) => {
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
    id: v.id("reservations"),
    addr: v.string(),
    hour: v.number(),
    date: v.optional(v.string()),
  },
  handler: async (ctx, { id, addr, hour, date }) => {
    await ctx.db.patch(id, {
      deliveryAddr: addr,
      deliveryHour: hour,
      deliveryDate: date,
      updatedAt: Date.now(),
    });
  },
});

export const cancel = mutation({
  args: { id: v.id("reservations") },
  handler: async (ctx, { id }) => {
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
