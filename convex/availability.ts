import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertAdmin, assertAdminRead } from "./admin";

const statusValidator = v.union(
  v.literal("maintenance"),
  v.literal("blocked")
);

export const list = query({
  args: {
    adminToken: v.string(),
    bikeId: v.optional(v.id("bikes")),
    fromISO: v.optional(v.string()),
    toISO: v.optional(v.string()),
  },
  handler: async (ctx, { adminToken, bikeId, fromISO, toISO }) => {
    await assertAdminRead(ctx, adminToken);
    const all = await ctx.db.query("motorcycleAvailability").collect();
    return all.filter((row) => {
      if (bikeId && row.bikeId !== bikeId) return false;
      if (fromISO && row.date < fromISO) return false;
      if (toISO && row.date >= toISO) return false;
      return true;
    });
  },
});

export const setRange = mutation({
  args: {
    adminToken: v.string(),
    bikeId: v.id("bikes"),
    fromISO: v.string(), // inclusive
    toISO: v.string(), // exclusive
    status: statusValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { adminToken, bikeId, fromISO, toISO, status, notes }) => {
    await assertAdmin(ctx, adminToken);
    if (toISO <= fromISO) throw new Error("toISO must be after fromISO.");
    const now = Date.now();
    let cursor = fromISO;
    while (cursor < toISO) {
      const existing = await ctx.db
        .query("motorcycleAvailability")
        .withIndex("by_bike_date", (q) => q.eq("bikeId", bikeId).eq("date", cursor))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { status, notes });
      } else {
        await ctx.db.insert("motorcycleAvailability", {
          bikeId,
          date: cursor,
          status,
          notes,
          createdAt: now,
        });
      }
      cursor = addDay(cursor);
    }
  },
});

export const clearDay = mutation({
  args: {
    adminToken: v.string(),
    id: v.id("motorcycleAvailability"),
  },
  handler: async (ctx, { adminToken, id }) => {
    await assertAdmin(ctx, adminToken);
    await ctx.db.delete(id);
  },
});

function addDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
