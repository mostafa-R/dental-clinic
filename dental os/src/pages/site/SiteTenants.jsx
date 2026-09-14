import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import SiteTenantModal from '../../features/site/SiteTenantModal';
import SiteTenantStatsModal from '../../features/site/SiteTenantStatsModal';
import { platformApi } from '../../features/site/platformApi';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { requestConfirm } from '../../features/ui/confirmDialog';
import { useT } from '../../lib/i18n';
import { formatDate } from '../../lib/format';

const STATUS_BADGES = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  trial: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  suspended: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  cancelled: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  archived: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
};

export default function SiteTenants() {
  const dispatch = useDispatch();
  const { t } = useT();
  const adminRole = useSelector((s) => s.siteAuth.admin?.role);

  const [data, setData] = useState({ tenants: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } });
  const [filters, setFilters] = useState({ page: 1, limit: 10, status: '', plan: '', search: '' });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statsTenant, setStatsTenant] = useState(null);
  const [acting, setActing] = useState(null);

  const isSuperAdmin = adminRole === 'super_admin';
  const isAdmin = isSuperAdmin || adminRole === 'admin';
  const canManage = isAdmin;

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const params = { page: filters.page, limit: filters.limit };
      if (filters.status) params.status = filters.status;
      if (filters.plan) params.plan = filters.plan;
      if (filters.search) params.search = filters.search;
      const result = await platformApi.listTenants(params);
      setData(result);
      setStatus('succeeded');
    } catch (err) {
      setStatus('failed');
      setError(err);
      dispatch(showErrorDialog(err));
    }
  }, [dispatch, filters]);

  useEffect(() => {
    load();
  }, [load]);

const onAction = async (id, method, confirmKey, vars = {}) => {
    if (confirmKey) {
      const ok = await requestConfirm({
        title: t('common.confirm'),
        message: t(confirmKey, vars),
        danger: /delete/i.test(confirmKey),
      });
      if (!ok) return;
    }
    try {
      await platformApi[method](id);
      await load();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setActing(null);
    }
  };

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (tenant) => { setEditing(tenant); setFormOpen(true); };

  const saveTenant = async (payload) => {
    if (payload._id) {
      await platformApi.updateTenant(payload._id, payload);
    } else {
      await platformApi.createTenant(payload.tenantData);
    }
    setFormOpen(false);
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('site.tenants.title')}
        subtitle={t('site.tenants.subtitle')}
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreate}>
              {t('site.tenants.create')}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          placeholder={t('site.tenants.searchPlaceholder')}
          className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-brand-light"
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-brand-light"
        >
          <option value="">{t('site.tenants.allStatuses')}</option>
          {Object.keys(STATUS_BADGES).map((s) => (
            <option key={s} value={s}>{t(`tenant.status.${s}`)}</option>
          ))}
        </select>
        <select
          value={filters.plan}
          onChange={(e) => setFilters((f) => ({ ...f, plan: e.target.value, page: 1 }))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-brand-light"
        >
          <option value="">{t('site.tenants.allPlans')}</option>
          <option value="starter">Starter</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      {status === 'loading' && status !== 'succeeded' && <Spinner label={t('site.tenants.loading')} />}
      {error && status === 'failed' && <EmptyState title={t('site.tenants.loadFailed')} />}
      {status === 'succeeded' && data.tenants.length === 0 && (
        <EmptyState title={t('site.tenants.empty')} description={t('site.tenants.emptyHint')} />
      )}

      {status === 'succeeded' && data.tenants.length > 0 && (
        <DataTable
          columns={[
            { label: t('site.tenants.col.name') },
            { label: t('site.tenants.col.plan') },
            { label: t('site.tenants.col.status') },
            { label: t('site.tenants.col.created') },
            { label: t('site.tenants.col.stats') },
            { label: t('site.tenants.col.actions'), className: 'text-end' },
          ]}
          count={data.tenants.length}
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
              {data.tenants.map((tenant) => (
                  <tr key={tenant._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{tenant.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{tenant.email}</p>
                      {tenant.quarantineReason && (
                        <p className="mt-1 text-xs font-medium text-rose-500 dark:text-rose-400">{t('site.tenants.quarantined')}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 uppercase text-xs font-medium text-slate-600 dark:text-slate-300">{tenant.plan}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGES[tenant.status] || STATUS_BADGES.archived}`}>
                        {t(`tenant.status.${tenant.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(tenant.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {tenant.branchesCount ?? 0} {t('site.tenants.branches')} · {tenant.usersCount ?? 0} {t('site.tenants.users')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setStatsTenant(tenant)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          {t('site.tenants.viewStats')}
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => openEdit(tenant)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            {t('common.edit')}
                          </button>
                        )}
                        {isSuperAdmin && tenant.quarantineReason && (
                          <button
                            type="button"
                            disabled={acting === tenant._id}
                            onClick={() => onAction(tenant._id, 'removeQuarantine', 'site.tenants.removeQuarantineConfirm', { name: tenant.name })}
                            className="rounded-md px-2 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                          >
                            {t('site.tenants.releaseQuarantine')}
                          </button>
                        )}
                        {isSuperAdmin && tenant.status === 'suspended' && !tenant.quarantineReason && (
                          <button
                            type="button"
                            disabled={acting === tenant._id}
                            onClick={() => onAction(tenant._id, 'activateTenant', 'site.tenants.activateConfirm', { name: tenant.name })}
                            className="rounded-md px-2 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                          >
                            {t('site.tenants.activate')}
                          </button>
                        )}
                        {isSuperAdmin && (tenant.status === 'active' || tenant.status === 'trial') && (
                          <button
                            type="button"
                            disabled={acting === tenant._id}
                            onClick={() => onAction(tenant._id, 'suspendTenant', 'site.tenants.suspendConfirm', { name: tenant.name })}
                            className="rounded-md px-2 py-1 text-xs font-medium text-amber-600 transition hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
                          >
                            {t('site.tenants.suspend')}
                          </button>
                        )}
                        {isSuperAdmin && (
                          <button
                            type="button"
                            disabled={acting === tenant._id}
                            onClick={() => onAction(tenant._id, 'archiveTenant', 'site.tenants.archiveConfirm', { name: tenant.name })}
                            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                          >
                            {t('site.tenants.archive')}
                          </button>
                        )}
                        {isSuperAdmin && (
                          <button
                            type="button"
                            disabled={acting === tenant._id}
                            onClick={() => onAction(tenant._id, 'deleteTenant', 'site.tenants.deleteConfirm', { name: tenant.name })}
                            className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15"
                          >
                            {t('site.tenants.delete')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
        </DataTable>
      )}

      {formOpen && (
        <SiteTenantModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          tenant={editing}
          onSave={saveTenant}
        />
      )}
      {statsTenant && (
        <SiteTenantStatsModal
          tenant={statsTenant}
          onClose={() => setStatsTenant(null)}
        />
      )}
    </div>
  );
}