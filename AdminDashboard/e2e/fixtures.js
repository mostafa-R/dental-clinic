import { test as base, expect } from "@playwright/test";

/**
 * The site dashboard authenticates with an HttpOnly session cookie, so there is
 * no token to inject from the test. Instead every test seeds a session by
 * stubbing `GET /auth/me` — the same call `App` makes on boot — and lets the
 * app bootstrap itself exactly as it does in production.
 */
export const ROLES = {
  superAdmin: {
    _id: "sa-1",
    name: "Root Admin",
    email: "root@dentalos.test",
    role: "super_admin",
    permissions: [],
    isActive: true,
  },
  admin: {
    _id: "a-1",
    name: "Platform Admin",
    email: "admin@dentalos.test",
    role: "admin",
    permissions: [],
    isActive: true,
  },
  support: {
    _id: "s-1",
    name: "Support Rep",
    email: "support@dentalos.test",
    role: "support",
    permissions: [],
    isActive: true,
  },
};

/**
 * The `{ success, data }` envelope every site endpoint answers with.
 * `route.fulfill` requires `body` to be a string, so serialise here.
 */
const ok = (data) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ success: true, data }),
});

const fail = (status, message) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ success: false, message }),
});

/**
 * Stub the whole site API surface. Individual tests override specific routes by
 * calling `mockApi` again or by layering `page.route` on top.
 */
export async function mockApi(page, { user = ROLES.superAdmin, analytics = {} } = {}) {
  // Playwright evaluates handlers in reverse registration order, so the
  // catch-all goes on first and the specific routes below shadow it.
  // Anything not explicitly stubbed answers as an empty successful collection so
  // no test trips over an unmocked call and 500s for the wrong reason.
  await page.route("**/api/v1/site/**", (route) => {
    const section = route.request().url().split("/api/v1/site/")[1]?.split("?")[0] ?? "";

    for (const [fragment, body] of Object.entries(analytics)) {
      if (section.startsWith(fragment)) return route.fulfill(ok(body));
    }

    return route.fulfill(ok({}));
  });

  // login.fulfilled only reaches a real page when the response carries a user,
  // otherwise ProtectedRoute spins on its `if (!user)` loader forever.
  await page.route("**/api/**/auth/login**", (route) => route.fulfill(ok({ user })));

  // An absent session has to be a 401, not a null user. getCurrentUser reads
  // `data.user || data`, so a 200 carrying `{ user: null }` would fall through
  // to the envelope itself and authenticate the visitor.
  await page.route("**/api/**/auth/me**", (route) =>
    route.fulfill(user ? ok({ user }) : fail(401, "Not authenticated")),
  );
}

/**
 * Stub the whole site API surface, then log in through the real form.
 *
 * `mockApi` must run exactly once per test: Playwright resolves the
 * last-registered matching handler first, so a second call silently shadows the
 * first one's per-endpoint stubs. Pass the options through here instead of
 * calling `mockApi` separately in the test body.
 */
export async function signIn(page, user = ROLES.superAdmin, options = {}) {
  await mockApi(page, { ...options, user });
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill("Sup3rSecret!");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export const test = base.extend({
  // A blank slate per test: no persisted theme, and English by default so the
  // assertions below can match literal English copy.
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem("theme");
        window.localStorage.setItem("language", "en");
      } catch {
        /* storage may be unavailable in some contexts */
      }
    });
    await use(page);
  },
});

export { expect };
