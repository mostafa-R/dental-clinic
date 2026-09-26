import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { showErrorDialog } from '../ui/uiSlice';
import { fetchBranches } from '../branches/branchSlice';
import { fetchPatients } from '../patients/patientSlice';
import { createAppointment, resetFormState, updateAppointment } from './appointmentSlice';
import api from '../../lib/axios';
import { useT } from '../../lib/i18n';
import { formatMoney } from '../../lib/format';
import { useIsClinicWide } from '../../lib/roles';

function toLocalInput(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

const EMPTY = {
  patient: '',
  doctor: '',
  branch: '',
  chair: '',
  start: '',
  end: '',
  reason: '',
  notes: '',
};

export default function AppointmentFormModal({ open, appointment, defaultStart, onClose, onSaved }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const { formStatus } = useSelector((s) => s.appointments);
  const { items: patients, status: patientsStatus } = useSelector((s) => s.patients);
  const { items: branches, status: branchesStatus } = useSelector((s) => s.branches);
  // The branch picker is shown to any clinic-wide role, not just system admins:
  // the server's `resolveBranchForCreate` requires an explicit branch from them,
  // so hiding this field would make every create fail with "branch is required".
  const canPickBranch = useIsClinicWide();
  const isEdit = Boolean(appointment);

  const [form, setForm] = useState(EMPTY);
  const [doctors, setDoctors] = useState([]);
  const [doctorsError, setDoctorsError] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [invItems, setInvItems] = useState([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [showInvoiceSection, setShowInvoiceSection] = useState(false);

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 sm:py-2';

  useEffect(() => {
    if (open) {
      // A silent failure here left an empty doctor dropdown that looked like
      // "no doctors configured", and the appointment could not be saved
      // without a doctor. Report it instead.
      setDoctorsError('');
      api
        .get('/users/doctors')
        .then((d) => setDoctors(d.data.data.doctors))
        .catch(() => {
          setDoctors([]);
          setDoctorsError(t('common.loadFailedList'));
          dispatch(showErrorDialog({ message: t('common.loadFailedList') }));
        });
      if (patientsStatus === 'idle') dispatch(fetchPatients({ page: 1, limit: 100 }));
      if (canPickBranch && branchesStatus === 'idle') dispatch(fetchBranches({ isActive: 'true' }));
    }
  }, [dispatch, open, canPickBranch, branchesStatus, patientsStatus, t]);

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setForm({
        patient: appointment.patient?._id || appointment.patient || '',
        doctor: appointment.doctor?._id || appointment.doctor || '',
        branch: appointment.branch?._id || appointment.branch || '',
        chair: appointment.chair || '',
        start: toLocalInput(appointment.start),
        end: toLocalInput(appointment.end),
        reason: appointment.reason || '',
        notes: appointment.notes || '',
      });
      setPatientSearch('');
    } else {
      // Clean slate: never carry the previously edited appointment's branch
      // into a new one. The default is applied by the effect below, once the
      // branch list has loaded.
      setForm({ ...EMPTY, start: defaultStart ? toLocalInput(defaultStart) : '' });
      setPatientSearch('');
    }
    dispatch(resetFormState());
  }, [open, appointment, defaultStart, dispatch]);

  // Default a new appointment to the first available branch, but only once the
  // list has loaded and only while the field is untouched. Kept separate from
  // the reset effect so a late-arriving branch list cannot wipe typed input.
  useEffect(() => {
    if (!open || appointment) return;
    setForm((f) => (f.branch || !branches?.length ? f : { ...f, branch: branches[0]._id }));
  }, [open, appointment, branches]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submitting = formStatus === 'loading';

  const filteredPatients = patientSearch
    ? patients.filter(
        (p) =>
          p.fullName?.toLowerCase().includes(patientSearch.toLowerCase()) ||
          p.phone?.includes(patientSearch) ||
          p.patientId?.toLowerCase().includes(patientSearch.toLowerCase()),
      )
    : patients.slice(0, 20);

  const invSubtotal = useMemo(
    () => invItems.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0),
    [invItems],
  );

  const onSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      patient: form.patient,
      doctor: form.doctor,
      chair: form.chair,
      reason: form.reason,
      notes: form.notes,
    };
    if (form.start) payload.start = new Date(form.start).toISOString();
    if (form.end) payload.end = new Date(form.end).toISOString();
    if (canPickBranch && form.branch) payload.branch = form.branch;

    try {
      if (isEdit) {
        await dispatch(updateAppointment({ id: appointment._id, payload })).unwrap();
      } else {
        const newAppt = await dispatch(createAppointment(payload)).unwrap();
        if (newAppt?._id) {
          const patientId = newAppt.patient?._id || newAppt.patient;
          const doctorId = newAppt.doctor?._id || newAppt.doctor;
          const branchId = newAppt.branch?._id || newAppt.branch;
          if (patientId && doctorId) {
              api
                .post(`/patients/${patientId}/clinical-notes`, {
                  doctor: doctorId,
                  appointment: newAppt._id,
                  chiefComplaint: (form.reason || '').trim() || undefined,
                })
                .catch((err) => { if (import.meta.env.DEV) console.error('Auto-create clinical note failed', err?.response?.data || err); });
            }
            if (patientId && branchId) {
              const items = invItems
                .filter((it) => it.description.trim())
                .map((it) => ({
                  description: it.description.trim(),
                  quantity: Number(it.quantity) || 1,
                  unitPrice: Number(it.unitPrice) || 0,
                }));
              if (items.length > 0) {
                api
                  .post('/billing', {
                    patient: patientId,
                    branch: branchId,
                    appointment: newAppt._id,
                    items,
                  })
                  .catch((err) => { if (import.meta.env.DEV) console.error('Auto-create invoice failed', err?.response?.data || err); });
              }
            }
        }
      }
      onSaved?.();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const labelCls = 'mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200';

  return (
    <Modal
      open={open}
      title={isEdit ? t('appointments.form.edit') : t('appointments.form.new')}
      onClose={onClose}
      size="xl"
      fullScreenMobile
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:flex-none"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="appointment-form"
            disabled={submitting}
            className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand/25 transition hover:bg-brand-dark active:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60 dark:bg-brand dark:hover:bg-brand-dark sm:flex-none"
          >
            {submitting ? t('common.saving') : isEdit ? t('common.save') : t('appointments.form.book')}
          </button>
        </>
      }
    >
      {formStatus === 'loading' && (
        <div className="mb-3"><Spinner label={t('common.saving')} /></div>
      )}

      <form id="appointment-form" onSubmit={onSubmit} className="space-y-3 sm:space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <label className="block">
            <span className={labelCls}>{t('appointments.form.patient')} <span className="text-red-500">*</span></span>
            <input
              list="patient-options"
              value={form.patient ? (patients.find((p) => p._id === form.patient)?.fullName || patientSearch) : patientSearch}
              onChange={(e) => {
                const val = e.target.value;
                const match = patients.find((p) => p.fullName === val);
                setForm((f) => ({ ...f, patient: match ? match._id : '' }));
                setPatientSearch(val);
              }}
              placeholder={t('appointments.form.patientPlaceholder')}
              required
              className={inputCls}
            />
            <datalist id="patient-options">
              {filteredPatients.map((p) => (
                <option key={p._id} value={p.fullName}>
                  {p.patientId} · {p.phone}
                </option>
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className={labelCls}>{t('appointments.form.doctor')} <span className="text-red-500">*</span></span>
            <select
              value={form.doctor}
              onChange={set('doctor')}
              required
              aria-label={t('appointments.form.doctor')}
              aria-invalid={doctorsError ? 'true' : undefined}
              className={inputCls}
            >
              <option value="" disabled>{t('appointments.form.selectDoctor')}</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
            {doctorsError && (
              <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{doctorsError}</span>
            )}
          </label>

          <label className="block">
            <span className={labelCls}>{t('appointments.form.start')}</span>
            <input type="datetime-local" value={form.start} onChange={set('start')} className={inputCls} />
          </label>

          <label className="block">
            <span className={labelCls}>{t('appointments.form.end')}</span>
            <input type="datetime-local" value={form.end} onChange={set('end')} className={inputCls} />
          </label>

          <label className="block">
            <span className={labelCls}>{t('appointments.form.chair')}</span>
            <input value={form.chair} onChange={set('chair')} placeholder={t('appointments.form.chairPlaceholder')} className={inputCls} />
          </label>

            {canPickBranch && (

            <label className="block">
              <span className={labelCls}>{t('appointments.form.branch')} <span className="text-red-500">*</span></span>
              <select value={form.branch} onChange={set('branch')} required disabled={branchesStatus === 'loading'} className={inputCls}>
                <option value="" disabled>{branchesStatus === 'loading' ? t('common.loading') : t('appointments.form.selectBranch')}</option>
                {branches.map((b) => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <label className="block">
          <span className={labelCls}>{t('appointments.form.reason')}</span>
          <input value={form.reason} onChange={set('reason')} placeholder={t('appointments.form.reasonPlaceholder')} className={inputCls} />
        </label>

        <label className="block">
          <span className={labelCls}>{t('appointments.form.notes')}</span>
          <textarea value={form.notes} onChange={set('notes')} rows={2} className={inputCls} />
        </label>

        {!isEdit && (
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowInvoiceSection((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-dark dark:text-brand-light"
            >
              <svg className={`transition ${showInvoiceSection ? 'rotate-90' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
              {showInvoiceSection ? t('billing.form.lineItems') : `+ ${t('billing.form.addItem')}`}
              {invItems.some((it) => it.description.trim()) && (
                <span className="text-emerald-600 dark:text-emerald-400">&#10003;</span>
              )}
            </button>

            {showInvoiceSection && (
              <div className="mt-2 space-y-1.5">
                {invItems.map((it, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input value={it.description} onChange={(e) => {
                      const next = [...invItems]; next[i] = { ...next[i], description: e.target.value }; setInvItems(next);
                    }} placeholder={t('billing.form.descriptionPlaceholder')} className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                    <input type="number" min="1" step="1" value={it.quantity} onChange={(e) => {
                      const next = [...invItems]; next[i] = { ...next[i], quantity: e.target.value }; setInvItems(next);
                    }} className="w-14 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-center outline-none focus:border-brand dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                    <input type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => {
                      const next = [...invItems]; next[i] = { ...next[i], unitPrice: e.target.value }; setInvItems(next);
                    }} className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-right outline-none focus:border-brand dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                    <span className="w-16 text-right text-xs text-slate-500 dark:text-slate-400">
                      {formatMoney((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))}
                    </span>
                    {invItems.length > 1 && (
                      <button type="button" aria-label={t('common.remove')} onClick={() => setInvItems(invItems.filter((_, idx) => idx !== i))} className="p-1 text-slate-300 hover:text-red-500">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => setInvItems([...invItems, { description: '', quantity: 1, unitPrice: 0 }])} className="text-xs font-medium text-brand hover:text-brand-dark dark:text-brand-light">
                    + {t('billing.form.addItem')}
                  </button>
                  {invSubtotal > 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {t('billing.form.subtotal')}: {formatMoney(invSubtotal)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
