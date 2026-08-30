import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import { platformApi } from '../../features/site/platformApi';
import { showErrorDialog } from '../../features/ui/uiSlice';
import { useT } from '../../lib/i18n';
import { formatDate } from '../../lib/format';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

export default function SiteBranches() {
  const dispatch = useDispatch();
  const { t } = useT();
  const adminRole = useSelector((s) => s.siteAuth.admin?.role);
  const isAdmin = adminRole === 'super_admin' || adminRole === 'admin';
  const isSuperAdmin = adminRole === 'super_admin';

  const [data, setData] = useState({ branches: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
  const [tenants, setTenants] = useState([]);
  const [filters, setFilters] = useState({ page: 1, limit: 20, tenant: '', search: '' });
  const [status, setStatus] = useState('idle');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const params = { page: filters.page, limit: filters.limit };
      if (filters.tenant) params.tenant = filters.tenant;
      if (filters.search) params.search = filters.search;
      const result = await platformApi.listBranches(params);
      setData(result);
      setStatus('succeeded');
    } catch (err) {
      setStatus('failed');
      dispatch(showErrorDialog(err));
    }
  }, [dispatch, filters]);

  const loadTenants = useCallback(async () => {
    try {
      const result = await platformApi.listTenants({ page: 1, limit: 100 });
      setTenants(result.tenants || []);
    } catch {
      setTenants([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };

  const [form, setForm] = useState({ tenant: '', name: '', address: '', phone: '', isActive: true });

  const onOpenModal = (branch) => {
    if (branch) {
      setForm({
        tenant: String(branch.tenant?._id || branch.tenant || ''),
        name: branch.name,
        address: branch.address || '',
        phone: branch.phone || '',
        isActive: branch.isActive !== false,
      });
    } else {
      setForm({ tenant: '', name: '', address: '', phone: '', isActive: true });
    }
    setEditing(branch);
    setFormOpen(true);
  };

  const onChange = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [e.target.name]: val }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const payload = { name: form.name, address: form.address || undefined, phone: form.phone || undefined, isActive: form.isActive };
        await platformApi.updateBranch(editing._id, payload);
      } else {
        const payload = { tenant: form.tenant, tenantId: form.tenant, name: form.name, address: form.address || undefined, phone: form.phone || undefined };
        await platformApi.createBranch(payload);
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (branch) => {
    if (!window.confirm(t('site.branches.deleteConfirm', { name: branch.name }))) return;
    try {
      await platformApi.deleteBranch(branch._id);
      await load();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('site.branches.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('site.branches.subtitle')}</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {t('site.branches.create')}
          </button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          placeholder={t('site.branches.searchPlaceholder')}
          className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <select
          value={filters.tenant}
          onChange={(e) => setFilters((f) => ({ ...f, tenant: e.target.value, page: 1 }))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">{t('site.branches.allTenants')}</option>
          {tenants.map((tenant) => (
            <option key={tenant._id} value={tenant._id}>{tenant.name}</option>
          ))}
        </select>
      </div>

      {status === 'loading' && <Spinner label={t('site.branches.loading')} />}
      {status === 'succeeded' && data.branches.length === 0 && (
        <EmptyState title={t('site.branches.empty')} description={t('site.branches.emptyHint')} />
      )}

      {status === 'succeeded' && data.branches.length > 0 && (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500">
                  <th className="px-4 py-3 text-left">{t('site.branches.col.name')}</th>
                  <th className="px-4 py-3 text-left">{t('site.branches.col.tenant')}</th>
                  <th className="px-4 py-3 text-left">{t('site.branches.col.users')}</th>
                  <th className="px-4 py-3 text-left">{t('site.branches.col.status')}</th>
                  <th className="px-4 py-3 text-left">{t('site.branches.col.created')}</th>
                  {isAdmin && <th className="px-4 py-3 text-right">{t('site.branches.col.actions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.branches.map((branch) => (
                  <tr key={branch._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{branch.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{branch.address || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{branch.tenant?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{branch.usersCount ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${branch.isActive === false ? 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'}`}>
                        {branch.isActive === false ? t('common.inactive') : t('common.active')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(branch.createdAt)}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenModal(branch)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            {t('common.edit')}
                          </button>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => onDelete(branch)}
                              className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15"
                            >
                              {t('common.delete')}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
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

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t('site.branches.editTitle') : t('site.branches.createTitle')}
        footer={
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        <form onSubmit={(e) => e.preventDefault()} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!editing && (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.branches.field.tenant')}</label>
              <select name="tenant" value={form.tenant} onChange={onChange} required className={inputCls}>
                <option value="">{t('site.branches.selectTenant')}</option>
                {tenants.map((tenant) => (
                  <option key={tenant._id} value={tenant._id}>{tenant.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.branches.field.name')}</label>
            <input name="name" value={form.name} onChange={onChange} required minLength={2} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.branches.field.phone')}</label>
            <input name="phone" value={form.phone} onChange={onChange} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('site.branches.field.address')}</label>
            <input name="address" value={form.address} onChange={onChange} className={inputCls} />
          </div>
          {editing && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                id="branchIsActive"
                checked={form.isActive}
                onChange={onChange}
                name="isActive"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
              />
              <label htmlFor="branchIsActive" className="text-sm text-slate-700 dark:text-slate-200">{t('common.active')}</label>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}