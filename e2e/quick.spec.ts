import { test, expect } from "@playwright/test";

// Partner quick-add page (/new), behind the owner login. Read-only: nothing
// here saves a booking.

test("quick-add page asks for the owner login first, in Spanish", async ({ page }) => {
  await page.goto("/new");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByText("¿Qué moto?")).toHaveCount(0);
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
  // Listing, changing and deleting her recent rentals need a session too.
  await expect(client.query(anyApi.quick.mine, { adminToken: bad })).rejects.toThrow();
  const fakeRes = "j570000000000000000000000000000a";
  await expect(
    client.mutation(anyApi.quick.update, {
      adminToken: bad, id: fakeRes, bikeId: "j970000000000000000000000000000a",
      startDate: "2030-01-01", days: 1, priceUSD: 1, paid: true,
    })
  ).rejects.toThrow();
  await expect(client.mutation(anyApi.quick.remove, { adminToken: bad, id: fakeRes })).rejects.toThrow();
  await expect(client.mutation(anyApi.quick.adminDelete, { adminToken: bad, id: fakeRes })).rejects.toThrow();
  // Services sold on commission: every call needs a session. The exact
  // message shows it's the login that refused, not a missing function.
  const service = { serviceName: "Test", date: "2026-01-01", priceUSD: 2, costUSD: 1 };
  const denied = /Admin auth required|Server Error/;
  await expect(client.query(anyApi.services.mine, { adminToken: bad })).rejects.toThrow(denied);
  await expect(
    client.query(anyApi.services.list, { adminToken: bad, fromISO: "2026-01-01", toISO: "2026-02-01" })
  ).rejects.toThrow(denied);
  await expect(client.mutation(anyApi.services.create, { adminToken: bad, ...service })).rejects.toThrow();
  await expect(client.mutation(anyApi.services.update, { adminToken: bad, id: fakeRes, ...service })).rejects.toThrow();
  await expect(client.mutation(anyApi.services.remove, { adminToken: bad, id: fakeRes })).rejects.toThrow();
  await expect(client.mutation(anyApi.services.adminDelete, { adminToken: bad, id: fakeRes })).rejects.toThrow();
  await expect(client.query(anyApi.payments.toVerify, { adminToken: bad })).rejects.toThrow();
});

// Signed in (E2E_ADMIN_USER / E2E_ADMIN_PASSWORD): the form works up to, but
// not including, Save, so the suite never writes a booking.
test("signed in, the quick-add form fills in the list price and fits the screen", async ({ page }) => {
  const user = process.env.E2E_ADMIN_USER;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!user || !password, "E2E_ADMIN_USER / E2E_ADMIN_PASSWORD not set");
  await page.goto("/new");
  await page.getByPlaceholder("Nombre").fill(user!);
  await page.getByPlaceholder("Clave").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText("¿Qué moto?")).toBeVisible();
  await expect(page.getByTestId("quick-bike").first()).toBeVisible();

  await page.getByRole("button", { name: "3", exact: true }).click();
  await expect(page.getByTestId("quick-days")).toHaveText("3");
  // Wait for the bikes for the new dates, not the ones still on screen.
  await expect(page.getByTestId("quick-bikes")).toHaveAttribute("data-loading", "false");
  await expect(page.getByLabel("Precio en dólares")).toHaveValue(/^\d+(\.\d+)?$/);

  // "Ya me pagó" starts ticked: rentals are paid in cash by default.
  await expect(page.getByTestId("quick-paid")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Toca una moto/ })).toBeDisabled();
  const free = page.locator('[data-testid="quick-bike"]:not([disabled])').first();
  if (await free.count()) {
    await free.click();
    await expect(page.getByRole("button", { name: /Guardar · \$/ })).toBeEnabled();
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(2);
});

// The service form works out the commission as she types. Never saves.
test("signed in, the service form shows the commission and fits the screen", async ({ page }) => {
  const user = process.env.E2E_ADMIN_USER;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!user || !password, "E2E_ADMIN_USER / E2E_ADMIN_PASSWORD not set");
  await page.goto("/new");
  await page.getByPlaceholder("Nombre").fill(user!);
  await page.getByPlaceholder("Clave").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.getByTestId("quick-mode-service").click();
  await expect(page.getByText("¿Qué servicio fue?")).toBeVisible();
  await expect(page.getByRole("button", { name: /Elige el servicio/ })).toBeDisabled();

  await page.getByLabel("Nombre del servicio").fill("Masaje");
  await expect(page.getByRole("button", { name: /Pon los precios/ })).toBeDisabled();
  await page.getByLabel("Cuánto pagó el cliente").fill("60");
  await page.getByLabel("Cuánto costó el servicio").fill("40,50");
  await expect(page.getByTestId("service-commission")).toContainText("$19.50");
  // It's on the Save button too, which is always on screen.
  await expect(page.getByRole("button", { name: /✅ Guardar · comisión \$19\.50/ })).toBeEnabled();

  // Typed the wrong way round: warned, and it can't be saved.
  await page.getByLabel("Cuánto costó el servicio").fill("80");
  await expect(page.getByTestId("service-commission")).toContainText("Revisa");
  await expect(page.getByRole("button", { name: /Revisa los números/ })).toBeDisabled();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(2);

  // And back to rentals.
  await page.getByTestId("quick-mode-moto").click();
  await expect(page.getByText("¿Qué moto?")).toBeVisible();
});
