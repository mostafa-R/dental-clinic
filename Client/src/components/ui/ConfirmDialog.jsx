import { useEffect, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import Button from './Button';
import { getConfirmState, resolveConfirm, subscribeConfirm } from '../../features/ui/confirmDialog';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function ConfirmDialog() {
  const { t } = useT();
  const [state, setState] = useState(getConfirmState());
  const panelRef = useRef(null);

  useEffect(() => subscribeConfirm(setState), []);

  useEffect(() => {
    if (!state.open) return undefined;
    const restore = document.activeElement;
    const panel = panelRef.current;
    const focusable = panel
      ? Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
      : [];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const onKey = (e) => {
      if (e.key === 'Escape') {
        resolveConfirm(false);
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const active = document.activeElement;
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    (first || panel)?.focus?.();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restore?.focus?.();
    };
  }, [state.open]);

  if (!state.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm dark:bg-slate-950/80" onClick={() => resolveConfirm(false)} aria-hidden="true" />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={state.message ? 'confirm-dialog-message' : undefined}
        className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl outline-none dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              state.danger
                ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300'
                : 'bg-brand/10 text-brand-dark dark:bg-brand/15 dark:text-brand-light'
            }`}
          >
            {state.danger ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 16v-4M12 8h.01" />
                <path d="M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900 dark:text-white">{state.title}</h2>
            {state.message && (
              <p id="confirm-dialog-message" className="mt-1 text-sm text-slate-600 dark:text-slate-300">{state.message}</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => resolveConfirm(false)}>
            {state.cancelLabel || t('common.cancel')}
          </Button>
          <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => resolveConfirm(true)} autoFocus>
            {state.confirmLabel || t('common.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}