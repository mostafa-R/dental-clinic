import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import DataTable from '../components/ui/DataTable';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import BranchFormModal from '../features/branches/BranchFormModal';
import { fetchBranches, deleteBranch } from '../features/branches/branchSlice';
import { showErrorDialog, pushToast } from '../features/ui/uiSlice';
import { requestConfirm } from '../features/ui/confirmDialog';
import { useSocketEvent } from '../lib/socket';
import { useT } from '../lib/i18n';
import { canManageBranches } from '../lib/roles';

export default function Branches() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { items, status, error } = useSelector((s) => s.branches);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canManage = canManageBranches();

  useEffect(() => {
    dispatch(fetchBranches());
  }, [dispatch]);

  const refetch = useCallback(() => { dispatch(fetchBranches()); }, [dispatch]);
  useSocketEvent('branch:created', refetch);
  useSocketEvent('branch:updated', refetch);
  useSocketEvent('branch:deleted', refetch);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (branch) => { setEditing(branch); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditing(null); };

  const onDelete = async (branch) => {
    const ok = await requestConfirm({
      title: t('common.confirm'),
      message: t('branches.deleteConfirm', { name: branch.name }),
      danger: true,
    });
    if (!ok) return;
    try {
      await dispatch(deleteBranch(branch._id)).unwrap();
      dispatch(pushToast({ type: 'success', message: t('branches.deleted') }));
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const isLoading = status === 'loading' || status === 'idle';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('branches.title')}
        subtitle={t('branches.subtitle')}
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreate}>
              {t('branches.new')}
            </Button>
          ) : undefined
        }
      />

      {isLoading && <Spinner label={t('branches.loading')} />}
      {error && !isLoading && <EmptyState title={t('branches.loadFailed')} message={error?.message || String(error)} />}
      {status === 'succeeded' && !error && items.length === 0 && (
        <EmptyState title={t('branches.empty')} description={t('branches.emptyHint')} action={
          canManage ? (
            <Button size="sm" onClick={openCreate}>
              {t('branches.new')}
            </Button>
          ) : undefined
        } />
      )}

      {status === 'succeeded' && items.length > 0 && (
        <DataTable
          columns={[
            { label: t('branches.col.name') },
            { label: t('branches.col.address') },
            { label: t('branches.col.phone') },
            { label: t('branches.col.status') },
            ...(canManage ? [{ label: t('branches.col.actions'), className: 'text-end' }] : []),
          ]}
          count={items.length}
        >
          {items.map((b) => (
            <tr key={b._id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30">
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{b.name}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{b.address || '—'}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{b.phone || '—'}</td>
              <td className="px-4 py-3">
                {b.isActive ? (
                  <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{t('branches.active')}</span>
                ) : (
                  <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{t('branches.inactive')}</span>
                )}
              </td>
              {canManage && (
                <td className="px-4 py-3 text-end">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="xs" onClick={() => openEdit(b)}>
                      {t('common.edit')}
                    </Button>
                    <Button variant="danger-soft" size="xs" onClick={() => onDelete(b)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </DataTable>
      )}

      <BranchFormModal open={formOpen} onClose={closeForm} branch={editing} />
    </div>
  );
}
