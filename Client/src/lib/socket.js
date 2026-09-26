import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { store } from '../app/store';
import { pushToast } from '../features/ui/uiSlice';
import { t } from './i18n';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace(/\/api(\/v1)?$/, '') || '';

let socket = null;
let currentBranchId = null;
let queueSubscribed = false;

/**
 * Every consumer registers through here instead of calling `socket.on`
 * directly. The socket is a singleton that is destroyed and rebuilt whenever
 * the active branch changes (see `disconnectSocket`), and a fresh socket starts
 * with an empty listener map. Components that stayed mounted across the switch
 * kept a reference to the old instance, so their handlers were stranded on a
 * dead socket and realtime updates stopped with no error surfaced. Keeping the
 * registrations here lets a rebuilt socket re-attach all of them.
 */
const trackedListeners = new Map();

function attachListener(target, event, handler) {
  target.on(event, handler);
  let handlers = trackedListeners.get(event);
  if (!handlers) {
    handlers = new Set();
    trackedListeners.set(event, handlers);
  }
  handlers.add(handler);
}

function detachListener(target, event, handler) {
  target.off(event, handler);
  // A component can unmount after the socket was rebuilt, in which case
  // `target` is the dead instance but the handler was replayed onto the live
  // one. Detach from both so no closure is left dangling on the new socket.
  if (socket && socket !== target) socket.off(event, handler);
  const handlers = trackedListeners.get(event);
  if (!handlers) return;
  handlers.delete(handler);
  if (handlers.size === 0) trackedListeners.delete(event);
}

function replayTrackedListeners(target) {
  for (const [event, handlers] of trackedListeners) {
    for (const handler of handlers) {
      target.on(event, handler);
    }
  }
}

/**
 * Re-assert the server-side subscriptions for a (re)connected socket. The
 * branch/queue flags are module state, so a rebuilt or reconnected socket has
 * to be told again what it was subscribed to.
 */
function emitActiveSubscriptions(target) {
  if (currentBranchId) target.emit('subscribe:branch', currentBranchId);
  if (queueSubscribed) target.emit('subscribe:queue');
}

export function getSocket() {
  if (socket) return socket;

  const isDev = import.meta.env.DEV;
  socket = io(SOCKET_URL, {
    autoConnect: true,
    withCredentials: true,
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  if (isDev) {
    socket.on('connect', () => console.debug('[socket] connected', socket.id));
    socket.on('disconnect', (reason) => console.debug('[socket] disconnected', reason));
    socket.io.on('reconnect_attempt', (attempt) => {
      console.debug('[socket] reconnect attempt', attempt);
    });
    socket.io.on('reconnect', (attempt) => {
      console.debug('[socket] reconnected after', attempt, 'attempts');
    });
  }

  // `connect` fires on the initial handshake and on every reconnect, so this
  // is the single place that re-asserts subscriptions for this instance.
  socket.on('connect', () => {
    emitActiveSubscriptions(socket);
  });

  socket.on('error', (data) => {
    if (data?.message?.includes('Session ID unknown')) return;
    console.warn('[socket] server error:', data?.message);
    store.dispatch(pushToast({ type: 'error', message: data?.message || t('socket.connectionError') }));
  });

  socket.on('connect_error', (err) => {
    if (isDev) console.debug('[socket] connect_error:', err.message);
    if (err.message?.includes('Unauthorized') || err.message?.includes('Invalid or expired')) {
      store.dispatch(pushToast({ type: 'error', message: t('socket.sessionExpired') }));
    }
  });

  replayTrackedListeners(socket);

  return socket;
}

export function subscribeBranch(branchId) {
  if (!branchId || branchId === currentBranchId) return;
  const s = getSocket();
  if (currentBranchId) {
    s.emit('unsubscribe:branch', currentBranchId);
  }
  s.emit('subscribe:branch', branchId);
  currentBranchId = branchId;
}

export function unsubscribeCurrentBranch() {
  if (!currentBranchId) return;
  const s = getSocket();
  s.emit('unsubscribe:branch', currentBranchId);
  currentBranchId = null;
}

export function subscribeQueue() {
  if (queueSubscribed) return;
  getSocket().emit('subscribe:queue');
  queueSubscribed = true;
}

export function unsubscribeQueue() {
  if (!queueSubscribed) return;
  const s = getSocket();
  s.emit('unsubscribe:queue');
  queueSubscribed = false;
}

export function disconnectSocket() {
  unsubscribeCurrentBranch();
  unsubscribeQueue();
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function useSocketEvent(event, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const target = getSocket();
    const wrappedHandler = (...args) => handlerRef.current(...args);
    attachListener(target, event, wrappedHandler);
    return () => { detachListener(target, event, wrappedHandler); };
  }, [event]);
}

export { SOCKET_URL, attachListener as onTrackedSocketEvent, detachListener as offTrackedSocketEvent };
