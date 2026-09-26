/**
 * Late binding between the HTTP client and the Redux store.
 *
 * `lib/axios.js` is imported by every `*Api.js`, and every slice imports its
 * `*Api.js` — so anything in `axios.js` that reaches back into `app/store.js`
 * closes the loop `store -> slices -> api -> axios -> store`. That cycle was
 * being worked around with dynamic `import()` calls, which cannot actually
 * split a module that is already in the main chunk: the bundler flagged all of
 * them as ineffective, and the workaround also meant a session-expiry purge
 * depended on a promise resolving rather than on the store being available.
 *
 * This module has no imports at all, so both sides can point at it without
 * reintroducing the cycle. `main.jsx` binds the store once at startup - it
 * already imports both - and `axios.js` reads it back only when a request
 * actually fails.
 */
let binding = null;

export function bindStore(store, actions = {}) {
  binding = { store, actions };
}

/** The bound store, or `null` before `bindStore` has run. */
export function getBoundStore() {
  return binding?.store ?? null;
}

/**
 * A store action creator passed in at bind time. Returning `null` rather than
 * throwing lets the caller treat an unbound client as "nothing to do", which
 * is the correct behaviour on a public page that never mounted a session.
 */
export function getBoundAction(name) {
  return binding?.actions?.[name] ?? null;
}
