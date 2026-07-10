import EmptyState from '../../components/ui/EmptyState';
import { ClockIcon } from '../../components/ui/icons';
import { roleLabel } from '../../lib/roles';
import { timeAgo } from '../../lib/format';
import { useT } from '../../lib/i18n';

export default function RecentActivity({ recentStaff }) {
  const { t } = useT();
  if (!recentStaff?.length) {
    return <EmptyState title={t('dashboard.noRecentActivity')} message={t('dashboard.recentActivityHint')} />;
  }

  return (
    <ul className="-my-1 divide-y divide-slate-100 dark:divide-slate-800">
      {recentStaff.map((u) => {
        const ago = timeAgo(u.createdAt);
        const agoText = typeof ago === 'string' ? ago : t(ago.key, ago.vars);
        return (
          <li key={u._id} className="flex items-center gap-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
              {u.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{u.name}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{roleLabel(u.role)}</p>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <ClockIcon width={14} height={14} />
              {agoText}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
