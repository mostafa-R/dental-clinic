import { useEffect, useRef, useState } from 'react';
import { getSocket, onTrackedSocketEvent, offTrackedSocketEvent } from '../lib/socket';

const isPair = (pair) => Array.isArray(pair) && Boolean(pair[0]) && typeof pair[1] === 'function';

/**
 * Subscribe to socket events while the component is mounted.
 * Pass an array of [eventName, handler] pairs. Returns the socket instance
 * (re-renders the component once connected).
 *
 * The array may be written inline at the call site. Registration is keyed on the
 * *event names*, not on the array identity, and each name gets a single wrapper
 * that reads the current handler out of a ref. An inline array therefore no
 * longer re-attaches handlers on every render, which used to leak wrappers into
 * the socket's tracked-listener registry: the old wrappers were anonymous
 * closures that `offTrackedSocketEvent` could only match by reference, so a
 * re-render added a handler it could not remove and the same event fired once
 * per render.
 *
 * @deprecated Prefer one `useSocketEvent(event, handler)` call from
 * `lib/socket` per event. It already uses this handler-ref pattern and is
 * harder to misuse. If you keep this hook, the array is safe to write inline.
 */
export function useSocket(events = []) {
  const [socket, setSocket] = useState(() => getSocket());

  const pairs = Array.isArray(events) ? events.filter(isPair) : [];
  // Stable across renders as long as the caller subscribes to the same names.
  const eventKey = pairs.map(([event]) => event).join('|');
  // Latest handler per event name, refreshed on every render but never used as
  // an effect dependency.
  const handlersRef = useRef(pairs);
  handlersRef.current = pairs;

  useEffect(() => {
    const s = getSocket();
    if (s && s !== socket) setSocket(s);

    const attached = pairs.map(([event]) => {
      const wrapper = (...args) => {
        const handler = handlersRef.current.find((pair) => pair[0] === event)?.[1];
        return handler?.(...args);
      };
      onTrackedSocketEvent(s, event, wrapper);
      return [event, wrapper];
    });

    return () => {
      attached.forEach(([event, wrapper]) => offTrackedSocketEvent(s, event, wrapper));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventKey]);

  return socket;
}

export { getSocket };
