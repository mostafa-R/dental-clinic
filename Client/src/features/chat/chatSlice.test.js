import { describe, expect, it, beforeEach } from 'vitest';

import reducer, { markChannelRead, markRead, setActiveChat } from './chatSlice.js';

/**
 * Read-receipt state handling.
 *
 * Two things are pinned here:
 *
 *   1. `markChannelRead.fulfilled` used to have no `extraReducers` case at all.
 *      The channel's unread badge was therefore only cleared as a side effect of
 *      the *next* `fetchMessages.fulfilled` — up to a full poll interval of a
 *      stale count, and permanently stale if that fetch failed. The thunk
 *      resolves with the channel id, so the badge should clear on ack.
 *
 *   2. Clearing a DM's unread count must not disturb a channel's, and vice
 *      versa — the two are keyed differently (`id` vs `channel:<id>`) and share
 *      the same `unread` map.
 */

const init = () => reducer(undefined, { type: '@@INIT' });

/** Thunk actions are plain objects with these fields; the slice only reads `payload`. */
const channelReadFulfilled = (channel, requestId = 'r1') =>
  markChannelRead.fulfilled(channel, requestId, channel);
const channelReadRejected = (channel, requestId = 'r1') =>
  markChannelRead.rejected({ message: 'Request failed' }, requestId, channel, 'nope');
const markReadFulfilled = (ids, requestId = 'r2') => markRead.fulfilled(ids, requestId, ids);

const withUnread = (state, unread) => ({ ...state, unread });

describe('chatSlice markChannelRead', () => {
  let state;
  beforeEach(() => {
    state = init();
  });

  it('clears the acknowledged channel badge', () => {
    state = withUnread(state, { 'channel:doctors': 7 });
    state = reducer(state, channelReadFulfilled('doctors'));

    expect(state.unread['channel:doctors']).toBe(0);
  });

  it('leaves other channels and DMs alone', () => {
    state = withUnread(state, {
      'channel:doctors': 7,
      'channel:front-desk': 3,
      'user-1': 5,
    });
    state = reducer(state, channelReadFulfilled('doctors'));

    expect(state.unread['channel:doctors']).toBe(0);
    expect(state.unread['channel:front-desk']).toBe(3);
    expect(state.unread['user-1']).toBe(5);
  });

  it('does not clear the badge when the request failed', () => {
    // A failed receipt write must not be papered over locally, otherwise the UI
    // claims "read" while the server still counts the channel unread.
    state = withUnread(state, { 'channel:doctors': 7 });
    state = reducer(state, channelReadRejected('doctors'));

    expect(state.unread['channel:doctors']).toBe(7);
  });

  it('does not touch message contents', () => {
    state = withUnread(state, { 'channel:doctors': 7 });
    const before = state.messages;
    state = reducer(state, channelReadFulfilled('doctors'));

    expect(state.messages).toBe(before);
  });
});

describe('chatSlice markRead', () => {
  it('flags exactly the acknowledged messages as read', () => {
    let state = init();
    state = reducer(state, setActiveChat({ type: 'dm', id: 'user-1' }));
    state = {
      ...state,
      messages: [
        { _id: 'm1', isRead: false },
        { _id: 'm2', isRead: false },
        { _id: 'm3', isRead: true },
      ],
    };
    state = reducer(state, markReadFulfilled(['m1']));

    expect(state.messages.map((m) => m.isRead)).toEqual([true, false, true]);
  });
});
