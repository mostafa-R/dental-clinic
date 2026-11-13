import { describe, expect, it, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  listTriggers: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  installTemplates: vi.fn(),
  test: vi.fn(),
  listRuns: vi.fn(),
}));

vi.mock('./automationApi', () => ({ automationApi: mocks }));
vi.mock('../../lib/errors', () => ({ errPayload: (e, fb) => ({ message: e?.message || fb, code: e?.code }) }));

import reducer, {
  fetchAutomations,
  fetchAutomationTriggers,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  installAutomationTemplates,
  testAutomation,
  fetchAutomationRuns,
} from './automationSlice';

function makeStore() {
  return configureStore({ reducer: { automations: reducer } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('automationSlice (Phase 4)', () => {
  it('loads automations list into state', async () => {
    mocks.list.mockResolvedValueOnce({ automations: [{ _id: 'a1', name: 'Rule 1' }] });
    const store = makeStore();
    await store.dispatch(fetchAutomations());
    const state = store.getState().automations;
    expect(state.status).toBe('succeeded');
    expect(state.items).toEqual([{ _id: 'a1', name: 'Rule 1' }]);
  });

  it('records load failure without false success', async () => {
    mocks.list.mockRejectedValueOnce(new Error('boom'));
    const store = makeStore();
    await store.dispatch(fetchAutomations());
    const state = store.getState().automations;
    expect(state.status).toBe('failed');
    expect(state.error?.message).toBe('boom');
  });

  it('loads triggers catalog metadata', async () => {
    mocks.listTriggers.mockResolvedValueOnce({ triggers: [{ key: 'appointment.created', label: 'New' }], actionTypes: ['notify_branch'], conditionOps: ['eq'] });
    const store = makeStore();
    await store.dispatch(fetchAutomationTriggers());
    const state = store.getState().automations;
    expect(state.triggers[0].key).toBe('appointment.created');
    expect(state.actionTypes).toContain('notify_branch');
  });

  it('handles create/update/delete and test/runs flows', async () => {
    mocks.create.mockResolvedValueOnce({ automation: { _id: 'a1', name: 'A' } });
    mocks.update.mockResolvedValueOnce({ automation: { _id: 'a1', name: 'A2' } });
    mocks.test.mockResolvedValueOnce({ matched: true, actions: [] });
    mocks.listRuns.mockResolvedValueOnce({ runs: [{ _id: 'r1', status: 'success' }] });
    mocks.remove.mockResolvedValueOnce({});
    mocks.installTemplates.mockResolvedValueOnce({ installed: [{ _id: 't1' }] });

    const store = makeStore();
    await store.dispatch(createAutomation({ name: 'A' }));
    expect(store.getState().automations.items[0]._id).toBe('a1');

    await store.dispatch(updateAutomation({ id: 'a1', payload: { name: 'A2' } }));
    expect(store.getState().automations.items[0].name).toBe('A2');

    await store.dispatch(testAutomation({ id: 'a1', payload: { eventData: {} } }));
    expect(store.getState().automations.testStatus).toBe('succeeded');
    expect(store.getState().automations.testResult.matched).toBe(true);

    await store.dispatch(fetchAutomationRuns({ automation: 'a1' }));
    expect(store.getState().automations.runs[0]._id).toBe('r1');

    await store.dispatch(deleteAutomation('a1'));
    expect(store.getState().automations.items).toHaveLength(0);

    await store.dispatch(installAutomationTemplates());
    expect(store.getState().automations.formStatus).toBe('succeeded');
  });
});
