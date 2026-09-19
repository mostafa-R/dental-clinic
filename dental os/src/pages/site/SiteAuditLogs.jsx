import { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import Pagination from '../../components/ui/Pagination';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { platformApi } from '../../features/site/platformApi';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { useT } from '../../lib/i18n';
import { formatDateTime } from '../../lib/format';

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
      <PageHeader title={t('site.audit.title')} subtitle={t('site.audit.subtitle')} />

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
        <DataTable
          columns={[
            { label: t('site.audit.col.time') },
            { label: t('site.audit.col.admin') },
            { label: t('site.audit.col.action') },
            { label: t('site.audit.col.target') },
            { label: t('site.audit.col.details') },
            { label: t('site.audit.col.ip') },
          ]}
          count={data.logs.length}
          footer={
            data.pagination.totalPages > 1 ? (
              <Pagination
                page={data.pagination.page}
                pages={data.pagination.totalPages}
                total={data.pagination.total}
                pageSize={data.pagination.limit}
                onChange={(p) => setFilters((f) => ({ ...f, page: p }))}
                prevLabel={t('common.prev')}
                nextLabel={t('common.next')}
              />
            ) : undefined
          }
        >
              {data.logs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">{formatDateTime(log.createdAt)}</td>
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
        </DataTable>
      )}
    </div>
  );
}