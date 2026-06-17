import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertAdmin, assertAdminRead } from "./admin";
import {
  BookingSplitLookup,
  DEFAULT_JJ_PCT,
  DEFAULT_KAREN_PCT,
  PaymentLike,
  signedAmount,
  summariseSettlement,
} from "./lib/settlement";

const partner = v.union(v.literal("JJ"), v.literal("Karen"));

async function buildSplitLookup(
  ctx: { db: { get: (id: any) => Promise<any> } },
  payments: { reservationId: string }[],
  fallbackJj: number,
  fallbackKaren: number
): Promise<BookingSplitLookup> {
  const cache = new Map<string, { jjPct: number; karenPct: number }>();
  for (const p of payments) {
    if (cache.has(p.reservationId)) continue;
    const r = await ctx.db.get(p.reservationId as any);
    cache.set(p.reservationId, {
      jjPct: r?.jjSharePct ?? fallbackJj,
      karenPct: r?.karenSharePct ?? fallbackKaren,
    });
  }
  return {
    splitFor(id) {
      return cache.get(id) ?? { jjPct: fallbackJj, karenPct: fallbackKaren };
    },
  };
}

// Filter to a 'YYYY-MM' window using receivedAt. Pending payments are
// excluded from settlement math by design (see spec §13).
function inMonth(p: { receivedAt?: number; status: string }, ymOpt?: string) {
  if (p.status !== "received") return false;
  if (!ymOpt) return true;
  if (!p.receivedAt) return false;
  const d = new Date(p.receivedAt);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}` === ymOpt;
}

export const summary = query({
  args: { adminToken: v.string(), settlementMonth: v.optional(v.string()) }, // 'YYYY-MM'
  handler: async (ctx, { adminToken, settlementMonth }) => {
    await assertAdminRead(ctx, adminToken);
    const cfg = await ctx.db.query("config").first();
    const fallbackJj = cfg?.jjSharePercentage ?? DEFAULT_JJ_PCT;
    const fallbackKaren = cfg?.karenSharePercentage ?? DEFAULT_KAREN_PCT;

    const allPayments = await ctx.db.query("payments").collect();
    const payments = allPayments.filter((p) => inMonth(p, settlementMonth));

    let transfers = await ctx.db.query("settlementTransfers").collect();
    if (settlementMonth) {
      transfers = transfers.filter((t) => t.settlementMonth === settlementMonth);
    }

    const split = await buildSplitLookup(
      ctx,
      payments,
      fallbackJj,
      fallbackKaren
    );

    const result = summariseSettlement(
      payments as unknown as PaymentLike[],
      transfers,
      split
    );

    // Per-method breakdown for the partner-settlement page.
    const byMethod = new Map<
      string,
      {
        method: string;
        amount: number;
        collectedBy: { JJ: number; Karen: number };
        count: number;
      }
    >();
    for (const p of payments) {
      const amt = signedAmount(p as unknown as PaymentLike);
      if (amt === 0) continue;
      const row = byMethod.get(p.method) ?? {
        method: p.method,
        amount: 0,
        collectedBy: { JJ: 0, Karen: 0 },
        count: 0,
      };
      row.amount += amt;
      row.collectedBy[p.collectedBy] += amt;
      row.count += 1;
      byMethod.set(p.method, row);
    }

    return {
      ...result,
      paymentMethodBreakdown: Array.from(byMethod.values()).sort(
        (a, b) => b.amount - a.amount
      ),
      transfers,
    };
  },
});

export const listTransfers = query({
  args: { adminToken: v.string(), settlementMonth: v.optional(v.string()) },
  handler: async (ctx, { adminToken, settlementMonth }) => {
    await assertAdminRead(ctx, adminToken);
    const all = await ctx.db.query("settlementTransfers").order("desc").collect();
    return settlementMonth
      ? all.filter((t) => t.settlementMonth === settlementMonth)
      : all;
  },
});

export const recordTransfer = mutation({
  args: {
    adminToken: v.string(),
    fromPartner: partner,
    toPartner: partner,
    amount: v.number(),
    date: v.string(),
    method: v.string(),
    settlementMonth: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminToken);
    if (args.fromPartner === args.toPartner)
      throw new Error("From and To partner must differ.");
    if (args.amount <= 0) throw new Error("Amount must be greater than zero.");
    const now = Date.now();
    return await ctx.db.insert("settlementTransfers", {
      fromPartner: args.fromPartner,
      toPartner: args.toPartner,
      amount: args.amount,
      currency: "USD",
      date: args.date,
      method: args.method,
      settlementMonth: args.settlementMonth,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removeTransfer = mutation({
  args: { adminToken: v.string(), id: v.id("settlementTransfers") },
  handler: async (ctx, { adminToken, id }) => {
    await assertAdmin(ctx, adminToken);
    await ctx.db.delete(id);
  },
});
