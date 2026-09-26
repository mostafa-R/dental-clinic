import { useId, useMemo } from 'react';

/**
 * Shared id source for a `TabList` and its `TabPanel`s.
 *
 * The two elements are wired together by `aria-controls` / `aria-labelledby`,
 * so the ids have to be generated once and handed to both. Letting `TabList`
 * mint its own prefix would give the panels a different one, and the references
 * would dangle.
 *
 * This lives outside the component file so `TabList.jsx` exports only
 * components, which keeps React Fast Refresh working for it.
 */
export function useTabIds() {
  const base = useId();
  return useMemo(
    () => ({
      base,
      tabId: (key) => `${base}-tab-${key}`,
      panelId: (key) => `${base}-panel-${key}`,
    }),
    [base],
  );
}
