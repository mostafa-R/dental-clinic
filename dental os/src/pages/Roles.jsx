import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import RoleFormModal from '../features/roles/RoleFormModal';
import {
  deleteRole,
  fetchRoles,
  fetchModules,
} from '../features/roles/rolesSlice';
import { showErrorDialog } from '../features/ui/uiSlice';
import { useSocketEvent } from '../lib/socket';
import { CRUD_ACTIONS, CRUD_SHORT, MODULES as LOCAL_MODULES } from '../features/roles/permissions';
import { useT } from '../lib/i18n';
import { canManageRoles } from '../lib/roles';

export default function Roles() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { items, status, error, modules: serverModules } = useSelector((s) => s.roles);
  const MODULES = serverModules?.modules || LOCAL_MODULES;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canManage = canManageRoles();

  useEffect(() => {
    dispatch(fetchRoles());
    dispatch(fetchModules());
  }, [dispatch]);

  const refetch = useCallback(() => { dispatch(fetchRoles()); }, [dispatch]);
  useSocketEvent('role:created', refetch);
  useSocketEvent('role:updated', refetch);
  useSocketEvent('role:deleted', refetch);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (role) => { setEditing(role); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditing(null); };

  const onDelete = async (role) => {
    if (!window.confirm(t('roles.deleteConfirm', { name: role.name }))) return;
    try {
      await dispatch(deleteRole(role._id)).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const isLoading = status === 'loading' || status === 'idle';

  const getPerm = (role, moduleKey) => {
    if (role.isSystemAdmin) return CRUD_ACTIONS;
    const entry = role.permissions?.find((p) => p.module === moduleKey);
    return entry?.actions || [];
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('roles.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('roles.subtitle')}</p>
        </div>
        {canManage && (
          <button type="button" onClick={openCreate} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            {t('roles.new')}
          </button>
        )}
      </header>

      {isLoading && <Spinner label={t('roles.loading')} />}
      {error && !isLoading && <EmptyState title={t('roles.loadFailed')} message={error?.message} />}
      {status === 'succeeded' && !error && items.length === 0 && <EmptyState title={t('roles.empty')} />}

      {status === 'succeeded' && !error && items.length > 0 && (
        <div className="space-y-4">
          {items.map((role) => (
            <Card key={role._id} padded={false}>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-white">{role.name}</span>
                      {role.isBuiltIn && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700/40 dark:text-slate-400">{t('roles.builtIn')}</span>
                      )}
                      {role.isSystemAdmin && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{t('roles.admin')}</span>
                      )}
                      {!role.isActive && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">{t('roles.inactive')}</span>
                      )}
                    </div>
                    {role.description && <p className="text-sm text-slate-500 dark:text-slate-400">{role.description}</p>}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => openEdit(role)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                      {t('common.edit')}
                    </button>
                    {!role.isBuiltIn && (
                      <button type="button" onClick={() => onDelete(role)} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15">
                        {t('common.archive')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Permission summary */}
              <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                      <th className="px-4 py-2 text-left">{t('roles.col.module')}</th>
                      {CRUD_ACTIONS.map((a) => (
                        <th key={a} className="px-3 py-2 text-center">{CRUD_SHORT[a]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {MODULES.map((mod) => {
                      const actions = getPerm(role, mod.key);
                      return (
                        <tr key={mod.key}>
                              <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{t('mod.' + mod.key)}</td>
                          {CRUD_ACTIONS.map((a) => (
                            <td key={a} className="px-3 py-2 text-center">
                              {actions.includes(a) ? (
                                <svg className="mx-auto h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0z" clipRule="evenodd" /></svg>
                              ) : (
                                <span className="text-slate-200 dark:text-slate-700">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      <RoleFormModal open={formOpen} onClose={closeForm} role={editing} />
    </div>
  );
}
