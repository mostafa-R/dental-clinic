import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import TreatmentPlanFormModal from './TreatmentPlanFormModal';
import { useNavigate } from 'react-router-dom';

import {
  addPlanItem,
  archivePlan,
  fetchPlans,
  removePlanItem,
  updatePlanItem,
} from './emrSlice';
import { generateInvoiceFromPlan } from '../wallet/walletSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { useSocketEvent } from '../../lib/socket';
import { canManageEmr } from '../../lib/roles';
import { formatMoney } from '../../lib/format';
import {
  PLAN_STATUS_STYLES,
  PROCEDURE_STATUS_STYLES,
  PROCEDURE_STATUSES,
} from './dental';
import { useT } from '../../lib/i18n';
import { PhiField } from '../../hooks/usePhi';

const TOOTH_OPTIONS = [
  { value: '', label: '—' },
  ...Array.from({ length: 32 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
];

function newItemDraft() {
  return { tooth: '', procedureName: '', estimatedCost: '' };
}

export default function TreatmentPlansTab({ patientId }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const { items: plans, status, error } = useSelector((s) => s.emr.plans);
  const canManage = canManageEmr();

  const [formOpen, setFormOpen] = useState(false);
  const [expanded, setExpanded] = useState(new Set());
  const [drafts, setDrafts] = useState({});

  const refetch = useCallback(() => {
    dispatch(fetchPlans({ patientId, params: { limit: 100 } }));
  }, [dispatch, patientId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useSocketEvent('treatment-plan:created', refetch);
  useSocketEvent('treatment-plan:updated', refetch);

  const toggle = (planId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  const setDraft = (planId, field, value) => {
    setDrafts((prev) => ({ ...prev, [planId]: { ...(prev[planId] || newItemDraft()), [field]: value } }));
  };

  const onAddItem = async (planId) => {
    const draft = drafts[planId] || newItemDraft();
    if (!draft.procedureName.trim()) {
      dispatch(showErrorDialog({ message: t('emr.plan.needItem') }));
      return;
    }
    try {
      await dispatch(
        addPlanItem({
          patientId,
          planId,
          payload: {
            tooth: draft.tooth ? Number(draft.tooth) : null,
            procedureName: draft.procedureName.trim(),
            estimatedCost: draft.estimatedCost === '' ? 0 : Number(draft.estimatedCost),
          },
        }),
      ).unwrap();
      setDrafts((prev) => ({ ...prev, [planId]: newItemDraft() }));
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const onStatusChange = async (planId, itemId, status) => {
    try {
      await dispatch(updatePlanItem({ patientId, planId, itemId, payload: { status } })).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const onRemoveItem = async (planId, itemId) => {
    if (!window.confirm(t('emr.plan.removeItemConfirm'))) return;
    try {
      await dispatch(removePlanItem({ patientId, planId, itemId })).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const onArchive = async (planId) => {
    if (!window.confirm(t('emr.plan.archiveConfirm'))) return;
    try {
      await dispatch(archivePlan({ patientId, planId })).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const navigate = useNavigate();
  const isLoading = status === 'loading' || status === 'idle';
  const inputCls =
    'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/20';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('emr.plan.subtitle')}</p>
        {canManage && (
          <button type="button" onClick={() => setFormOpen(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            {t('emr.plan.new')}
          </button>
        )}
      </div>

      {isLoading && <Spinner label={t('emr.plan.loading')} />}
      {error && !isLoading && <EmptyState title={t('emr.plan.loadFailed')} message={error?.message} />}
      {!isLoading && !error && plans.length === 0 && <EmptyState title={t('emr.plan.empty')} />}

      {!isLoading && !error && plans.length > 0 && (
        <div className="space-y-4">
          {plans.map((plan) => {
            const isOpen = expanded.has(plan._id);
            const draft = drafts[plan._id] || newItemDraft();
            return (
              <Card key={plan._id} padded={false}>
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <button type="button" onClick={() => toggle(plan._id)} className="flex flex-1 items-center gap-3 text-start">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}><path d="m9 18 6-6-6-6" /></svg>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-white">{plan.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PLAN_STATUS_STYLES[plan.status]}`}>
                          {t(`emr.plan.status.${plan.status}`)}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-slate-400 dark:text-slate-500">{plan.planNo}</p>
                    </div>
                  </button>
                  <div className="text-end">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatMoney(plan.totalEstimated)}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t('emr.plan.progress', { done: plan.completedCount, total: plan.items.length })}</p>
                  </div>
                  {canManage && plan.status !== 'archived' && plan.items.some((i) => i.status === 'completed' || i.status === 'in_progress') && (
                    <button type="button" onClick={async () => {
                      const billableIds = plan.items.filter((i) => !i.invoice && (i.status === 'completed' || i.status === 'in_progress')).map((i) => i._id);
                      if (billableIds.length === 0) return;
                      try {
                        await dispatch(generateInvoiceFromPlan({ patientId, planId: plan._id, payload: { itemIds: billableIds } })).unwrap();
                        navigate(`/billing`);
                      } catch (err) {
                        dispatch(showErrorDialog(err));
                      }
                    }} className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/15">
                      {t('wallet.generateInvoice')}
                    </button>
                  )}
                  {canManage && plan.status !== 'archived' && (
                    <button type="button" onClick={() => onArchive(plan._id)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                      {t('emr.plan.archive')}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {plan.diagnosis && <p className="px-4 pt-3 text-xs text-slate-500 dark:text-slate-400">{t('emr.plan.diagnosis')}: <PhiField>{plan.diagnosis}</PhiField></p>}
                    <div className="space-y-1 p-4">
                      {plan.items.map((item) => (
                        <div key={item._id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                          <span className="w-8 text-center font-mono text-xs text-slate-400 dark:text-slate-500">{item.tooth ? `#${item.tooth}` : '—'}</span>
                          <span className="flex-1 text-sm text-slate-700 dark:text-slate-200"><PhiField>{item.procedureName}</PhiField></span>
                          <span className="text-sm font-medium text-slate-900 dark:text-white">{formatMoney(item.estimatedCost)}</span>
                          {canManage ? (
                            <select value={item.status} onChange={(e) => onStatusChange(plan._id, item._id, e.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                              {PROCEDURE_STATUSES.map((s) => (
                                <option key={s} value={s}>{t(`emr.procedure.status.${s}`)}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROCEDURE_STATUS_STYLES[item.status]}`}>{t(`emr.procedure.status.${item.status}`)}</span>
                          )}
                          {canManage && (
                            <button type="button" onClick={() => onRemoveItem(plan._id, item._id)} className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15" aria-label={t('common.cancel')}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                      ))}

                      {canManage && plan.status !== 'archived' && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-200 p-2 dark:border-slate-700">
                          <select value={draft.tooth} onChange={(e) => setDraft(plan._id, 'tooth', e.target.value)} className={`${inputCls} w-16`} aria-label={t('emr.plan.tooth')}>
                            {TOOTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <input value={draft.procedureName} onChange={(e) => setDraft(plan._id, 'procedureName', e.target.value)} placeholder={t('emr.plan.procedureName')} className={`${inputCls} flex-1`} />
                          <input value={draft.estimatedCost} onChange={(e) => setDraft(plan._id, 'estimatedCost', e.target.value)} type="number" min="0" step="0.01" placeholder={t('emr.plan.cost')} className={`${inputCls} w-28`} />
                          <button type="button" onClick={() => onAddItem(plan._id)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500">
                            {t('emr.plan.addItem')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <TreatmentPlanFormModal open={formOpen} patientId={patientId} onClose={() => setFormOpen(false)} />
    </div>
  );
}
