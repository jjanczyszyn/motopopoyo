import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertAdmin, assertAdminRead } from "./admin";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("bikes").collect();
    return rows.filter((b) => b.isActive);
  },
});

// Admin listing — every bike, regardless of isActive/status.
export const listAll = query({
  args: { adminToken: v.string() },
  handler: async (ctx, { adminToken }) => {
    await assertAdminRead(ctx, adminToken);
    return await ctx.db.query("bikes").collect();
  },
});

export const availability = query({
  args: { startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { startDate, endDate }) => {
    const bikes = await ctx.db.query("bikes").collect();
    // Reservations that overlap with [startDate, endDate) and are not cancelled.
    const reservations = await ctx.db.query("reservations").collect();
    const blocking = reservations.filter(
      (r) =>
        r.status !== "cancelled" &&
        r.status !== "returned" &&
        // overlap test: r.startDate < endDate && r.endDate > startDate
        r.startDate < endDate &&
        r.endDate > startDate
    );
    const busyByBike = new Set<string>(blocking.map((r) => r.bikeId));
    return bikes
      .filter((b) => b.isActive)
      .map((b) => ({ bikeId: b._id, available: !busyByBike.has(b._id) }));
  },
});

const SEED = [
  {
    slug: "genesis-red",
    name: "Genesis KLIK",
    color: "Red",
    type: "Electric" as const,
    plate: "RI 50272",
    range: "70 km range",
    image: "assets/genesis-red.png",
    isActive: true,
  },
  {
    slug: "genesis-blue",
    name: "Genesis KLIK",
    color: "Blue",
    type: "Electric" as const,
    plate: "RI 50273",
    range: "70 km range",
    image: "assets/genesis-blue.png",
    isActive: true,
  },
  {
    slug: "yamaha-xt",
    name: "Yamaha XT 125",
    color: "White",
    type: "Gas" as const,
    plate: "RI 46495",
    range: "125cc · 4-speed",
    image: "assets/yamaha-xt125.png",
    isActive: true,
  },
];

export const ensureSeeded = mutation({
  args: {},
  handler: async (ctx) => {
    const inserted: Id<"bikes">[] = [];
    for (const b of SEED) {
      const existing = await ctx.db
        .query("bikes")
        .withIndex("by_slug", (q) => q.eq("slug", b.slug))
        .first();
      if (!existing) {
        const id = await ctx.db.insert("bikes", b);
        inserted.push(id);
      }
    }
    return inserted;
  },
});

export const setActive = mutation({
  args: { bikeId: v.id("bikes"), isActive: v.boolean(), adminToken: v.string() },
  handler: async (ctx, { bikeId, isActive, adminToken }) => {
    await assertAdmin(ctx, adminToken);
    // Keep the new `status` field in lockstep so the admin UI stays correct
    // even when toggled from the legacy active checkbox.
    await ctx.db.patch(bikeId, {
      isActive,
      status: isActive ? "active" : "inactive",
    });
  },
});

export const setStatus = mutation({
  args: {
    adminToken: v.string(),
    bikeId: v.id("bikes"),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("maintenance"),
      v.literal("sold")
    ),
  },
  handler: async (ctx, { adminToken, bikeId, status }) => {
    await assertAdmin(ctx, adminToken);
    await ctx.db.patch(bikeId, {
      status,
      isActive: status === "active",
    });
  },
});

export const updateBike = mutation({
  args: {
    adminToken: v.string(),
    bikeId: v.id("bikes"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    plate: v.optional(v.string()),
    range: v.optional(v.string()),
    image: v.optional(v.string()),
    dailyRate: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { adminToken, bikeId, ...patch }) => {
    await assertAdmin(ctx, adminToken);
    const next: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) next[k] = val;
    }
    await ctx.db.patch(bikeId, next);
  },
});

// Admin patch: update editable fields on a bike by slug. Used to roll a
// dev-side edit forward to prod without going through the dashboard.
export const patchBySlug = mutation({
  args: {
    slug: v.string(),
    plate: v.optional(v.string()),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    range: v.optional(v.string()),
    image: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    adminToken: v.string(),
  },
  handler: async (ctx, { slug, adminToken, ...fields }) => {
    await assertAdmin(ctx, adminToken);
    const bike = await ctx.db
      .query("bikes")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!bike) throw new Error(`No bike with slug ${slug}`);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(bike._id, patch);
    return bike._id;
  },
});
