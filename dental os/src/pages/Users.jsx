import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import { fetchUsers, toggleUserActive } from '../features/users/userSlice';
import { showErrorDialog, pushToast } from '../features/ui/uiSlice';
import { requestConfirm } from '../features/ui/confirmDialog';
import { useSocketEvent } from '../lib/socket';
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

      {isLoading && <Spinner label={t('users.loading')} />}
      {error && !isLoading && <EmptyState title={t('users.loadFailed')} message={error?.message} />}
      {status === 'succeeded' && !error && items.length === 0 && (
        <EmptyState
          title={t('users.empty')}
          message={t('users.emptyHint')}
          action={
            canManage ? (
              <Button size="sm" onClick={openCreate}>
                {t('users.new')}
              </Button>
            ) : undefined
          }
        />
      )}

      {status === 'succeeded' && items.length > 0 && (
        <DataTable
          columns={[
            { label: t('users.col.name') },
            { label: t('users.col.email') },
            { label: t('users.col.role') },
            { label: t('users.col.branch') },
            { label: t('users.col.status') },
            { label: t('users.col.actions'), className: 'text-end' },
          ]}
          count={items.length}
        >
          {items.map((u) => (
            <tr key={u._id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30">
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

      <UserFormModal open={formOpen} onClose={closeForm} user={editing} />
    </div>
  );
}
