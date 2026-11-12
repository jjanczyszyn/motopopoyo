import { test, expect } from "@playwright/test";

// Partner quick-add page (/new#t=<secret>). Read-only: nothing here saves.

test("quick-add page without a valid link shows a lock screen", async ({ page }) => {
  await page.goto("/new#t=not-a-real-link");
  await expect(page.getByText("This link isn't valid")).toBeVisible();
  // No form, no bikes, no way in.
  await expect(page.getByText("Which moto")).toHaveCount(0);
});

test("public API refuses quick-add calls with a wrong link token", async () => {
  const { ConvexHttpClient } = await import("convex/browser");
  const { anyApi } = await import("convex/server");
  const url = process.env.VITE_CONVEX_URL ?? "https://tough-meadowlark-233.convex.cloud";
  const client = new ConvexHttpClient(url);
  const check = await client.query(anyApi.quick.check, { token: "x".repeat(40) });
  expect(check.ok).toBe(false);
  await expect(
    client.query(anyApi.quick.options, { token: "x".repeat(40), startDate: "2030-01-01", days: 1 })
  ).rejects.toThrow();
  await expect(
    client.mutation(anyApi.quick.create, {
      token: "x".repeat(40),
      bikeId: "j970000000000000000000000000000a",
      startDate: "2030-01-01",
      days: 1,
      priceUSD: 1,
    })
  ).rejects.toThrow();
});

// With a real link (E2E_QUICK_TOKEN), check the form works up to — but not
// including — Save, so the suite never writes a booking.
test("quick-add form fills in the list price and fits the screen", async ({ page }) => {
  const token = process.env.E2E_QUICK_TOKEN;
  test.skip(!token, "E2E_QUICK_TOKEN not set");
  await page.goto(`/new#t=${token}`);
  await expect(page.getByText("Which moto")).toBeVisible();
  await expect(page.getByTestId("quick-bike").first()).toBeVisible();

  await page.getByRole("button", { name: "3", exact: true }).click();
  await expect(page.getByTestId("quick-days")).toHaveText("3");
  await expect(page.getByLabel("Price in dollars")).toHaveValue(/^\d+(\.\d+)?$/);

  const save = page.getByRole("button", { name: /Pick a moto|Save rental/ });
  await expect(save).toBeDisabled();
  const free = page.locator('[data-testid="quick-bike"]:not([disabled])').first();
  if (await free.count()) {
    await free.click();
    await expect(page.getByRole("button", { name: /Save rental · \$/ })).toBeEnabled();
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(2);
});
