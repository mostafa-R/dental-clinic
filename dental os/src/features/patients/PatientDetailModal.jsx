import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { formatDate } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { canViewEmr } from '../../lib/roles';
import { PhiField } from '../../lib/usePhi.jsx';

function genderLabel(gender, t) {
  switch (gender) {
    case 'male':
      return t('patients.gender.male');
    case 'female':
      return t('patients.gender.female');
    case 'other':
      return t('patients.gender.other');
    default:
      return t('patients.gender.unknown');
  }
}

function Row({ label, value, phi }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-end text-sm font-medium text-slate-900 dark:text-white">
        {phi ? <PhiField>{value}</PhiField> : (value || '—')}
      </dd>
    </div>
  );
}

function ConditionSection({ title, items, noneLabel, phi }) {
  const list = items?.filter((c) => c.name?.trim());
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{title}</h4>
      {phi && list?.length ? (
        <p className="text-sm text-slate-400 italic">***</p>
      ) : list?.length ? (
        <div className="flex flex-wrap gap-2">
          {list.map((c, i) => (
            <span key={i} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              {c.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 dark:text-slate-500">{noneLabel}</p>
      )}
    </div>
  );
}

export default function PatientDetailModal({ open, patient, onClose }) {
  const { t } = useT();
  const navigate = useNavigate();
  const canOpenEmr = canViewEmr();

  const openEmr = () => {
    onClose?.();
    if (patient?._id) navigate(`/patients/${patient._id}/emr`);
  };

  const footer = patient && canOpenEmr ? (
    <button
      type="button"
      onClick={openEmr}
      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
    >
      {t('emr.open')}
    </button>
  ) : null;

  return (
    <Modal open={open} title={t('patients.detail.title')} onClose={onClose} size="lg" footer={footer}>
      {!patient ? (
        <EmptyState title={t('patients.detail.none')} />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-xl font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
              {patient.firstName?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{patient.fullName}</h3>
              <p className="font-mono text-xs text-slate-400 dark:text-slate-500">{patient.patientId}</p>
            </div>
            <span
              className={`ms-auto rounded-full px-3 py-1 text-xs font-medium ${
                patient.isActive
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-300'
              }`}
            >
              {patient.isActive ? t('common.active') : t('common.archived')}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              <Row label={t('patients.col.phone')} value={patient.phone} phi />
              <Row label={t('patients.form.email')} value={patient.email} phi />
              <Row label={t('patients.detail.age')} value={patient.age != null ? t('patients.detail.ageYears', { age: patient.age }) : null} />
              <Row label={t('patients.form.gender')} value={genderLabel(patient.gender, t)} />
            </dl>
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              <Row label={t('patients.form.branch')} value={patient.branch?.name} />
              <Row label={t('patients.form.address')} value={patient.address} phi />
              <Row label={t('patients.form.dob')} value={patient.dateOfBirth ? formatDate(patient.dateOfBirth) : null} />
              <Row label={t('patients.col.registered')} value={formatDate(patient.createdAt)} />
            </dl>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="space-y-4">
              <ConditionSection title={t('patients.form.chronicConditions')} phi items={patient.medicalHistory?.chronicConditions} noneLabel={t('common.none')} />
              <ConditionSection title={t('patients.form.allergies')} phi items={patient.medicalHistory?.allergies} noneLabel={t('common.none')} />
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('patients.form.notes')}</h4>
                <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                  <PhiField>{patient.medicalHistory?.notes || '—'}</PhiField>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
