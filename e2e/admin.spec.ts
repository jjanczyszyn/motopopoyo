import { test, expect } from "@playwright/test";

// Admin panel. Without credentials these cover the login gate — which is the
// part every operator hits first, and the part that has to work one-handed on
// a phone. Set E2E_ADMIN_USER / E2E_ADMIN_PASSWORD to unlock the signed-in
// specs at the bottom.

test.describe("login gate", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin");
  });

  test("shows the sign-in form", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /admin login/i })).toBeVisible();
    await expect(page.getByPlaceholder("Username")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
  });

  test("rejects bad credentials without leaking which half was wrong", async ({ page }) => {
    await page.getByPlaceholder("Username").fill("nobody");
    await page.getByPlaceholder("Password").fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    const error = page.getByText(/invalid credentials/i);
    await expect(error).toBeVisible();
    // Must not say "no such user" / "wrong password" — that would confirm
    // which usernames exist.
    await expect(page.getByText(/no such user|unknown user|wrong password/i)).toHaveCount(0);
  });

  test("fields are big enough to tap and don't zoom iOS on focus", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "touch sizing only matters on phones");

    for (const field of ["Username", "Password"]) {
      const input = page.getByPlaceholder(field);
      const box = await input.boundingBox();
      expect(box, `${field} should be laid out`).not.toBeNull();
      expect(box!.height, `${field} tap target`).toBeGreaterThanOrEqual(40);

      // <16px font is what makes iOS Safari zoom the page on focus.
      const fontSize = await input.evaluate((el) =>
        parseFloat(getComputedStyle(el).fontSize)
      );
      expect(fontSize, `${field} font-size`).toBeGreaterThanOrEqual(16);
    }

    const signIn = page.getByRole("button", { name: /sign in/i });
    const btnBox = await signIn.boundingBox();
    expect(btnBox!.height).toBeGreaterThanOrEqual(44);
  });

  test("no sideways scroll on a phone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone-only check");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });
});

// Signed-in coverage. Skipped unless credentials are provided, so the suite
// stays green for contributors (and in CI) without a shared password.
const user = process.env.E2E_ADMIN_USER;
const password = process.env.E2E_ADMIN_PASSWORD;

test.describe("signed in", () => {
  test.skip(!user || !password, "set E2E_ADMIN_USER / E2E_ADMIN_PASSWORD to run");

  test.beforeEach(async ({ page }) => {
    await page.goto("/admin");
    await page.getByPlaceholder("Username").fill(user!);
    await page.getByPlaceholder("Password").fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  test("phone gets a bottom tab bar, not a horizontal tab scroller", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone-only layout");

    const bookings = page.getByRole("button", { name: "Bookings", exact: true });
    await expect(bookings).toBeVisible();

    // The tab bar is pinned to the bottom of the viewport.
    const box = await bookings.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.y).toBeGreaterThan(viewport.height * 0.7);

    await bookings.click();
    await expect(page.getByRole("button", { name: /new booking/i })).toBeVisible();
  });

  test("every section renders without horizontal overflow", async ({ page }) => {
    for (const section of ["dashboard", "bookings", "payments", "motorcycles", "settings"]) {
      await page.goto(`/admin#${section}`);
      await page.waitForTimeout(600);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${section} overflows sideways`).toBeLessThanOrEqual(2);
    }
  });

  test("dashboard leads with all-time revenue and the partner balance", async ({ page }) => {
    await page.goto("/admin#dashboard");

    await expect(page.getByText(/all-time revenue/i)).toBeVisible();
    await expect(page.getByText(/JJ earned/i)).toBeVisible();
    await expect(page.getByText(/Karen earned/i)).toBeVisible();
    await expect(page.getByText(/balance between partners/i)).toBeVisible();

    // Either they're square or one owes the other a concrete amount.
    await expect(
      page.getByText(/all settled up|owes .* \$\d/i).first()
    ).toBeVisible();

    // And it's a shortcut into the settlement section.
    await page.getByRole("button", { name: /go to partner settlement/i }).click();
    await expect(page.getByText(/transfers/i).first()).toBeVisible();
  });

  test("season switch is reachable in settings", async ({ page }) => {
    await page.goto("/admin#settings");
    await expect(page.getByText(/season pricing/i).first()).toBeVisible();
    await expect(page.getByText(/high season/i).first()).toBeVisible();
    await expect(page.getByText(/low season/i).first()).toBeVisible();

    // Exactly one season is active, so exactly one card offers to activate.
    await expect(page.getByRole("button", { name: /make active/i })).toHaveCount(1);
    await expect(page.getByText(/^active$/i).first()).toBeVisible();
  });
});
