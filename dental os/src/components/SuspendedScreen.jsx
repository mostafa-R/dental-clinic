import { useSelector } from 'react-redux';
import { useT } from '../lib/i18n';

export default function SuspendedScreen() {
  const user = useSelector((s) => s.auth.user);
  const { t } = useT();
  const tenantName = user?.tenant?.name || '';

  return (
    <div className="flex min-h-screen items-center justify-center bg-amber-50 dark:bg-slate-900 p-6">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          {t('suspended.title')}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          {t('suspended.message', { tenant: tenantName })}
        </p>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 text-xs text-slate-600 dark:text-slate-400">
          {t('suspended.help')}
        </div>
      </div>
    </div>
  );
}