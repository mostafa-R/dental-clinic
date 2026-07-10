import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setSearch, setStatusFilter } from './patientSlice';
import { useT } from '../../lib/i18n';

export default function PatientSearch() {
  const dispatch = useDispatch();
  const { t } = useT();
  const { search, isActive } = useSelector((s) => s.patients.query);
  const [value, setValue] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (value !== search) dispatch(setSearch(value));
    }, 350);
    return () => clearTimeout(timer);
  }, [value, dispatch, search]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <svg
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('patients.searchPlaceholder')}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 ps-9 pe-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>
      <select
        value={isActive === undefined ? '' : isActive}
        onChange={(e) => {
          const v = e.target.value;
          dispatch(setStatusFilter(v === '' ? undefined : v));
        }}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        <option value="">{t('common.all')}</option>
        <option value="true">{t('common.active')}</option>
        <option value="false">{t('common.archived')}</option>
      </select>
    </div>
  );
}
