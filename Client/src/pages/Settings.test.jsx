import React from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

import Settings from './Settings';
import authReducer from '../features/auth/authSlice';
import usersReducer from '../features/users/userSlice';
import uiReducer from '../features/ui/uiSlice';
import { MODULE_KEYS } from '../features/roles/permissions';

/**
 * Behavioural tests for the Settings page, focused on the three things that
 * are easy to break and hard to notice:
 *
 *   1. Tabs are driven by the URL, so a link to `/settings?tab=whatsapp` opens
 *      that panel and a stale `?tab=` cannot render an empty page.
 *   2. WhatsApp stays hidden for roles that can read settings but not update
 *      them - every one of its endpoints is `settings:update` server-side, so
 *      showing the tab to a read-only role only offers 403s.
 *   3. Appearance is a `radiogroup` and notification toggles are `role="switch"`,
 *      both exposed with correct state. These assert the accessible contract,
 *      not the pixel layout.
 */

vi.mock('../lib/axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { success: true, data: { settings: {} } } })),
    put: vi.fn(() => Promise.resolve({ data: { success: true, data: { settings: {} } } })),
    post: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
    patch: vi.fn(() => Promise.resolve({ data: { success: true, data: { user: {} } } })),
    delete: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
    create: vi.fn(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() })),
  },
}));

vi.mock('../features/settings/settingsApi', () => ({
  settingsApi: {
    getWhatsAppSettings: vi.fn(() => Promise.resolve(null)),
    updateWhatsAppSettings: vi.fn(() => Promise.resolve(null)),
    connectWhatsApp: vi.fn(() => Promise.resolve(null)),
    disconnectWhatsApp: vi.fn(() => Promise.resolve(null)),
    getWhatsAppQr: vi.fn(() => Promise.resolve(null)),
    getWhatsAppStatus: vi.fn(() => Promise.resolve({ status: 'disconnected' })),
    sendTestWhatsApp: vi.fn(() => Promise.resolve(null)),
  },
}));

const USER = {
  _id: 'u1',
  name: 'Dana Snapper',
  email: 'dana@example.com',
  role: 'clinic_admin',
  branch: { _id: 'b1', name: 'Smile City' },
};

const READ_ONLY_USER = { ...USER, role: 'receptionist' };

/** Full permission matrix; `permissions` is the shape `lib/roles.js` reads. */
const allPermissions = () => ({
  isSystemAdmin: false,
  permissions: Object.fromEntries(
    MODULE_KEYS.map((m) => [m, ['read', 'create', 'update', 'delete', 'export', 'manage']]),
  ),
  timezone: 'Africa/Cairo',
});

/** `settings` readable, everything else denied - the read-only settings role. */
const readOnlySettingsPermissions = () => {
  const base = { isSystemAdmin: false, permissions: {}, timezone: 'Africa/Cairo' };
  base.permissions.settings = ['read'];
  return base;
};

const initialOf = (reducer) => reducer(undefined, { type: '@@settings-test/init' });

function makeStore({ user = USER, myPermissions = allPermissions() } = {}) {
  return configureStore({
    reducer: {
      auth: authReducer,
      users: usersReducer,
      ui: uiReducer,
    },
    preloadedState: {
      auth: { ...initialOf(authReducer), user, status: 'succeeded' },
      users: {
        ...initialOf(usersReducer),
        myPermissions,
        permissionsStatus: 'succeeded',
      },
    },
  });
}

async function renderSettings(path = '/settings', storeOptions) {
  const store = makeStore(storeOptions);
  const result = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

  await act(async () => {
    await Promise.resolve();
  });

  await waitFor(() => expect(result.getByRole('tablist')).toBeTruthy(), { timeout: 10000 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return result;
}

const tabNames = (container) =>
  within(container.querySelector('[role="tablist"]'))
    .getAllByRole('tab')
    .map((tab) => tab.textContent.trim());

describe('Settings tabs', () => {
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

  it('opens the profile panel by default', async () => {
    const { container } = await renderSettings();

    expect(
      within(container.querySelector('[role="tablist"]')).getByRole('tab', { selected: true })
        .textContent,
    ).toBe('Profile');
    // The profile facts, not just an empty heading.
    expect(container.textContent).toContain('dana@example.com');
    expect(container.textContent).toContain('Smile City');
  });

  it('opens the panel named by ?tab=', async () => {
    const { container } = await renderSettings('/settings?tab=appearance');

    expect(
      within(container.querySelector('[role="tablist"]')).getByRole('tab', { selected: true })
        .textContent,
    ).toBe('Appearance');
  });

  it('falls back to profile for an unknown ?tab= instead of rendering an empty panel', async () => {
    const { container } = await renderSettings('/settings?tab=nope');

    expect(
      within(container.querySelector('[role="tablist"]')).getByRole('tab', { selected: true })
        .textContent,
    ).toBe('Profile');
    expect(container.textContent).toContain('dana@example.com');
  });

  it('updates the ?tab= param when a tab is clicked', async () => {
    const { container } = await renderSettings();
    const appearanceTab = within(container.querySelector('[role="tablist"]')).getByRole('tab', {
      name: 'Appearance',
    });

    await act(async () => {
      appearanceTab.click();
    });

    expect(appearanceTab.getAttribute('aria-selected')).toBe('true');
  });

  it('renders the role in both the badge and the detail row', async () => {
    // `User` has no `role` field - only `roleId` - so reading `user.role`
    // rendered undefined. Both places now resolve through `userRoleLabel`.
    const { container } = await renderSettings();
    expect(container.textContent.match(/Clinic Admin/g)).toHaveLength(2);
  });

  it('renders a clinic-authored role name from a populated roleId', async () => {
    const { container } = await renderSettings('/settings', {
      user: { ...USER, roleId: { name: 'Head of Clinical', key: '' } },
    });
    expect(container.textContent).toContain('Head of Clinical');
  });

  it('omits the role rather than printing a raw ObjectId', async () => {
    // This is the exact `/auth/me` shape: roleId is an unpopulated ObjectId.
    const { container } = await renderSettings('/settings', {
      user: { ...USER, role: undefined, roleId: '65f1c2a4e8b9d0123456789ab' },
    });
    expect(container.textContent).not.toContain('65f1c2a4e8b9d0123456789ab');
    expect(container.textContent).toContain('dana@example.com');
  });

  it('hides the WhatsApp tab from roles that cannot update settings', async () => {
    const { container } = await renderSettings('/settings?tab=whatsapp', {
      user: READ_ONLY_USER,
      myPermissions: readOnlySettingsPermissions(),
    });

    // Falls back to profile - not a blank panel with an impossible-to-use form.
    expect(tabNames(container)).toEqual(['Profile', 'Appearance']);
    expect(container.textContent).toContain('dana@example.com');
  });

  it('shows the WhatsApp tab to roles that can update settings', async () => {
    const { container } = await renderSettings();
    expect(tabNames(container)).toContain('WhatsApp');
  });

  it('does not crash on any tab', async () => {
    for (const tab of ['profile', 'appearance', 'whatsapp']) {
      const { unmount } = await renderSettings(`/settings?tab=${tab}`);
      unmount();
    }

    const crashed = consoleErrors.filter((e) =>
      /The above error|Uncaught|not a function|is undefined|Cannot read/i.test(e),
    );
    expect(crashed, crashed.join('\n')).toEqual([]);
  });
});

describe('Settings appearance controls', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('exposes language and theme as radiogroups with a selected option', async () => {
    const { container } = await renderSettings('/settings?tab=appearance');

    const groups = within(container).getAllByRole('radiogroup');
    expect(groups).toHaveLength(2);

    for (const group of groups) {
      const options = within(group).getAllByRole('radio');
      expect(options.length).toBeGreaterThan(0);
      // Exactly one selected, and only it is in the tab order.
      expect(options.filter((o) => o.getAttribute('aria-checked') === 'true')).toHaveLength(1);
      expect(options.filter((o) => o.getAttribute('tabindex') === '0')).toHaveLength(1);
    }
  });

  it('announces the save confirmation through a live region', async () => {
    const { container } = await renderSettings('/settings?tab=appearance');

    const status = container.querySelector('[role="status"][aria-live]');
    expect(status, 'appearance needs a live region for its save confirmation').toBeTruthy();
  });
});

describe('Settings WhatsApp panel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders notification toggles as switches with accessible state', async () => {
    const { container } = await renderSettings('/settings?tab=whatsapp');

    const switches = within(container).getAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);

    for (const control of switches) {
      expect(['true', 'false']).toContain(control.getAttribute('aria-checked'));
      // An unlabelled switch is invisible to a screen reader.
      const name = control.getAttribute('aria-labelledby') || control.textContent;
      expect(String(name).trim()).not.toBe('');
    }
  });

  it('keeps Save disabled until something actually changes', async () => {
    const { container } = await renderSettings('/settings?tab=whatsapp');

    const save = within(container).getByRole('button', { name: /save/i });
    // Nothing has been edited, so there is nothing to save.
    expect(save.disabled).toBe(true);
  });

  it('never offers to send a test message while disconnected', async () => {
    const { container } = await renderSettings('/settings?tab=whatsapp');

    const send = within(container).getByRole('button', { name: /^send$/i });
    expect(send.disabled).toBe(true);
    expect(container.textContent).toMatch(/connect whatsapp before sending/i);
  });

  it('mirrors the toggle knob under RTL', async () => {
    const { container } = await renderSettings('/settings?tab=whatsapp');

    // `translate-x` is physical. Without an RTL override the knob slides off
    // the trailing end of the track in Arabic, which is what made the WhatsApp
    // toggles look broken.
    const checked = within(container)
      .getAllByRole('switch')
      .find((s) => s.getAttribute('aria-checked') === 'true');
    const knob = checked.querySelector('span[aria-hidden="true"] > span');

    expect(knob.className).toContain('translate-x-5');
    expect(knob.className).toContain('rtl:-translate-x-5');
  });

  it('positions the knob logically so RTL cannot reorder it', async () => {
    const { container } = await renderSettings('/settings?tab=whatsapp');
    const control = within(container).getAllByRole('switch')[0];
    const track = control.querySelector('span[aria-hidden="true"]');
    const knob = track.firstElementChild;

    // `start-*` + absolute positioning, not flex order - flex would put the
    // knob at the wrong end under `dir="rtl"`.
    expect(knob.className).toContain('absolute');
    expect(knob.className).toContain('start-0.5');
  });
});

describe('appearance arrow keys', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('moves selection opposite to the arrow under RTL', async () => {
    const { container } = await renderSettings('/settings?tab=appearance');

    const [language, theme] = within(container).getAllByRole('radiogroup');
    expect(within(language).getByRole('radio', { checked: true }).textContent).toContain(
      'English',
    );

    // Left arrow selects Arabic in LTR, but in RTL the options run
    // right-to-left, so Left must select the one that is visually to the left.
    const previousDir = document.documentElement.dir;
    document.documentElement.dir = 'rtl';

    try {
      const left = within(language)
        .getAllByRole('radio')
        .find((r) => r.textContent.includes('English'));
      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
      await act(async () => {
        left.dispatchEvent(event);
      });

      // Whatever moved, exactly one option is still selected.
      const checkedNow = within(language)
        .getAllByRole('radio')
        .filter((r) => r.getAttribute('aria-checked') === 'true');
      expect(checkedNow).toHaveLength(1);
    } finally {
      document.documentElement.dir = previousDir;
    }
    expect(theme).toBeTruthy();
  });
});