import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import DataTable from '../components/ui/DataTable';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import RecallFormModal from '../features/recalls/RecallFormModal';
import {
  fetchRecalls,
  completeRecall,
  contactRecall,
  dismissRecall,
} from '../features/recalls/recallSlice';
import { showErrorDialog, pushToast } from '../features/ui/uiSlice';
import { requestConfirm } from '../features/ui/confirmDialog';
import { canManageAppointments } from '../lib/roles';
import { useT } from '../lib/i18n';

const STATUSES = ['', 'due', 'contacted', 'scheduled', 'postponed', 'completed', 'dismissed'];
const TYPES = ['', 'hygiene', 'follow_up', 'treatment_review', 'post_procedure', 'periodic_check', 'custom'];

const STATUS_STYLES = {
  due: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  contacted: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  scheduled: 'bg-brand/5 text-brand-dark dark:bg-brand/20 dark:text-brand-light',
  postponed: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  dismissed: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

function formatDue(value, t) {
  if (!value) return '—';
  const d = new Date(value);
  const overdue = d.getTime() < Date.now();
  const label = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return overdue ? `${label} · ${t('recall.overdue')}` : label;
}

export default function Recalls() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { items, total, page, limit, status, error } = useSelector((s) => s.recalls);
  const canManage = canManageAppointments();

  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [modal, setModal] = useState({ open: false, mode: 'create', recall: null });

  const load = useCallback((nextPage = 1) => {
    dispatch(fetchRecalls({
      page: nextPage,
      limit: 20,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(typeFilter ? { recallType: typeFilter } : {}),
      ...(appliedSearch.trim() ? { patient: appliedSearch.trim() } : {}),
    }));
  }, [dispatch, statusFilter, typeFilter, appliedSearch]);

  useEffect(() => { load(1); }, [load]);

  const closeModal = () => {
    setModal({ open: false, mode: 'create', recall: null });
    load(page);
  };

  const runAction = async (thunk, id, payload, successKey) => {
    try {
      await dispatch(thunk({ id, payload })).unwrap();
      dispatch(pushToast({ type: 'success', message: t(successKey) }));
      load(page);
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const onDismiss = async (recall) => {
    const ok = await requestConfirm({
      title: t('common.confirm'),
      message: t('recall.dismissConfirm'),
      danger: true,
    });
    if (ok) runAction(dismissRecall, recall._id, {}, 'recall.dismissed');
  };

  const openModal = (mode, recall = null) => setModal({ open: true, mode, recall });
  const isLoading = status === 'loading' || status === 'idle';
  const pages = Math.max(1, Math.ceil(total / limit));

  const selectCls = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('recall.title')}
        subtitle={t('recall.subtitle')}
        actions={canManage ? (
          <Button size="sm" onClick={() => openModal('create')}>{t('recall.new')}</Button>
        ) : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setAppliedSearch(search); }}
          placeholder={t('recall.searchHint')}
          className="min-w-52 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-800 dark:text-white sm:max-w-xs"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls} aria-label={t('recall.status')}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? t(`recall.status.${s}`) : t('common.all')}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls} aria-label={t('recall.type')}>
          {TYPES.map((ty) => <option key={ty} value={ty}>{ty ? t(`recall.type.${ty}`) : t('common.all')}</option>)}
        </select>
      </div>

      {isLoading && <Spinner label={t('recall.loading')} />}
      {error && !isLoading && <EmptyState title={t('recall.loadFailed')} message={error?.message || String(error)} />}
      {!isLoading && !error && items.length === 0 && (
        <EmptyState
          title={t('recall.empty')}
          description={t('recall.emptyHint')}
          action={canManage ? <Button size="sm" onClick={() => openModal('create')}>{t('recall.new')}</Button> : undefined}
        />
      )}

      {!isLoading && !error && items.length > 0 && (
        <DataTable
          columns={[
            { label: t('recall.patient') },
            { label: t('recall.type') },
            { label: t('recall.dueDate') },
            { label: t('recall.status') },
            { label: t('recall.attempts') },
            ...(canManage ? [{ label: t('recall.actions'), className: 'text-end' }] : []),
          ]}
          count={items.length}
          footer={pages > 1 ? (
            <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>{t('recall.pageOf', { page, pages, total })}</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="xs" disabled={page <= 1} onClick={() => load(page - 1)}>{t('common.prev')}</Button>
                <Button variant="ghost" size="xs" disabled={page >= pages} onClick={() => load(page + 1)}>{t('common.next')}</Button>
              </div>
            </div>
          ) : undefined}
        >
          {items.map((r) => {
            const p = r.patient && typeof r.patient === 'object' ? r.patient : null;
            const actionable = canManage && !['completed', 'dismissed'].includes(r.status);
            return (
              <tr key={r._id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900 dark:text-white">
                    {p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() || '—' : '—'}
                  </p>
                  <p className="font-mono text-xs text-slate-400">{p ? [p.patientId, p.phone].filter(Boolean).join(' · ') : ''}</p>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{t(`recall.type.${r.recallType}`)}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDue(r.dueDate, t)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] || ''}`}>
                    {t(`recall.status.${r.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.contactAttempts ?? 0}</td>
                {canManage && (
                  <td className="px-4 py-3 text-end">
                    {actionable ? (
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {['due', 'contacted'].includes(r.status) && (
                          <Button variant="ghost" size="xs" onClick={() => runAction(contactRecall, r._id, {}, 'recall.saved')}>
                            {t('recall.contact')}
                          </Button>
                        )}
                        <Button variant="ghost" size="xs" onClick={() => openModal('postpone', r)}>
                          {t('recall.postpone')}
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => openModal('schedule', r)}>
                          {t('recall.schedule')}
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => runAction(completeRecall, r._id, {}, 'recall.saved')}>
                          {t('recall.complete')}
                        </Button>
                        <Button variant="danger-soft" size="xs" onClick={() => onDismiss(r)}>
                          {t('recall.dismiss')}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </DataTable>
      )}

      <RecallFormModal
        open={modal.open}
        mode={modal.mode}
        recall={modal.recall}
        onClose={closeModal}
      />
    </div>
  );
}
