import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { showErrorDialog } from '../features/ui/uiSlice';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import api from '../lib/axios';
import { useSocketEvent } from '../lib/socket';
import { SOCKET_EVENTS } from '../lib/socketEvents';
import { useCanCreateAppointments } from '../lib/roles';
import { useT } from '../lib/i18n';
import { toDateInputValue, todayAsDateInputValue, fromDateTimeInputValue } from '../lib/clinicTime';

/**
 * The day/week browser works in *calendar days*, not instants, so it must not be
 * subject to any timezone. `anchor` is therefore a `YYYY-MM-DD` string
 * everywhere, and day math is done through UTC (where `YYYY-MM-DD` means the
 * same calendar day in every zone).
 *
 * This was the source of an off-by-one on the whole view: the old code did
 * `setDate`/`toLocaleDateString` in the browser's zone, so a receptionist west
 * of the clinic saw the week range labelled one day early and `CalendarView`
 * dropped same-day appointments from the wrong column.
 */
function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Format a `YYYY-MM-DD` day through a UTC-noon Date so no zone can shift it. */
function dayLabel(day, locale, opts) {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function dateInputValue(date) {
  return toDateInputValue(date);
}

export default function Appointments() {
  const dispatch = useDispatch();
  const { t, lang } = useT();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const { items, status, error, query } = useSelector((s) => s.appointments);
  const canCreate = useCanCreateAppointments();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState('calendar');
  const [view, setView] = useState('day');
  const [anchor, setAnchor] = useState(() => todayAsDateInputValue());
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
      // A `?new=1` deep link must not bypass the create permission: drop the
      // param and stay on the calendar when the role has no
      // `appointments:create`.
      if (canCreate) {
        // 09:00 clinic time today — see `openCreate`.
        setDefaultStart(fromDateTimeInputValue(`${todayAsDateInputValue()}T09:00`));
        setEditing(null);
        setFormOpen(true);
      }
    }
    if (newParam || tabParam) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, canCreate]);

  useEffect(() => {
    // The doctor filter silently rendering empty looks identical to "this
    // clinic has no doctors", so report the failure.
    api
      .get('/users/doctors')
      // `?? []`: the filter below reads `doctors.length` on every render, so a
      // 200 whose body lacks the key would crash the whole page rather than
      // show an empty filter.
      .then((d) => setDoctors(d.data?.data?.doctors ?? []))
      .catch(() => {
        setDoctors([]);
        dispatch(showErrorDialog({ message: t('common.loadFailedList') }));
      });
  }, [dispatch, t]);

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

  useSocketEvent(SOCKET_EVENTS.APPOINTMENT_CREATED, refetch);
  useSocketEvent(SOCKET_EVENTS.APPOINTMENT_UPDATED, refetch);
  useSocketEvent(SOCKET_EVENTS.APPOINTMENT_STATUS_CHANGED, refetch);

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
    // 09:00 is a clinic wall clock. The old `withTime.setHours(9, 0, 0, 0)`
    // set 09:00 in the *browser's* zone, which the form then rendered in the
    // clinic's zone — a new appointment from a remote receptionist opened at
    // the wrong hour.
    setDefaultStart(fromDateTimeInputValue(`${toDateInputValue(start)}T09:00`));
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
      return dayLabel(date, locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    return `${dayLabel(date, locale, { month: 'short', day: 'numeric' })} – ${dayLabel(addDays(date, 6), locale, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-brand-light';

  const hasActiveFilters = query.patient || query.doctor;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('appointments.title')}
        subtitle={t('appointments.subtitle')}
        actions={
          canCreate && (
            <Button size="sm" onClick={() => openCreate(anchor)}>
              {t('appointments.new')}
            </Button>
          )
        }
      />

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setTab('calendar')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition sm:px-4 ${
            tab === 'calendar' ? 'bg-brand/5 text-brand-dark dark:bg-brand/20 dark:text-brand-light' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {t('appointments.calendar')}
        </button>
        <button
          type="button"
          onClick={() => setTab('queue')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition sm:px-4 ${
            tab === 'queue' ? 'bg-brand/5 text-brand-dark dark:bg-brand/20 dark:text-brand-light' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
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
                aria-label={t('common.prev')}
              >
                <svg className="rtl:rotate-180" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setAnchor(todayAsDateInputValue())}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:text-sm"
              >
                {t('appointments.today')}
              </button>
              <button
                type="button"
                onClick={() => setAnchor((d) => addDays(d, view === 'week' ? 7 : 1))}
                className="rounded-md border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label={t('common.next')}
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
                  hasActiveFilters ? 'text-brand dark:text-brand-light' : 'text-slate-500 dark:text-slate-400'
                }`}
                aria-label={t('appointments.filters')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                </svg>
                {hasActiveFilters && (
                  <span className="absolute -end-1 -top-1 h-2 w-2 rounded-full bg-brand" />
                )}
              </button>
              <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setView('day')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    view === 'day' ? 'bg-brand/5 text-brand-dark dark:bg-brand/20 dark:text-brand-light' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {t('appointments.day')}
                </button>
                <button
                  type="button"
                  onClick={() => setView('week')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    view === 'week' ? 'bg-brand/5 text-brand-dark dark:bg-brand/20 dark:text-brand-light' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
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
                aria-label={t('appointments.searchPatient')}
                className={inputCls}
              />
              <select
                value={query.doctor}
                onChange={(e) => dispatch(setDoctorFilter(e.target.value))}
                aria-label={t('appointments.allDoctors')}
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
              aria-label={t('appointments.searchPatient')}
              className={`w-44 ${inputCls}`}
            />
            <select
              value={query.doctor}
              onChange={(e) => dispatch(setDoctorFilter(e.target.value))}
              aria-label={t('appointments.allDoctors')}
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
                  onNew={canCreate ? openCreate : undefined}
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
