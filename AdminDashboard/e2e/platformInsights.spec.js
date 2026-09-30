import { test, expect, signIn, ROLES } from "./fixtures.js";

/**
 * The audit finding this file guards: the 13 `/analytics/platform/*` endpoints
 * existed on the server with no client caller at all. These tests assert each one
 * is actually requested, and that a role without a permission sees neither the
 * tab nor its request.
 */

/**
 * Exact contract read by `OverviewSection`: it destructures every top-level key
 * and dereferences nested totals with no optional chaining, so a partial stub
 * crashes the page into the error boundary instead of rendering.
 */
const OVERVIEW = {
  tenants: { total: 6, active: 5, trial: 1, suspended: 1, cancelled: 0, archived: 0 },
  users: { total: 12, active: 10, doctors: 4, patients: 0, staff: 0 },
  healthcare: {
    patients: { totalActive: 320, newLast30: 41 },
    appointments: { today: 18, upcoming: 55, noShowRate: 7.5, completed: 300 },
    branches: 9,
  },
  financial: {
    revenue: { total: 128400, thisMonth: 14300, byMonth: [], byService: [] },
    expenses: { total: 52000, byCategory: [] },
    payments: { collected: 120000, byMethod: [] },
    refunds: { total: 1200 },
    commissions: { total: 800 },
  },
  inventory: { lowStock: 4, totalItems: 210, outOfStock: 1 },
  subscriptions: { mrr: 24000, arr: 288000, active: 5, churned: 1, byPlan: [] },
  system: {
    health: { status: "healthy", uptime: 99.98 },
    errors: { unresolved: 2, last24h: 1 },
    storage: { estimatedUsedMB: 5120, estimatedTotalMB: 20480 },
    jobs: { running: 2, failed: 0, queued: 0, completed: 40 },
  },
};

const collectRequests = (page) => {
  const seen = [];
  page.on("request", (req) => {
    const m = req.url().match(/\/api\/v1\/site\/analytics\/platform\/([a-z-]+)/);
    if (m) seen.push(m[1]);
  });
  return seen;
};

test.describe("platform insights — endpoints are actually called", () => {
  const TABS = [
    ["overview", /overview/i],
    ["financial", /financial/i],
    ["patients", /patients/i],
    ["appointments", /appointments/i],
    ["doctors", /doctors/i],
    ["treatments", /treatments/i],
    ["inventory", /inventory/i],
    // Tab id is "billing"; the endpoint is /saas-billing.
    ["saas-billing", /billing/i],
    ["usage", /usage/i],
    ["activity", /activity/i],
    ["jobs", /jobs/i],
    ["security", /security/i],
    ["roles", /site admins/i],
  ];

  test("requests the overview endpoint on load and renders its figures", async ({ page }) => {
    const seen = collectRequests(page);
    await signIn(page, ROLES.superAdmin, { analytics: { "analytics/platform/overview": OVERVIEW } });
    await page.goto("/platform-insights");

    await expect(page.getByRole("heading", { name: /platform insights/i }).last()).toBeVisible();
    await expect(page.getByText("320").first()).toBeVisible();
    expect(seen).toContain("overview");
  });

  for (const [section, label] of TABS) {
    test(`requests /analytics/platform/${section} when its tab is opened`, async ({ page }) => {
      const seen = collectRequests(page);
      await signIn(page, ROLES.superAdmin, { analytics: { "analytics/platform/overview": OVERVIEW } });
      await page.goto("/platform-insights");

      await page.getByRole("button", { name: label }).click();

      await expect
        .poll(() => seen.includes(section), { timeout: 10_000 })
        .toBe(true);
    });
  }
});

test.describe("platform insights — permission gating", () => {
  test("hides the super-admin-only security tab from an admin role", async ({ page }) => {
    const seen = collectRequests(page);
    await signIn(page, ROLES.admin, { analytics: { "analytics/platform/overview": OVERVIEW } });
    await page.goto("/platform-insights");

    await expect(page.getByRole("heading", { name: /platform insights/i }).last()).toBeVisible();
    // SECURITY_VIEW is not in the admin role defaults.
    await expect(page.getByRole("button", { name: /^security$/i })).toHaveCount(0);
    expect(seen).not.toContain("security");
  });

  test("hides the financial tab from a support role", async ({ page }) => {
    await signIn(page, ROLES.support, { analytics: { "analytics/platform/overview": OVERVIEW } });
    await page.goto("/platform-insights");

    await expect(page.getByRole("heading", { name: /platform insights/i }).last()).toBeVisible();
    // FINANCIAL_VIEW is not in the support role defaults.
    await expect(page.getByRole("button", { name: /^financial$/i })).toHaveCount(0);
  });

  test("shows every tab to a super admin", async ({ page }) => {
    await signIn(page, ROLES.superAdmin, { analytics: { "analytics/platform/overview": OVERVIEW } });
    await page.goto("/platform-insights");

    for (const label of [/overview/i, /financial/i, /security/i, /site admins/i]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
  });

  test("still renders the other sections when one endpoint 403s", async ({ page }) => {
    await signIn(page, ROLES.superAdmin, { analytics: { "analytics/platform/overview": OVERVIEW } });
    // Registered after signIn so it outranks the catch-all.
    await page.route("**/api/v1/site/analytics/platform/security", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "Insufficient site permissions" }),
      }),
    );
    await page.goto("/platform-insights");

    await page.getByRole("button", { name: /^security$/i }).click();

    await expect(page.getByText(/insufficient site permissions/i).first()).toBeVisible();
    // Switching back still works — one 403 must not poison the page.
    await page.getByRole("button", { name: /overview/i }).click();
    await expect(page.getByText("320").first()).toBeVisible();
  });
});
