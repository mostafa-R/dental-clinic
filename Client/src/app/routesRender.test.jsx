import React from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

import App from '../App';

/**
 * Mounts every route in the app and asserts it renders.
 *
 * `npm run build` proves the import graph resolves; it says nothing about what
 * happens when a page actually mounts. A page can compile cleanly and still
 * throw on first render - a selector reading a slice that does not exist, a
 * `.map` over an undefined list, a hook called conditionally, a bad i18n key -
 * and the only way to catch that class of defect is to mount the real
 * component tree.
 *
 * Everything under test is real: the real `App`, the real `AppLayout`,
 * `ProtectedRoute`, `ModuleGuard`, `Sidebar`, `Topbar`, the real page
 * components, and the real feature slices. Only the two network edges are
 * stubbed, because there is no backend here:
 *
 *   - `lib/axios`, so data-loading thunks settle into their empty state
 *     instead of rejecting. The empty path is the one that hides crashes: a
 *     table that maps over an empty array still evaluates the header, the
 *     toolbar and every conditional around it.
 *   - `lib/socket`, so no connection is attempted.
 *
 * `auth` and `users` are stubbed to a signed-in clinic admin with full
 * permissions, which is what `ProtectedRoute` and `ModuleGuard` need in order
 * to render the page at all rather than the login redirect or AccessDenied.
 */

vi.mock('../lib/socket', () => ({
  getSocket: () => null,
  subscribeBranch: vi.fn(),
  unsubscribeCurrentBranch: vi.fn(),
  subscribeQueue: vi.fn(),
  unsubscribeQueue: vi.fn(),
  disconnectSocket: vi.fn(),
  useSocketEvent: () => {},
  SOCKET_URL: 'ws://localhost:7000',
  attachListener: vi.fn(),
  detachListener: vi.fn(),
  // `socket.js` re-exports these two under the names `hooks/useSocket.js` uses.
  onTrackedSocketEvent: vi.fn(),
  offTrackedSocketEvent: vi.fn(),
}));

vi.mock('../lib/axios', () => {
  // The response body has to look like the server's, not merely resolve. Every
  // list endpoint answers with a `{ success, data: { <plural>: [], pagination } }`
  // envelope, and each slice reads its own key out of that
  // (`state.items = action.payload.users`, `state.unread = action.payload.unread`,
  // ...). A blanket `data: []` therefore left those keys `undefined` and the
  // pages crashed on first mount - `Users.jsx` called `.slice()` on an
  // undefined list. One superset envelope carrying the keys the server actually
  // sends keeps every slice on its normal empty path.
  const EMPTY = {
    appointments: [],
    balances: {},
    branches: [],
    commissions: [],
    dayCloses: [],
    doctors: [],
    drawings: [],
    entries: [],
    expenses: [],
    groups: [],
    invoices: [],
    items: [],
    messages: [],
    notes: [],
    patients: [],
    permissions: {},
    plans: [],
    prescriptions: [],
    roles: [],
    staff: [],
    unread: {},
    users: [],
    pagination: { page: 1, limit: 20, total: 0, pages: 1 },
    // `state.stats = action.payload` in the dashboard slice, so the dashboard's
    // own keys sit at the top level of that payload rather than under a nested
    // `stats`. Inventory keeps its own nested `stats` object, which is why both
    // shapes are present.
    modules: [],
    queueByStatus: {},
    recentStaff: [],
    staffByRole: [],
    stats: { lowStockCount: 0, totalStockValue: 0 },
    summary: {},
    total: 0,
  };

  const api = vi.fn(() => Promise.resolve({ data: { success: true, data: { ...EMPTY } } }));
  api.get = vi.fn(() => Promise.resolve({ data: { success: true, data: { ...EMPTY } } }));
  api.post = vi.fn(() => Promise.resolve({ data: { success: true, data: { ...EMPTY } } }));
  api.put = vi.fn(() => Promise.resolve({ data: { success: true, data: { ...EMPTY } } }));
  api.patch = vi.fn(() => Promise.resolve({ data: { success: true, data: { ...EMPTY } } }));
  api.delete = vi.fn(() => Promise.resolve({ data: { success: true, data: { ...EMPTY } } }));
  api.interceptors = { request: { use: vi.fn() }, response: { use: vi.fn() } };
  return { default: api, shouldEndSession: () => false };
});

vi.mock('../lib/notificationSound', () => ({
  initNotifications: vi.fn(),
  playNotification: vi.fn(),
}));

// jsdom has no layout engine, so `scrollIntoView` does not exist. The chat
// message list calls it on mount; without the stub that throws a TypeError
// unrelated to the app. This is an environment gap, not app behaviour.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

import accountingReducer from '../features/accounting/accountingSlice';
import appointmentReducer from '../features/appointments/appointmentSlice';
import authReducer from '../features/auth/authSlice';
import billingReducer from '../features/billing/billingSlice';
import branchReducer from '../features/branches/branchSlice';
import chatReducer from '../features/chat/chatSlice';
import dashboardReducer from '../features/dashboard/dashboardSlice';
import emrReducer from '../features/emr/emrSlice';
import inventoryReducer from '../features/inventory/inventorySlice';
import patientsReducer from '../features/patients/patientSlice';
import recallsReducer from '../features/recalls/recallSlice';
import rolesReducer from '../features/roles/rolesSlice';
import uiReducer from '../features/ui/uiSlice';
import usersReducer from '../features/users/userSlice';
import walletReducer from '../features/wallet/walletSlice';
import { MODULE_KEYS } from '../features/roles/permissions';

/**
 * The shape `GET /auth/my-permissions` actually returns, which is what
 * `lib/roles.js` reads:
 *
 *   moduleAccessStatus() looks up `myPermissions.permissions[module]` and
 *   returns 'permission' when that array is missing or empty - it does not
 *   parse "module:action" strings. Feeding it a flat array (the obvious guess)
 *   makes every module look denied, which is how this suite first rendered
 *   AccessDenied on all sixteen routes.
 */
const PERMISSION_MAP = Object.fromEntries(
  MODULE_KEYS.map((m) => [m, ['read', 'create', 'update', 'delete', 'export', 'manage']]),
);

const MY_PERMISSIONS = {
  isSystemAdmin: false,
  permissions: PERMISSION_MAP,
  timezone: 'Africa/Cairo',
};

const USER = {
  _id: 'u1',
  name: 'Smoke Tester',
  email: 'smoke@example.com',
  role: 'clinic_admin',
  plan: { name: 'pro', modules: MODULE_KEYS },
  branch: { _id: 'b1', name: 'Main' },
  tenant: { _id: 't1', name: 'Clinic', isActive: true, status: 'active' },
  preferences: {},
};

/** The real slice's own initial state, so pages that read `items`/`status`/... get them. */
const initialOf = (reducer) => reducer(undefined, { type: '@@smoke/init' });

/**
 * The real reducers, with only `auth` and `users` pre-seeded to a signed-in
 * clinic admin. Hand-rolled stand-ins for those two looked harmless and were
 * not: pages read fields the real slices own - `Users.jsx` destructures
 * `{ items, status, error }` straight off `s.users` - so a three-key stub made
 * it call `filtered.slice(...)` on `undefined` and crash. Using the real
 * reducer and overriding the session through `preloadedState` keeps every other
 * field identical to production.
 */
const makeStore = ({ authenticated = true } = {}) =>
  configureStore({
    reducer: {
      accounting: accountingReducer,
      appointments: appointmentReducer,
      auth: authReducer,
      billing: billingReducer,
      branches: branchReducer,
      chat: chatReducer,
      dashboard: dashboardReducer,
      emr: emrReducer,
      inventory: inventoryReducer,
      patients: patientsReducer,
      recalls: recallsReducer,
      roles: rolesReducer,
      ui: uiReducer,
      users: usersReducer,
      wallet: walletReducer,
    },
    preloadedState: {
      auth: {
        ...initialOf(authReducer),
        user: authenticated ? USER : null,
        status: 'succeeded',
      },
      users: {
        ...initialOf(usersReducer),
        myPermissions: authenticated ? MY_PERMISSIONS : null,
        permissionsStatus: 'succeeded',
      },
    },
  });

/** Routes that sit behind ProtectedRoute + ModuleGuard + AppLayout. */
const AUTH_ROUTES = [
  '/dashboard',
  '/patients',
  '/patients/p1/emr',
  '/appointments',
  '/recalls',
  '/branches',
  '/billing',
  '/accounting',
  '/inventory',
  '/roles',
  '/users',
  '/settings',
  '/chat',
];

/** Public, and the 404 branch. */
const STANDALONE_ROUTES = ['/pricing', '/definitely-not-a-route'];

// One Suspense boundary wraps the whole `<Routes>`, so a still-loading lazy
// child replaces the entire tree - AppLayout's `<main>` included - with
// `RouteFallback`. Waiting on the landmark therefore means "wait for the chunk",
// and a cold jsdom module graph can take longer than waitFor's 1s default.
const WAIT = { timeout: 10000 };

async function renderAt(path, { authenticated = true } = {}) {
  const store = makeStore({ authenticated });
  const result = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </Provider>,
  );

  // Let the lazy() chunks resolve, the data thunks settle, and effects flush.
  // A single microtask is not enough for a dynamic import, so this waits on a
  // condition rather than a fixed number of ticks.
  await act(async () => {
    await Promise.resolve();
  });

  // The wait target is a mounted landmark, never text. Text is the wrong signal
  // here on both sides: FullPageLoader and AccessDenied both render text while
  // the route has not loaded, and the skeleton-heavy pages (/dashboard) render
  // no text at all once they have. Waiting on text therefore passed while a
  // loader was on screen and failed on the pages that actually worked.
  if (AUTH_ROUTES.includes(path)) {
    await waitFor(
      () => {
        expect(
          result.container.querySelector('main'),
          `${path} never mounted AppLayout`,
        ).toBeTruthy();
      },
      WAIT,
    );
  }

  // Then let the page's own effects and pending data run.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return result;
}

/** Render errors React logged, ignoring benign noise from the test env. */
function crashLogs(consoleErrors) {
  return consoleErrors.filter((e) =>
    /The above error|Uncaught|not a function|is undefined|Cannot read|is not iterable/i.test(e),
  );
}

describe('every route renders', () => {
  let consoleErrors;

  beforeEach(() => {
    consoleErrors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(AUTH_ROUTES)('renders %s inside the app layout', async (path) => {
    const { container, unmount } = await renderAt(path);

    // `main` is AppLayout's page outlet and `aside` is the Sidebar, so both
    // being present means the request cleared ProtectedRoute and ModuleGuard and
    // mounted the layout chrome. A loader or AccessDenied has neither.
    expect(container.querySelector('main'), `${path} did not reach AppLayout`).toBeTruthy();
    expect(container.querySelector('aside'), `${path} rendered no sidebar`).toBeTruthy();
    expect(
      container.querySelector('main').innerHTML.length,
      `${path} mounted an empty outlet`,
    ).toBeGreaterThan(0);

    const crashed = crashLogs(consoleErrors);
    expect(crashed, `console errors while rendering ${path}:\n${crashed.join('\n')}`).toEqual(
      [],
    );

    unmount();
  });

  it.each(STANDALONE_ROUTES)('renders %s', async (path) => {
    const { container, unmount } = await renderAt(path);

    // Public pages have no layout chrome, so require a real tree instead. The
    // loading frame is a single short div; a rendered page is far larger.
    await waitFor(
      () => {
        expect(
          container.innerHTML.length,
          `${path} rendered too little to be a page`,
        ).toBeGreaterThan(300);
      },
      WAIT,
    );

    const crashed = crashLogs(consoleErrors);
    expect(crashed, `console errors while rendering ${path}:\n${crashed.join('\n')}`).toEqual(
      [],
    );

    unmount();
  });

  it('shows a real login form to a signed-out visitor', async () => {
    // With a session in the store the Login page redirects away, so the
    // signed-out case is the one that actually exercises the form.
    const { container } = await renderAt('/login', { authenticated: false });
    await waitFor(
      () => {
        expect(container.querySelector('input[type="password"]')).toBeTruthy();
      },
      WAIT,
    );
  });

  it('renders the 404 page for an unknown path', async () => {
    const { container } = await renderAt('/definitely-not-a-route');
    await waitFor(
      () => {
        expect(container.textContent).toMatch(/404|not found/i);
      },
      WAIT,
    );
  });

  it('does not bounce an authorised user off a permitted page', async () => {
    // ModuleGuard redirects to the landing path when a module is denied. If a
    // route rendered the AccessDenied screen instead of its page, the guard is
    // disagreeing with the sidebar registry.
    const { container } = await renderAt('/accounting');
    expect(container.textContent).not.toMatch(/access denied|not authorized/i);
  });
});
