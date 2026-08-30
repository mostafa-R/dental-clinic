import { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { platformApi } from '../../features/site/platformApi';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { useT } from '../../lib/i18n';
import { formatTime } from '../../lib/format';

export default function SiteAuditLogs() {
  const dispatch = useDispatch();
  const { t } = useT();

  const [data, setData] = useState({ logs: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
  const [actions, setActions] = useState([]);
  const [filters, setFilters] = useState({ page: 1, limit: 20, action: '', targetType: '', adminId: '', targetId: '', startDate: '', endDate: '' });
  const [status, setStatus] = useState('idle');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const params = { page: filters.page, limit: filters.limit };
      if (filters.action) params.action = filters.action;
      if (filters.targetType) params.targetType = filters.targetType;
      if (filters.adminId) params.adminId = filters.adminId;
      if (filters.targetId) params.targetId = filters.targetId;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const result = await platformApi.listAuditLogs(params);
      setData(result);
      setStatus('succeeded');
    } catch (err) {
      setStatus('failed');
      dispatch(showErrorDialog(err));
    }
  }, [dispatch, filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    platformApi.getAuditActions().then((list) => setActions(Array.isArray(list) ? list : list.actions || [])).catch(() => {});
  }, []);

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value, page: 1 }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('site.audit.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('site.audit.subtitle')}</p>
      </header>

      <Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <select
            value={filters.action}
            onChange={setFilter('action')}
            className="col-span-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 md:col-span-1"
          >
            <option value="">{t('site.audit.filter.action')}</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            value={filters.targetType}
            onChange={setFilter('targetType')}
            className="col-span-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 md:col-span-1"
          >
            <option value="">{t('site.audit.filter.targetType')}</option>
            <option value="tenant">tenant</option>
            <option value="branch">branch</option>
            <option value="admin">admin</option>
            <option value="subscription">subscription</option>
            <option value="plan">plan</option>
            <option value="platform">platform</option>
          </select>
          <input
            value={filters.adminId}
            onChange={setFilter('adminId')}
            placeholder={t('site.audit.filter.adminId')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <input
            value={filters.targetId}
            onChange={setFilter('targetId')}
            placeholder={t('site.audit.filter.targetId')}
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

      {status === 'loading' && <Spinner label={t('site.audit.loading')} />}
      {status === 'succeeded' && data.logs.length === 0 && (
        <EmptyState title={t('site.audit.empty')} description={t('site.audit.emptyHint')} />
      )}

      {status === 'succeeded' && data.logs.length > 0 && (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500">
                  <th className="px-4 py-3 text-left">{t('site.audit.col.time')}</th>
                  <th className="px-4 py-3 text-left">{t('site.audit.col.admin')}</th>
                  <th className="px-4 py-3 text-left">{t('site.audit.col.action')}</th>
                  <th className="px-4 py-3 text-left">{t('site.audit.col.target')}</th>
                  <th className="px-4 py-3 text-left">{t('site.audit.col.details')}</th>
                  <th className="px-4 py-3 text-left">{t('site.audit.col.ip')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.logs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">{formatTime(log.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{log.adminEmail || '—'}</p>
                      {log.adminRole && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">{log.adminRole}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {log.targetType}
                      {log.targetId && <span className="text-slate-400"> · {log.targetId}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">{log.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            {t('common.page', { page: data.pagination.page, total: data.pagination.totalPages })}
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
              disabled={data.pagination.page >= data.pagination.totalPages}
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