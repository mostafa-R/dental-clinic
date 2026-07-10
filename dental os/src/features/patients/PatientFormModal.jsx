import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { showErrorDialog } from '../ui/uiSlice';
import { fetchBranches } from '../branches/branchSlice';
import { createPatient, resetFormState, updatePatient } from './patientSlice';
import { useT } from '../../lib/i18n';

const GENDERS = [
  { value: 'male', key: 'patients.gender.male' },
  { value: 'female', key: 'patients.gender.female' },
  { value: 'other', key: 'patients.gender.other' },
];

const EMPTY = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  dateOfBirth: '',
  gender: 'male',
  address: '',
  branch: '',
  chronicConditions: [],
  allergies: [],
  notes: '',
};

function toDateInput(dob) {
  if (!dob) return '';
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function fromForm(form, isSuperAdmin) {
  const payload = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    gender: form.gender,
    address: form.address.trim(),
  };
  if (isSuperAdmin && form.branch) {
    payload.branch = form.branch;
  }
  if (form.dateOfBirth) {
    const d = new Date(form.dateOfBirth);
    payload.dateOfBirth = Number.isNaN(d.getTime()) ? '' : d.toISOString();
  } else {
    payload.dateOfBirth = '';
  }
  payload.medicalHistory = {
    chronicConditions: form.chronicConditions.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim() })),
    allergies: form.allergies.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim() })),
    notes: form.notes.trim(),
  };
  return payload;
}

function ConditionList({ label, items, onChange, addLabel, noneLabel, placeholder }) {
  const update = (i, value) => {
    const next = [...items];
    next[i] = { name: value };
    onChange(next);
  };
  const add = () => onChange([...items, { name: '' }]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
        <button type="button" onClick={add} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
          {addLabel}
        </button>
      </div>
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500">{noneLabel}</p>
        )}
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              value={item.name}
              onChange={(e) => update(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded-md px-2 text-slate-400 transition hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
              aria-label="Remove"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PatientFormModal({ open, patient, onClose, onSaved }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const { formStatus } = useSelector((s) => s.patients);
  const { items: branches, status: branchesStatus } = useSelector((s) => s.branches);
  const myPermissions = useSelector((s) => s.users.myPermissions);
  const isSuperAdmin = myPermissions?.isSystemAdmin ?? false;
  const isEdit = Boolean(patient);

  const [form, setForm] = useState(EMPTY);

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

  useEffect(() => {
    if (open && isSuperAdmin && branchesStatus === 'idle') {
      dispatch(fetchBranches({ isActive: 'true' }));
    }
  }, [open, isSuperAdmin, branchesStatus, dispatch]);

  useEffect(() => {
    if (open) {
      if (patient) {
        setForm({
          firstName: patient.firstName || '',
          lastName: patient.lastName || '',
          phone: patient.phone || '',
          email: patient.email || '',
          dateOfBirth: toDateInput(patient.dateOfBirth),
          gender: patient.gender || 'unknown',
          address: patient.address || '',
          branch: patient.branch?._id || patient.branch || '',
          chronicConditions: patient.medicalHistory?.chronicConditions?.map((c) => ({ name: c.name })) || [],
          allergies: patient.medicalHistory?.allergies?.map((c) => ({ name: c.name })) || [],
          notes: patient.medicalHistory?.notes || '',
        });
      } else {
        setForm({ ...EMPTY, branch: branches[0]?._id || '' });
      }
      dispatch(resetFormState());
    }
  }, [open, patient, dispatch, branches]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submitting = formStatus === 'loading';

  const onSubmit = async (e) => {
    e.preventDefault();
    const payload = fromForm(form, isSuperAdmin);
    try {
      if (isEdit) {
        await dispatch(updatePatient({ id: patient._id, payload })).unwrap();
      } else {
        await dispatch(createPatient(payload)).unwrap();
      }
      onSaved?.();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? t('patients.form.edit') : t('patients.form.new')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="patient-form"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {submitting ? t('common.saving') : isEdit ? t('common.save') : t('patients.form.create')}
          </button>
        </>
      }
    >
      {formStatus === 'loading' && (
        <div className="mb-3"><Spinner label={t('common.saving')} /></div>
      )}

      <form id="patient-form" onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('patients.form.firstName')} required>
            <input value={form.firstName} onChange={set('firstName')} required className={inputCls} />
          </Field>
          <Field label={t('patients.form.lastName')} required>
            <input value={form.lastName} onChange={set('lastName')} required className={inputCls} />
          </Field>
          <Field label={t('patients.form.phone')} required>
            <input value={form.phone} onChange={set('phone')} required className={inputCls} />
          </Field>
          <Field label={t('patients.form.email')}>
            <input type="email" value={form.email} onChange={set('email')} className={inputCls} />
          </Field>
          <Field label={t('patients.form.dob')}>
            <input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} className={inputCls} />
          </Field>
          <Field label={t('patients.form.gender')}>
            <select value={form.gender} onChange={set('gender')} className={inputCls}>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>{t(g.key)}</option>
              ))}
            </select>
          </Field>
          {isSuperAdmin && (
            <Field label={t('patients.form.branch')} required>
              <select
                value={form.branch}
                onChange={set('branch')}
                required
                disabled={branchesStatus === 'loading'}
                className={inputCls}
              >
                <option value="" disabled>
                  {branchesStatus === 'loading' ? t('common.loading') : t('patients.form.selectBranch')}
                </option>
                {branches.map((b) => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <Field label={t('patients.form.address')}>
          <textarea value={form.address} onChange={set('address')} rows={2} className={inputCls} />
        </Field>

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{t('patients.form.medicalHistory')}</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ConditionList
              label={t('patients.form.chronicConditions')}
              items={form.chronicConditions}
              onChange={(v) => setForm((f) => ({ ...f, chronicConditions: v }))}
              addLabel={t('common.add')}
              noneLabel={t('common.none')}
              placeholder="e.g. Diabetes"
            />
            <ConditionList
              label={t('patients.form.allergies')}
              items={form.allergies}
              onChange={(v) => setForm((f) => ({ ...f, allergies: v }))}
              addLabel={t('common.add')}
              noneLabel={t('common.none')}
              placeholder="e.g. Penicillin"
            />
          </div>
          <div className="mt-4">
            <Field label={t('patients.form.notes')}>
              <textarea value={form.notes} onChange={set('notes')} rows={3} className={inputCls} />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
