import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import api from '../../lib/axios';
import Modal from '../../components/ui/Modal';
import { createPrescription, resetFormState } from './emrSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { useT } from '../../lib/i18n';

function emptyMed() {
  return { name: '', dosage: '', frequency: '', duration: '', instructions: '' };
}

export default function PrescriptionFormModal({ open, patientId, patient, onClose }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const formStatus = useSelector((s) => s.emr.formStatus);
  const formError = useSelector((s) => s.emr.formError);
  const currentUser = useSelector((s) => s.auth.user);

  const isDoctor = currentUser?.isDoctor;
  const [doctor, setDoctor] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [meds, setMeds] = useState([emptyMed()]);

  useEffect(() => {
    if (!open) return;
    setDiagnosis('');
    setNotes('');
    setMeds([emptyMed()]);
    dispatch(resetFormState());
    if (isDoctor) {
      setDoctor(currentUser._id);
    } else {
      setDoctor('');
      const branchId = patient?.branch?._id || patient?.branch;
      api
        .get('/users/doctors').then((r) => setDoctors(r.data.data.doctors || []))
        .catch(() => setDoctors([]));
    }
  }, [open, isDoctor, currentUser, patient, dispatch]);

  const updateMed = (idx, field, value) => {
    setMeds((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));
  };
  const addMed = () => setMeds((prev) => [...prev, emptyMed()]);
  const removeMed = (idx) => setMeds((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    const cleanMeds = meds.filter((m) => m.name.trim()).map((m) => ({
      name: m.name.trim(),
      dosage: m.dosage?.trim() || undefined,
      frequency: m.frequency?.trim() || undefined,
      duration: m.duration?.trim() || undefined,
      instructions: m.instructions?.trim() || undefined,
    }));

    if (!doctor) {
      dispatch(showErrorDialog({ message: t('emr.rx.needDoctor') }));
      return;
    }
    if (cleanMeds.length === 0) {
      dispatch(showErrorDialog({ message: t('emr.rx.needMed') }));
      return;
    }

    try {
      await dispatch(
        createPrescription({
          patientId,
          payload: { doctor, diagnosis: diagnosis.trim(), notes: notes.trim(), medications: cleanMeds },
        }),
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
      title={t('emr.rx.new')}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={submit} disabled={formStatus === 'loading'} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            {formStatus === 'loading' ? t('common.saving') : t('emr.rx.create')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.rx.doctor')}</label>
            {isDoctor ? (
              <input value={currentUser?.name || ''} disabled className={`${inputCls} opacity-70`} />
            ) : (
              <select value={doctor} onChange={(e) => setDoctor(e.target.value)} className={inputCls}>
                <option value="">{t('emr.rx.selectDoctor')}</option>
                {doctors.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.rx.diagnosis')}</label>
            <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className={inputCls} maxLength={500} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.rx.medications')}</label>
            <button type="button" onClick={addMed} className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300">
              {t('emr.rx.addMed')}
            </button>
          </div>
          <div className="space-y-2">
            {meds.map((m, idx) => (
              <div key={idx} className="rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <input value={m.name} onChange={(e) => updateMed(idx, 'name', e.target.value)} placeholder={t('emr.rx.medName')} className={`${inputCls} flex-1`} />
                  <button type="button" onClick={() => removeMed(idx)} disabled={meds.length <= 1} className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 dark:hover:bg-rose-500/15" aria-label={t('common.cancel')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <input value={m.dosage} onChange={(e) => updateMed(idx, 'dosage', e.target.value)} placeholder={t('emr.rx.dosage')} className={inputCls} />
                  <input value={m.frequency} onChange={(e) => updateMed(idx, 'frequency', e.target.value)} placeholder={t('emr.rx.frequency')} className={inputCls} />
                  <input value={m.duration} onChange={(e) => updateMed(idx, 'duration', e.target.value)} placeholder={t('emr.rx.duration')} className={inputCls} />
                  <input value={m.instructions} onChange={(e) => updateMed(idx, 'instructions', e.target.value)} placeholder={t('emr.rx.instructions')} className={inputCls} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.rx.notes')}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} maxLength={1000} />
        </div>
        {formError?.message && <p className="text-xs text-rose-600 dark:text-rose-400">{formError.message}</p>}
      </div>
    </Modal>
  );
}
