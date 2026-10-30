/**
 * Shared debounce utilities for request coalescing.
 *
 * The Dashboard already has a correct implementation (400 ms trailing / 2 s max)
 * that collapses socket event bursts into a single fetch. This module extracts
 * that pattern for reuse across the app.
 */

/**
 * Create a debounced callback that collapses rapid calls into one execution.
 *
 * @param {Function} fn - The function to debounce
 * @param {number} delay - Debounce delay in ms (default 300ms)
 * @param {number} maxWait - Maximum wait time before forced execution (default 2000ms)
 * @returns {Function} Debounced function with a .cancel() method
 */
export function debounce(fn, delay = 300, maxWait = 2000) {
  let timer = null;
  let startedAt = 0;

  function cancel() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    startedAt = 0;
  }

  function debounced(...args) {
    const now = Date.now();

    if (!startedAt) {
      startedAt = now;
    }

    const elapsed = now - startedAt;
    const wait = Math.max(0, Math.min(delay, maxWait - elapsed));

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      cancel();
      fn(...args);
    }, wait);
  }

  debounced.cancel = cancel;

  return debounced;
}

/**
 * Hook-friendly debounce that returns a stable ref and handles cleanup.
 *
 * @param {Function} fn - The function to debounce
 * @param {number} delay - Debounce delay in ms
 * @param {number} maxWait - Maximum wait time
 * @returns {Function} Stable debounced function
 */
export function useDebouncedCallback(fn, delay = 300, maxWait = 2000) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const debouncedRef = useRef(null);

  if (!debouncedRef.current) {
    debouncedRef.current = debounce((...args) => fnRef.current(...args), delay, maxWait);
  }

  // Cleanup on unmount
  useEffect(() => () => debouncedRef.current?.cancel(), []);

  return debouncedRef.current;
}

// Need to import these for useDebouncedCallback
import { useEffect, useRef } from 'react';
