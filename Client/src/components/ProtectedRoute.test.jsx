import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

import ProtectedRoute from './ProtectedRoute';

vi.mock('../lib/socket', () => ({
  subscribeBranch: vi.fn(),
  disconnectSocket: vi.fn(),
}));

vi.mock('../lib/roles', () => ({
  usePermissionRevalidation: () => {},
  useLandingPath: () => '/dashboard',
}));

vi.mock('../features/auth/authSlice', () => ({
  loadCurrentUser: () => ({ type: 'auth/loadCurrentUser' }),
  verifyImpersonation: () => ({ type: 'auth/verifyImpersonation' }),
}));

vi.mock('../features/users/userSlice', () => ({
  fetchMyPermissions: () => ({ type: 'users/fetchMyPermissions' }),
}));

vi.mock('../lib/i18n', () => ({
  useT: () => ({ t: (k) => k }),
}));

function makeStore(overrides = {}) {
  const baseAuth = {
    user: {
      _id: 'u1',
      name: 'User',
      branch: { _id: 'b1' },
      tenant: { _id: 't1', status: 'active', isActive: true },
    },
    status: 'succeeded',
  };
  const baseUsers = {
    permissionsStatus: 'succeeded',
    myPermissions: { isSystemAdmin: false, permissions: {} },
  };
  return configureStore({
    reducer: {
      auth: (s = baseAuth) => ({ ...s, ...(overrides.auth || {}) }),
      users: (s = baseUsers) => ({ ...s, ...(overrides.users || {}) }),
    },
  });
}

function renderProtected(store, initialPath = '/secret') {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/secret" element={<div data-testid="protected-content">TOP SECRET</div>} />
          </Route>
          <Route path="/login" element={<div>LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

afterEach(cleanup);

describe('ProtectedRoute permission-fetch failure (Phase 1.1)', () => {
  it('renders AccessDenied and never exposes protected content when permissions fetch fails', () => {
    const store = makeStore({ users: { permissionsStatus: 'failed' } });
    renderProtected(store);

    expect(screen.getByText('accessDenied.title')).toBeTruthy();
    expect(screen.getByText('accessDenied.permissionBody')).toBeTruthy();
    expect(screen.queryByTestId('protected-content')).toBeNull();
    expect(screen.queryByText('TOP SECRET')).toBeNull();
  });
});
