import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import RoleFormModal from '../features/roles/RoleFormModal';
import MatrixView from '../features/roles/MatrixView';
import {
  deleteRole,
  fetchRoles,
  fetchModules,
  toggleRoleStatus,
} from '../features/roles/rolesSlice';
import { showErrorDialog, pushToast } from '../features/ui/uiSlice';
import { requestConfirm } from '../features/ui/confirmDialog';
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
  const [matrixOpen, setMatrixOpen] = useState(false);
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
    const ok = await requestConfirm({
      title: t('common.confirm'),
      message: t('roles.deleteConfirm', { name: role.name }),
      danger: true,
    });
    if (!ok) return;
    try {
      await dispatch(deleteRole(role._id)).unwrap();
      dispatch(pushToast({ type: 'success', message: t('roles.deleted') }));
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const onToggleStatus = async (role) => {
    if (role.isActive) {
      const ok = await requestConfirm({
        title: t('common.confirm'),
        message: t('roles.deactivateConfirm', { name: role.name }),
      });
      if (!ok) return;
    }
    try {
      await dispatch(toggleRoleStatus({ id: role._id, isActive: !role.isActive })).unwrap();
      dispatch(pushToast({ type: 'success', message: t(`roles.toggled${role.isActive ? 'Inactive' : 'Active'}`) }));
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
      <PageHeader
        title={t('roles.title')}
        subtitle={t('roles.subtitle')}
        actions={
          canManage && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setMatrixOpen((v) => !v)}>
                {matrixOpen ? t('roles.hideMatrix') : t('roles.viewMatrix')}
              </Button>
              <Button size="sm" onClick={openCreate}>
                {t('roles.new')}
              </Button>
            </div>
          )
        }
      />

      {matrixOpen ? (
        <MatrixView />
      ) : (
        <>
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
                        <span className="rounded-full bg-brand/5 px-2 py-0.5 text-xs font-medium text-brand-dark dark:bg-brand/20 dark:text-brand-light">{t('roles.admin')}</span>
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
                      <>
                        <button
                          type="button"
                          onClick={() => onToggleStatus(role)}
                          className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                            role.isActive
                              ? 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/15'
                              : 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/15'
                          }`}
                        >
                          {role.isActive ? t('roles.deactivate') : t('roles.activate')}
                        </button>
                        <button type="button" onClick={() => onDelete(role)} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15">
                          {t('common.archive')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Permission summary */}
              <DataTable
                columns={[
                  { label: t('roles.col.module') },
                  ...CRUD_ACTIONS.map((a) => ({ label: CRUD_SHORT[a], className: 'text-center' })),
                ]}
                count={MODULES.length}
              >
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
              </DataTable>
            </Card>
          ))}
        </div>
      )}

      <RoleFormModal open={formOpen} onClose={closeForm} role={editing} />
        </>
      )}
    </div>
  );
}
