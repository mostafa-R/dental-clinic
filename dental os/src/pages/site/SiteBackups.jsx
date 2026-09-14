import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import StatCard from '../../components/ui/StatCard';
import Pagination from '../../components/ui/Pagination';
import { platformApi } from '../../features/site/platformApi';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { requestConfirm } from '../../features/ui/confirmDialog';
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
    if (!(await requestConfirm({
      title: t('common.confirm'),
      message: t('site.backups.triggerConfirm'),
    }))) return;
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
      <PageHeader
        title={t('site.backups.title')}
        subtitle={t('site.backups.subtitle')}
        actions={
          isSuperAdmin ? (
            <Button size="sm" onClick={onTrigger} disabled={triggering}>
              {triggering ? t('site.backups.triggering') : t('site.backups.trigger')}
            </Button>
          ) : undefined
        }
      />

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
        <DataTable
          columns={[
            { label: t('site.backups.col.time') },
            { label: t('site.backups.col.filename') },
            { label: t('site.backups.col.size') },
            { label: t('site.backups.col.type') },
            { label: t('site.backups.col.status') },
            { label: t('site.backups.col.duration') },
            { label: t('site.backups.col.encrypted'), className: 'text-end' },
          ]}
          count={data.logs.length}
          footer={
            data.pages > 1 ? (
              <Pagination
                page={data.page}
                pages={data.pages}
                total={data.total}
                onChange={setPage}
                prevLabel={t('common.prev')}
                nextLabel={t('common.next')}
              />
            ) : undefined
          }
        >
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
        </DataTable>
      )}
    </div>
  );
}