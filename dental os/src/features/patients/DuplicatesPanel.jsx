import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';

import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import { closeDuplicates, fetchDuplicates, mergePatients } from './patientSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { formatDate } from '../../lib/format';
import { useT } from '../../lib/i18n';

export default function DuplicatesPanel() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { duplicates, mergeStatus } = useSelector((s) => s.patients);
  const [survivorByGroup, setSurvivorByGroup] = useState({});

  useEffect(() => {
    dispatch(fetchDuplicates());
  }, [dispatch]);

  const handleMerge = async (group) => {
    const survivorId = survivorByGroup[group.key] || group.patients[0]?._id;
    const duplicatesToMerge = (group.patients || []).filter((p) => p._id !== survivorId);
    if (duplicatesToMerge.length === 0) return;

    try {
      for (const dup of duplicatesToMerge) {
        await dispatch(mergePatients({ duplicateId: dup._id, survivorId })).unwrap();
      }
      toast.success(t('patients.duplicates.merged'));
      dispatch(fetchDuplicates());
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const hasGroups = (duplicates.groups || []).length > 0;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('patients.duplicates.title')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('patients.duplicates.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => dispatch(closeDuplicates())}
          className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {t('common.close')}
        </button>
      </div>

      {duplicates.status === 'loading' && <Spinner label={t('common.loading')} />}
      {duplicates.status === 'failed' && <EmptyState title={t('patients.duplicates.loadFailed')} message={duplicates.error?.message} />}
      {duplicates.status === 'succeeded' && !hasGroups && (
        <EmptyState title={t('patients.duplicates.none')} />
      )}
      {duplicates.status === 'succeeded' && hasGroups && (
        <div className="mt-4 space-y-4">
          {duplicates.groups.map((group) => {
            const survivorId = survivorByGroup[group.key] || group.patients[0]?._id;
            const selectable = group.patients || [];
            return (
              <div key={group.key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{t('patients.duplicates.matchedBy')}</span>
                  <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
                    {t(`patients.duplicates.match.${group.matchedOn}`)}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{group.count} {t('patients.duplicates.records')}</span>
                </div>

                <div className="space-y-1.5">
                  {selectable.map((p) => {
                    const isSurvivor = p._id === survivorId;
                    return (
                      <div
                        key={p._id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                          isSurvivor
                            ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                            : 'border-slate-100 bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <input
                            type="radio"
                            name={`survivor-${group.key}`}
                            checked={isSurvivor}
                            onChange={() => setSurvivorByGroup((prev) => ({ ...prev, [group.key]: p._id }))}
                            className="h-3.5 w-3.5 accent-emerald-600"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                              {p.firstName} {p.lastName}
                              {isSurvivor && (
                                <span className="ms-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                                  {t('patients.duplicates.survivor')}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                              {p.patientId} · {p.phone || '—'} · {formatDate(p.createdAt)}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{p.branch?.name || ''}</span>
                      </div>
                    );
                  })}
                </div>

                {selectable.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleMerge(group)}
                    disabled={mergeStatus === 'loading'}
                    className="mt-2.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                  >
                    {mergeStatus === 'loading' ? t('common.loading') : t('patients.duplicates.mergeInto')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}