# Changelog

## Unreleased

### Added
- **Seasonal pricing.** The `config` row now carries a high-season and a
  low-season price list, switchable from admin → Settings → Season pricing.
  High season is $20/day ($120/week, $450/month); low season is $18/day
  ($108/week, $405/month) — the same proportional discounts (a week bills as
  6 days, a month as 22.5 days). Editing a daily rate re-derives the weekly
  and monthly rates unless they are overridden by hand.
- **Google Places review sync.** `reviews.refresh` (daily cron) now calls the
  Places API (New) and upserts reviews by review id, storing Google's exact
  `publishTime`. Activates once `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACE_ID`
  are set in the Convex environment; a no-op otherwise.

- New 5-star Google review (Franziska Koch, May 2026) added to the seed.

### Changed
- Reviews on the home page show the **real publication date** (e.g.
  "30 April 2026", localised) instead of a hard-coded "4 days ago" string that
  froze at capture time. Seeded reviews carry the date they were actually
  posted, and the carousel sorts newest-first by that date.

### Removed
- The unused fake-review seed (`reviews.ensureSeeded`) and the unauthenticated
  public `reviews.upsertMany` mutation, which is now internal-only.
