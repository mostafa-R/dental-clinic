import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import { archivePatient } from './patientSlice';
import { showErrorDialog, pushToast } from '../ui/uiSlice';
import { requestConfirm } from '../ui/confirmDialog';
import { useCanManagePatients, useCanViewEmr } from '../../lib/roles';
import { formatDate } from '../../lib/format';
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

export default function PatientsTable({ onView, onEdit, loading }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useT();
  const { items } = useSelector((s) => s.patients);
  const canManage = useCanManagePatients();
  const canOpenEmr = useCanViewEmr();
  const [archivingId, setArchivingId] = useState(null);

  const onArchive = async (patient) => {
    const ok = await requestConfirm({
      title: t('common.confirm'),
      message: t('patients.archiveConfirm', { name: patient.fullName }),
      danger: true,
    });
    if (!ok) return;
    setArchivingId(patient._id);
    try {
      await dispatch(archivePatient(patient._id)).unwrap();
      dispatch(pushToast({ type: 'success', message: t('patients.archived') }));
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setArchivingId(null);
    }
  };

  if (!items.length && !loading) {
    return (
      <div className="px-5 py-16 text-center text-sm text-slate-400 dark:text-slate-500">
        {t('patients.empty')}
      </div>
    );
  }

  return (
    <DataTable
      loading={loading}
      columns={[
        { label: t('patients.col.patientId') },
        { label: t('patients.col.name') },
        { label: t('patients.col.phone') },
        { label: t('patients.col.ageGender') },
        { label: t('patients.col.branch') },
        { label: t('patients.col.registered') },
        { label: t('patients.col.status') },
        { label: t('patients.col.actions'), className: 'text-end' },
      ]}
      count={items.length}
    >
      {items.map((p) => (
        <tr key={p._id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
          <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{p.patientId}</td>
          <td className="px-5 py-3">
            <button
              type="button"
              onClick={() => onView(p)}
              className="font-medium text-slate-900 hover:text-brand dark:text-white"
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
              <Button variant="ghost" size="xs" onClick={() => onView(p)}>
                {t('common.view')}
              </Button>
              {canOpenEmr && (
                <Button variant="ghost" size="xs" onClick={() => navigate(`/patients/${p._id}/emr`)}>
                  {t('emr.open')}
                </Button>
              )}
              {canManage && (
                <>
                  <Button variant="ghost" size="xs" onClick={() => onEdit(p)}>
                    {t('common.edit')}
                  </Button>
                  {p.isActive && (
                    <Button
                      variant="danger-soft"
                      size="xs"
                      onClick={() => onArchive(p)}
                      disabled={archivingId === p._id}
                    >
                      {archivingId === p._id ? '…' : t('common.archive')}
                    </Button>
                  )}
                </>
              )}
            </div>
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
