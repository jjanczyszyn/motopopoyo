import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { assertAdmin } from "./admin";
import {
  DEFAULT_SEASON,
  DEFAULT_SEASON_RATES,
  ratesForDaily,
  type Season,
  type SeasonRates,
} from "./lib/season";

// Season presets on the config row, back-filled with the defaults for rows
// written before seasonal pricing existed.
function seasonRatesOf(cfg: Doc<"config">): Record<Season, SeasonRates> {
  return cfg.seasonRates ?? DEFAULT_SEASON_RATES;
}

function activeSeason(cfg: Doc<"config">): Season {
  return cfg.season ?? DEFAULT_SEASON;
}

// The config row is always present after `seed:all` runs at deploy time.
// Returning `null` is safe — every consumer already uses optional chaining
// while the query is loading.
export const get = query({
  args: {},
  handler: async (ctx): Promise<Doc<"config"> | null> => {
    return await ctx.db.query("config").first();
  },
});

export const updateBusiness = mutation({
  args: {
    adminToken: v.string(),
    businessName: v.optional(v.string()),
    currency: v.optional(v.string()),
    timezone: v.optional(v.string()),
    dailyRate: v.optional(v.number()),
    weeklyRate: v.optional(v.number()),
    monthlyRate: v.optional(v.number()),
    deposit: v.optional(v.number()),
    jjSharePercentage: v.optional(v.number()),
    karenSharePercentage: v.optional(v.number()),
  },
  handler: async (ctx, { adminToken, ...patch }) => {
    await assertAdmin(ctx, adminToken);
    const cfg = await ctx.db.query("config").first();
    if (!cfg) throw new Error("Config row missing — run seed.all first.");
    // Validate against the stored values when only one side is being edited —
    // otherwise saving "JJ 80" alone would leave the pair at 80/30.
    const nextJj = patch.jjSharePercentage ?? cfg.jjSharePercentage ?? 70;
    const nextKaren = patch.karenSharePercentage ?? cfg.karenSharePercentage ?? 30;
    if (
      (patch.jjSharePercentage !== undefined ||
        patch.karenSharePercentage !== undefined) &&
      nextJj + nextKaren !== 100
    ) {
      throw new Error(
        `JJ + Karen share must equal 100% (got ${nextJj} + ${nextKaren}).`
      );
    }
    const next: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) next[k] = val;
    }
    // A manual rate edit belongs to whichever season is active, otherwise the
    // next season switch would silently revert it.
    if (
      patch.dailyRate !== undefined ||
      patch.weeklyRate !== undefined ||
      patch.monthlyRate !== undefined
    ) {
      const season = activeSeason(cfg);
      const rates = seasonRatesOf(cfg);
      next.seasonRates = {
        ...rates,
        [season]: {
          daily: patch.dailyRate ?? cfg.dailyRate,
          weekly: patch.weeklyRate ?? cfg.weeklyRate,
          monthly: patch.monthlyRate ?? cfg.monthlyRate,
        },
      };
    }
    await ctx.db.patch(cfg._id, next);
  },
});

// Switch the live price list. Existing reservations keep the rate they were
// booked at — they store dailyRateUSD/totalUSD at creation time.
export const setSeason = mutation({
  args: {
    adminToken: v.string(),
    season: v.union(v.literal("high"), v.literal("low")),
  },
  handler: async (ctx, { adminToken, season }) => {
    await assertAdmin(ctx, adminToken);
    const cfg = await ctx.db.query("config").first();
    if (!cfg) throw new Error("Config row missing — run seed.all first.");
    const rates = seasonRatesOf(cfg)[season];
    await ctx.db.patch(cfg._id, {
      season,
      seasonRates: seasonRatesOf(cfg),
      dailyRate: rates.daily,
      weeklyRate: rates.weekly,
      monthlyRate: rates.monthly,
    });
    return rates;
  },
});

// Edit one season's price list. Omitting weekly/monthly re-derives them from
// the daily rate so the discount ladder stays proportional.
export const setSeasonRates = mutation({
  args: {
    adminToken: v.string(),
    season: v.union(v.literal("high"), v.literal("low")),
    daily: v.number(),
    weekly: v.optional(v.number()),
    monthly: v.optional(v.number()),
  },
  handler: async (ctx, { adminToken, season, daily, weekly, monthly }) => {
    await assertAdmin(ctx, adminToken);
    const cfg = await ctx.db.query("config").first();
    if (!cfg) throw new Error("Config row missing — run seed.all first.");
    if (!(daily > 0)) throw new Error("Daily rate must be greater than 0.");
    const derived = ratesForDaily(daily);
    const rates: SeasonRates = {
      daily,
      weekly: weekly ?? derived.weekly,
      monthly: monthly ?? derived.monthly,
    };
    const next: Record<string, unknown> = {
      seasonRates: { ...seasonRatesOf(cfg), [season]: rates },
    };
    if (activeSeason(cfg) === season) {
      next.dailyRate = rates.daily;
      next.weeklyRate = rates.weekly;
      next.monthlyRate = rates.monthly;
    }
    await ctx.db.patch(cfg._id, next);
    return rates;
  },
});

export const setPaymentMethodCollector = mutation({
  args: {
    adminToken: v.string(),
    methodId: v.string(),
    defaultCollector: v.union(
      v.literal("JJ"),
      v.literal("Karen"),
      v.literal("manual")
    ),
  },
  handler: async (ctx, { adminToken, methodId, defaultCollector }) => {
    await assertAdmin(ctx, adminToken);
    const cfg = await ctx.db.query("config").first();
    if (!cfg) throw new Error("Config row missing — run seed.all first.");
    const next = cfg.paymentMethods.map((m) =>
      m.id === methodId ? { ...m, defaultCollector } : m
    );
    await ctx.db.patch(cfg._id, { paymentMethods: next });
  },
});
