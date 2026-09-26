/**
 * Root-level session teardown.
 *
 * Logging out previously cleared only `auth` and the users slice, so every
 * PHI-bearing slice (patients, appointments + queue, billing, EMR, wallet,
 * chat, inventory, recalls, accounting) stayed in memory. On a shared terminal
 * the next person to sign in could see the previous patient's data until each
 * slice happened to refetch.
 *
 * Kept in its own dependency-free module so `store.js` and any caller can
 * import the action without creating a cycle back through the slices.
 */
export const RESET_ALL = 'app/resetAll';

export const resetAllState = () => ({ type: RESET_ALL });
