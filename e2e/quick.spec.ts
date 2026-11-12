import { test, expect } from "@playwright/test";

// Partner quick-add page (/new), behind the owner login. Read-only: nothing
// here saves a booking.

test("quick-add page asks for the owner login first", async ({ page }) => {
  await page.goto("/new");
  await expect(page.getByRole("heading", { name: "Admin login" })).toBeVisible();
  await expect(page.getByText("Which moto")).toHaveCount(0);
});

test("public API refuses quick-add calls without an admin session", async () => {
  const { ConvexHttpClient } = await import("convex/browser");
  const { anyApi } = await import("convex/server");
  const url = process.env.VITE_CONVEX_URL ?? "https://tough-meadowlark-233.convex.cloud";
  const client = new ConvexHttpClient(url);
  const bad = "x".repeat(32);
  await expect(client.query(anyApi.quick.me, { adminToken: bad })).rejects.toThrow();
  await expect(
    client.query(anyApi.quick.options, { adminToken: bad, startDate: "2030-01-01", days: 1 })
  ).rejects.toThrow();
  await expect(
    client.mutation(anyApi.quick.create, {
      adminToken: bad,
      bikeId: "j970000000000000000000000000000a",
      startDate: "2030-01-01",
      days: 1,
      priceUSD: 1,
    })
  ).rejects.toThrow();
});

// Signed in (E2E_ADMIN_USER / E2E_ADMIN_PASSWORD): the form works up to, but
// not including, Save, so the suite never writes a booking.
test("signed in, the quick-add form fills in the list price and fits the screen", async ({ page }) => {
  const user = process.env.E2E_ADMIN_USER;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!user || !password, "E2E_ADMIN_USER / E2E_ADMIN_PASSWORD not set");
  await page.goto("/new");
  await page.getByPlaceholder("Username").fill(user!);
  await page.getByPlaceholder("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Which moto")).toBeVisible();
  await expect(page.getByTestId("quick-bike").first()).toBeVisible();

  await page.getByRole("button", { name: "3", exact: true }).click();
  await expect(page.getByTestId("quick-days")).toHaveText("3");
  await expect(page.getByLabel("Price in dollars")).toHaveValue(/^\d+(\.\d+)?$/);

  await expect(page.getByRole("button", { name: /Pick a moto/ })).toBeDisabled();
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
