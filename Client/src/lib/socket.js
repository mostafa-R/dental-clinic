import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { store } from '../app/store';
import { pushToast } from '../features/ui/uiSlice';
import { t } from './i18n';
import { SOCKET_EMITS } from './socketEvents';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace(/\/api(\/v1)?$/, '') || '';

let socket = null;
let currentBranchId = null;
let queueSubscribed = false;

/**
 * Live connection state, published to subscribers.
 *
 * While the socket is down, realtime updates simply stop arriving, so the UI
 * looks healthy but is showing stale data: a new appointment never appears, the
 * queue board does not advance, and the user has no way to tell that from "no
 * activity". This is a tiny pub/sub rather than a Redux slice because it is
 * transport state with exactly one consumer, and routing it through the store
 * would re-render every component selecting from `ui` on each connect/disconnect
 * for no benefit. It also must be readable synchronously at module scope, before
 * any component has mounted to ask.
 */
let connectionStatus = 'connecting';
const connectionListeners = new Set();

function setConnectionStatus(next) {
  if (connectionStatus === next) return;
  connectionStatus = next;
  for (const listener of connectionListeners) {
    try {
      listener(connectionStatus);
    } catch {
      /* a bad subscriber must not stop the others */
    }
  }
}

export function getSocketConnectionStatus() {
  return connectionStatus;
}

/** Returns an unsubscribe function. */
export function subscribeSocketConnectionStatus(listener) {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

/**
 * 'connecting' | 'connected' | 'disconnected'.
 *
 * Subscribing replays the current value synchronously so the first render is
 * already correct - otherwise a component that mounts while the socket is
 * connected would show a stale 'connecting' until the next transition.
 */
export function useSocketConnectionStatus() {
  const [status, setStatus] = useState(getSocketConnectionStatus);
  useEffect(() => subscribeSocketConnectionStatus(setStatus), []);
  return status;
}

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
  if (currentBranchId) target.emit(SOCKET_EMITS.SUBSCRIBE_BRANCH, currentBranchId);
  if (queueSubscribed) target.emit(SOCKET_EMITS.SUBSCRIBE_QUEUE);
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
    setConnectionStatus('connected');
    emitActiveSubscriptions(socket);
  });

  // A deliberate `disconnectSocket()` rebuild is not a connection loss and must
  // not surface as one. It is handled by ordering, not by a guard flag: that
  // function calls `removeAllListeners()` *before* `disconnect()`, so the
  // handler below is already unregistered and never runs for that teardown.
  // (Reversing those two lines would make every branch switch flash a spurious
  // "connection lost" banner.)
  socket.on('disconnect', (reason) => {
    setConnectionStatus('disconnected');
    if (isDev) console.debug('[socket] disconnected:', reason);
  });

  // While the manager is retrying we are 'connecting', not yet 'disconnected':
  // the difference is whether to tell the user data is stale or that we are
  // working on restoring it.
  socket.io.on('reconnect_attempt', () => {
    setConnectionStatus('connecting');
  });

  socket.on('error', (data) => {
    if (data?.message?.includes('Session ID unknown')) return;
    console.warn('[socket] server error:', data?.message);
    store.dispatch(pushToast({ type: 'error', message: data?.message || t('socket.connectionError') }));
  });

  socket.on('connect_error', (err) => {
    if (isDev) console.debug('[socket] connect_error:', err.message);
    if (err.message?.includes('Unauthorized') || err.message?.includes('Invalid or expired')) {
      setConnectionStatus('disconnected');
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
    s.emit(SOCKET_EMITS.UNSUBSCRIBE_BRANCH, currentBranchId);
  }
  s.emit(SOCKET_EMITS.SUBSCRIBE_BRANCH, branchId);
  currentBranchId = branchId;
}

export function unsubscribeCurrentBranch() {
  if (!currentBranchId) return;
  const s = getSocket();
  s.emit(SOCKET_EMITS.UNSUBSCRIBE_BRANCH, currentBranchId);
  currentBranchId = null;
}

export function subscribeQueue() {
  if (queueSubscribed) return;
  getSocket().emit(SOCKET_EMITS.SUBSCRIBE_QUEUE);
  queueSubscribed = true;
}

export function unsubscribeQueue() {
  if (!queueSubscribed) return;
  const s = getSocket();
  s.emit(SOCKET_EMITS.UNSUBSCRIBE_QUEUE);
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
