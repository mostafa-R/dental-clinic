import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Modal from '../../components/ui/Modal';
import { createPlan, resetFormState } from './emrSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { useT } from '../../lib/i18n';

const TOOTH_OPTIONS = [
  { value: '', label: '—' },
  ...Array.from({ length: 32 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
];

function emptyItem() {
  return { tooth: '', procedureName: '', procedureCode: '', estimatedCost: '' };
}

export default function TreatmentPlanFormModal({ open, patientId, onClose, preselectedTooth }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const formStatus = useSelector((s) => s.emr.formStatus);
  const formError = useSelector((s) => s.emr.formError);

  const [title, setTitle] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [items, setItems] = useState([emptyItem()]);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDiagnosis('');
      setItems([{ ...emptyItem(), tooth: preselectedTooth ? String(preselectedTooth) : '' }]);
      dispatch(resetFormState());
    }
  }, [open, dispatch, preselectedTooth]);

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    const cleanItems = items
      .filter((it) => it.procedureName.trim())
      .map((it) => ({
        tooth: it.tooth ? Number(it.tooth) : null,
        procedureName: it.procedureName.trim(),
        procedureCode: it.procedureCode?.trim() || undefined,
        estimatedCost: it.estimatedCost === '' ? 0 : Number(it.estimatedCost),
      }));

    if (!title.trim()) {
      dispatch(showErrorDialog({ message: t('emr.plan.needTitle') }));
      return;
    }
    if (cleanItems.length === 0) {
      dispatch(showErrorDialog({ message: t('emr.plan.needItem') }));
      return;
    }

    try {
      await dispatch(
        createPlan({ patientId, payload: { title: title.trim(), diagnosis: diagnosis.trim(), items: cleanItems } }),
      ).unwrap();
      onClose();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const inputCls =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/20';

  return (
    <Modal
      open={open}
      title={t('emr.plan.new')}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={formStatus === 'loading'}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {formStatus === 'loading' ? t('common.saving') : t('emr.plan.create')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.plan.title')}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} maxLength={120} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.plan.diagnosis')}</label>
            <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className={inputCls} maxLength={500} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.plan.items')}</label>
            <button type="button" onClick={addItem} className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300">
              {t('emr.plan.addItem')}
            </button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 items-center gap-2">
                <select value={it.tooth} onChange={(e) => updateItem(idx, 'tooth', e.target.value)} className={`${inputCls} col-span-2`} aria-label={t('emr.plan.tooth')}>
                  {TOOTH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <input value={it.procedureName} onChange={(e) => updateItem(idx, 'procedureName', e.target.value)} placeholder={t('emr.plan.procedureName')} className={`${inputCls} col-span-5`} />
                <input value={it.procedureCode} onChange={(e) => updateItem(idx, 'procedureCode', e.target.value)} placeholder={t('emr.plan.code')} className={`${inputCls} col-span-2`} />
                <input value={it.estimatedCost} onChange={(e) => updateItem(idx, 'estimatedCost', e.target.value)} type="number" min="0" step="0.01" placeholder={t('emr.plan.cost')} className={`${inputCls} col-span-2`} />
                <button type="button" onClick={() => removeItem(idx)} disabled={items.length <= 1} className="col-span-1 rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 dark:hover:bg-rose-500/15" aria-label={t('common.cancel')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
        {formError?.message && <p className="text-xs text-rose-600 dark:text-rose-400">{formError.message}</p>}
      </div>
    </Modal>
  );
}
