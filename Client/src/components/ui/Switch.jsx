import { useId } from 'react';

/**
 * An on/off control with a label and an optional description, laid out as a
 * full-width row.
 *
 * Settings pages had three different checkbox idioms: a bare `<input
 * type="checkbox">` with a side label, the same with the label above it, and a
 * one-line toggle pair. Each was a ~16px target and none of them explained what
 * turning the setting on would actually do. This is the single row primitive
 * for all of them.
 *
 * The whole row is the hit target — the button wraps the label text, not just
 * the 20x20 track — because a 20px target is below the WCAG 2.2 target-size
 * floor and awkward on touch. `role="switch"` with `aria-checked` is the
 * correct role for an on/off setting (as opposed to `role="checkbox"`, which
 * reads as "this item is checked").
 *
 * `id` is required when the caller also renders a `Field`, so the visible label
 * and the control stay one element for assistive tech; when omitted a stable
 * one is generated.
 */
const TRACK_ON = 'bg-brand';
const TRACK_OFF = 'bg-slate-300 dark:bg-slate-600';

// `translate-x` is physical, so it slides the knob the same way in both
// directions. Under `dir="rtl"` the track's "on" end is on the left, and an
// unmirrored knob travelled out of the track and read as broken. The RTL
// variants flip the travel; the knob is absolutely positioned so it cannot be
// reordered by the flex direction.
const KNOB_ON = 'translate-x-5 rtl:-translate-x-5';
const KNOB_OFF = 'translate-x-0';

export default function Switch({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
  children,
}) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const descId = description ? `${switchId}-desc` : undefined;

  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <button
        type="button"
        role="switch"
        id={switchId}
        aria-checked={checked}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="group flex min-w-0 flex-1 items-start gap-3 text-start disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-800 group-hover:text-slate-900 dark:text-slate-100 dark:group-hover:text-white">
            {label}
          </span>
          {description && (
            <span id={descId} className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </span>
          )}
          {children}
        </span>
        <span
          aria-hidden="true"
          className={`relative mt-0.5 inline-block h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${checked ? TRACK_ON : TRACK_OFF}`}
        >
          <span
            className={`absolute top-0.5 start-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? KNOB_ON : KNOB_OFF}`}
          />
        </span>
      </button>
    </div>
  );
}