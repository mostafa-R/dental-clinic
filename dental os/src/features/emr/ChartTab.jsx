import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import DentalChart from './DentalChart';
import ToothPanel from './ToothPanel';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import TreatmentPlanFormModal from './TreatmentPlanFormModal';
import { fetchChart, fetchPlans, resetFormState, saveTooth } from './emrSlice';
import { useSocketEvent } from '../../lib/socket';
import { canManageEmr } from '../../lib/roles';
import { useT } from '../../lib/i18n';
import { formatMoney } from '../../lib/format';
import { PROCEDURE_STATUS_STYLES } from './dental';

export default function ChartTab({ patientId }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const { data: chart, status, error } = useSelector((s) => s.emr.chart);
  const plans = useSelector((s) => s.emr.plans);
  const formStatus = useSelector((s) => s.emr.formStatus);
  const canManage = canManageEmr();

  const [selectedNumber, setSelectedNumber] = useState(null);
  const [planFormOpen, setPlanFormOpen] = useState(false);

  const refetch = useCallback(() => {
    dispatch(fetchChart(patientId));
    dispatch(fetchPlans({ patientId, params: { status: 'active', limit: 100 } }));
  }, [dispatch, patientId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useSocketEvent('chart:updated', refetch);
  useSocketEvent('treatment-plan:created', refetch);
  useSocketEvent('treatment-plan:updated', refetch);

  const teeth = chart?.teeth || [];
  const selectedTooth = selectedNumber ? teeth.find((t) => t.number === selectedNumber) : null;

  const planItemsByTooth = useMemo(() => {
    const map = {};
    (plans.items || []).forEach((plan) => {
      (plan.items || []).forEach((item) => {
        if (!item.tooth) return;
        if (!map[item.tooth]) map[item.tooth] = [];
        map[item.tooth].push({ ...item, planId: plan._id, planTitle: plan.title });
      });
    });
    return map;
  }, [plans.items]);

  const selectedToothItems = selectedNumber ? planItemsByTooth[selectedNumber] || [] : [];

  const handleSave = useCallback(async (payload) => {
    try {
      await dispatch(saveTooth({ patientId, number: selectedNumber, payload })).unwrap();
      dispatch(resetFormState());
    } catch {
      /* formError surfaced via the panel */
    }
  }, [dispatch, patientId, selectedNumber]);

  const isLoading = status === 'loading' || status === 'idle';

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card title={t('emr.chart.title')} className="lg:col-span-2">
        {isLoading && <Spinner label={t('emr.chart.loading')} />}
        {error && !isLoading && <EmptyState title={t('emr.chart.loadFailed')} message={error?.message} />}
        {!isLoading && !error && (
          <DentalChart teeth={teeth} selectedNumber={selectedNumber} onSelect={setSelectedNumber} planItemsByTooth={planItemsByTooth} />
        )}
      </Card>

      <div className="space-y-4">
        <Card title={t('emr.tooth.panelTitle')}>
          {!selectedNumber ? (
            <EmptyState title={t('emr.tooth.selectHint')} />
          ) : !canManage ? (
            <EmptyState title={t('emr.tooth.readOnly')} message={t('emr.tooth.readOnlyHint')} />
          ) : (
            <ToothPanel
              tooth={selectedTooth}
              saving={formStatus === 'loading'}
              onSave={handleSave}
              onCancel={() => setSelectedNumber(null)}
            />
          )}
        </Card>

        {selectedNumber && selectedToothItems.length > 0 && (
          <Card title={t('emr.plan.procedures')}>
            <div className="space-y-2">
              {selectedToothItems.map((item, i) => (
                <div key={item._id || i} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{item.procedureName}</p>
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">{item.planTitle}</p>
                  </div>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{formatMoney(item.estimatedCost)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROCEDURE_STATUS_STYLES[item.status]}`}>
                    {t(`emr.procedure.status.${item.status}`)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {selectedNumber && canManage && (
          <button
            type="button"
            onClick={() => setPlanFormOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-500 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            {t('emr.plan.addProcedure')}
          </button>
        )}
      </div>

      <TreatmentPlanFormModal
        open={planFormOpen}
        patientId={patientId}
        preselectedTooth={selectedNumber}
        onClose={() => setPlanFormOpen(false)}
      />
    </div>
  );
}
