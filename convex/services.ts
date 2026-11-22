import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertAdmin, assertAdminRead } from "./admin";
import { todayNicaragua, whoFor } from "./quick";
import { isISODate } from "./lib/quick";
import {
  MAX_CLIENT_NAME, MAX_SERVICE_NAME, canEditService, cleanText, commissionUSD, recentNames,
  roundUSD, serviceProblem, serviceTotals,
} from "./lib/services";

// Services sold on commission, logged by a partner on /new ("Servicio") and
// reviewed in the admin ("Services"). Kept apart from `payments` on purpose:
// moto revenue and the partner settlement don't include them.
// See docs/adr/0001-service-commissions.md.

const fields = {
  serviceName: v.string(),
  date: v.string(),
  priceUSD: v.number(),
  costUSD: v.number(),
  clientName: v.optional(v.string()),
};

type Input = {
  serviceName: string; date: string; priceUSD: number; costUSD: number; clientName?: string;
};

function checked(input: Input) {
  const problem = serviceProblem(input, todayNicaragua());
  if (problem) throw new ConvexError(problem);
  return {
    serviceName: cleanText(input.serviceName, MAX_SERVICE_NAME),
    date: input.date,
    priceUSD: roundUSD(input.priceUSD),
    costUSD: roundUSD(input.costUSD),
    clientName: cleanText(input.clientName, MAX_CLIENT_NAME) || undefined,
  };
}

const receipt = (s: ReturnType<typeof checked>) => ({
  serviceName: s.serviceName,
  date: s.date,
  priceUSD: s.priceUSD,
  costUSD: s.costUSD,
  commissionUSD: commissionUSD(s.priceUSD, s.costUSD),
});

async function editable(ctx: MutationCtx, adminToken: string, id: Id<"serviceSales">) {
  const who = whoFor((await assertAdmin(ctx, adminToken)).username);
  const s = await ctx.db.get(id);
  if (!s || !canEditService(s, who, Date.now())) {
    throw new ConvexError(
      "QUICK_EDIT_CLOSED: this service can only be changed by whoever added it, within 24 hours."
    );
  }
  return { who, s };
}

/** For the /new form: her services from the last 24 hours, and names used before. */
export const mine = query({
  args: { adminToken: v.string() },
  handler: async (ctx, { adminToken }) => {
    const who = whoFor((await assertAdminRead(ctx, adminToken)).username);
    const now = Date.now();
    const recent = await ctx.db.query("serviceSales").order("desc").take(200);
    return {
      names: recentNames(recent, 6),
      rows: recent
        .filter((s) => canEditService(s, who, now))
        .map((s) => ({
          _id: s._id,
          serviceName: s.serviceName,
          date: s.date,
          priceUSD: s.priceUSD,
          costUSD: s.costUSD,
          commissionUSD: commissionUSD(s.priceUSD, s.costUSD),
          clientName: s.clientName ?? "",
        })),
    };
  },
});

export const create = mutation({
  args: { adminToken: v.string(), ...fields },
  handler: async (ctx, { adminToken, ...input }) => {
    const who = whoFor((await assertAdmin(ctx, adminToken)).username);
    const s = checked(input);
    const now = Date.now();
    await ctx.db.insert("serviceSales", { ...s, addedBy: who, createdAt: now, updatedAt: now });
    return receipt(s);
  },
});

export const update = mutation({
  args: { adminToken: v.string(), id: v.id("serviceSales"), ...fields },
  handler: async (ctx, { adminToken, id, ...input }) => {
    await editable(ctx, adminToken, id);
    const s = checked(input);
    await ctx.db.patch(id, { ...s, updatedAt: Date.now() });
    return receipt(s);
  },
});

/** Soft delete by its author within 24 hours; the row stays on record. */
export const remove = mutation({
  args: { adminToken: v.string(), id: v.id("serviceSales") },
  handler: async (ctx, { adminToken, id }) => {
    const { who, s } = await editable(ctx, adminToken, id);
    const now = Date.now();
    await ctx.db.patch(id, { deletedAt: now, deletedBy: who, updatedAt: now });
    return receipt(s as ReturnType<typeof checked>);
  },
});

/** Admin soft delete, at any age. */
export const adminDelete = mutation({
  args: { adminToken: v.string(), id: v.id("serviceSales") },
  handler: async (ctx, { adminToken, id }) => {
    const who = whoFor((await assertAdmin(ctx, adminToken)).username);
    const s = await ctx.db.get(id);
    if (!s) throw new ConvexError("That service doesn't exist.");
    if (s.deletedAt !== undefined) return;
    const now = Date.now();
    await ctx.db.patch(id, { deletedAt: now, deletedBy: who, updatedAt: now });
  },
});

/** Services in [fromISO, toISO), newest first, with their totals and all-time totals. */
export const list = query({
  args: { adminToken: v.string(), fromISO: v.string(), toISO: v.string() },
  handler: async (ctx, { adminToken, fromISO, toISO }) => {
    await assertAdminRead(ctx, adminToken);
    if (!isISODate(fromISO) || !isISODate(toISO)) throw new ConvexError("Bad date range.");
    const all = await ctx.db.query("serviceSales").collect();
    const rows = all
      .filter((s) => s.deletedAt === undefined && s.date >= fromISO && s.date < toISO)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
      .map((s) => ({ ...s, commissionUSD: commissionUSD(s.priceUSD, s.costUSD) }));
    return { rows, totals: serviceTotals(rows), allTime: serviceTotals(all) };
  },
});
