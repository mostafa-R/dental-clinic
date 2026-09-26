import { describe, expect, it, beforeEach } from 'vitest';

import reducer, { fetchAppointments, setDate } from './appointmentSlice.js';

/**
 * Regression coverage for the live-queue request sequencing.
 *
 * The bug: Live Queue refetches on tab focus and when the socket pushes an
 * update, so several list requests can be in flight at once. Responses were
 * applied in arrival order, so a slow request for the previous day could land
 * after a newer one and repopulate the board with the wrong day's
 * appointments -- the user would act on yesterday's queue believing it is
 * today.
 *
 * The fix records the newest requestId on `pending` and drops `fulfilled` /
 * `rejected` from any request that is no longer the newest.
 */

const reducerInit = () => reducer(undefined, { type: '@@INIT' });

/** Build a real pending/fulfilled pair so action types and requestIds match RTK. */
const pending = (requestId) => fetchAppointments.pending(requestId, {});
const fulfilled = (requestId, appointments) =>
  fetchAppointments.fulfilled(
    { appointments, pagination: { page: 1, pages: 1, total: appointments.length } },
    requestId,
    {},
  );
// `thunk.rejected(error, requestId, arg, payload)`. The slice reads
// `action.payload`, which is what `rejectWithValue` populates in the real thunk.
const rejected = (requestId, payload = 'boom') =>
  fetchAppointments.rejected(
    { message: 'Request failed' },
    requestId,
    {},
    payload,
  );

const NAME = (n) => `patient-${n}`;

describe('appointmentSlice fetchAppointments sequencing', () => {
  let state;
  beforeEach(() => {
    state = reducerInit();
  });

  it('applies a response when nothing superseded it', () => {
    state = reducer(state, pending('r1'));
    state = reducer(state, fulfilled('r1', [{ id: 1, name: NAME(1) }]));

    expect(state.items).toHaveLength(1);
    expect(state.items[0].id).toBe(1);
    expect(state.status).toBe('succeeded');
  });

  // The regression this file exists for.
  it('ignores an older response that arrives after a newer one', () => {
    state = reducer(state, pending('r1'));
    state = reducer(state, pending('r2'));

    // The NEW request wins the race.
    state = reducer(state, fulfilled('r2', [{ id: 2, name: NAME(2) }]));
    expect(state.items.map((a) => a.id)).toEqual([2]);

    // The stale one lands late and must not resurrect the previous day.
    state = reducer(state, fulfilled('r1', [{ id: 1, name: NAME(1) }]));
    expect(state.items.map((a) => a.id)).toEqual([2]);
  });

  it('ignores a stale failure so it cannot flip a good list to errored', () => {
    state = reducer(state, pending('r1'));
    state = reducer(state, pending('r2'));
    state = reducer(state, fulfilled('r2', [{ id: 2, name: NAME(2) }]));

    state = reducer(state, rejected('r1', 'stale network error'));

    expect(state.status).toBe('succeeded');
    expect(state.error).toBeNull();
    expect(state.items).toHaveLength(1);
  });

  it('surfaces the failure of the newest request', () => {
    state = reducer(state, pending('r1'));
    state = reducer(state, rejected('r1', 'real failure'));

    expect(state.status).toBe('failed');
    expect(state.error).toBe('real failure');
  });

  it('keeps the newest of many overlapping requests', () => {
    state = reducer(state, pending('r1'));
    state = reducer(state, pending('r2'));
    state = reducer(state, pending('r3'));

    // Out-of-order arrivals, oldest last.
    state = reducer(state, fulfilled('r2', [{ id: 2, name: NAME(2) }]));
    state = reducer(state, fulfilled('r1', [{ id: 1, name: NAME(1) }]));
    state = reducer(state, fulfilled('r3', [{ id: 3, name: NAME(3) }]));

    expect(state.items.map((a) => a.id)).toEqual([3]);
  });

  it('does not let a stale response overwrite a newly requested day', () => {
    // User is looking at today, then switches to tomorrow while the "today"
    // request is still in flight.
    state = reducer(state, pending('r-today'));
    state = reducer(state, setDate('2026-09-27'));
    expect(state.query.date).toBe('2026-09-27');
    state = reducer(state, pending('r-tomorrow'));

    // The old day's response arrives last and must be dropped, otherwise the
    // board shows the wrong day under the new date filter.
    state = reducer(state, fulfilled('r-today', [{ id: 1, name: NAME(1) }]));
    expect(state.items).toHaveLength(0);

    state = reducer(state, fulfilled('r-tomorrow', [{ id: 2, name: NAME(2) }]));
    expect(state.items.map((a) => a.id)).toEqual([2]);
  });
});
