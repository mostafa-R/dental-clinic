import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { archivePatient } from './patientSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { canManagePatients, canViewEmr } from '../../lib/roles';
import { formatDate, formatNumber } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { PhiField } from '../../hooks/usePhi';

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

export default function PatientsTable({ onView, onEdit }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useT();
  const { items } = useSelector((s) => s.patients);
  const canManage = canManagePatients();
  const canOpenEmr = canViewEmr();
  const [archivingId, setArchivingId] = useState(null);

  const onArchive = async (patient) => {
    if (!window.confirm(t('patients.archiveConfirm', { name: patient.fullName }))) return;
    setArchivingId(patient._id);
    try {
      await dispatch(archivePatient(patient._id)).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setArchivingId(null);
    }
  };

  if (!items.length) {
    return (
      <div className="px-5 py-16 text-center text-sm text-slate-400 dark:text-slate-500">
        {t('patients.empty')}
      </div>
    );
  }

  const thCls = 'px-5 py-3 font-medium text-slate-400 dark:text-slate-500';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
            <th className={thCls}>{t('patients.col.patientId')}</th>
            <th className={thCls}>{t('patients.col.name')}</th>
            <th className={thCls}>{t('patients.col.phone')}</th>
            <th className={thCls}>{t('patients.col.ageGender')}</th>
            <th className={thCls}>{t('patients.col.branch')}</th>
            <th className={thCls}>{t('patients.col.registered')}</th>
            <th className={thCls}>{t('patients.col.status')}</th>
            <th className={`${thCls} text-end`}>{t('patients.col.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {items.map((p) => (
            <tr key={p._id} className="transition hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
              <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{p.patientId}</td>
              <td className="px-5 py-3">
                <button
                  type="button"
                  onClick={() => onView(p)}
                  className="font-medium text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
                >
                  {p.fullName}
                </button>
              </td>
              <td className="px-5 py-3 text-slate-600 dark:text-slate-300"><PhiField>{p.phone}</PhiField></td>
              <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                {p.age != null ? `${p.age}y` : '—'} / {genderLabel(p.gender, t)}
              </td>
              <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{p.branch?.name || '—'}</td>
              <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{formatDate(p.createdAt)}</td>
              <td className="px-5 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.isActive
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-300'
                  }`}
                >
                  {p.isActive ? t('common.active') : t('common.archived')}
                </span>
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => onView(p)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {t('common.view')}
                  </button>
                  {canOpenEmr && (
                    <button
                      type="button"
                      onClick={() => navigate(`/patients/${p._id}/emr`)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/15"
                    >
                      {t('emr.open')}
                    </button>
                  )}
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => onEdit(p)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/15"
                      >
                        {t('common.edit')}
                      </button>
                      {p.isActive && (
                        <button
                          type="button"
                          onClick={() => onArchive(p)}
                          disabled={archivingId === p._id}
                          className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/15"
                        >
                          {archivingId === p._id ? '…' : t('common.archive')}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sr-only">{formatNumber(items.length)} rows</p>
    </div>
  );
}
