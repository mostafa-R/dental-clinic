import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import {
  fetchAppointments,
  resetAppointments,
  setDoctorFilter,
  setPatientFilter,
  setDate,
} from '../features/appointments/appointmentSlice';
import AppointmentFormModal from '../features/appointments/AppointmentFormModal';
import CalendarView from '../features/appointments/CalendarView';
import LiveQueue from '../features/appointments/LiveQueue';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import api from '../lib/axios';
import { useSocketEvent } from '../lib/socket';
import { canManageAppointments } from '../lib/roles';
import { useT } from '../lib/i18n';

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dateInputValue(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Appointments() {
  const dispatch = useDispatch();
  const { t, lang } = useT();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const { items, status, error, query } = useSelector((s) => s.appointments);
  const user = useSelector((s) => s.auth.user);
  const canManage = canManageAppointments();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState('calendar');
  const [view, setView] = useState('day');
  const [anchor, setAnchor] = useState(() => new Date());
  const [doctors, setDoctors] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [defaultStart, setDefaultStart] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const newParam = searchParams.get('new');
    const tabParam = searchParams.get('tab');
    if (tabParam === 'queue') {
      setTab('queue');
    }
    if (newParam === '1') {
      const withTime = new Date();
      withTime.setHours(9, 0, 0, 0);
      setDefaultStart(withTime);
      setEditing(null);
      setFormOpen(true);
    }
    if (newParam || tabParam) {
      setSearchParams({}, { replace: true });
    }
  }, []);

  useEffect(() => {
    api.get('/users/doctors').then((d) => setDoctors(d.data.data.doctors)).catch(() => {});
  }, []);

  useEffect(() => {
    dispatch(setDate(dateInputValue(anchor)));
  }, [dispatch, anchor]);

  const buildParams = useCallback(() => {
    const params = { limit: 200 };
    if (view === 'week') {
      const end = addDays(anchor, 6);
      params.from = dateInputValue(anchor);
      params.to = dateInputValue(end);
    } else {
      params.date = dateInputValue(anchor);
    }
    if (query.doctor) params.doctor = query.doctor;
    if (query.status) params.status = query.status;
    if (query.patient) params.patient = query.patient;
    return params;
  }, [anchor, view, query.doctor, query.status, query.patient]);

  useEffect(() => {
    dispatch(fetchAppointments(buildParams()));
  }, [dispatch, buildParams]);

  const refetch = useCallback(() => {
    if (tab === 'queue') return;
    dispatch(fetchAppointments(buildParams()));
  }, [dispatch, buildParams, tab]);

  useSocketEvent('appointment:created', refetch);
  useSocketEvent('appointment:updated', refetch);
  useSocketEvent('appointment:statusChanged', refetch);

  useEffect(() => () => dispatch(resetAppointments()), [dispatch]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        dispatch(fetchAppointments(buildParams()));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [dispatch, buildParams]);

  const isLoading = status === 'loading' || status === 'idle';

  const openCreate = (day) => {
    const start = day || anchor;
    const withTime = new Date(start);
    withTime.setHours(9, 0, 0, 0);
    setDefaultStart(withTime);
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (appointment) => {
    setEditing(appointment);
    setDefaultStart(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const onSaved = () => {
    closeForm();
    dispatch(fetchAppointments(buildParams()));
  };

  const doctorList = useMemo(() => {
    const seen = new Set();
    const list = [];
    items.forEach((a) => {
      if (a.doctor && !seen.has(a.doctor._id)) {
        seen.add(a.doctor._id);
        list.push(a.doctor);
      }
    });
    return list;
  }, [items]);

  const formatRange = (date, viewMode) => {
    if (viewMode === 'day') {
      return date.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    const end = addDays(date, 6);
    return `${date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';

  const hasActiveFilters = query.patient || query.doctor;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 sm:items-center">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white sm:text-2xl">{t('appointments.title')}</h1>
          <p className="hidden text-sm text-slate-500 dark:text-slate-400 sm:block">{t('appointments.subtitle')}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => openCreate(anchor)}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 sm:px-4"
          >
            <span className="hidden sm:inline">{t('appointments.new')}</span>
            <span className="sm:hidden">+</span>
          </button>
        )}
      </header>

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setTab('calendar')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition sm:px-4 ${
            tab === 'calendar' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {t('appointments.calendar')}
        </button>
        <button
          type="button"
          onClick={() => setTab('queue')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition sm:px-4 ${
            tab === 'queue' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {t('appointments.liveQueue')}
        </button>
      </div>

      {tab === 'calendar' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAnchor((d) => addDays(d, view === 'week' ? -7 : -1))}
                className="rounded-md border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Previous"
              >
                <svg className="rtl:rotate-180" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setAnchor(new Date())}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:text-sm"
              >
                {t('appointments.today')}
              </button>
              <button
                type="button"
                onClick={() => setAnchor((d) => addDays(d, view === 'week' ? 7 : 1))}
                className="rounded-md border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Next"
              >
                <svg className="rtl:rotate-180" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
              <span className="ms-1 text-xs font-medium text-slate-700 dark:text-slate-200 sm:text-sm">{formatRange(anchor, view)}</span>
            </div>

            <div className="ms-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className={`relative rounded-md border border-slate-200 p-1.5 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 sm:hidden ${
                  hasActiveFilters ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
                }`}
                aria-label="Filters"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                </svg>
                {hasActiveFilters && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-indigo-500" />
                )}
              </button>
              <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setView('day')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    view === 'day' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {t('appointments.day')}
                </button>
                <button
                  type="button"
                  onClick={() => setView('week')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    view === 'week' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {t('appointments.week')}
                </button>
              </div>
            </div>
          </div>

          {filtersOpen && (
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:hidden">
              <input
                type="text"
                value={query.patient}
                onChange={(e) => dispatch(setPatientFilter(e.target.value))}
                placeholder={t('appointments.searchPatient')}
                className={inputCls}
              />
              <select
                value={query.doctor}
                onChange={(e) => dispatch(setDoctorFilter(e.target.value))}
                className={inputCls}
              >
                <option value="">{t('appointments.allDoctors')}</option>
                {(doctors.length ? doctors : doctorList).map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="hidden items-center gap-2 sm:flex">
            <input
              type="text"
              value={query.patient}
              onChange={(e) => dispatch(setPatientFilter(e.target.value))}
              placeholder={t('appointments.searchPatient')}
              className={`w-44 ${inputCls}`}
            />
            <select
              value={query.doctor}
              onChange={(e) => dispatch(setDoctorFilter(e.target.value))}
              className={inputCls}
            >
              <option value="">{t('appointments.allDoctors')}</option>
              {(doctors.length ? doctors : doctorList).map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          </div>

          <Card padded={false}>
            <div className="p-2 sm:p-4">
              {isLoading && <Spinner label={t('appointments.loading')} />}
              {error && !isLoading && (
                <EmptyState title={t('appointments.loadFailed')} message={error?.message || error} />
              )}
              {status === 'succeeded' && !error && (
                <CalendarView
                  appointments={items}
                  view={view}
                  anchorDate={anchor}
                  doctorFilter={query.doctor}
                  onEdit={openEdit}
                  onNew={openCreate}
                />
              )}
            </div>
          </Card>
        </>
      )}

      {tab === 'queue' && <LiveQueue />}

      <AppointmentFormModal
        open={formOpen}
        appointment={editing}
        defaultStart={defaultStart}
        onClose={closeForm}
        onSaved={onSaved}
      />
    </div>
  );
}
