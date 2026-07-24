import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || '';

let socket = null;
let currentBranchId = null;

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

  socket.on('error', (data) => {
    if (data?.message?.includes('Session ID unknown')) return;
    console.warn('[socket] server error:', data?.message);
    toast.error(data?.message || 'Real-time connection error');
  });

  socket.on('connect_error', (err) => {
    if (isDev) console.debug('[socket] connect_error:', err.message);
    if (err.message?.includes('Unauthorized') || err.message?.includes('Invalid or expired')) {
      toast.error('Session expired — please log in again');
    }
  });

  socket.io.on('reconnect', () => {
    if (currentBranchId) {
      socket.emit('subscribe:branch', currentBranchId);
    }
  });

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

export function disconnectSocket() {
  unsubscribeCurrentBranch();
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
    const socket = getSocket();
    const wrappedHandler = (...args) => handlerRef.current(...args);
    socket.on(event, wrappedHandler);
    return () => { socket.off(event, wrappedHandler); };
  }, [event]);
}

export { SOCKET_URL };
