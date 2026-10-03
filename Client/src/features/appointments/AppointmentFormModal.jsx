import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { showErrorDialog } from '../ui/uiSlice';
import { fetchBranches } from '../branches/branchSlice';
import { patientApi } from '../patients/patientApi';
import { createAppointment, resetFormState, updateAppointment } from './appointmentSlice';
import api from '../../lib/axios';
import { errPayload } from '../../lib/errors';
import { useT } from '../../lib/i18n';
import { formatMoney } from '../../lib/format';
import { toDateTimeInputValue, fromDateTimeInputValue } from '../../lib/clinicTime';
import { useIsClinicWide } from '../../lib/roles';

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

const PATIENT_PAGE = 20;
const PATIENT_SEARCH_DEBOUNCE_MS = 300;
// Must match `maxLength: 100` on `search` in server listPatientsQuerySchema.
const PATIENT_SEARCH_MAX = 100;

export default function AppointmentFormModal({ open, appointment, defaultStart, onClose, onSaved }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const { formStatus } = useSelector((s) => s.appointments);
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
  const [patientOptions, setPatientOptions] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  // The input is a free-text field backed by a datalist, so it has to render a
  // label rather than an id. Held separately from `patientSearch` because the
  // server search only returns the current page of matches and will not contain
  // the patient already attached to the appointment being edited.
  const [selectedPatientName, setSelectedPatientName] = useState('');
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
      if (canPickBranch && branchesStatus === 'idle') dispatch(fetchBranches({ isActive: 'true' }));
    }
  }, [dispatch, open, canPickBranch, branchesStatus, t]);

  // Patient lookup used to be `fetchPatients({ page: 1, limit: 100 })` into the
  // shared patients slice, then filtered in the browser. Two failures: the cap
  // made patient 101 unreachable for anyone booking, and the slice was shared
  // with the Patients page, so once that page had loaded its own page 1 the
  // status was no longer 'idle' and this modal silently reused it. Search is
  // server-side now.
  //
  // `patientRequestId` is a stale-response guard, not a cancellation: an
  // in-flight request still completes, but its result is discarded if a newer
  // search started meanwhile or the modal closed. That is deliberate — aborting
  // would also cancel the shared axios request, and there is only ever one page
  // of cheap reads in flight.
  const patientSearchTimer = useRef(null);
  const patientRequestId = useRef(0);

  useEffect(() => {
    if (!open) return undefined;
    clearTimeout(patientSearchTimer.current);
    // Trim + clamp to the server's `maxLength: 100` on `search`; a longer
    // pasted value would be rejected with a 400 rather than searched.
    const term = patientSearch.trim().slice(0, PATIENT_SEARCH_MAX);

    patientSearchTimer.current = setTimeout(() => {
      const requestId = patientRequestId.current + 1;
      patientRequestId.current = requestId;
      setPatientsLoading(true);
      patientApi
        .list({ search: term || undefined, page: 1, limit: PATIENT_PAGE, isActive: 'true' })
        .then((data) => {
          if (patientRequestId.current !== requestId) return;
          setPatientOptions(Array.isArray(data?.patients) ? data.patients : []);
        })
        .catch(() => {
          if (patientRequestId.current !== requestId) return;
          // Leave the field usable; a failed lookup is not worth blocking the form over.
          setPatientOptions([]);
        })
        .finally(() => {
          if (patientRequestId.current === requestId) setPatientsLoading(false);
        });
    }, PATIENT_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(patientSearchTimer.current);
      // Invalidate anything still in flight so it cannot repopulate the list
      // after the modal closes.
      patientRequestId.current += 1;
    };
  }, [open, patientSearch]);

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setForm({
        patient: appointment.patient?._id || appointment.patient || '',
        doctor: appointment.doctor?._id || appointment.doctor || '',
        branch: appointment.branch?._id || appointment.branch || '',
        chair: appointment.chair || '',
        start: toDateTimeInputValue(appointment.start),
        end: toDateTimeInputValue(appointment.end),
        reason: appointment.reason || '',
        notes: appointment.notes || '',
      });
      setPatientSearch('');
      setSelectedPatientName(
        typeof appointment.patient === 'object' ? appointment.patient?.fullName || '' : '',
      );
    } else {
      // Clean slate: never carry the previously edited appointment's branch
      // into a new one. The default is applied by the effect below, once the
      // branch list has loaded.
      setForm({ ...EMPTY, start: defaultStart ? toDateTimeInputValue(defaultStart) : '' });
      setPatientSearch('');
      setSelectedPatientName('');
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
    // `new Date(form.start)` parsed the datetime-local value in the *browser's*
    // zone, so a 09:00 slot chosen in a Cairo clinic was stored as 09:00 in
    // whatever zone the receptionist's laptop was set to — a silent multi-hour
    // error on every appointment. The wall clock belongs to the clinic.
    if (form.start) payload.start = fromDateTimeInputValue(form.start)?.toISOString();
    if (form.end) payload.end = fromDateTimeInputValue(form.end)?.toISOString();
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
          // These two are conveniences layered on top of a booking that has
          // already succeeded, so a failure here must not reject the booking or
          // close the modal — but it must not be silent either. A swallowed
          // error left the appointment on the schedule with no clinical note and
          // no invoice, and nothing in the UI to say so.
          if (patientId && doctorId) {
            try {
              await api.post(`/patients/${patientId}/clinical-notes`, {
                doctor: doctorId,
                appointment: newAppt._id,
                chiefComplaint: (form.reason || '').trim() || undefined,
              });
            } catch (err) {
              dispatch(showErrorDialog(errPayload(err, t('appointments.form.clinicalNoteFailed'))));
            }
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
              try {
                await api.post('/billing', {
                  patient: patientId,
                  branch: branchId,
                  appointment: newAppt._id,
                  items,
                });
              } catch (err) {
                dispatch(showErrorDialog(errPayload(err, t('appointments.form.invoiceFailed'))));
              }
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
              value={selectedPatientName || patientSearch}
              onChange={(e) => {
                const val = e.target.value;
                // A datalist selection gives back the `value` attribute exactly,
                // so matching on fullName is reliable for a picked option and
                // yields no match while the user is still typing.
                const match = patientOptions.find((p) => p.fullName === val);
                setForm((f) => ({ ...f, patient: match ? match._id : '' }));
                setSelectedPatientName(match ? match.fullName : '');
                setPatientSearch(val);
              }}
              placeholder={t('appointments.form.patientPlaceholder')}
              required
              aria-describedby="patient-options-status"
              className={inputCls}
            />
            <datalist id="patient-options">
              {patientOptions.map((p) => (
                <option key={p._id} value={p.fullName}>
                  {p.patientId} · {p.phone}
                </option>
              ))}
            </datalist>
            <span id="patient-options-status" className="sr-only" role="status">
              {patientsLoading ? t('common.loading') : ''}
            </span>
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
