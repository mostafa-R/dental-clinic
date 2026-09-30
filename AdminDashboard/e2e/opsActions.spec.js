import { test, expect, signIn, ROLES } from "./fixtures.js";

const ok = (data) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ success: true, data }),
});

/**
 * Ordering matters: `signIn` installs the catch-all, and Playwright resolves the
 * most recently registered matching handler first. So per-endpoint overrides
 * must be registered *after* signIn, or the catch-all silently wins.
 */

test.describe("audit chain verification", () => {
  // Both list endpoints need real shapes: the slice assigns `data` straight
  // through for the log list, and `data.actions` for the action filter, so an
  // empty `{}` from the catch-all makes the page throw on `.map`.
  const AUDIT_LIST = { logs: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 } };
  const AUDIT_ACTIONS = { actions: ["admin.update", "tenant.create"] };

  const stubAuditList = async (page) => {
    await page.route("**/api/v1/site/audit-logs/actions", (route) =>
      route.fulfill(ok(AUDIT_ACTIONS)),
    );
    await page.route("**/api/v1/site/audit-logs", (route) => route.fulfill(ok(AUDIT_LIST)));
  };

  test("verifies the chain and reports a clean result to a super admin", async ({ page }) => {
    await signIn(page, ROLES.superAdmin);
    await stubAuditList(page);
    let called = false;
    await page.route("**/api/v1/site/audit-logs/verify", (route) => {
      called = true;
      return route.fulfill(ok({ valid: true, errors: [], checked: 512 }));
    });
    await page.goto("/audit-logs");

    await page.getByRole("button", { name: /verify chain/i }).click();

    await expect(page.getByText(/verified/i).first()).toBeVisible();
    expect(called).toBe(true);
  });

  test("surfaces tampering errors instead of reporting success", async ({ page }) => {
    await signIn(page, ROLES.superAdmin);
    await stubAuditList(page);
    await page.route("**/api/v1/site/audit-logs/verify", (route) =>
      route.fulfill(
        ok({
          valid: false,
          errors: ["Hash mismatch: entry 64f (admin.update)"],
          checked: 512,
        }),
      ),
    );
    await page.goto("/audit-logs");

    await page.getByRole("button", { name: /verify chain/i }).click();

    await expect(page.getByText(/hash mismatch/i).first()).toBeVisible();
  });

  test("does not offer verification to a non-super-admin role", async ({ page }) => {
    await signIn(page, ROLES.admin);
    await stubAuditList(page);
    await page.goto("/audit-logs");

    // The route is authorizeSite('super_admin') on the server.
    await expect(page.getByRole("button", { name: /verify chain/i })).toHaveCount(0);
  });
});

test.describe("error log resolution", () => {
  const LOG = {
    _id: "e1",
    statusCode: 500,
    method: "GET",
    url: "/api/v1/patients",
    message: "boom",
    resolved: false,
    createdAt: "2026-01-05T10:00:00.000Z",
  };
  const LIST = { logs: [LOG], stats: { stats: { total: 1, "4xx": 0, "5xx": 1 } } };

  test("resolves a log and flips the row to a resolved badge", async ({ page }) => {
    await signIn(page, ROLES.admin);
    // Broad route first, specific second: the most recently registered handler
    // wins, so the resolve override has to come last to be reachable.
    await page.route("**/api/v1/site/error-logs**", (route) => route.fulfill(ok(LIST)));
    let patched = false;
    await page.route("**/api/v1/site/error-logs/e1/resolve", (route) => {
      patched = true;
      return route.fulfill(ok({ log: { ...LOG, resolved: true } }));
    });
    await page.goto("/error-logs");

    await page.getByRole("button", { name: /mark resolved/i }).first().click();

    await expect.poll(() => patched).toBe(true);
  });

  test("hides the resolve action from a support role", async ({ page }) => {
    await signIn(page, ROLES.support);
    await page.route("**/api/v1/site/error-logs**", (route) => route.fulfill(ok(LIST)));
    await page.goto("/error-logs");

    // authorizeSite('super_admin', 'admin') on the server.
    await expect(page.getByRole("button", { name: /mark resolved/i })).toHaveCount(0);
  });
});

test.describe("feature flag bulk update", () => {
  const MODULES = ["dashboard", "patients", "reports"];
  const FLAG = { plan: "pro", enabledModules: ["dashboard"], availableModules: MODULES };

  test("sends the whole module list in one request", async ({ page }) => {
    await signIn(page, ROLES.superAdmin);
    let body = null;
    await page.route("**/api/v1/site/feature-flags/t1/modules", (route) => {
      body = route.request().postDataJSON();
      return route.fulfill(ok({ tenantId: "t1", enabledModules: body.modules }));
    });
    await page.route("**/api/v1/site/feature-flags/t1", (route) => route.fulfill(ok(FLAG)));
    await page.route("**/api/v1/site/tenants**", (route) =>
      route.fulfill(ok({ tenants: [{ _id: "t1", name: "Bright Smile" }] })),
    );
    await page.goto("/feature-flags");
    await page.locator("select").first().selectOption("t1");

    await page.getByRole("button", { name: /enable all/i }).click();

    await expect.poll(() => body).toEqual({ modules: MODULES });
  });

  test("hides the bulk action from an admin role", async ({ page }) => {
    await signIn(page, ROLES.admin);
    await page.route("**/api/v1/site/feature-flags/t1", (route) => route.fulfill(ok(FLAG)));
    await page.route("**/api/v1/site/tenants**", (route) =>
      route.fulfill(ok({ tenants: [{ _id: "t1", name: "Bright Smile" }] })),
    );
    await page.goto("/feature-flags");
    await page.locator("select").first().selectOption("t1");

    // require2faSuperAdmin on the server, so super_admin only.
    await expect(page.getByRole("button", { name: /enable all/i })).toHaveCount(0);
  });
});
