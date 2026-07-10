import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || '';

let socket = null;

export function getSocket() {
  if (socket) return socket;

  const isDev = import.meta.env.DEV;
  socket = io(SOCKET_URL, {
    autoConnect: true,
    withCredentials: true,
    transports: isDev ? ['websocket', 'polling'] : ['polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  if (import.meta.env.DEV) {
    socket.on('connect', () => console.debug('[socket] connected', socket.id));
    socket.on('disconnect', (reason) => console.debug('[socket] disconnected', reason));
    socket.on('connect_error', (err) => console.debug('[socket] connect_error', err.message));
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export { SOCKET_URL };
