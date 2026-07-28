# Session handoff — 2026-07-28 12:48 UTC

## What this is

`moto.popoyo.co` — motorbike rental site for Karen & JJ in Popoyo, Nicaragua.
Vite + React on GitHub Pages, Convex backend, in-browser OCR for ID capture.
[README.md](./README.md) has the stack, schema, pricing model and test
commands; [CLAUDE.md](./CLAUDE.md) has the hard rules (no PII or secrets in
git, dev-vs-prod Convex split).

## Deploy / ops essentials

- **Frontend**: merge to `main` → `.github/workflows/deploy.yml` publishes to
  GitHub Pages (~45s).
- **CI** (`ci.yml`) runs typecheck + unit tests + build + **Playwright e2e** on
  every PR. Don't merge red.
- **Convex prod** is `tough-meadowlark-233`; dev is `third-kookabura-106`.
- **Targeting the right deployment is the trap in this repo.** The CLI
  auto-loads `.env.local`, which holds a *dev* deploy key, and then **ignores
  `--prod`**. `convex deploy` defaults to prod while `convex run` defaults to
  dev, so a seed can print `"ok"` after writing to the wrong place. Always:

  ```sh
  line=$(grep -m1 '^CONVEX_DEPLOY_KEY=' .env.prod.local)
  export CONVEX_DEPLOY_KEY="${line#CONVEX_DEPLOY_KEY=}"
  npx convex dashboard --no-open   # must print tough-meadowlark-233
  npx convex run seed:all '{}'
  ```

  Then query the data back to confirm. This cost real time on 2026-07-25.
- **`npm run build` runs `tsc -b` first.** A type error means no new bundle,
  and `vite preview` keeps serving the stale one — which looks exactly like
  "my fix didn't work". Check the build succeeded before debugging output.

## Current state (all shipped and live)

- **Seasonal pricing.** Admin → Settings → Season pricing swaps the live price
  list in one click. High = $20/$120/$450, low = $18/$108/$405 (same
  proportional discounts — a week bills as 6 days, a month as 22.5). Logic in
  `convex/lib/season.ts`. **Low season is ACTIVE on prod**; switch back when
  high season starts.
- **Reviews carry real dates** (`publishedAt`), rendered localised, sorted
  newest-first. 17 seeded.
- **Admin is mobile-first**: bottom tab bar, floating "+ New booking",
  collapsible filters, card layouts instead of side-scrolling tables,
  full-screen modal sheets, 16px fields / 44px tap targets (`.admin-root`
  rules in `index.html` — they need `!important`, every control is styled
  inline).
- **Payments are one tap.** `payments.markPaid` books the whole outstanding
  balance on the rental's start date using the booking's own method; custom
  cases go via "Custom…" / "Edit". Balance arithmetic lives in
  `convex/lib/balance.ts`, shared by the booking list and the payment writer
  so displayed and written amounts can't drift.
- **Dashboard leads with all-time figures**: total revenue, each partner's
  earnings and share %, what each collected, and the balance between them,
  tapping through to Partner settlement.

## Business snapshot (2026-07-25, prod)

- All-time revenue **$5,174**. JJ earned $3,622 / collected $990; Karen earned
  $1,552 / collected $4,184 → **Karen owes JJ $2,631.80**, unsettled.
- Average occupancy **~26%** across the 16 months with rentals (Apr 2025 –
  Jul 2026); range 8.6% (Jan 2026) to 50% (Apr 2026). Three bikes.

## Open threads

1. **Signed-in admin e2e specs skip in CI.** They need `E2E_ADMIN_USER` /
   `E2E_ADMIN_PASSWORD` as repo secrets — deliberately not added, storing an
   admin password there is the owner's call. Locally:
   `E2E_ADMIN_USER=jj E2E_ADMIN_PASSWORD=$(npx convex env get ADMIN_JJ_PASSWORD) npm run test:e2e`
2. **Google review sync is built but dormant.** `reviews.refresh` (daily cron)
   calls the Places API (New) and upserts by review id using Google's exact
   `publishTime`. No-ops until `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACE_ID`
   are set in the Convex prod env. Until then new reviews go by hand into
   `seedReviews` in `convex/seed.ts` (owner pastes them, add a real `date`),
   then re-seed prod.
3. Franziska Koch's review is dated `2026-05-25`, inferred from Google's
   "2 months ago" as shown on 2026-07-24 — approximate until the sync replaces
   it with the exact timestamp.
4. **`ADMIN_DESIGN_SPEC.md`** (untracked, repo root) is the full redesign
   brief. Covered so far: the hard mobile constraints and pain points 1, 3, 4,
   6, 11, 12, 18. Still open: global search, empty-state visuals,
   period-selector consistency, the seasonality heatmap on phones.
5. Untracked local files kept out of git on purpose: `ADMIN_DESIGN_SPEC.md`,
   `convex/_debugReport.ts`.
