import { useEffect, useState } from 'react';
import { getSocket } from '../lib/socket';

/**
 * Subscribe to socket events while the component is mounted.
 * Pass an array of [eventName, handler] pairs. Handlers are cleaned up on
 * unmount or when the events array changes.
 * Returns the socket instance (re-renders component once connected).
 */
export function useSocket(events = []) {
  const [socket, setSocket] = useState(() => getSocket());

  useEffect(() => {
    const s = getSocket();
    if (s && s !== socket) setSocket(s);

    const cleaned = events.filter(Boolean);
    cleaned.forEach(([event, handler]) => {
      if (event && typeof handler === 'function') {
        s?.on(event, handler);
      }
    });

    return () => {
      cleaned.forEach(([event, handler]) => {
        if (event && typeof handler === 'function') {
          s?.off(event, handler);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  return socket;
}

export { getSocket };
