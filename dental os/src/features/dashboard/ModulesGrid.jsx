import { Link } from 'react-router-dom';
import { useT } from '../../lib/i18n';

export default function ModulesGrid({ modules }) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {modules.map((m) => (
        <Link
          key={m.key}
          to={`/${m.key}`}
          className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500 dark:hover:bg-indigo-500/10"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">{m.label}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-700 dark:bg-slate-700 dark:text-slate-300 dark:group-hover:bg-indigo-500/20 dark:group-hover:text-indigo-300">
              {m.enabled ? t('common.open') : t('common.inDevelopment')}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {m.enabled ? t('common.manageModule') : t('common.comingSoon')}
          </p>
        </Link>
      ))}
    </div>
  );
}
