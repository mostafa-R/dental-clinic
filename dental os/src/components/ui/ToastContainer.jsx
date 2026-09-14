import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { dismissToast } from '../../features/ui/uiSlice';

const styles = {
  success: 'border-emerald-200 dark:border-emerald-500/30',
  error: 'border-red-200 dark:border-red-500/30',
  info: 'border-slate-200 dark:border-slate-700',
};

const icons = {
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  error: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  ),
  info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500">
      <path d="M12 16v-4M12 8h.01" />
      <path d="M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />
    </svg>
  ),
};

function ToastItem({ toast, onClose }) {
  useEffect(() => {
    const id = setTimeout(onClose, toast.type === 'error' ? 6000 : 4000);
    return () => clearTimeout(id);
  }, [toast.id, toast.type, onClose]);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3 shadow-lg animate-toast-in dark:bg-slate-900 ${styles[toast.type] ?? styles.info}`}
    >
      <span className="mt-0.5 shrink-0">{icons[toast.type] ?? icons.info}</span>
      <div className="min-w-0 flex-1">
        {toast.title && (
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{toast.title}</p>
        )}
        {toast.message && (
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{toast.message}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        aria-label="Close"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useSelector((s) => s.ui.toasts);
  const dispatch = useDispatch();

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed end-4 top-4 z-[70] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => dispatch(dismissToast(toast.id))} />
      ))}
    </div>
  );
}