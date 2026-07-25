import EmptyState from '../../components/ui/EmptyState';
import { BranchIcon } from '../../components/ui/icons';
import { formatNumber } from '../../lib/format';
import { useT } from '../../lib/i18n';

export default function BranchesList({ branches }) {
  const { t } = useT();
  if (!branches?.length) {
    return <EmptyState title={t('dashboard.noBranches')} message={t('dashboard.createBranchHint')} />;
  }

  return (
    <ul className="space-y-2">
      {branches.map((b) => (
        <li key={b._id} className="group flex items-center gap-3 rounded-xl border border-transparent p-3 transition-all duration-200 hover:border-slate-100 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-800/50">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            b.isActive
              ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm'
              : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
          }`}>
            <BranchIcon width={18} height={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{b.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.staffCount', { count: formatNumber(b.staffCount) })}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
              b.isActive
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30'
                : 'bg-slate-50 text-slate-500 ring-slate-500/10 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-500/20'
            }`}
          >
            {b.isActive ? t('common.active') : t('common.inactive')}
          </span>
        </li>
      ))}
    </ul>
  );
}
