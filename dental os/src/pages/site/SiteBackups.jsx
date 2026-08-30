import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import StatCard from '../../components/ui/StatCard';
import { platformApi } from '../../features/site/platformApi';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { useT } from '../../lib/i18n';
import { formatTime } from '../../lib/format';

const STATUS_BADGES = {
  running: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  failed: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

export default function SiteBackups() {
  const dispatch = useDispatch();
  const { t } = useT();
  const isSuperAdmin = useSelector((s) => s.siteAuth.admin?.role) === 'super_admin';

  const [data, setData] = useState({ logs: [], total: 0, page: 1, limit: 20, pages: 1 });
  const [status, setStatus] = useState('idle');
  const [page, setPage] = useState(1);
  const [triggering, setTriggering] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const result = await platformApi.listBackups({ page, limit: 20 });
      setData(result);
      setStatus('succeeded');
    } catch (err) {
      setStatus('failed');
      dispatch(showErrorDialog(err));
    }
  }, [dispatch, page]);

  useEffect(() => {
    load();
  }, [load]);

  const onTrigger = async () => {
    if (!window.confirm(t('site.backups.triggerConfirm'))) return;
    setTriggering(true);
    try {
      await platformApi.triggerBackup();
      await load();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setTriggering(false);
    }
  };

  const runningCount = data.logs.filter((l) => l.status === 'running').length;
  const completedBytes = data.logs.filter((l) => l.status === 'completed').reduce((s, l) => s + (l.sizeBytes || 0), 0);
  const failedCount = data.logs.filter((l) => l.status === 'failed').length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('site.backups.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('site.backups.subtitle')}</p>
        </div>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={onTrigger}
            disabled={triggering}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {triggering ? t('site.backups.triggering') : t('site.backups.trigger')}
          </button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('site.backups.stats.total')} value={data.total ?? '—'} />
        <StatCard label={t('site.backups.stats.running')} value={runningCount} />
        <StatCard label={t('site.backups.stats.completedSize')} value={formatBytes(completedBytes)} />
        <StatCard label={t('site.backups.stats.failed')} value={failedCount} />
      </div>

      {status === 'loading' && <Spinner label={t('site.backups.loading')} />}
      {status === 'succeeded' && data.logs.length === 0 && (
        <EmptyState title={t('site.backups.empty')} description={t('site.backups.emptyHint')} />
      )}

      {status === 'succeeded' && data.logs.length > 0 && (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500">
                  <th className="px-4 py-3 text-left">{t('site.backups.col.time')}</th>
                  <th className="px-4 py-3 text-left">{t('site.backups.col.filename')}</th>
                  <th className="px-4 py-3 text-left">{t('site.backups.col.size')}</th>
                  <th className="px-4 py-3 text-left">{t('site.backups.col.type')}</th>
                  <th className="px-4 py-3 text-left">{t('site.backups.col.status')}</th>
                  <th className="px-4 py-3 text-left">{t('site.backups.col.duration')}</th>
                  <th className="px-4 py-3 text-right">{t('site.backups.col.encrypted')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.logs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">{formatTime(log.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{log.filename}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatBytes(log.sizeBytes)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {log.type === 'manual' ? t('site.backups.manual') : t('site.backups.scheduled')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGES[log.status] || STATUS_BADGES.failed}`}>
                        {t(`site.backups.status.${log.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{formatDuration(log.durationMs)}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-600 dark:text-slate-300">
                      {log.encrypted ? t('common.yes') : t('common.no')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            {t('common.page', { page: data.page, total: data.pages })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t('common.prev')}
            </button>
            <button
              type="button"
              disabled={page >= data.pages}
              onClick={() => setPage(page + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}