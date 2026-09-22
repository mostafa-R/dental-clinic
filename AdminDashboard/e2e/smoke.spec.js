import { expect, test } from "@playwright/test";

// Backend-independent smoke tests: they run against the static production
// build (vite preview) with no API server, so they only assert client-side
// behavior (rendering, route guards, palette, shortcuts).

test("login page renders the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dental OS" })).toBeVisible();
});

test("unauthenticated deep links redirect to login", async ({ page }) => {
  await page.goto("/tenants");
  await expect(page).toHaveURL(/\/login$/);
});

test("command palette opens globally and shows an empty state for guests", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // Wait for app init (palette mounts after the auth check settles).
  await expect(page.locator("#email")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Nothing permission-gated is visible without a session.
  await expect(dialog.getByText("No results found")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("keyboard shortcut g then a heads toward analytics (login guard)", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("g");
  await page.keyboard.press("a");
  await expect(page).toHaveURL(/\/login$/);
});
