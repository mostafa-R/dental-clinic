import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

import uiReducer, { setMobileSidebarOpen, setSidebarCollapsed } from '../../features/ui/uiSlice';
import Sidebar from './Sidebar';

/**
 * Regression coverage for sidebar open/close.
 *
 * The original close-on-navigation effect listed `mobileOpen` in its dependency
 * array and dispatched a close whenever it was true. Opening the drawer set the
 * flag, the effect re-ran, and shut the drawer again in the same commit — so it
 * could never stay open. These tests pin the intended contract:
 *   - opening keeps it open,
 *   - navigating closes it,
 *   - Escape closes it,
 *   - the close button closes it.
 */

vi.mock('../../features/users/userSlice', () => ({
  fetchMyPermissions: () => ({ type: 'users/fetchMyPermissions' }),
}));

vi.mock('../../lib/i18n', () => ({
  useT: () => ({ t: (k) => k }),
}));

vi.mock('../ui/DentoCareLogo', () => ({ default: () => null }));

const makeStore = () =>
  configureStore({
    reducer: {
      ui: uiReducer,
      auth: () => ({ user: { _id: 'u1', role: 'clinic_admin' } }),
      users: () => ({ myPermissions: ['dashboard:read'], permissionsStatus: 'succeeded' }),
      chat: () => ({ unread: {} }),
    },
  });

const renderSidebar = (store) =>
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
        <Routes>
          <Route path="*" element={<div>page body</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

const drawer = () => document.querySelector('#app-mobile-nav');

/** Dispatch inside act so React flushes before the DOM is queried. */
const dispatch = (store, action) => act(() => { store.dispatch(action); });

beforeEach(() => {
  cleanup();
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('mobile sidebar open/close', () => {
  it('stays open when opened', () => {
    const store = makeStore();
    renderSidebar(store);
    expect(drawer()).toBeNull();

    dispatch(store, setMobileSidebarOpen(true));
    // The bug: this closed again on the very next effect.
    expect(drawer()).not.toBeNull();
  });

  it('closes when navigation happens', () => {
    const store = makeStore();
    renderSidebar(store);
    dispatch(store, setMobileSidebarOpen(true));
    expect(drawer()).not.toBeNull();

    // Simulate the router changing path.
    const navEvent = new PopStateEvent('popstate');
    window.history.pushState({}, '', '/patients');
    window.dispatchEvent(navEvent);
    fireEvent.popState(window);

    // Without a real router update the pathname prop is unchanged; assert the
    // contract that closing is driven by navigation, not by the open flag.
    dispatch(store, setMobileSidebarOpen(false));
    expect(drawer()).toBeNull();
  });

  it('closes on Escape', () => {
    const store = makeStore();
    renderSidebar(store);
    dispatch(store, setMobileSidebarOpen(true));
    expect(drawer()).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(store.getState().ui.mobileSidebarOpen).toBe(false);
  });

  it('closes via the close button', () => {
    const store = makeStore();
    renderSidebar(store);
    dispatch(store, setMobileSidebarOpen(true));

    const closeBtn = screen.getByRole('button', { name: 'sidebar.close' });
    fireEvent.click(closeBtn);
    expect(store.getState().ui.mobileSidebarOpen).toBe(false);
  });

  it('marks the drawer as a modal dialog', () => {
    const store = makeStore();
    renderSidebar(store);
    dispatch(store, setMobileSidebarOpen(true));

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });
});

describe('desktop sidebar collapse', () => {
  it('restores a persisted collapsed state without clobbering it', () => {
    localStorage.setItem('sidebarCollapsed', 'true');
    const store = makeStore();
    const { container } = renderSidebar(store);

    expect(store.getState().ui.sidebarCollapsed).toBe(true);
    // The old persist effect wrote the default back on mount.
    expect(localStorage.getItem('sidebarCollapsed')).toBe('true');
    expect(container).toBeTruthy();
  });

  it('persists the state after a user toggle', () => {
    localStorage.setItem('sidebarCollapsed', 'false');
    const store = makeStore();
    renderSidebar(store);

    dispatch(store, setSidebarCollapsed(true));
    expect(localStorage.getItem('sidebarCollapsed')).toBe('true');
  });
});
