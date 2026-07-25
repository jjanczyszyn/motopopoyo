import { test, expect } from "@playwright/test";

// Customer-facing site. Read-only: nothing here books, pays or writes.

test("home page renders live pricing from Convex", async ({ page }) => {
  await page.goto("/");

  // The price pills are fed by config.dailyRate — a number must arrive.
  const perDay = page.locator("text=/\\$\\d+/").first();
  await expect(perDay).toBeVisible();

  const body = await page.locator("body").innerText();
  const prices = body.match(/\$\d+/g) ?? [];
  expect(prices.length).toBeGreaterThan(0);
});

test("reviews show a real date, never a relative one", async ({ page }) => {
  await page.goto("/");

  // Wait for at least one review card to hydrate from Convex.
  await expect(page.getByText(/via Google reviews|vía Google reviews/i).first())
    .toBeVisible();

  const body = await page.locator("body").innerText();

  // The bug this guards: "4 days ago" strings frozen at capture time.
  expect(body).not.toMatch(/\b\d+\s+(day|days|week|weeks|month|months|year|years)\s+ago\b/i);

  // And a real date is rendered in its place — "April 30, 2026" in en-US,
  // "30 de abril de 2026" in es-NI.
  expect(body).toMatch(
    /(\p{L}+\s+\d{1,2},?\s+20\d{2})|(\d{1,2}\s+(de\s+)?\p{L}+\s+(de\s+)?20\d{2})/u
  );
});

test("page does not scroll sideways", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(500);

  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  // A couple of pixels of rounding is fine; a real overflow is not.
  expect(overflow).toBeLessThanOrEqual(2);
});
