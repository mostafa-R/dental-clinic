/**
 * Route registry — the single source of truth for "which URL needs which
 * permission module".
 *
 * Everything that decides what a user may reach is derived from this list:
 *   - the sidebar (it renders one item per `NAV_ROUTES` entry, icons come from
 *     `components/layout/Sidebar.jsx`),
 *   - the URL guard (`components/ModuleGuard.jsx`), which matches the current
 *     `location.pathname` against `matchers` so a hand-typed or bookmarked URL
 *     is denied exactly like a hidden menu item,
 *   - the landing route after login and after a permission denial.
 *
 * Keeping the sidebar and the guard on one list is the whole point: a module can
 * no longer be reachable by URL while absent from the menu, or visible in the
 * menu while its URL bounces.
 *
 * No JSX and no React imports here on purpose — this module is imported by
 * `lib/roles.js`, which is unit-tested in a plain Node environment.
 */

/**
 * `path` uses the react-router pattern syntax. `:param` segments match one path
 * segment. `nav: false` keeps a route out of the sidebar while still gating its
 * URL (the EMR lives under a patient, so it has no menu entry of its own).
 * `section` is the sidebar heading it is grouped under; `null` means the
 * unlabelled top group.
 *
 * Order defines sidebar order and is preserved in the landing-route fallback.
 */
export const NAV_ROUTES = [
  { path: '/dashboard', module: 'dashboard', labelKey: 'nav.dashboard', section: null },
  { path: '/patients', module: 'patients', labelKey: 'nav.patients', section: 'nav.section.clinical' },
  { path: '/appointments', module: 'appointments', labelKey: 'nav.appointments', section: 'nav.section.clinical' },
  { path: '/recalls', module: 'appointments', labelKey: 'nav.recalls', section: 'nav.section.clinical' },
  { path: '/billing', module: 'billing', labelKey: 'nav.billing', section: 'nav.section.business' },
  { path: '/accounting', module: 'accounting', labelKey: 'nav.accounting', section: 'nav.section.business' },
  { path: '/inventory', module: 'inventory', labelKey: 'nav.inventory', section: 'nav.section.business' },
  { path: '/branches', module: 'branches', labelKey: 'nav.branches', section: 'nav.section.business' },
  { path: '/chat', module: 'chat', labelKey: 'nav.chat', section: 'nav.section.communication' },
  { path: '/users', module: 'users', labelKey: 'nav.users', section: 'nav.section.administration' },
  { path: '/roles', module: 'roles', labelKey: 'nav.roles', section: 'nav.section.administration' },
  { path: '/settings', module: 'settings', labelKey: 'nav.settings', section: 'nav.section.administration' },
  // Reached from a patient row, a dashboard card or a search result, never
  // from the sidebar. Registered so the guard gates the URL even though there
  // is no menu entry for it.
  { path: '/patients/:id/emr', module: 'emr', nav: false },
  { path: '/patients/:id', module: 'patients', nav: false },
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function toMatcher(path) {
  const source = path
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.startsWith(':') ? '[^/]+' : escapeRegExp(segment)))
    .join('/');
  return new RegExp(`^/${source}(?:/|$)`);
}

/**
 * Longest pattern first, so `/patients/:id/emr` wins over `/patients` and the
 * EMR is checked against `emr` rather than `patients`.
 */
const MATCHERS = NAV_ROUTES.map((route) => ({
  ...route,
  segments: route.path.split('/').filter(Boolean).length,
  regexp: toMatcher(route.path),
})).sort((a, b) => b.segments - a.segments);

/** Sidebar entries, in display order. */
export const NAV_ITEMS = NAV_ROUTES.filter((route) => route.nav !== false);

/**
 * The sidebar route a permission module is reached through, or `null` when the
 * module has no page of its own.
 *
 * Callers that link to a module by *key* must go through this rather than
 * building `/${module}`. The two are not the same string: `settings` and
 * `roles` are fine, but a module like `emr` lives at `/patients/:id/emr` and
 * `platform_settings` is not a client route at all. Guessing produced links
 * that landed on the 404 page, and a 404 bypasses `moduleForPath` entirely, so
 * the permission guard never even ran.
 *
 * Only routes with a menu entry are returned — a `nav: false` route needs a
 * `:param` that the caller does not have (there is no patient in scope here),
 * so it is not a valid dashboard destination either.
 *
 * @param {string} module
 * @returns {{path: string, labelKey: string}|null}
 */
export function navRouteForModule(module) {
  if (!module) return null;
  return NAV_ROUTES.find((route) => route.nav !== false && route.module === module) || null;
}

/** Sidebar groups, in display order, each with its already-filtered items. */
export const NAV_SECTION_ORDER = [
  null,
  'nav.section.clinical',
  'nav.section.business',
  'nav.section.communication',
  'nav.section.administration',
];

/**
 * The permission module a pathname requires, or `null` when the path is not a
 * registered route (the 404 branch) and therefore needs no module.
 *
 * Callers normally pass `location.pathname`, which React Router has already
 * stripped of the query and hash, but the matcher normalises anyway: a caller
 * that forwards a raw `location.search`-bearing string would otherwise silently
 * fall through to the 404 branch and skip the permission check entirely.
 *
 * @param {string} pathname
 * @returns {string|null}
 */
export function moduleForPath(pathname) {
  if (!pathname || typeof pathname !== 'string') return null;
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  const match = MATCHERS.find((route) => route.regexp.test(path));
  return match ? match.module : null;
}

/**
 * Role landing preference. Only a preference: `landingPathFor` falls through to
 * the first accessible route when the role's usual page is outside the plan or
 * not granted to it, which is what stops a redirect loop on a page the user
 * cannot open.
 */
export const ROLE_LANDING_PREFERENCE = {
  doctor: '/appointments',
  accountant: '/billing',
  receptionist: '/billing',
};

export const DEFAULT_LANDING_PATH = '/dashboard';
