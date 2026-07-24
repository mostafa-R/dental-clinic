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
    <div
      className="w-full rounded-lg border border-slate-200 bg-white p-2 transition active:scale-[0.98] hover:border-indigo-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500 sm:p-2.5"
      onClick={() => onEdit?.(appointment)}
    >
      <div className="flex items-start justify-between gap-1.5 sm:gap-2">
        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 sm:text-xs">{time}</span>
        <div className="flex items-center gap-1">
          <span className={`rounded-full px-1 py-0.5 text-[9px] font-medium ring-1 ring-inset sm:px-1.5 sm:text-[10px] ${statusStyle(appointment.status)}`}>
            {t(statusTKey(appointment.status))}
          </span>
          {patient?._id && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onViewEmr?.(patient._id); }}
              className="hidden rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25 sm:block sm:px-2 sm:py-1 sm:text-xs"
            >
              {t('emr.open')}
            </button>
          )}
        </div>
      </div>
      <p className="mt-0.5 truncate text-xs font-medium text-slate-900 hover:underline dark:text-white sm:mt-1 sm:text-sm">
        {patient?.fullName || t('appointments.patientFallback')}
      </p>
      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">{appointment.doctor?.name || t('appointments.doctorFallback')}</p>
      {appointment.chair && (
        <p className="hidden truncate text-[10px] text-slate-400 dark:text-slate-500 sm:block sm:text-[11px]">{appointment.chair}</p>
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
      <div className={`grid gap-2 sm:gap-3 ${gridCols}`}>
        {byDay.map(({ day, items }) => {
          const isToday = sameDay(day, new Date());
          return (
            <div key={day.toISOString()} className="flex flex-col">
              <div className="mb-1.5 flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800 sm:mb-2 sm:pb-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white sm:text-sm">
                    {day.toLocaleDateString(locale, { weekday: 'short' })}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 sm:ms-1.5 sm:text-sm">
                    {day.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
                  </span>
                  {isToday && (
                    <span className="ms-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 sm:ms-2 sm:px-2 sm:text-[10px]">
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="sm:h-4 sm:w-4">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
              <div className="space-y-1 sm:space-y-2">
                {items.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-2 py-3 text-center text-[11px] text-slate-300 dark:border-slate-700 dark:text-slate-600 sm:py-4 sm:text-xs">
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
