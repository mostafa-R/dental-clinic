import { Fragment, useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import StatCard from '../../components/ui/StatCard';
import { platformApi } from '../../features/site/platformApi';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { useT } from '../../lib/i18n';
import { formatTime } from '../../lib/format';

export default function SiteErrorLogs() {
  const dispatch = useDispatch();
  const { t } = useT();

  const [data, setData] = useState({ logs: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 } });
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({ page: 1, limit: 50, tenantId: '', statusCode: '', startDate: '', endDate: '' });
  const [status, setStatus] = useState('idle');
  const [expanded, setExpanded] = useState(null);
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const params = {};
      if (filters.tenantId) params.tenantId = filters.tenantId;
      if (filters.statusCode) params.statusCode = filters.statusCode;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const result = await platformApi.listErrorLogs({ page: filters.page, limit: filters.limit, ...params });
      setData(result);
      setStatus('succeeded');
    } catch (err) {
      setStatus('failed');
      dispatch(showErrorDialog(err));
    }
  }, [dispatch, filters]);

  const loadStats = useCallback(async () => {
    try {
      const result = await platformApi.getErrorLogStats({});
      setStats(result.stats);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value, page: 1 }));

  const onResolve = async (id) => {
    setActing(id);
    try {
      await platformApi.resolveErrorLog(id);
      await load();
      await loadStats();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setActing(null);
    }
  };

  const badgeFor = (statusCode) => {
    if (!statusCode) return 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300';
    if (statusCode >= 500) return 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300';
    if (statusCode >= 400) return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('site.errors.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('site.errors.subtitle')}</p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('site.errors.stats.total')} value={stats?.total ?? '—'} />
        <StatCard label={`4xx`} value={stats?.['4xx'] ?? '—'} />
        <StatCard label={`5xx`} value={stats?.['5xx'] ?? '—'} />
        <StatCard label={t('site.errors.stats.tenants')} value={stats?.byTenant?.length ?? '—'} />
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <input
            value={filters.tenantId}
            onChange={setFilter('tenantId')}
            placeholder={t('site.errors.filter.tenantId')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <input
            value={filters.statusCode}
            onChange={setFilter('statusCode')}
            placeholder={t('site.errors.filter.statusCode')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <input
            type="date"
            value={filters.startDate}
            onChange={setFilter('startDate')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={setFilter('endDate')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </Card>

      {status === 'loading' && <Spinner label={t('site.errors.loading')} />}
      {status === 'succeeded' && data.logs.length === 0 && (
        <EmptyState title={t('site.errors.empty')} description={t('site.errors.emptyHint')} />
      )}

      {status === 'succeeded' && data.logs.length > 0 && (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500">
                  <th className="px-4 py-3 text-left">{t('site.errors.col.time')}</th>
                  <th className="px-4 py-3 text-left">{t('site.errors.col.status')}</th>
                  <th className="px-4 py-3 text-left">{t('site.errors.col.request')}</th>
                  <th className="px-4 py-3 text-left">{t('site.errors.col.message')}</th>
                  <th className="px-4 py-3 text-left">{t('site.errors.col.tenant')}</th>
                  <th className="px-4 py-3 text-right">{t('site.errors.col.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.logs.map((log) => (
                  <Fragment key={log._id}>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">{formatTime(log.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeFor(log.statusCode)}`}>
                          {log.statusCode || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === log._id ? null : log._id)}
                          className="max-w-[220px] truncate font-mono text-xs text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
                          title={log.url}
                        >
                          <span className="font-semibold uppercase">{log.method}</span> {log.url}
                        </button>
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{log.message}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{log.tenant?.name || log.tenantId || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {!log.resolved ? (
                          <button
                            type="button"
                            disabled={acting === log._id}
                            onClick={() => onResolve(log._id)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                          >
                            {t('site.errors.resolve')}
                          </button>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                            {t('site.errors.resolved')}
                          </span>
                        )}
                      </td>
                    </tr>
                    {expanded === log._id && (
                      <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                        <td colSpan={6} className="px-4 py-3">
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-200 dark:bg-slate-950">
                            {log.stack || log.message || '—'}
                          </pre>
                          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <span>{t('site.errors.requestId')}: {log.requestId || '—'}</span>
                            <span>IP: {log.ip || '—'}</span>
                            <span>{t('site.errors.userAgent')}: {log.userAgent || '—'}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data.pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            {t('common.page', { page: data.pagination.page, total: data.pagination.pages })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={data.pagination.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t('common.prev')}
            </button>
            <button
              type="button"
              disabled={data.pagination.page >= data.pagination.pages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
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