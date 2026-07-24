import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { transitionAppointment } from './appointmentSlice';
import { showErrorDialog } from '../ui/uiSlice';
import StatusBadge from './StatusBadge';
import { nextStatusOptions, statusTKey } from './statuses';
import { useT } from '../../lib/i18n';

const STATUS_BORDER = {
  checked_in: 'border-l-amber-400',
  in_progress: 'border-l-violet-400',
  scheduled: 'border-l-sky-400',
  confirmed: 'border-l-indigo-400',
  completed: 'border-l-emerald-400',
};

function formatTime(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function waitingSince(date) {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 0) return null;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '< 1m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

export default function QueueCard({ appointment, onClick, isDragging, compact }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const [transitioning, setTransitioning] = useState(false);
  const options = nextStatusOptions(appointment.status);

  const handleTransition = async (status) => {
    setTransitioning(true);
    try {
      await dispatch(transitionAppointment({ id: appointment._id, status })).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setTransitioning(false);
    }
  };

  const borderCls = STATUS_BORDER[appointment.status] || 'border-l-slate-300';
  const time = formatTime(appointment.start);
  const wait = appointment.status === 'checked_in' ? waitingSince(appointment.start) : null;

  if (compact) {
    return (
      <div
        className={`rounded-lg border border-slate-200 border-l-4 bg-white p-2.5 shadow-sm transition active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 ${borderCls}`}
        onClick={() => onClick?.(appointment)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                {appointment.patient?.fullName || t('appointments.patientFallback')}
              </p>
              <StatusBadge status={appointment.status} size="sm" />
            </div>
            <div className="mt-0.5 flex items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
              {time && <span>{time}</span>}
              <span className="truncate">{appointment.doctor?.name || t('appointments.doctorFallback')}</span>
              {appointment.patient?.phone && <span className="hidden sm:inline">{appointment.patient.phone}</span>}
              {appointment.chair && <span className="hidden sm:inline">· {appointment.chair}</span>}
            </div>
          </div>
          {wait && (
            <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              {wait}
            </span>
          )}
        </div>

        {options.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleTransition(opt)}
                disabled={transitioning}
                className="min-h-[32px] rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-700 active:bg-indigo-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                <span className="rtl:-scale-x-100 inline-block">→</span> {t(statusTKey(opt))}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`cursor-pointer rounded-xl border border-slate-200 border-l-4 bg-white p-3 shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-800 ${borderCls} ${
        isDragging ? 'shadow-lg ring-2 ring-indigo-400/50 rotate-[2deg] opacity-95' : ''
      }`}
      onClick={() => !isDragging && onClick?.(appointment)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {appointment.patient?.fullName || t('appointments.patientFallback')}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {appointment.doctor?.name || t('appointments.doctorFallback')}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 dark:text-slate-500">
            {time && <span>{time}</span>}
            {appointment.patient?.phone && <span>{appointment.patient.phone}</span>}
            {appointment.chair && <span>· {appointment.chair}</span>}
          </div>
          {appointment.reason && (
            <p className="mt-1 truncate text-xs text-slate-400 italic dark:text-slate-500">
              {appointment.reason}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={appointment.status} />
          {wait && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              {wait}
            </span>
          )}
        </div>
      </div>

      {options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => handleTransition(opt)}
              disabled={transitioning}
              className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              <span className="rtl:-scale-x-100 inline-block">→</span> {t(statusTKey(opt))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
