import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import { statusStyle, statusTKey } from './statuses';

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function AppointmentCard({ appointment, onEdit, onViewEmr, t }) {
  const time = new Date(appointment.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const patient = appointment.patient;
  
  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white p-2.5 transition hover:border-indigo-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{time}</span>
        <div className="flex items-center gap-1">
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusStyle(appointment.status)}`}>
            {t(statusTKey(appointment.status))}
          </span>
          {patient?._id && (
            <button
              type="button"
              onClick={() => onViewEmr?.(patient._id)}
              className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
            >
              {t('emr.open')}
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onEdit?.(appointment)}
        className="mt-1 w-full truncate text-start text-sm font-medium text-slate-900 hover:underline dark:text-white"
      >
        {patient?.fullName || t('appointments.patientFallback')}
      </button>
      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{appointment.doctor?.name || t('appointments.doctorFallback')}</p>
      {appointment.chair && (
        <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{appointment.chair}</p>
      )}
    </div>
  );
}

export default function CalendarView({ appointments, view, anchorDate, doctorFilter, onEdit, onNew }) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  const onViewEmr = (patientId) => {
    navigate(`/patients/${patientId}/emr`);
  };

  const days = useMemo(() => {
    const count = view === 'day' ? 1 : view === 'week' ? 7 : 1;
    return Array.from({ length: count }, (_, i) => addDays(anchorDate, i));
  }, [view, anchorDate]);

  const byDay = useMemo(() => {
    return days.map((day) => ({
      day,
      items: appointments
        .filter((a) => sameDay(new Date(a.start), day))
        .filter((a) => !doctorFilter || a.doctor?._id === doctorFilter)
        .sort((a, b) => new Date(a.start) - new Date(b.start)),
    }));
  }, [appointments, days, doctorFilter]);

  const gridCols = view === 'day' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-7';

  return (
    <div>
      <div className={`grid gap-3 ${gridCols}`}>
        {byDay.map(({ day, items }) => {
          const isToday = sameDay(day, new Date());
          return (
            <div key={day.toISOString()} className="flex flex-col">
              <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                <div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {day.toLocaleDateString(locale, { weekday: 'short' })}
                  </span>
                  <span className="ms-1.5 text-sm text-slate-500 dark:text-slate-400">
                    {day.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
                  </span>
                  {isToday && (
                    <span className="ms-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                      Today
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onNew?.(day)}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800"
                  aria-label={t('appointments.addAppointment')}
                  title={t('appointments.addAppointment')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-2 py-4 text-center text-xs text-slate-300 dark:border-slate-700 dark:text-slate-600">
                    {t('appointments.noAppointments')}
                  </p>
                ) : (
                  items.map((a) => (
                    <AppointmentCard key={a._id} appointment={a} onEdit={onEdit} onViewEmr={onViewEmr} t={t} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
