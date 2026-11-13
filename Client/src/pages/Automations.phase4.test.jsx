import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  listTriggers: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  installTemplates: vi.fn(),
  test: vi.fn(),
  listRuns: vi.fn(),
  fetchBranches: vi.fn(() => ({ type: 'branches/fetch' })),
  showErrorDialog: vi.fn((e) => ({ type: 'ui/showErrorDialog', payload: e })),
  pushToast: vi.fn((p) => ({ type: 'ui/pushToast', payload: p })),
  requestConfirm: vi.fn(async () => true),
}));

vi.mock('../features/automations/automationApi', () => ({ automationApi: {
  list: (...a) => mocks.list(...a),
  get: (...a) => mocks.get(...a),
  listTriggers: (...a) => mocks.listTriggers(...a),
  create: (...a) => mocks.create(...a),
  update: (...a) => mocks.update(...a),
  remove: (...a) => mocks.remove(...a),
  installTemplates: (...a) => mocks.installTemplates(...a),
  test: (...a) => mocks.test(...a),
  listRuns: (...a) => mocks.listRuns(...a),
  getRun: vi.fn(),
} }));
vi.mock('../features/branches/branchSlice', () => ({ fetchBranches: (...a) => mocks.fetchBranches(...a) }));
vi.mock('../features/ui/uiSlice', () => ({
  showErrorDialog: (...a) => mocks.showErrorDialog(...a),
  pushToast: (...a) => mocks.pushToast(...a),
}));
vi.mock('../features/ui/confirmDialog', () => ({ requestConfirm: (...a) => mocks.requestConfirm(...a) }));
vi.mock('../lib/i18n', () => ({ useT: () => ({ t: (k) => k }) }));
vi.mock('../lib/format', () => ({ formatDate: (v) => String(v || '') }));
vi.mock('../lib/roles', () => ({
  usePermission: (module) => module === 'automations',
}));

import automationsReducer from '../features/automations/automationSlice';
import Automations from './Automations';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderPage(preloaded) {
  const store = configureStore({
    reducer: {
      automations: automationsReducer,
      branches: (s = { items: [] }) => s,
    },
    preloadedState: preloaded,
  });
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/automations']}>
        <Automations />
      </MemoryRouter>
    </Provider>,
  );
}

describe('Automations page (Phase 4)', () => {
  it('renders list and loads triggers on mount', async () => {
    mocks.list.mockResolvedValue({ automations: [{ _id: 'a1', name: 'Rule A', enabled: true, trigger: { type: 'appointment.created' } }] });
    mocks.listTriggers.mockResolvedValue({ triggers: [{ key: 'appointment.created', label: 'Appointment created' }], actionTypes: [], conditionOps: [] });
    renderPage();
    await screen.findByText('Rule A');
    expect(mocks.list).toHaveBeenCalled();
    expect(mocks.listTriggers).toHaveBeenCalled();
  });

  it('shows empty state when no automations', async () => {
    mocks.list.mockResolvedValue({ automations: [] });
    mocks.listTriggers.mockResolvedValue({ triggers: [], actionTypes: [], conditionOps: [] });
    renderPage();
    await screen.findByText('automations.empty');
  });

  it('validates invalid JSON in create form without calling API', async () => {
    mocks.list.mockResolvedValue({ automations: [] });
    mocks.listTriggers.mockResolvedValue({ triggers: [{ key: 'appointment.created', label: 'Appointment created' }], actionTypes: [], conditionOps: [] });
    renderPage();
    await screen.findByText('automations.empty');
    fireEvent.click(screen.getByRole('button', { name: 'automations.new' }));
    await screen.findByText('automations.form.new');

    const nameInput = screen.getByText('automations.form.name').parentElement.querySelector('input');
    const actionsInput = screen.getByText('automations.form.actionsJson').parentElement.querySelector('textarea');
    fireEvent.change(nameInput, { target: { value: 'Bad' } });
    fireEvent.change(actionsInput, { target: { value: '{bad' } });

    fireEvent.click(screen.getByRole('button', { name: 'automations.form.save' }));
    await screen.findByText('automations.form.invalidJson');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
