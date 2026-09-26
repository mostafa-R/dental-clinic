import { describe, expect, it, beforeEach } from 'vitest';

import {
  getConfirmState,
  requestConfirm,
  resolveConfirm,
} from './confirmDialog.js';
import uiReducer, { dismissToast, pushToast, showErrorDialog } from './uiSlice.js';

describe('requestConfirm / resolveConfirm', () => {
  beforeEach(() => {
    // Drain any dialog left open by the previous test so module-level state
    // does not leak between cases.
    resolveConfirm(false);
  });

  it('resolves true when the user confirms', async () => {
    const p = requestConfirm({ title: 'Delete patient' });
    expect(getConfirmState().open).toBe(true);
    expect(getConfirmState().title).toBe('Delete patient');
    resolveConfirm(true);
    await expect(p).resolves.toBe(true);
    expect(getConfirmState().open).toBe(false);
  });

  it('resolves false when the user cancels', async () => {
    const p = requestConfirm({ title: 'Delete patient' });
    resolveConfirm(false);
    await expect(p).resolves.toBe(false);
  });

  // The regression this file exists for: a second request used to overwrite the
  // stored resolver, leaving the first caller awaiting a promise that could
  // never settle. In the app that meant a form stuck permanently in its
  // loading/submitting state with no way out.
  it('settles a superseded prompt as false instead of stranding it', async () => {
    const first = requestConfirm({ title: 'First' });
    const second = requestConfirm({ title: 'Second' });

    await expect(first).resolves.toBe(false);

    // The newer prompt is still the live one and must still be answerable.
    expect(getConfirmState().title).toBe('Second');
    resolveConfirm(true);
    await expect(second).resolves.toBe(true);
  });

  it('does not throw when a prompt is resolved with no pending request', () => {
    expect(() => resolveConfirm(true)).not.toThrow();
  });

  it('only lets the latest of many rapid prompts be answered', async () => {
    const a = requestConfirm({ title: 'a' });
    const b = requestConfirm({ title: 'b' });
    const c = requestConfirm({ title: 'c' });

    // Each new prompt supersedes the previous one, so the first two are
    // cancelled and only the last is still live.
    await expect(a).resolves.toBe(false);
    await expect(b).resolves.toBe(false);
    expect(getConfirmState().title).toBe('c');

    resolveConfirm(true);
    await expect(c).resolves.toBe(true);
  });
});

describe('toast list ceiling', () => {
  // Toasts auto-dismiss on a timer, but a timer only runs while the item is
  // mounted. A failing poll or socket reconnect could emit errors faster than
  // they expired and grow the array (plus a DOM node and timer per entry)
  // without bound.
  it('keeps only the newest toasts', () => {
    let state = uiReducer(undefined, { type: '@@INIT' });
    for (let i = 0; i < 12; i += 1) {
      state = uiReducer(state, pushToast({ title: `t${i}`, type: 'error' }));
    }
    expect(state.toasts).toHaveLength(5);
    expect(state.toasts.at(-1).title).toBe('t11');
    // The oldest are the ones dropped.
    expect(state.toasts.map((t) => t.title)).toEqual(['t7', 't8', 't9', 't10', 't11']);
  });

  it('applies the same ceiling to error dialogs that degrade to toasts', () => {
    let state = uiReducer(undefined, { type: '@@INIT' });
    for (let i = 0; i < 8; i += 1) {
      state = uiReducer(state, showErrorDialog({ message: `boom ${i}` }));
    }
    expect(state.toasts).toHaveLength(5);
  });

  it('leaves the list alone when under the ceiling', () => {
    let state = uiReducer(undefined, { type: '@@INIT' });
    state = uiReducer(state, pushToast({ title: 'only' }));
    expect(state.toasts).toHaveLength(1);
  });

  it('dismisses by id', () => {
    let state = uiReducer(undefined, { type: '@@INIT' });
    state = uiReducer(state, pushToast({ title: 'keep' }));
    state = uiReducer(state, pushToast({ title: 'drop' }));
    const target = state.toasts.at(-1).id;
    state = uiReducer(state, dismissToast(target));
    expect(state.toasts.map((t) => t.title)).toEqual(['keep']);
  });
});
