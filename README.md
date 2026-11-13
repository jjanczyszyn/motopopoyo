# Karen & JJ Moto Rental

Customer-facing moto-rental booking flow for Popoyo, Nicaragua.

- **Live site:** [moto.popoyo.co](https://moto.popoyo.co/)
- **Admin panel:** [moto.popoyo.co/#/admin](https://moto.popoyo.co/#/admin) — password-gated (owner credentials, see local notes / `src/screens/Admin.tsx`)

## Local development

```sh
npm install

# Backend (Convex dev deployment) in one terminal
npm run convex:dev

# Frontend in another
npm run dev   # → http://localhost:5173
```

Tests:
```sh
npm test           # vitest, all green = ship-ready
npm run typecheck
npm run build      # production bundle
```

## Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React + TypeScript, hosted on GitHub Pages |
| Backend | Convex — schema, queries, mutations, scheduled functions |
| Payments | Display-only contact details (Cash, Venmo, Zelle, PayPal, Wise, Revolut, Apple Pay, bank transfer). Confirmation happens out-of-band over WhatsApp. |
| OCR | tesseract.js in-browser, parser at `src/lib/ocrParse.ts` (TD3 + TD1 MRZ + visual-zone heuristics) |

## Pricing & seasons

Two price lists live on the `config` row, and admin → Settings → **Season
pricing** switches which one is live with one click:

| Season | Per day | Per week | Per month |
|---|---|---|---|
| High | $20 | $120 | $450 |
| Low | $18 | $108 | $405 |

The weekly/monthly rates are proportional in both seasons — a week bills as
6 days (~14% off) and a month as 22.5 days (25% off) — so switching seasons
never distorts the long-rental discounts. Defaults and the derivation live in
`convex/lib/season.ts`; editing a daily rate in admin re-derives the other two
unless they are overridden by hand.

`config.dailyRate / weeklyRate / monthlyRate` always hold the **active**
season's rates, so the site, contract and booking maths read them unchanged.
Existing reservations store the rate they were booked at and are unaffected by
a season switch. Editing a booking's dates re-prices it from its **own** stored daily rate
(`dailyRateUSD`), never today's season. An admin can set an **agreed price**
(a negotiated deal); such bookings (`agreedPrice: true`) are never re-priced
automatically.

## Google reviews

The home page carousel is fed from the `reviews` table and shows each review's
**actual publication date** (`publishedAt`), localised per language — never a
"3 months ago" string, which freezes at fetch time and goes stale.

`convex/reviews.ts:refresh` (daily cron, 12:00 UTC) pulls the latest reviews
from the Google Places API (New) and upserts them by review id. It is a no-op
until both Convex env vars are set:

```
npx convex env set --prod GOOGLE_PLACES_API_KEY <key>
npx convex env set --prod GOOGLE_PLACE_ID <place id of the Google listing>
npx convex run --prod reviews:refresh   # optional: sync immediately
```

Place Details returns up to 5 reviews per call, so rows accumulate — reviews
Google stops returning are kept, never deleted.

## Admin panel

`moto.popoyo.co/admin` — operator tool for Karen and JJ, used mostly one-handed
on a phone while a customer waits, and installable as a PWA.

- **Phones** get a fixed bottom tab bar (Home · Bookings · Payments · Motos ·
  More), a floating "+ New booking" button in thumb reach, card layouts in
  place of side-scrolling tables, and full-screen modal sheets. Controls are
  ≥44px and fields render at 16px so iOS doesn't zoom on focus (see the
  `.admin-root` rules in `index.html` — they need `!important` because every
  control is styled inline).
- **Recording a payment is one tap.** "Mark paid · $X" books the whole
  outstanding balance on the rental's start date with the booking's payment
  method and that method's default collector (`payments.markPaid`). Custom
  amounts, methods or dates go through "Custom…" / "Edit". The Payments tab lists
  **Overdue** bookings (rental started, nothing recorded) apart from
  **Upcoming** ones, asks before recording, and never dates a payment in the
  future.
- **Booking integrity.** Every booking write (`create`, `adminCreate`,
  `adminUpdate`) refuses a bike that is already held (pending, confirmed or
  active) or blocked for maintenance on any of those days; a return day can be
  the next renter's start day. Admins may save anyway after a warning (for
  back-filling past rentals). Rules live in `convex/lib/integrity.ts`.
- **Data checks.** Overpaid bookings show their credit ("+$X credit"). Names
  the ID scan probably got wrong (an ID-card heading, initials only) are saved
  with `needsReview` and get a "Check name" badge. `cancel`, `setDelivery`,
  `attachDoc` and `attachSignature` require an admin login.
- **Hand-made data changes** to production are recorded in
  [`docs/data-log.md`](docs/data-log.md) and tagged in the record's notes.
- Desktop keeps the wide tables, the column picker and the top tab row.

## Quick "New rental" page

`moto.popoyo.co/new` is a one-screen page for a partner to log a rental from
their phone in a few taps: start day → number of days → moto → price → Save.
Optional renter name; the "Ya me pagó" (paid in cash) toggle starts **on**,
so a saved rental is recorded as paid unless she unticks it. The page is in
simple Spanish (for Karen); server errors are mapped to plain Spanish in
`src/lib/quickText.ts`.

- **Same login as `/admin`** (username + password, `ADMIN_KAREN_PASSWORD` /
  `ADMIN_JJ_PASSWORD`), sharing its session, so signing in on one signs in both.
- **Functions** (`convex/quick.ts`, all need an admin session): `me` (who's
  signed in and today's date in Popoyo), `options` (active bikes, free/booked
  for the chosen days, list price) and `create` (insert the booking).
- **What a saved rental looks like:** source `walk_in`, note "Added by Karen
  via quick add", status from the dates (ahead → confirmed, running → active,
  past → returned), `agreedPrice` when the price differs from the list price,
  `needsReview` ("Check name") when no name was given. "Already paid" records
  one cash payment collected by the signed-in partner, dated the start day.
- Same double-booking/maintenance guard as every other booking write; past
  rentals (back-fills) skip it. Helpers and tests: `convex/lib/quick.ts`.

## Usage & error log

Admin → **More → Activity & errors** shows what people do and what breaks:
site visitors and completed bookings over 30 days, the **booking funnel** (how
many visitors reached each step, so drop-offs stand out), and a filterable
list of events (everything / errors / renter site / admin), in Nicaragua time.

| Logged | Event |
|---|---|
| Site or admin opened (with referrer host) | `visit` `site_open` / `admin_open` |
| Each renter screen reached | `step` `screen:<step>` |
| Each admin tab opened | `step` `tab:<tab>` |
| Booking created / failed, admin login / failed login | `action` |
| Failed server call (function + message), JS error, unhandled promise, screen crash | `error` |

How it works: `src/lib/telemetry.ts` batches events to the public
`events.log` mutation and wraps the Convex client so every failed mutation or
action is logged with its function name. `convex/events.ts` stores them in the
`events` table (indexes `by_at`, `by_kind_at`); a daily cron
(`events.prune`, 09:00 UTC) deletes events older than 90 days.

Privacy: no names, phone numbers, ID data or passwords are logged, only a
random per-tab session id, device type, locale, path and our own messages.
Free text is scrubbed server-side (emails, long digit runs, tokens). Admin
events carry the admin username. Automated browsers (`navigator.webdriver`,
including our e2e tests) are not logged.

Cost: well inside Convex's free tier (a visit is roughly 5–15 small rows,
kept 90 days).

## Testing

| Command | What it runs |
|---|---|
| `npm test` | Unit tests (vitest) — pricing, seasons, balances, OCR parsing, dates, phones |
| `npm run test:e2e` | End-to-end (Playwright) against a production build, desktop + iPhone |
| `npm run test:ocr` | OCR accuracy harness — slow, local only |

CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, build and the e2e
suite on every pull request. The signed-in admin e2e specs are skipped unless
`E2E_ADMIN_USER` / `E2E_ADMIN_PASSWORD` are set (locally, or as repo secrets).
The signed-in quick-add form spec uses the same variables and never saves.

## Deployment topology

- **GitHub Pages**: workflow at `.github/workflows/deploy.yml` builds on push to `main` and serves `moto.popoyo.co` (custom domain, `public/CNAME`).
- **Convex prod**: deployment `tough-meadowlark-233`. Live site reads from this. Update with `CONVEX_DEPLOY_KEY=<prod key> npx convex deploy`, then `npx convex run --prod seed:all '{}'` to re-seed bikes / reviews / payment methods.
- **Convex dev**: deployment `third-kookabura-106`. Local development only — edits in this dashboard do **not** propagate to the live site. See [CLAUDE.md](./CLAUDE.md).

## Layout

```
src/
  App.tsx                     # router (mobile vs desktop branches), reservation flow shell
  components/
    BikeIllustration.tsx      # bike SVG/photo + style-by-slug
    CountrySelect.tsx         # searchable flag-and-name dropdown
    ExpiryField.tsx           # dd-mm-YYYY ↔ ISO date input
    PaymentIcon.tsx           # cash emoji + brand SVGs (venmo/zelle/paypal/wise/revolut/applepay)
    Common.tsx, Icons.tsx
  screens/                    # one file per step in the rental flow
    Home.tsx Calendar.tsx BikePick.tsx OCR.tsx Phone.tsx
    Payment.tsx Contract.tsx Delivery.tsx Done.tsx Admin.tsx
    Quick.tsx                 # /new partner quick-add page (owner login)
  hooks/useReservationDraft.ts
  lib/                        # pure logic with vitest coverage
    pricing.ts dates.ts countries.ts ocrParse.ts phone.ts assets.ts
convex/
  schema.ts                   # config / bikes / reservations / reviews
  config.ts bikes.ts reservations.ts reviews.ts
  contract.ts ocr.ts storage.ts crons.ts seed.ts
  quick.ts                    # /new page: me / options / create
  lib/pricing.ts              # shared with frontend
public/
  assets/                     # bike photos, logo, helmet, payment brand SVGs
  CNAME                       # custom domain pin
tests-local/                  # gitignored — see CLAUDE.md
```

## Project conventions

See [CLAUDE.md](./CLAUDE.md) for the rules followed when working on this repo
(no secrets / personal documents in commits, dev-vs-prod Convex split, etc.).
