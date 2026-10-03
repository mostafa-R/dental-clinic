/**
 * A labelled row inside a settings card: heading, optional description, and a
 * control area on the trailing side (or below on narrow screens).
 *
 * Settings pages had three different hand-rolled versions of this — a
 * `<p className="mb-2">` heading over a flex row, a `Field` for everything
 * including plain toggles, and a bare `<h4>` + `space-y-4`. This keeps the
 * heading, the explanation and the control on one predictable baseline.
 */
export default function SettingRow({ label, description, htmlFor, children, className = '' }) {
  return (
    <div className={`grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 ${className}`}>
      <div className="min-w-0">
        {label && (
          <label
            htmlFor={htmlFor}
            className="block text-sm font-medium text-slate-800 dark:text-slate-100"
          >
            {label}
          </label>
        )}
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      <div className="sm:justify-self-end">{children}</div>
    </div>
  );
}