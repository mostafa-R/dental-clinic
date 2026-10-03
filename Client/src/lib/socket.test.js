import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `socket.js` creates a singleton on first use and keeps connection state in
// module scope, so every test needs a freshly evaluated copy of the module.
async function loadSocket(connectFactory) {
  vi.resetModules();
  vi.doMock('socket.io-client', () => ({ io: connectFactory }));
  vi.doMock('../app/store', () => ({
    store: { dispatch: vi.fn(), getState: vi.fn(() => ({})) },
  }));
  return import('./socket');
}

/** Minimal socket.io double: records handlers so tests can fire events. */
function createFakeSocket() {
  const handlers = new Map();
  const managerHandlers = new Map();

  const fake = {
    id: 'sock-1',
    connected: true,
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return fake;
    },
    off(event, fn) {
      const list = handlers.get(event) || [];
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
      return fake;
    },
    emit: vi.fn(),
    removeAllListeners: vi.fn(() => {
      handlers.clear();
      return fake;
    }),
    disconnect: vi.fn(() => {
      // socket.io emits `disconnect` as part of an explicit disconnect, unless
      // the listener set was cleared first (which disconnectSocket does).
      for (const fn of [...(handlers.get('disconnect') || [])]) fn('io client disconnect');
      return fake;
    }),
    io: {
      on(event, fn) {
        if (!managerHandlers.has(event)) managerHandlers.set(event, []);
        managerHandlers.get(event).push(fn);
        return fake.io;
      },
    },
  };

  return {
    fake,
    fire(event, ...args) {
      for (const fn of [...(handlers.get(event) || [])]) fn(...args);
    },
    fireManager(event, ...args) {
      for (const fn of [...(managerHandlers.get(event) || [])]) fn(...args);
    },
    emitCount: () => fake.emit.mock.calls.length,
  };
}

describe('socket connection status', () => {
  let harness;

  beforeEach(() => {
    harness = createFakeSocket();
  });

  afterEach(() => {
    vi.doUnmock('socket.io-client');
    vi.doUnmock('../app/store');
    vi.resetModules();
  });

  it('reports connected once the handshake completes', async () => {
    const mod = await loadSocket(() => harness.fake);
    expect(mod.getSocketConnectionStatus()).toBe('connecting');

    mod.getSocket();
    harness.fire('connect');

    expect(mod.getSocketConnectionStatus()).toBe('connected');
  });

  it('reports disconnected when the transport drops unexpectedly', async () => {
    const mod = await loadSocket(() => harness.fake);
    mod.getSocket();
    harness.fire('connect');

    harness.fire('disconnect', 'transport close');

    expect(mod.getSocketConnectionStatus()).toBe('disconnected');
  });

  it('reports connecting (not disconnected) while the manager retries', async () => {
    const mod = await loadSocket(() => harness.fake);
    mod.getSocket();
    harness.fire('connect');
    harness.fire('disconnect', 'transport close');

    harness.fireManager('reconnect_attempt', 1);

    // "Reconnecting" and "offline" are different promises to the user, so a
    // retry in flight must not be reported as a dead connection.
    expect(mod.getSocketConnectionStatus()).toBe('connecting');
  });

  it('does not report a loss for the deliberate disconnectSocket rebuild', async () => {
    const mod = await loadSocket(() => harness.fake);
    mod.getSocket();
    harness.fire('connect');

    // The guard is ordering, not a flag: removeAllListeners() runs before
    // disconnect(), so no `disconnect` handler survives to report a loss.
    mod.disconnectSocket();

    expect(harness.fake.removeAllListeners).toHaveBeenCalledBefore(harness.fake.disconnect);
    expect(mod.getSocketConnectionStatus()).toBe('connected');
  });

  it('still reports a real drop on the rebuilt socket', async () => {
    const mod = await loadSocket(() => harness.fake);
    mod.getSocket();
    mod.disconnectSocket();

    // Rebuild the socket (as a branch switch does) and reconnect. A genuine
    // transport failure afterwards must still be reported - the previous test
    // must not pass merely because nothing ever reports a drop.
    const second = createFakeSocket();
    harness = second;
    expect(mod.getSocket()).toBeTruthy();
    second.fire('connect');
    expect(mod.getSocketConnectionStatus()).toBe('connected');

    second.fire('disconnect', 'transport close');
    expect(mod.getSocketConnectionStatus()).toBe('disconnected');
  });

  it('notifies subscribers and stops after unsubscribe', async () => {
    const mod = await loadSocket(() => harness.fake);
    const seen = [];
    const unsubscribe = mod.subscribeSocketConnectionStatus((s) => seen.push(s));

    mod.getSocket();
    harness.fire('connect');
    harness.fire('disconnect', 'transport close');
    expect(seen).toEqual(['connected', 'disconnected']);

    unsubscribe();
    harness.fire('connect');
    // No further pushes once unsubscribed.
    expect(seen).toEqual(['connected', 'disconnected']);
  });

  it('re-asserts branch and queue subscriptions on reconnect', async () => {
    const mod = await loadSocket(() => harness.fake);
    mod.getSocket();

    mod.subscribeBranch('branch-1');
    mod.subscribeQueue();
    harness.fake.emit.mockClear();

    harness.fire('connect');

    const emitted = harness.fake.emit.mock.calls.map(([event]) => event);
    expect(emitted).toContain('subscribe:branch');
    expect(emitted).toContain('subscribe:queue');
  });
});
