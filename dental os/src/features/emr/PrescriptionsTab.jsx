import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import PrescriptionFormModal from './PrescriptionFormModal';
import { deletePrescription, fetchPrescriptions } from './emrSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { canManagePrescriptions } from '../../lib/roles';
import { formatDate } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { PhiField } from '../../lib/usePhi.jsx';

export default function PrescriptionsTab({ patientId, patient }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const { items: prescriptions, status, error } = useSelector((s) => s.emr.prescriptions);
  const canManage = canManagePrescriptions();

  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchPrescriptions({ patientId, params: { limit: 100 } }));
  }, [dispatch, patientId]);

  const onDelete = async (rxId) => {
    if (!window.confirm(t('emr.rx.deleteConfirm'))) return;
    try {
      await dispatch(deletePrescription({ patientId, rxId })).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const isLoading = status === 'loading' || status === 'idle';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('emr.rx.subtitle')}</p>
        {canManage && (
          <button type="button" onClick={() => setFormOpen(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            {t('emr.rx.new')}
          </button>
        )}
      </div>

      {isLoading && <Spinner label={t('emr.rx.loading')} />}
      {error && !isLoading && <EmptyState title={t('emr.rx.loadFailed')} message={error?.message} />}
      {!isLoading && !error && prescriptions.length === 0 && <EmptyState title={t('emr.rx.empty')} />}

      {!isLoading && !error && prescriptions.length > 0 && (
        <div className="space-y-4">
          {prescriptions.map((rx) => (
            <Card key={rx._id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{rx.rxNo}</span>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                      {t('emr.rx.issuedBy', { doctor: rx.doctor?.name || '—' })}
                    </span>
                  </div>
                  {rx.diagnosis && <p className="mt-1 text-sm text-slate-700 dark:text-slate-200"><PhiField>{rx.diagnosis}</PhiField></p>}
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{formatDate(rx.issuedAt)}</p>
                </div>
                {canManage && (
                  <button type="button" onClick={() => onDelete(rx._id)} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15">
                    {t('common.close')}
                  </button>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {rx.medications.map((m, i) => (
                  <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">
                    <span className="font-medium text-slate-900 dark:text-white"><PhiField>{m.name}</PhiField></span>
                    {m.dosage && <span className="text-slate-500 dark:text-slate-400">{m.dosage}</span>}
                    {m.frequency && <span className="text-slate-500 dark:text-slate-400">· {m.frequency}</span>}
                    {m.duration && <span className="text-slate-500 dark:text-slate-400">· {m.duration}</span>}
                    {m.instructions && <span className="text-slate-400 dark:text-slate-500">— {m.instructions}</span>}
                  </div>
                ))}
              </div>

              {rx.notes && <p className="mt-3 whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">{rx.notes}</p>}
            </Card>
          ))}
        </div>
      )}

      <PrescriptionFormModal open={formOpen} patientId={patientId} patient={patient} onClose={() => setFormOpen(false)} />
    </div>
  );
}
