import { useRef } from 'react';

/**
 * Tab strip with the WAI-ARIA tabs pattern.
 *
 * Every page in the app used to mark the active tab with colour alone
 * (`border-brand text-brand`), so the selection was invisible to screen-reader
 * and colour-blind users. This wires up the roles, `aria-selected` and the
 * roving tabindex that the pattern requires, including arrow-key navigation -
 * without arrow keys a roving tabindex would leave the unselected tabs
 * unreachable, so the two have to be added together.
 *
 * `ids` comes from `useTabIds()` and is what connects each tab to its panel via
 * `aria-controls`. Only the selected tab gets `aria-controls`, because these
 * pages render one panel at a time; pointing the hidden tabs at ids that are
 * not in the DOM would be a dangling reference.
 */

const BTN_BASE =
  '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';
const BTN_ACTIVE =
  'border-brand text-brand dark:border-brand-light dark:text-brand-light';
const BTN_IDLE =
  'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200';

export default function TabList({ tabs, active, onChange, label, ids }) {
  const listRef = useRef(null);

  const focusTab = (index) => {
    const next = (index + tabs.length) % tabs.length;
    const node = listRef.current?.querySelectorAll('[role="tab"]')[next];
    node?.focus();
    onChange(tabs[next].key);
  };

  const onKeyDown = (event) => {
    const current = tabs.findIndex((tb) => tb.key === active);
    if (current === -1) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusTab(current + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusTab(current - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusTab(0);
        break;
      case 'End':
        event.preventDefault();
        focusTab(tabs.length - 1);
        break;
      default:
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800"
    >
      {tabs.map((tb) => {
        const selected = tb.key === active;
        return (
          <button
            key={tb.key}
            type="button"
            role="tab"
            id={ids.tabId(tb.key)}
            aria-selected={selected}
            aria-controls={selected ? ids.panelId(tb.key) : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tb.key)}
            className={`${BTN_BASE} ${selected ? BTN_ACTIVE : BTN_IDLE}`}
          >
            {tb.label}
          </button>
        );
      })}
    </div>
  );
}
