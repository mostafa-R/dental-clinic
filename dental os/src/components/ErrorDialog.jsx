import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { clearErrorDialog } from '../features/ui/uiSlice';
import { useT } from '../lib/i18n';

export default function ErrorDialog() {
  const dispatch = useDispatch();
  const { open, title, message, fields } = useSelector((s) => s.ui);
  const { t } = useT();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') dispatch(clearErrorDialog());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, dispatch]);

  if (!open) return null;

  const onClose = () => dispatch(clearErrorDialog());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm dark:bg-slate-950/80" onClick={onClose} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-dialog-title"
        className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="error-dialog-title" className="text-base font-semibold text-slate-900 dark:text-white">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{message}</p>
          </div>
        </div>

        {fields.length > 0 && (
          <ul className="mt-4 space-y-1.5 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
            {fields.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-slate-400 dark:text-slate-500">•</span>
                <span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">{f.field}:</span>{' '}
                  <span className="text-slate-600 dark:text-slate-300">{f.message}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {t('common.gotIt')}
          </button>
        </div>
      </div>
    </div>
  );
}
