import EmptyState from '../../components/ui/EmptyState';
import { formatNumber } from '../../lib/format';
import { useT } from '../../lib/i18n';

export default function BranchesList({ branches }) {
  const { t } = useT();
  if (!branches?.length) {
    return <EmptyState title={t('dashboard.noBranches')} message={t('dashboard.createBranchHint')} />;
  }

  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {branches.map((b) => (
        <li key={b._id} className="flex items-center justify-between py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{b.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.staffCount', { count: formatNumber(b.staffCount) })}</p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              b.isActive
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-300'
            }`}
          >
            {b.isActive ? t('common.active') : t('common.inactive')}
          </span>
        </li>
      ))}
    </ul>
  );
}
