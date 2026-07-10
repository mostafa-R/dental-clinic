import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import { fetchBranches, deleteBranch } from '../features/branches/branchSlice';
import { showErrorDialog } from '../features/ui/uiSlice';
import { useT } from '../lib/i18n';
import { canManageBranches } from '../lib/roles';
import BranchFormModal from '../features/branches/BranchFormModal';

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

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (branch) => { setEditing(branch); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditing(null); };

  const onDelete = async (branch) => {
    if (!window.confirm(t('branches.deleteConfirm', { name: branch.name }))) return;
    try {
      await dispatch(deleteBranch(branch._id)).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const isLoading = status === 'loading' || status === 'idle';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('branches.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('branches.subtitle')}</p>
        </div>
        {canManage && (
          <button type="button" onClick={openCreate} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            {t('branches.new')}
          </button>
        )}
      </header>

      {isLoading && <Spinner label={t('branches.loading')} />}
      {error && !isLoading && <EmptyState title={t('branches.loadFailed')} message={error?.message || String(error)} />}
      {status === 'succeeded' && !error && items.length === 0 && (
        <EmptyState title={t('branches.empty')} description={t('branches.emptyHint')} action={
          canManage ? (
            <button type="button" onClick={openCreate} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
              {t('branches.new')}
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
                  <th className="px-4 py-3 text-left">{t('branches.col.name')}</th>
                  <th className="px-4 py-3 text-left">{t('branches.col.address')}</th>
                  <th className="px-4 py-3 text-left">{t('branches.col.phone')}</th>
                  <th className="px-4 py-3 text-left">{t('branches.col.status')}</th>
                  {canManage && <th className="px-4 py-3 text-right">{t('branches.col.actions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((b) => (
                  <tr key={b._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
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
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => openEdit(b)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                            {t('common.edit')}
                          </button>
                          <button type="button" onClick={() => onDelete(b)} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15">
                            {t('common.delete')}
                          </button>
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

      <BranchFormModal open={formOpen} onClose={closeForm} branch={editing} />
    </div>
  );
}
