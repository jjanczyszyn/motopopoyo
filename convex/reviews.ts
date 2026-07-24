import { v } from "convex/values";
import { query, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeReviews, type PlacesReview } from "./lib/googleReviews";

export const fiveStar = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db
      .query("reviews")
      .withIndex("by_rating", (q) => q.eq("rating", 5))
      .collect();
    // Newest first, by the date the reviewer actually posted. `fetchedAt` is
    // only a fallback for rows written before publishedAt existed.
    return all
      .sort((a, b) => (b.publishedAt ?? b.fetchedAt) - (a.publishedAt ?? a.fetchedAt))
      .slice(0, 20);
  },
});

export const upsertMany = internalMutation({
  args: {
    items: v.array(
      v.object({
        googleId: v.string(),
        name: v.string(),
        rating: v.number(),
        text: v.string(),
        publishedAt: v.number(),
        profilePic: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { items }) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    for (const r of items) {
      const existing = await ctx.db
        .query("reviews")
        .withIndex("by_googleId", (q) => q.eq("googleId", r.googleId))
        .first();
      if (existing) {
        // `when` is the legacy "N days ago" string — clear it as rows are
        // refreshed so nothing can render a stale relative date.
        await ctx.db.patch(existing._id, { ...r, when: undefined, fetchedAt: now });
        updated += 1;
      } else {
        await ctx.db.insert("reviews", { ...r, fetchedAt: now });
        inserted += 1;
      }
    }
    return { inserted, updated };
  },
});

// Pulls the latest reviews from Google Places (New) and upserts them.
// Configured entirely through Convex env vars:
//   npx convex env set GOOGLE_PLACES_API_KEY <key>
//   npx convex env set GOOGLE_PLACE_ID <place id of the Google Business listing>
// Without them this is a no-op, so the daily cron stays green until the key
// is in place. Places Details returns up to 5 reviews per call, so rows
// accumulate — we never delete reviews Google stops returning.
export const refresh = internalAction({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; reason?: string; inserted?: number; updated?: number }> => {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    const placeId = process.env.GOOGLE_PLACE_ID;
    if (!key || !placeId) {
      console.warn(
        "[reviews.refresh] GOOGLE_PLACES_API_KEY / GOOGLE_PLACE_ID not set — skipping."
      );
      return { ok: false, reason: "not-configured" };
    }

    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "id,reviews",
        },
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Places API ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { reviews?: PlacesReview[] };
    const items = normalizeReviews(data.reviews ?? []);
    if (!items.length) return { ok: true, inserted: 0, updated: 0 };

    const counts = await ctx.runMutation(internal.reviews.upsertMany, { items });
    return { ok: true, ...counts };
  },
});
