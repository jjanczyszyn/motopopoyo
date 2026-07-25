# Changelog

## Unreleased

### Added
- **One-tap payment recording.** Bookings and Payments now show a green
  "Mark paid · $X" button that records the whole outstanding balance as
  received on the rental's **start date**, using the booking's own payment
  method and that method's default collector. Anything unusual (part payment,
  different method or date) is a second tap away via "Custom…" / "Edit". The
  giant "+ Record payment for…" `<select>` is gone, replaced by an "Awaiting
  payment" list.
- **Mobile-first admin.** Phones get a fixed bottom tab bar (Home, Bookings,
  Payments, Motos, More) instead of a 9-tab horizontal scroller whose active
  tab could start off-screen; a floating "+ New booking" button in thumb
  reach; collapsible booking filters; card layouts instead of side-scrolling
  tables in Payments, Settlement and Settings; and full-screen modal sheets
  with a sticky footer action. Fields are 16px on touch (iOS no longer zooms
  the page on focus) and every control is at least a 44px tap target.
- **End-to-end tests** (Playwright, desktop + iPhone viewports) running in CI
  on every PR — public site pricing and review dates, admin login gate, touch
  target sizing, and no-horizontal-overflow checks. Signed-in admin specs run
  when `E2E_ADMIN_USER` / `E2E_ADMIN_PASSWORD` are set.

### Fixed
- The admin ignored hash changes, so browser Back/Forward and deep links like
  `/admin#settings` left the URL and the visible section out of sync — with no
  browser chrome in PWA standalone mode there was no way back.
- The cookie-consent banner is no longer shown on `/admin`; it is fixed to the
  bottom of the screen, directly on top of the new tab bar.
- Clearing a motorcycle's per-bike daily rate silently did nothing (an
  `undefined` field can't be distinguished from "not editing it"), so a bike
  could never be returned to the global rate.
- Saving only one partner's share percentage skipped validation entirely,
  allowing a 80/30 split that doesn't add up to 100%.
- Balance arithmetic now lives in `convex/lib/balance.ts` and is shared by the
  booking list and the payment writer, so the amount on the button is always
  the amount recorded; cent-rounding stops a booking sitting at an
  unclearable $0.004.

## Season pricing + review dates

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
