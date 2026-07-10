import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import api from '../../lib/axios';
import Modal from '../../components/ui/Modal';
import { createNote, resetFormState } from './emrSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { ATTACHMENT_TYPES } from '../../lib/dental';
import { useT } from '../../lib/i18n';

function emptyAttachment() {
  return { type: 'xray', url: '', caption: '' };
}

function nowLocalDatetime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function ClinicalNoteFormModal({ open, patientId, patient, onClose }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const formStatus = useSelector((s) => s.emr.formStatus);
  const formError = useSelector((s) => s.emr.formError);
  const currentUser = useSelector((s) => s.auth.user);

  const isDoctor = currentUser?.isDoctor;
  const [doctor, setDoctor] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [visitDate, setVisitDate] = useState(nowLocalDatetime());
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [examination, setExamination] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [plan, setPlan] = useState('');
  const [attachments, setAttachments] = useState([emptyAttachment()]);

  useEffect(() => {
    if (!open) return;
    setVisitDate(nowLocalDatetime());
    setChiefComplaint('');
    setExamination('');
    setDiagnosis('');
    setPlan('');
    setAttachments([emptyAttachment()]);
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

  const updateAttachment = (idx, field, value) => {
    setAttachments((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  };
  const addAttachment = () => setAttachments((prev) => [...prev, emptyAttachment()]);
  const removeAttachment = (idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!doctor) {
      dispatch(showErrorDialog({ message: t('emr.note.needDoctor') }));
      return;
    }
    const cleanAttachments = attachments
      .filter((a) => a.url.trim())
      .map((a) => ({ type: a.type, url: a.url.trim(), caption: a.caption?.trim() || undefined }));

    try {
      await dispatch(
        createNote({
          patientId,
          payload: {
            doctor,
            visitDate: visitDate ? new Date(visitDate).toISOString() : undefined,
            chiefComplaint: chiefComplaint.trim() || undefined,
            examination: examination.trim() || undefined,
            diagnosis: diagnosis.trim() || undefined,
            plan: plan.trim() || undefined,
            attachments: cleanAttachments.length ? cleanAttachments : undefined,
          },
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
      title={t('emr.note.new')}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={submit} disabled={formStatus === 'loading'} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            {formStatus === 'loading' ? t('common.saving') : t('emr.note.create')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.note.doctor')}</label>
            {isDoctor ? (
              <input value={currentUser?.name || ''} disabled className={`${inputCls} opacity-70`} />
            ) : (
              <select value={doctor} onChange={(e) => setDoctor(e.target.value)} className={inputCls}>
                <option value="">{t('emr.note.selectDoctor')}</option>
                {doctors.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.note.visitDate')}</label>
            <input type="datetime-local" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.note.chiefComplaint')}</label>
            <textarea value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} rows={2} className={`${inputCls} resize-none`} maxLength={1000} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.note.examination')}</label>
            <textarea value={examination} onChange={(e) => setExamination(e.target.value)} rows={2} className={`${inputCls} resize-none`} maxLength={2000} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.note.diagnosis')}</label>
            <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={2} className={`${inputCls} resize-none`} maxLength={1000} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.note.plan')}</label>
            <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={2} className={`${inputCls} resize-none`} maxLength={2000} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('emr.note.attachments')}</label>
            <button type="button" onClick={addAttachment} className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300">
              {t('emr.note.addAttachment')}
            </button>
          </div>
          <div className="space-y-2">
            {attachments.map((a, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <select value={a.type} onChange={(e) => updateAttachment(idx, 'type', e.target.value)} className={`${inputCls} w-32`} aria-label={t('emr.note.attachmentType')}>
                  {ATTACHMENT_TYPES.map((tp) => (
                    <option key={tp} value={tp}>{t(`emr.attachment.${tp}`)}</option>
                  ))}
                </select>
                <input value={a.url} onChange={(e) => updateAttachment(idx, 'url', e.target.value)} placeholder={t('emr.note.urlPlaceholder')} className={`${inputCls} flex-1`} />
                <input value={a.caption} onChange={(e) => updateAttachment(idx, 'caption', e.target.value)} placeholder={t('emr.note.caption')} className={`${inputCls} w-44`} />
                <button type="button" onClick={() => removeAttachment(idx)} disabled={attachments.length <= 1} className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 dark:hover:bg-rose-500/15" aria-label={t('common.cancel')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">{t('emr.note.attachmentHint')}</p>
        </div>
        {formError?.message && <p className="text-xs text-rose-600 dark:text-rose-400">{formError.message}</p>}
      </div>
    </Modal>
  );
}
