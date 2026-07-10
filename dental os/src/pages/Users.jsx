import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import { fetchUsers, toggleUserActive } from '../features/users/usersSlice';
import { showErrorDialog } from '../features/ui/uiSlice';
import { useT } from '../lib/i18n';
import { canManageUsers, roleLabel } from '../lib/roles';
import UserFormModal from '../features/users/UserFormModal';

export default function Users() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { items, status, error } = useSelector((s) => s.users);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canManage = canManageUsers();

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (user) => { setEditing(user); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditing(null); };

  const onToggleActive = async (user) => {
    const action = user.isActive ? 'deactivate' : 'activate';
    if (!window.confirm(t(`users.${action}Confirm`, { name: user.name }))) return;
    try {
      await dispatch(toggleUserActive(user._id)).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const isLoading = status === 'loading' || status === 'idle';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('users.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('users.subtitle')}</p>
        </div>
        {canManage && (
          <button type="button" onClick={openCreate} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            {t('users.new')}
          </button>
        )}
      </header>

      {isLoading && <Spinner label={t('users.loading')} />}
      {error && !isLoading && <EmptyState title={t('users.loadFailed')} message={error?.message} />}
      {status === 'succeeded' && !error && items.length === 0 && (
        <EmptyState title={t('users.empty')} description={t('users.emptyHint')} action={
          canManage ? (
            <button type="button" onClick={openCreate} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700">
              {t('users.new')}
            </button>
          ) : undefined
        } />
      )}

      {status === 'succeeded' && items.length > 0 && (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500">
                  <th className="px-4 py-3 text-left">{t('users.col.name')}</th>
                  <th className="px-4 py-3 text-left">{t('users.col.email')}</th>
                  <th className="px-4 py-3 text-left">{t('users.col.role')}</th>
                  <th className="px-4 py-3 text-left">{t('users.col.branch')}</th>
                  <th className="px-4 py-3 text-left">{t('users.col.status')}</th>
                  <th className="px-4 py-3 text-right">{t('users.col.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{u.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
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
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => openEdit(u)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                            {t('common.edit')}
                          </button>
                          <button type="button" onClick={() => onToggleActive(u)} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15">
                            {u.isActive ? t('common.deactivate') : t('common.activate')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <UserFormModal open={formOpen} onClose={closeForm} user={editing} />
    </div>
  );
}
