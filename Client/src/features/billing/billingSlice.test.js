import { describe, expect, it, beforeEach } from 'vitest';

import reducer, { fetchInvoices } from './billingSlice.js';

/**
 * Regression coverage for invoice-list request sequencing.
 *
 * The bug: the search box is debounced, but socket-driven refreshes and explicit
 * loads could also fire, leaving several list requests in flight. Responses were
 * applied in arrival order, so a slow broad query could land after a narrower
 * one and repopulate the table with rows that do not match what the user typed.
 */

const init = () => reducer(undefined, { type: '@@INIT' });
const pending = (requestId) => fetchInvoices.pending(requestId, {});
const fulfilled = (requestId, invoices) =>
  fetchInvoices.fulfilled(
    { invoices, pagination: { page: 1, pages: 1, total: invoices.length } },
    requestId,
    {},
  );
// `thunk.rejected(error, requestId, arg, payload)`; the slice reads `action.payload`.
const rejected = (requestId, payload = 'boom') =>
  fetchInvoices.rejected({ message: 'Request failed' }, requestId, {}, payload);

const NO = { id: 1, number: 'INV-1' };
const NARROW = { id: 2, number: 'INV-2' };

describe('billingSlice fetchInvoices sequencing', () => {
  let state;
  beforeEach(() => {
    state = init();
  });

  it('applies a response when nothing superseded it', () => {
    state = reducer(state, pending('r1'));
    state = reducer(state, fulfilled('r1', [NO]));

    expect(state.items).toHaveLength(1);
    expect(state.status).toBe('succeeded');
  });

  // The regression this file exists for.
  it('ignores a slow broad query that lands after a newer narrow one', () => {
    state = reducer(state, pending('r-broad'));
    state = reducer(state, pending('r-narrow'));

    state = reducer(state, fulfilled('r-narrow', [NARROW]));
    expect(state.items.map((i) => i.id)).toEqual([2]);

    state = reducer(state, fulfilled('r-broad', [NO]));
    expect(state.items.map((i) => i.id)).toEqual([2]);
  });

  it('ignores a stale failure so it cannot blank a good table', () => {
    state = reducer(state, pending('r1'));
    state = reducer(state, pending('r2'));
    state = reducer(state, fulfilled('r2', [NARROW]));

    state = reducer(state, rejected('r1', 'stale failure'));

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

  it('keeps the newest of many overlapping requests regardless of order', () => {
    state = reducer(state, pending('r1'));
    state = reducer(state, pending('r2'));
    state = reducer(state, pending('r3'));

    state = reducer(state, fulfilled('r1', [NO]));
    state = reducer(state, fulfilled('r3', [NARROW]));
    state = reducer(state, fulfilled('r2', [{ id: 3, number: 'INV-3' }]));

    expect(state.items.map((i) => i.id)).toEqual([2]);
  });
});
