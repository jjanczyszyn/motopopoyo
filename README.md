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
a season switch.

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
  hooks/useReservationDraft.ts
  lib/                        # pure logic with vitest coverage
    pricing.ts dates.ts countries.ts ocrParse.ts phone.ts assets.ts
convex/
  schema.ts                   # config / bikes / reservations / reviews
  config.ts bikes.ts reservations.ts reviews.ts
  contract.ts ocr.ts storage.ts crons.ts seed.ts
  lib/pricing.ts              # shared with frontend
public/
  assets/                     # bike photos, logo, helmet, payment brand SVGs
  CNAME                       # custom domain pin
tests-local/                  # gitignored — see CLAUDE.md
```

## Project conventions

See [CLAUDE.md](./CLAUDE.md) for the rules followed when working on this repo
(no secrets / personal documents in commits, dev-vs-prod Convex split, etc.).
