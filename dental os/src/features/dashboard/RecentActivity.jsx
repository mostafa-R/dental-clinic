import EmptyState from '../../components/ui/EmptyState';
import { roleLabel } from '../../lib/roles';
import { timeAgo } from '../../lib/format';
import { useT } from '../../lib/i18n';

export default function RecentActivity({ recentStaff }) {
  const { t } = useT();
  if (!recentStaff?.length) {
    return <EmptyState title={t('dashboard.noRecentActivity')} message={t('dashboard.recentActivityHint')} />;
  }

  return (
    <ul className="relative ml-4 space-y-0">
      {recentStaff.map((u, i) => {
        const ago = timeAgo(u.createdAt);
        const agoText = typeof ago === 'string' ? ago : t(ago.key, ago.vars);
        const isLast = i === recentStaff.length - 1;
        return (
          <li key={u._id} className="relative flex items-start gap-4 py-3 pl-6">
            {!isLast && (
              <span className="absolute left-0 top-8 h-full w-px bg-slate-200 dark:bg-slate-700" />
            )}
            <span className="absolute left-0 top-4 flex h-3 w-3 -translate-x-1/2 items-center justify-center">
              <span className={`h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
                i === 0 ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'
              }`} />
            </span>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-semibold text-white shadow-sm">
              {u.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{u.name}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{roleLabel(u.role)}</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {agoText}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
