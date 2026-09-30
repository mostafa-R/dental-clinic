import { test, expect, mockApi, signIn, ROLES } from "./fixtures.js";

test.describe("authentication", () => {
  test("sends an unauthenticated visitor to the login page", async ({ page }) => {
    await mockApi(page, { user: null });
    await page.goto("/tenants");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("redirects the root path to login when there is no session", async ({ page }) => {
    await mockApi(page, { user: null });
    await page.goto("/");

    await expect(page).toHaveURL(/\/login/);
  });

  test("signs in with valid credentials and lands on the dashboard", async ({ page }) => {
    await signIn(page, ROLES.superAdmin);

    await expect(page).toHaveURL((url) => !url.pathname.startsWith("/login"));
    await expect(page.getByText(ROLES.superAdmin.name)).toBeVisible();
  });

  test("surfaces a server error when the credentials are rejected", async ({ page }) => {
    await mockApi(page, { user: null });
    // Shadow the happy-path login stub with a rejection.
    await page.route("**/api/**/auth/login**", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "Invalid email or password" }),
      }),
    );

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(ROLES.superAdmin.email);
    await page.getByLabel(/password/i).fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("keeps the user on /login when the session is rejected on a deep link", async ({
    page,
  }) => {
    await mockApi(page, { user: null });
    await page.goto("/analytics/platform/overview");

    await expect(page).toHaveURL(/\/login/);
  });

  test("reveals a protected route once the session resolves", async ({ page }) => {
    await signIn(page, ROLES.superAdmin);

    await page.goto("/tenants");

    await expect(page).toHaveURL(/\/tenants/);
  });
});
