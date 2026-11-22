import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertAdmin, assertAdminRead } from "./admin";
import { whoFor } from "./quick";
import { MAX_PER_DAY, checkReview } from "./lib/beautyReviews";

// Customer reviews for Popoyo Beauty, left on beauty.popoyo.co/review and
// shown there once an owner publishes them. They live here because this is the
// admin both owners log in to (docs/adr/0002-beauty-reviews.md).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Public: leave a review. It isn't shown until an owner publishes it. */
export const submit = mutation({
  args: {
    name: v.string(),
    rating: v.number(),
    text: v.string(),
    service: v.optional(v.string()),
    // Hidden field people never see; bots fill it in.
    website: v.optional(v.string()),
  },
  handler: async (ctx, { website, ...input }) => {
    if (website) return; // Look successful to the bot, keep nothing.
    const checked = checkReview(input);
    if (!checked.ok) throw new ConvexError(checked.problem);
    const now = Date.now();
    const today = await ctx.db
      .query("beautyReviews")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", now - DAY_MS))
      .take(MAX_PER_DAY);
    if (today.length >= MAX_PER_DAY) {
      throw new ConvexError("We can't take more reviews right now. Please try again tomorrow.");
    }
    await ctx.db.insert("beautyReviews", { ...checked.review, status: "pending", createdAt: now });
  },
});

/** Public: published reviews, newest first. Only what the site shows. */
export const published = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("beautyReviews")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map(({ _id, name, rating, text, service, createdAt }) => ({ _id, name, rating, text, service, createdAt }));
  },
});

export const list = query({
  args: { adminToken: v.string() },
  handler: async (ctx, { adminToken }) => {
    await assertAdminRead(ctx, adminToken);
    const rows = await ctx.db.query("beautyReviews").withIndex("by_createdAt").order("desc").take(300);
    return { rows, pending: rows.filter((r) => r.status === "pending").length };
  },
});

/** Publish or hide. The customer's words and stars can't be edited. */
export const setStatus = mutation({
  args: {
    adminToken: v.string(),
    id: v.id("beautyReviews"),
    status: v.union(v.literal("published"), v.literal("hidden")),
  },
  handler: async (ctx, { adminToken, id, status }) => {
    const who = whoFor((await assertAdmin(ctx, adminToken)).username);
    if (!(await ctx.db.get(id))) throw new ConvexError("That review doesn't exist.");
    await ctx.db.patch(id, { status, reviewedBy: who, reviewedAt: Date.now() });
  },
});
