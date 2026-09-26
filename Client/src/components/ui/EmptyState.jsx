import { useT } from '../../lib/i18n';

export default function EmptyState({ title, message, description, icon, action }) {
  const { t } = useT();
  // Resolved through the dictionary so an Arabic UI never falls back to English.
  const heading = title || t('common.empty');
  const desc = message || description;
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light/25 text-brand ring-1 ring-brand/10 dark:bg-brand/15 dark:text-brand-light dark:ring-brand/20">
        {icon || (
          <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7h18M3 12h18M3 17h18" />
          </svg>
        )}
      </div>
      {/* Announced when an empty state replaces loaded content, so the change is
          not silent for screen reader users. The action stays outside the live
          region — interactive controls do not belong inside one. */}
      <div role="status">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{heading}</h3>
        {desc && <p className="mt-1 max-w-sm text-xs text-slate-400 dark:text-slate-500">{desc}</p>}
      </div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}