# Session handoff — 2026-07-25 (updated 01:00 UTC)

## What this is

`moto.popoyo.co` — motorbike rental site for Karen & JJ in Popoyo, Nicaragua.
Vite + React on GitHub Pages, Convex backend, in-browser OCR for ID capture.
See [README.md](./README.md) for the stack, layout and schema, and
[CLAUDE.md](./CLAUDE.md) for the rules (no PII/secrets in git, dev-vs-prod
Convex split).

## Deploy / ops essentials

- **Frontend**: merge to `main` → `.github/workflows/deploy.yml` publishes to
  GitHub Pages. `ci.yml` (added this session) runs typecheck + unit tests +
  build on every PR.
- **Convex prod** is `tough-meadowlark-233`; dev is `third-kookabura-106`.
- **Gotcha that cost time this session**: the CLI auto-loads `.env.local`,
  which holds a *dev* deploy key, and it then **ignores `--prod`**. Worse,
  `convex deploy` defaults to prod while `convex run` defaults to dev — so a
  seed can report `"ok"` while writing to the wrong deployment. Always:

  ```sh
  line=$(grep -m1 '^CONVEX_DEPLOY_KEY=' .env.prod.local)
  export CONVEX_DEPLOY_KEY="${line#CONVEX_DEPLOY_KEY=}"
  npx convex dashboard --no-open   # confirm it prints tough-meadowlark-233
  npx convex run seed:all '{}'
  ```

  Then verify by querying the data back.

## Current state (all live)

- **Seasonal pricing** shipped ([PR #1](https://github.com/jjanczyszyn/motopopoyo/pull/1),
  merged). Admin → Settings → Season pricing switches the live price list in
  one click. High = $20/$120/$450, low = $18/$108/$405 (same proportional
  discounts: a week bills as 6 days, a month as 22.5). Logic in
  `convex/lib/season.ts`.
- **Low season is currently ACTIVE on prod** — the site shows $18/day. Switch
  it back from the admin Settings page when high season starts.
- **Reviews show real dates.** Each row stores `publishedAt`; the home page
  renders a localised date instead of the old frozen "N days ago" strings.
  17 reviews seeded, newest first.

## Admin panel (rebuilt for phones this session)

- Bottom tab bar on phones, floating "+ New booking", collapsible filters,
  card layouts instead of side-scrolling tables, full-screen modal sheets,
  16px fields / 44px tap targets (`.admin-root` rules in `index.html` — they
  need `!important`, every control is styled inline).
- **Recording a payment is one tap**: `payments.markPaid` books the whole
  outstanding balance on the rental's start date with the booking's own
  method. Custom cases go through "Custom…" / "Edit".
- Balance arithmetic lives in `convex/lib/balance.ts` — shared by the booking
  list and the payment writer, so displayed and written amounts can't drift.
- `ADMIN_DESIGN_SPEC.md` (untracked, repo root) is the full redesign brief.
  This session covered its hard mobile constraints and pain points 1, 3, 4, 6,
  11, 12, 18 — the rest (global search, empty-state visuals, period-selector
  consistency, seasonality heatmap) is still open.

## Testing

- `npm test` — 134 unit tests. `npm run test:e2e` — Playwright, desktop +
  iPhone, against a production build.
- CI runs typecheck + unit + build + **e2e** on every PR (`ci.yml`).
- Signed-in admin e2e specs skip unless `E2E_ADMIN_USER` /
  `E2E_ADMIN_PASSWORD` are set. They are **not** set as repo secrets — add
  them to turn that coverage on in CI. Locally:
  `E2E_ADMIN_USER=jj E2E_ADMIN_PASSWORD=$(npx convex env get ADMIN_JJ_PASSWORD) npm run test:e2e`
- `npm run build` runs `tsc -b` first: a type error means **no new bundle**,
  and `vite preview` will happily keep serving the stale one. Never debug a
  built artifact without checking the build actually succeeded.

## Open threads

1. **Google review sync is built but dormant.** `reviews.refresh` (daily cron)
   calls the Places API (New) and upserts by review id using Google's exact
   `publishTime`. It no-ops until `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACE_ID`
   are set in the Convex prod env. Until then, new reviews are added by hand to
   `seedReviews` in `convex/seed.ts` (owner pastes them; add a real `date`).
2. Franziska Koch's review is dated `2026-05-25`, inferred from Google's
   "2 months ago" as shown on 2026-07-24 — approximate until the API sync
   replaces it with the exact timestamp.
3. Untracked local files at repo root: `ADMIN_DESIGN_SPEC.md`,
   `convex/_debugReport.ts` — deliberately uncommitted, not mine to land.
