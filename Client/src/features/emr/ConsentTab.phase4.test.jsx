import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  showErrorDialog: vi.fn((e) => ({ type: 'ui/showErrorDialog', payload: e })),
  pushToast: vi.fn((p) => ({ type: 'ui/pushToast', payload: p })),
  requestConfirm: vi.fn(async () => true),
}));

vi.mock('../../lib/axios', () => ({
  default: {
    get: (...args) => mocks.get(...args),
    post: (...args) => mocks.post(...args),
    patch: (...args) => mocks.patch(...args),
    delete: (...args) => mocks.del(...args),
  },
}));
vi.mock('../../lib/socket', () => ({ useSocketEvent: () => {} }));
vi.mock('../../lib/socketEvents', () => ({ SOCKET_EVENTS: {
  CONSENT_CREATED: 'consent:created',
  CONSENT_UPDATED: 'consent:updated',
  CONSENT_SIGNED: 'consent:signed',
  CONSENT_DECLINED: 'consent:declined',
  CONSENT_WITHDRAWN: 'consent:withdrawn',
  CONSENT_DELETED: 'consent:deleted',
} }));
vi.mock('../../lib/roles', () => ({
  usePermission: (module, action) => {
    if (module === 'consents') {
      if (action === 'read') return true;
      if (action === 'create' || action === 'update' || action === 'delete') return true;
    }
    return false;
  },
}));
vi.mock('../../lib/i18n', () => ({ useT: () => ({ t: (k, vars) => (vars?.n ? `${k}:${vars.n}` : k) }) }));
vi.mock('../../lib/format', () => ({ formatDate: (v) => String(v || '') }));
vi.mock('../ui/uiSlice', () => ({
  showErrorDialog: (...args) => mocks.showErrorDialog(...args),
  pushToast: (...args) => mocks.pushToast(...args),
}));
vi.mock('../ui/confirmDialog', () => ({ requestConfirm: (...args) => mocks.requestConfirm(...args) }));

import ConsentTab from './ConsentTab';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderTab(ui) {
  const store = configureStore({ reducer: { noop: (s = {}) => s } });
  return render(<Provider store={store}>{ui}</Provider>);
}

describe('ConsentTab (Phase 4)', () => {
  it('lists patient-scoped consents and renders status/details', async () => {
    mocks.get.mockResolvedValueOnce({
      data: { data: { consents: [{ _id: 'c1', title: 'Treatment Consent', type: 'treatment', status: 'draft', version: 1, createdAt: '2026-01-01' }] } },
    });
    renderTab(<ConsentTab patientId="p1" />);
    await waitFor(() => expect(screen.getByText('Treatment Consent')).toBeTruthy());
    expect(mocks.get).toHaveBeenCalledWith('/patients/p1/consents', { params: { page: 1, limit: 20 } });
    expect(screen.getByText('emr.consents.status.draft')).toBeTruthy();
    expect(screen.getByText(/emr\.consents\.version/)).toBeTruthy();
  });

  it('creates a consent via existing endpoint', async () => {
    mocks.get.mockResolvedValue({ data: { data: { consents: [] } } });
    mocks.post.mockResolvedValueOnce({ data: { data: { consent: { _id: 'c2' } } } });
    renderTab(<ConsentTab patientId="p1" />);
    await screen.findByText('emr.consents.empty');
    fireEvent.click(screen.getByRole('button', { name: 'emr.consents.new' }));
    const titleInput = await screen.findByLabelText(/emr\.consents\.titleLabel/i);
    fireEvent.change(titleInput, { target: { value: 'New Consent' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post.mock.calls[0][0]).toBe('/patients/p1/consents');
    expect(mocks.post.mock.calls[0][1]).toMatchObject({ title: 'New Consent', type: 'treatment' });
  });

  it('shows failure on create without false success and keeps form open', async () => {
    mocks.get.mockResolvedValue({ data: { data: { consents: [] } } });
    mocks.post.mockRejectedValueOnce({ response: { data: { message: 'Validation failed' } }, message: 'Validation failed' });
    renderTab(<ConsentTab patientId="p1" />);
    await screen.findByText('emr.consents.empty');
    fireEvent.click(screen.getByRole('button', { name: 'emr.consents.new' }));
    const titleInput = await screen.findByLabelText(/emr\.consents\.titleLabel/i);
    fireEvent.change(titleInput, { target: { value: 'Bad Consent' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await screen.findByText('Validation failed');
    expect(screen.getByDisplayValue('Bad Consent')).toBeTruthy();
    expect(mocks.pushToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success', message: 'emr.consents.saved' }));
  });

  it('sends decline action for draft/sent consent with confirmation', async () => {
    mocks.get.mockResolvedValue({ data: { data: { consents: [{ _id: 'c3', title: 'C3', type: 'treatment', status: 'sent' }] } } });
    mocks.patch.mockResolvedValueOnce({ data: { data: { consent: { _id: 'c3', status: 'declined' } } } });
    renderTab(<ConsentTab patientId="p1" />);
    await screen.findByText('C3');
    fireEvent.click(screen.getByRole('button', { name: 'emr.consents.decline' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/patients/p1/consents/c3/decline', {}));
    expect(mocks.requestConfirm).toHaveBeenCalled();
  });
});
