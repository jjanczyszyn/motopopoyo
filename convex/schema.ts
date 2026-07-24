import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  config: defineTable({
    // Effective rates for the *active* season — every consumer reads these.
    // Switching seasons rewrites them from `seasonRates` (see lib/season.ts).
    dailyRate: v.number(),
    weeklyRate: v.number(),
    monthlyRate: v.number(),
    season: v.optional(v.union(v.literal("high"), v.literal("low"))),
    seasonRates: v.optional(
      v.object({
        high: v.object({
          daily: v.number(),
          weekly: v.number(),
          monthly: v.number(),
        }),
        low: v.object({
          daily: v.number(),
          weekly: v.number(),
          monthly: v.number(),
        }),
      })
    ),
    deliveryStart: v.number(),
    deliveryEnd: v.number(),
    deposit: v.number(),
    contractTerms: v.string(),
    paymentMethods: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        sub: v.string(),
        detail: v.array(v.string()),
        enabled: v.boolean(),
        url: v.optional(v.string()),
        // Default partner who physically receives money paid via this method.
        // Per-payment override still wins — see payments.collectedBy.
        defaultCollector: v.optional(
          v.union(v.literal("JJ"), v.literal("Karen"), v.literal("manual"))
        ),
      })
    ),
    // Partner split (defaults 70/30). Stored on each booking when created so
    // historical reports stay stable if the split changes later.
    jjSharePercentage: v.optional(v.number()),
    karenSharePercentage: v.optional(v.number()),
    businessName: v.optional(v.string()),
    currency: v.optional(v.string()),
    timezone: v.optional(v.string()),
  }),

  bikes: defineTable({
    slug: v.string(),
    name: v.string(),
    color: v.string(),
    type: v.union(v.literal("Electric"), v.literal("Gas")),
    plate: v.string(),
    range: v.string(),
    image: v.string(),
    isActive: v.boolean(),
    // Operational status (admin spec). isActive stays in sync with this:
    // status === "active" implies isActive true; anything else implies false.
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("inactive"),
        v.literal("maintenance"),
        v.literal("sold")
      )
    ),
    // Per-bike override of the global daily rate. Falls back to config.dailyRate.
    dailyRate: v.optional(v.number()),
    notes: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  reservations: defineTable({
    code: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("active"),
      v.literal("returned"),
      v.literal("cancelled")
    ),

    bikeId: v.id("bikes"),
    startDate: v.string(),
    endDate: v.string(),
    days: v.number(),
    totalUSD: v.number(),

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
    paidAt: v.optional(v.number()),
    paidConfirmedBy: v.optional(v.string()),

    signatureMode: v.union(v.literal("draw"), v.literal("type")),
    signaturePng: v.optional(v.id("_storage")),
    signatureTyped: v.optional(v.string()),
    contractPdfId: v.optional(v.id("_storage")),
    signedAt: v.optional(v.number()),

    deliveryAddr: v.string(),
    deliveryHour: v.number(),
    deliveryDate: v.optional(v.string()),

    // Admin-panel additions
    customerEmail: v.optional(v.string()),
    source: v.optional(v.string()), // whatsapp | website | referral | hotel_partner | walk_in | instagram | facebook | other
    discount: v.optional(v.number()),
    dailyRateUSD: v.optional(v.number()),
    jjSharePct: v.optional(v.number()),
    karenSharePct: v.optional(v.number()),
    notes: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_phone", ["phoneCC", "phoneNum"])
    .index("by_status", ["status"])
    .index("by_bike_dates", ["bikeId", "startDate"]),

  // Each customer payment received against a booking. Source of truth for
  // revenue and settlement — `reservations.paidAt` is legacy single-shot data.
  payments: defineTable({
    reservationId: v.id("reservations"),
    amount: v.number(),
    currency: v.optional(v.string()),
    method: v.string(), // matches config.paymentMethods[].id
    collectedBy: v.union(v.literal("JJ"), v.literal("Karen")),
    paymentType: v.union(
      v.literal("deposit"),
      v.literal("balance"),
      v.literal("full_payment"),
      v.literal("refund")
    ),
    status: v.union(
      v.literal("received"),
      v.literal("pending"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("refunded")
    ),
    receivedAt: v.optional(v.number()), // ms epoch; required when status=received
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_reservation", ["reservationId"])
    .index("by_status", ["status"])
    .index("by_receivedAt", ["receivedAt"]),

  settlementTransfers: defineTable({
    fromPartner: v.union(v.literal("JJ"), v.literal("Karen")),
    toPartner: v.union(v.literal("JJ"), v.literal("Karen")),
    amount: v.number(),
    currency: v.optional(v.string()),
    date: v.string(), // ISO YYYY-MM-DD
    method: v.string(),
    settlementMonth: v.string(), // 'YYYY-MM'
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_month", ["settlementMonth"])
    .index("by_date", ["date"]),

  // Maintenance/blocked days that aren't tied to a booking. Booking-driven
  // unavailability is computed from reservations themselves at query time.
  motorcycleAvailability: defineTable({
    bikeId: v.id("bikes"),
    date: v.string(), // ISO YYYY-MM-DD
    status: v.union(v.literal("maintenance"), v.literal("blocked")),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_bike_date", ["bikeId", "date"])
    .index("by_date", ["date"]),

  adminSessions: defineTable({
    token: v.string(),
    expiresAt: v.number(),
    username: v.optional(v.union(v.literal("karen"), v.literal("jj"))),
  }).index("by_token", ["token"]),

  reviews: defineTable({
    googleId: v.string(),
    name: v.string(),
    rating: v.number(),
    text: v.string(),
    // When the reviewer actually posted it (epoch ms). The site renders a real
    // date from this — never a "N days ago" string, which goes stale the day
    // after it is written. `when` is the legacy relative string, kept only so
    // older rows still validate.
    publishedAt: v.optional(v.number()),
    when: v.optional(v.string()),
    profilePic: v.optional(v.string()),
    fetchedAt: v.number(),
  })
    .index("by_rating", ["rating"])
    .index("by_googleId", ["googleId"]),
});
