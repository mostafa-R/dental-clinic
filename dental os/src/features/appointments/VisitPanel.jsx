import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { updateAppointment, transitionAppointment } from './appointmentSlice';
import { showErrorDialog } from '../ui/uiSlice';
import StatusBadge from './StatusBadge';
import { nextStatusOptions, statusTKey } from './statuses';
import { useT } from '../../lib/i18n';
import { PhiField } from '../../lib/usePhi.jsx';
import { canViewEmr } from '../../lib/roles';
import api from '../../lib/axios';
import { formatMoney, formatTime } from '../../lib/format';

function toLocalInput(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function VisitPanel({ open, appointment, onClose }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useT();
  const currentUser = useSelector((s) => s.auth.user);
  const isDoctor = currentUser?.isDoctor;

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [chair, setChair] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [savingAppt, setSavingAppt] = useState(false);

  const [existingNote, setExistingNote] = useState(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [plan, setPlan] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [transitioning, setTransitioning] = useState(false);

  const [showPrescription, setShowPrescription] = useState(false);

  const [invoice, setInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [invItems, setInvItems] = useState([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [invDiscount, setInvDiscount] = useState('');
  const [invTax, setInvTax] = useState('');
  const [savingInvoice, setSavingInvoice] = useState(false);

  useEffect(() => {
    if (!open || !appointment) return;
    setStart(toLocalInput(appointment.start));
    setEnd(toLocalInput(appointment.end));
    setChair(appointment.chair || '');
    setReason(appointment.reason || '');
    setNotes(appointment.notes || '');
    setChiefComplaint('');
    setDiagnosis('');
    setPlan('');
    setExistingNote(null);

    if (appointment._id && appointment.patient?._id) {
      setLoadingNote(true);
      api
        .get(`/patients/${appointment.patient._id}/clinical-notes`, { params: { appointment: appointment._id, limit: 1 } })
        .then((r) => {
          const notes = r.data.data?.notes || [];
          if (notes.length > 0) {
            const note = notes[0];
            setExistingNote(note);
            setChiefComplaint(note.chiefComplaint || '');
            setDiagnosis(note.diagnosis || '');
            setPlan(note.plan || '');
          }
        })
        .catch(() => {})
        .finally(() => setLoadingNote(false));

      setLoadingInvoice(true);
      api
        .get('/billing', { params: { appointment: appointment._id, limit: 1 } })
        .then((r) => {
          const invoices = r.data.data?.invoices || [];
          if (invoices.length > 0) {
            const inv = invoices[0];
            setInvoice(inv);
            setInvItems(
              inv.items?.length > 0
                ? inv.items.map((it) => ({ description: it.description || '', quantity: it.quantity ?? 1, unitPrice: it.unitPrice ?? 0 }))
                : [{ description: '', quantity: 1, unitPrice: 0 }],
            );
            setInvDiscount(inv.discount ? String(inv.discount) : '');
            setInvTax(inv.tax ? String(inv.tax) : '');
          } else {
            setInvoice(null);
            setInvItems([{ description: '', quantity: 1, unitPrice: 0 }]);
            setInvDiscount('');
            setInvTax('');
          }
        })
        .catch(() => {})
        .finally(() => setLoadingInvoice(false));
    }
  }, [open, appointment]);

  const saveAppointment = async () => {
    if (!appointment) return;
    setSavingAppt(true);
    try {
      const payload = { chair, reason, notes };
      if (start) payload.start = new Date(start).toISOString();
      if (end) payload.end = new Date(end).toISOString();
      await dispatch(updateAppointment({ id: appointment._id, payload })).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setSavingAppt(false);
    }
  };

  const handleTransition = async (status) => {
    setTransitioning(true);
    try {
      await dispatch(transitionAppointment({ id: appointment._id, status })).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setTransitioning(false);
    }
  };

  const saveClinicalNote = async () => {
    if (!appointment?.patient?._id) return;
    setSavingNote(true);
    try {
      const payload = {
        doctor: appointment.doctor?._id || appointment.doctor,
        appointment: appointment._id,
        chiefComplaint: chiefComplaint.trim() || undefined,
        diagnosis: diagnosis.trim() || undefined,
        plan: plan.trim() || undefined,
      };
      if (existingNote) {
        await api.patch(`/patients/${appointment.patient._id}/clinical-notes/${existingNote._id}`, payload);
      } else {
        const result = await api.post(`/patients/${appointment.patient._id}/clinical-notes`, payload);
        setExistingNote(result.data.data?.note || result.data.data?.clinicalNote);
      }
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setSavingNote(false);
    }
  };

  const invSubtotal = invItems.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const invDiscountVal = Math.min(Number(invDiscount) || 0, invSubtotal);
  const invTaxVal = Math.max(Number(invTax) || 0, 0);
  const invTotal = invSubtotal - invDiscountVal + invTaxVal;

  const saveInvoice = async () => {
    const items = invItems
      .filter((it) => it.description.trim())
      .map((it) => ({ description: it.description.trim(), quantity: Number(it.quantity) || 1, unitPrice: Number(it.unitPrice) || 0 }));
    if (items.length === 0) {
      dispatch(showErrorDialog({ message: t('billing.form.addItem') }));
      return;
    }
    setSavingInvoice(true);
    try {
      const payload = { items };
      if (invDiscount !== '') payload.discount = Number(invDiscount) || 0;
      if (invTax !== '') payload.tax = Number(invTax) || 0;
      if (invoice) {
        const res = await api.patch(`/billing/${invoice._id}`, payload);
        setInvoice(res.data.data?.invoice);
      } else {
        const branchId = appointment.branch?._id || appointment.branch;
        const patientId = appointment.patient?._id || appointment.patient;
        if (!branchId) {
          dispatch(showErrorDialog({ message: t('appointments.form.selectBranch') }));
          setSavingInvoice(false);
          return;
        }
        const res = await api.post('/billing', { ...payload, patient: patientId, branch: branchId, appointment: appointment._id });
        setInvoice(res.data.data?.invoice);
      }
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setSavingInvoice(false);
    }
  };

  if (!appointment) return null;

  const patient = appointment.patient;
  const doctor = appointment.doctor;
  const options = nextStatusOptions(appointment.status);
  const inputCls =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/20';

  return (
    <>
      <Modal open={open} onClose={onClose} size="xl" title={
        <div className="flex items-center gap-3">
          <span className="truncate">{patient?.fullName || t('appointments.patientFallback')}</span>
          <StatusBadge status={appointment.status} />
          {canViewEmr() && patient?._id && (
            <button
              type="button"
              onClick={() => navigate(`/patients/${patient._id}/emr`)}
              className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
            >
              {t('emr.open')}
            </button>
          )}
        </div>
      }>
        <div className="space-y-6">
          {/* Patient & Doctor Info */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('appointments.form.patient')}</p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{patient?.fullName || '--'}</p>
              {patient?.phone && <p className="text-xs text-slate-500 dark:text-slate-400"><PhiField>{patient.phone}</PhiField></p>}
              {patient?.patientId && <p className="text-xs text-slate-400 dark:text-slate-500">#{patient.patientId}</p>}
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('appointments.form.doctor')}</p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{doctor?.name || '--'}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('appointments.form.start')}</p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                {appointment.start ? formatTime(appointment.start) : '--'}
                {appointment.end ? ` - ${formatTime(appointment.end)}` : ''}
              </p>
              {appointment.chair && <p className="text-xs text-slate-400 dark:text-slate-500">{appointment.chair}</p>}
            </div>
          </div>

          {/* Appointment Details */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('appointments.form.details')}</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t('appointments.form.start')}</label>
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t('appointments.form.end')}</label>
                <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t('appointments.form.chair')}</label>
                <input value={chair} onChange={(e) => setChair(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t('appointments.form.reason')}</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t('appointments.form.notes')}</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
              </div>
            </div>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={saveAppointment}
                disabled={savingAppt}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingAppt ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>

          {/* Clinical Note */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t('emr.note.visitNote')}
              {existingNote && <span className="ml-2 text-emerald-600 dark:text-emerald-400">&#10003;</span>}
            </h4>
            {loadingNote ? (
              <Spinner label={t('common.loading')} />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t('emr.note.chiefComplaint')}</label>
                    <textarea value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} rows={2} className={`${inputCls} resize-none`} maxLength={1000} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t('emr.note.diagnosis')}</label>
                    <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={2} className={`${inputCls} resize-none`} maxLength={1000} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t('emr.note.plan')}</label>
                    <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={2} className={`${inputCls} resize-none`} maxLength={2000} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPrescription(true)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {t('emr.rx.new')}
                  </button>
                  <button
                    type="button"
                    onClick={saveClinicalNote}
                    disabled={savingNote}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {savingNote ? t('common.saving') : existingNote ? t('common.save') : t('emr.note.create')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Invoice */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {t('billing.title')}
              </h4>
              {invoice && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                    {t('billing.col.invoice')} {invoice.invoiceNo} · {invoice.branch?.name || appointment.branch?.name || ''}
                  </span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                    invoice.status === 'partial' ? 'bg-amber-50 text-amber-700' :
                    invoice.status === 'void' ? 'bg-slate-100 text-slate-500' :
                    'bg-rose-50 text-rose-700'
                  }`}>
                    {t('invoice.status.' + invoice.status)}
                  </span>
                </div>
              )}
            </div>
            {loadingInvoice ? (
              <Spinner label={t('common.loading')} />
            ) : (
              <div className="space-y-2">
                {!invoice && appointment.branch && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {t('appointments.form.branch')}: {appointment.branch.name || appointment.branch}
                  </p>
                )}
                <div className="space-y-1.5">
                  {invItems.map((it, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input value={it.description} onChange={(e) => {
                        const next = [...invItems]; next[i] = { ...next[i], description: e.target.value }; setInvItems(next);
                      }} placeholder={t('billing.form.descriptionPlaceholder')} className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                      <input type="number" min="1" step="1" value={it.quantity} onChange={(e) => {
                        const next = [...invItems]; next[i] = { ...next[i], quantity: e.target.value }; setInvItems(next);
                      }} className="w-14 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-center outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                      <input type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => {
                        const next = [...invItems]; next[i] = { ...next[i], unitPrice: e.target.value }; setInvItems(next);
                      }} className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-right outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                      <span className="w-16 text-right text-xs text-slate-500 dark:text-slate-400">
                        {formatMoney((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))}
                      </span>
                      {invItems.length > 1 && (
                        <button type="button" onClick={() => setInvItems(invItems.filter((_, idx) => idx !== i))} className="p-1 text-slate-300 hover:text-red-500">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => setInvItems([...invItems, { description: '', quantity: 1, unitPrice: 0 }])} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
                    + {t('billing.form.addItem')}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    {t('billing.form.discount')}
                    <input type="number" min="0" step="0.01" value={invDiscount} onChange={(e) => setInvDiscount(e.target.value)} className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-right outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    {t('billing.form.tax')}
                    <input type="number" min="0" step="0.01" value={invTax} onChange={(e) => setInvTax(e.target.value)} className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-right outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                  </label>
                  <span className="ml-auto text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {t('billing.form.total')}: {formatMoney(invTotal)}
                  </span>
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={saveInvoice} disabled={savingInvoice} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50">
                    {savingInvoice ? t('common.saving') : invoice ? t('common.save') : t('billing.form.create')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Status Transitions */}
          {options.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('appointments.queue.status')}</h4>
              <div className="flex flex-wrap gap-2">
                {options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleTransition(opt)}
                    disabled={transitioning}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <span className="rtl:-scale-x-100 inline-block">→</span> {t(statusTKey(opt))}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Prescription Modal */}
      {showPrescription && patient?._id && (
        <PrescriptionModal
          patientId={patient._id}
          onClose={() => setShowPrescription(false)}
        />
      )}
    </>
  );
}

function PrescriptionModal({ patientId, onClose }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const [doctor, setDoctor] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [medication, setMedication] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [duration, setDuration] = useState('');
  const [saving, setSaving] = useState(false);

  const currentUser = useSelector((s) => s.auth.user);
  const isDoctor = currentUser?.isDoctor;

  useEffect(() => {
    if (isDoctor) {
      setDoctor(currentUser._id);
    } else {
      api.get('/users/doctors').then((r) => setDoctors(r.data.data.doctors || [])).catch(() => {});
    }
  }, [isDoctor, currentUser]);

  const submit = async () => {
    if (!medication.trim() || !doctor) return;
    setSaving(true);
    try {
      await api.post(`/patients/${patientId}/prescriptions`, {
        doctor,
        medications: [{ name: medication.trim(), dosage: dosage.trim(), frequency: frequency.trim(), duration: duration.trim() }],
      });
      onClose();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/20';

  return (
    <Modal open onClose={onClose} title={t('emr.rx.new')} size="sm" zIndex={60}>
      <div className="space-y-3">
        {!isDoctor && (
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t('emr.note.doctor')}</label>
            <select value={doctor} onChange={(e) => setDoctor(e.target.value)} className={inputCls}>
              <option value="">{t('emr.note.selectDoctor')}</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t('emr.rx.medName')} <span className="text-red-500">*</span></label>
          <input value={medication} onChange={(e) => setMedication(e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t('emr.rx.dosage')}</label>
            <input value={dosage} onChange={(e) => setDosage(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t('emr.rx.frequency')}</label>
            <input value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t('emr.rx.duration')}</label>
            <input value={duration} onChange={(e) => setDuration(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={submit} disabled={saving || !medication.trim()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50">
            {saving ? t('common.saving') : t('emr.rx.create')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
