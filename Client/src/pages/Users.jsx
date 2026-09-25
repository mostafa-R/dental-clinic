import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import DataTable from '../components/ui/DataTable';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import { fetchUsers, toggleUserActive } from '../features/users/userSlice';
import { showErrorDialog, pushToast } from '../features/ui/uiSlice';
import { requestConfirm } from '../features/ui/confirmDialog';
import { useSocketEvent } from '../lib/socket';
import { useT } from '../lib/i18n';
import { useCanManageUsers, roleLabel } from '../lib/roles';
import UserFormModal from '../features/users/UserFormModal';

export default function Users() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { items, status, error } = useSelector((s) => s.users);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const canManage = useCanManageUsers();

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (user) => { setEditing(user); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditing(null); };

  const refetch = useCallback(() => { dispatch(fetchUsers()); }, [dispatch]);
  useSocketEvent('user:created', refetch);
  useSocketEvent('user:updated', refetch);
  useSocketEvent('user:deleted', refetch);
  useSocketEvent('user:toggled', refetch);

  const onToggleActive = async (user) => {
    const action = user.isActive ? 'deactivate' : 'activate';
    const ok = await requestConfirm({
      title: t('common.confirm'),
      message: t(`users.${action}Confirm`, { name: user.name }),
    });
    if (!ok) return;
    try {
      await dispatch(toggleUserActive(user._id)).unwrap();
      dispatch(pushToast({ type: 'success', message: t(`users.toggled${action === 'activate' ? 'Active' : 'Inactive'}`, { name: user.name }) }));
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const isLoading = status === 'loading' || status === 'idle';

  const PAGE_SIZE = 20;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q),
    );
  }, [items, query]);

  const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const onQueryChange = (value) => {
    setQuery(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreate}>
              {t('users.new')}
            </Button>
          ) : undefined
        }
      />

      {error && !isLoading && <EmptyState title={t('users.loadFailed')} message={error?.message} />}
      {!error && !isLoading && status === 'succeeded' && items.length === 0 && (
        <EmptyState
          title={t('users.empty')}
          message={t('users.emptyHint')}
          action={
            canManage && !isLoading ? (
              <Button size="sm" onClick={openCreate}>
                {t('users.new')}
              </Button>
            ) : undefined
          }
        />
      )}

      {!error && (isLoading || status === 'succeeded') && (items.length > 0 || isLoading) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <label className="relative flex-1 sm:max-w-xs">
              <span className="sr-only">{t('users.search')}</span>
              <svg className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder={t('users.searchPlaceholder')}
                className="w-full rounded-xl border border-slate-200 bg-white py-2 ps-9 pe-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </label>
            <span className="hidden text-xs text-slate-400 dark:text-slate-500 sm:inline">
              {visible.length} / {items.length}
            </span>
          </div>

          {filtered.length === 0 && !isLoading ? (
            <EmptyState title={t('users.noResults')} />
          ) : (
            <DataTable
              loading={isLoading}
              columns={[
                { label: t('users.col.name') },
                { label: t('users.col.email') },
                { label: t('users.col.role') },
                { label: t('users.col.branch') },
                { label: t('users.col.status') },
                { label: t('users.col.actions'), className: 'text-end' },
              ]}
              count={visible.length}
              footer={
                totalPages > 1 ? (
                  <Pagination
                    page={page}
                    pages={totalPages}
                    total={filtered.length}
                    pageSize={PAGE_SIZE}
                    onChange={setPage}
                    prevLabel={t('common.prev')}
                    nextLabel={t('common.next')}
                  />
                ) : undefined
              }
            >
              {visible.map((u) => (
            <tr key={u._id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30">
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{u.name}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.email}</td>
              <td className="px-4 py-3">
                <span className="inline-flex rounded-full bg-brand/5 px-2.5 py-0.5 text-xs font-medium text-brand-dark dark:bg-brand/20 dark:text-brand-light">
                  {u.roleId?.name || roleLabel(u.role)}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.branch?.name || '—'}</td>
              <td className="px-4 py-3">
                {u.isActive ? (
                  <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{t('users.active')}</span>
                ) : (
                  <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{t('users.inactive')}</span>
                )}
              </td>
              <td className="px-4 py-3 text-end">
                {canManage && (
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="xs" onClick={() => openEdit(u)}>
                      {t('common.edit')}
                    </Button>
                    <Button variant="danger-soft" size="xs" onClick={() => onToggleActive(u)}>
                      {u.isActive ? t('common.deactivate') : t('common.activate')}
                    </Button>
                  </div>
                )}
              </td>
            </tr>
              ))}
            </DataTable>
          )}
        </div>
      )}

      <UserFormModal open={formOpen} onClose={closeForm} user={editing} />
    </div>
  );
}
