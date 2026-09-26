/**
 * The panel for a `TabList` tab.
 *
 * Rendered by the same component that renders the matching `TabList` so both
 * share the `useTabIds()` prefix. The label reference points back at the tab,
 * and `tabIndex={0}` makes the panel reachable by keyboard once focused.
 */
export default function TabPanel({ tabIds, tabKey, children, className = '' }) {
  return (
    <div
      role="tabpanel"
      id={tabIds.panelId(tabKey)}
      aria-labelledby={tabIds.tabId(tabKey)}
      tabIndex={0}
      className={`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${className}`}
    >
      {children}
    </div>
  );
}
