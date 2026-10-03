import { useId } from 'react';

/**
 * A mutually-exclusive set of options rendered as a joined button group.
 *
 * The appearance pickers used to be a row of independent buttons with no
 * `aria-pressed`, so a screen reader announced four unlabelled toggles and gave
 * no answer to "which one is selected?". `role="radiogroup"` + `role="radio"`
 * states that exactly one is chosen, and it is the right pattern here because
 * these are choices, not independent on/off switches.
 *
 * Only the selected radio is in the tab order (roving tabindex); arrow keys move
 * and select within the group, matching the native radio behaviour users
 * already know from OS settings panels.
 */
const BASE =
  'group relative flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-brand/40';
const ACTIVE =
  'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white';
const IDLE =
  'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-100';

export default function SegmentedControl({ label, value, options, onChange, className = '' }) {
  const baseId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const move = (next) => {
    const index = (next + options.length) % options.length;
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    document.getElementById(`${baseId}-${option.value}`)?.focus();
  };

  const onKeyDown = (event) => {
    // Arrow keys follow the reading direction: in RTL the options render
    // right-to-left, so ArrowRight selects the visually previous option.
    const rtl =
      typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        move(selectedIndex + (rtl ? -1 : 1));
        break;
      case 'ArrowLeft':
        event.preventDefault();
        move(selectedIndex + (rtl ? 1 : -1));
        break;
      case 'ArrowDown':
        event.preventDefault();
        move(selectedIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(selectedIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(options.length - 1);
        break;
      default:
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`inline-flex w-full max-w-md gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800 ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            id={`${baseId}-${option.value}`}
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`${BASE} ${selected ? ACTIVE : IDLE}`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}