import { useEffect, useId, useRef } from 'react';
import { useT } from '../../lib/i18n';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function Modal({ open, title, onClose, children, footer, size = 'md', zIndex, fullScreenMobile, describedBy }) {
  const { t } = useT();
  const titleId = useId();
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;

    const panel = panelRef.current;
    const focusable = panel
      ? Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
      : [];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const onKey = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current?.();
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
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  const dialogProps = {
    ref: panelRef,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
    'aria-describedby': describedBy,
    tabIndex: -1,
  };

  const titleBar = (onDark) => (
    <div className={`flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-5 sm:py-4 ${onDark ? 'border-slate-800' : 'border-slate-100 dark:border-slate-800'}`}>
      <h3 id={titleId} className="flex items-center gap-2.5 text-base font-semibold text-slate-900 dark:text-white">
        <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brand to-brand-dark" aria-hidden="true" />
        {title}
      </h3>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-1 text-slate-400 transition hover:bg-brand/10 hover:text-brand-dark dark:hover:bg-slate-800 dark:hover:text-slate-200"
        aria-label={t('common.close')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );

  if (fullScreenMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:overflow-y-auto sm:p-6">
        <div
          className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm dark:bg-slate-950/70"
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          {...dialogProps}
          className="relative z-10 flex h-full flex-col bg-white outline-none sm:my-8 sm:h-auto sm:w-full sm:max-w-4xl sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl dark:bg-slate-900 dark:sm:border-slate-800"
        >
          {titleBar(false)}
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-4">{children}</div>
          {footer && (
            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 px-4 py-3 sm:px-5 sm:py-4 dark:border-slate-800">
              {footer}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-start justify-center overflow-y-auto p-4 sm:p-6" style={{ zIndex: zIndex ?? 50 }}>
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm dark:bg-slate-950/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        {...dialogProps}
        className={`relative z-10 my-8 w-full ${sizes[size] || sizes.md} rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-slate-800 dark:bg-slate-900`}
      >
        {titleBar(true)}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}