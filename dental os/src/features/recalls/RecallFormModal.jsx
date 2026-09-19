import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { createRecall, postponeRecall, scheduleRecall, resetRecallForm } from './recallSlice';
import { patientApi } from '../patients/patientApi';
import { showErrorDialog } from '../ui/uiSlice';
import { useT } from '../../lib/i18n';

const TYPES = ['hygiene', 'follow_up', 'treatment_review', 'post_procedure', 'periodic_check', 'custom'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand dark:focus:ring-brand/20';
const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500';

function isObjectId(value) {
  return /^[0-9a-f]{24}$/i.test(value);
}

function toLocalInput(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Modes: create | postpone | schedule.
 * - create: picks a patient (async search), type, due date; posts { fdi-free
 *   recall payload } to POST /recalls.
 * - postpone: postponedUntil + notes → POST /recalls/:id/postpone.
 * - schedule: appointmentId → POST /recalls/:id/schedule.
 */
export default function RecallFormModal({ open, mode = 'create', recall, onClose }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const formStatus = useSelector((s) => s.recalls.formStatus);

  const [patientQuery, setPatientQuery] = useState('');
  const [patientOptions, setPatientOptions] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [recallType, setRecallType] = useState('follow_up');
  const [reason, setReason] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [notes, setNotes] = useState('');
  const [postponedUntil, setPostponedUntil] = useState('');
  const [appointmentId, setAppointmentId] = useState('');

  useEffect(() => {
    if (!open) return;
    dispatch(resetRecallForm());
    setPatientQuery('');
    setPatientOptions([]);
    setPatientId('');
    setRecallType(recall?.recallType || 'follow_up');
    setReason(recall?.reason || '');
    setDueDate(recall ? toLocalInput(recall.dueDate) : '');
    setPriority(recall?.priority || 'normal');
    setNotes('');
    setPostponedUntil('');
    setAppointmentId('');
  }, [open, dispatch, recall]);

  useEffect(() => {
    if (!open || mode !== 'create') return;
    if (patientQuery.trim().length < 2) {
      setPatientOptions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await (patientApi.list
          ? patientApi.list({ search: patientQuery.trim(), limit: 8 })
          : Promise.resolve({ patients: [] }));
        setPatientOptions(data.patients || data.items || []);
      } catch {
        setPatientOptions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [open, mode, patientQuery]);

  const canSubmit = useMemo(() => {
    if (mode === 'create') return !!patientId && !!dueDate;
    if (mode === 'postpone') return !!postponedUntil;
    if (mode === 'schedule') return isObjectId(appointmentId.trim());
    return false;
  }, [mode, patientId, dueDate, postponedUntil, appointmentId]);

  const submit = async () => {
    try {
      if (mode === 'create') {
        await dispatch(createRecall({
          patient: patientId,
          recallType,
          reason: reason.trim() || undefined,
          dueDate: new Date(dueDate).toISOString(),
          priority,
          notes: notes.trim() || undefined,
        })).unwrap();
      } else if (mode === 'postpone') {
        await dispatch(postponeRecall({
          id: recall._id,
          payload: {
            postponedUntil: new Date(postponedUntil).toISOString(),
            notes: notes.trim() || undefined,
          },
        })).unwrap();
      } else {
        await dispatch(scheduleRecall({
          id: recall._id,
          payload: { appointmentId: appointmentId.trim() },
        })).unwrap();
      }
      onClose();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const titles = { create: t('recall.new'), postpone: t('recall.postpone'), schedule: t('recall.schedule') };

  return (
    <Modal open={open} onClose={onClose} title={titles[mode] || titles.create}>
      <form id="recall-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        {mode === 'create' && (
          <>
            <div>
              <label className={labelCls}>{t('recall.patient')}</label>
              <input
                value={patientQuery}
                onChange={(e) => { setPatientQuery(e.target.value); setPatientId(''); }}
                placeholder={t('recall.patientSearchHint')}
                className={inputCls}
              />
              {patientOptions.length > 0 && !patientId && (
                <div className="mt-1 max-h-40 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  {patientOptions.map((p) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => { setPatientId(p._id); setPatientQuery(`${p.firstName || ''} ${p.lastName || ''} · ${p.patientId || ''}`.trim()); setPatientOptions([]); }}
                      className="block w-full px-3 py-2 text-start text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {p.firstName} {p.lastName} <span className="text-xs text-slate-400">· {p.patientId} · {p.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('recall.type')}</label>
                <select value={recallType} onChange={(e) => setRecallType(e.target.value)} className={inputCls}>
                  {TYPES.map((ty) => <option key={ty} value={ty}>{t(`recall.type.${ty}`)}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('recall.priority')}</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{t(`recall.priority.${p}`)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>{t('recall.dueDate')}</label>
              <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('recall.reason')}</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} maxLength={500} />
            </div>
            <div>
              <label className={labelCls}>{t('recall.notes')}</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} maxLength={2000} />
            </div>
          </>
        )}
        {mode === 'postpone' && (
          <>
            <div>
              <label className={labelCls}>{t('recall.postponedUntil')}</label>
              <input type="datetime-local" value={postponedUntil} onChange={(e) => setPostponedUntil(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('recall.notes')}</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} maxLength={2000} />
            </div>
          </>
        )}
        {mode === 'schedule' && (
          <div>
            <label className={labelCls}>{t('recall.appointmentId')}</label>
            <input
              value={appointmentId}
              onChange={(e) => setAppointmentId(e.target.value)}
              placeholder={t('recall.appointmentIdHint')}
              className={`${inputCls} font-mono`}
              maxLength={24}
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="recall-form" disabled={!canSubmit || formStatus === 'loading'}>
            {formStatus === 'loading' ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
