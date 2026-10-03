import { createAction } from "@reduxjs/toolkit";

/**
 * Signals that the session is gone and the UI must return to the login screen.
 *
 * This lives in its own module, importing nothing, so that `lib/axios.js` can
 * dispatch it. `axios.js` is itself imported by every slice, so importing a
 * slice action from there would create a cycle back through `app/store.js`.
 * A leaf module breaks it cleanly.
 *
 * The point is that this is an *action*, not a navigation. The interceptor used
 * to do `window.location.href = "/login"`, which is a full document load: every
 * mounted component unmounts at once, so unsaved form input, an open modal, and
 * any in-flight edit are discarded with no warning — and in a multi-tab session
 * only the tab that happened to fail is affected, leaving the others looking
 * authenticated against a dead session. Dispatching lets React Router navigate
 * and lets components react (flush drafts, close dialogs, stop polling).
 */
export const sessionExpired = createAction("auth/sessionExpired");
