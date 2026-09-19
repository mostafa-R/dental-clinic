import { useMemo } from 'react';
import { useT } from '../../lib/i18n';
import { statusStyle, statusTKey } from './statuses';

const DAY_START = 8;
const DAY_END = 20;
const PIXELS_PER_HOUR = 84;

function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function timeLabel(value) { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function resourceFor(a, t) { return a.chair || a.doctor?.name || t('appointments.unassigned'); }
function isTimedAppointment(a) {
  const start = new Date(a.start); const end = new Date(a.end);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
}
function chairKey(chair) { return String(chair || '').trim().toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ''); }
function overlaps(a, b) { return new Date(a.start) < new Date(b.end) && new Date(a.end) > new Date(b.start); }
function sharesBookedResource(a, b) {
  const sameDoctor = a.doctor?._id && b.doctor?._id && String(a.doctor._id) === String(b.doctor._id);
  const aChair = chairKey(a.chair); const bChair = chairKey(b.chair);
  return sameDoctor || Boolean(aChair && bChair && aChair === bChair);
}

function AppointmentBlock({ appointment, conflict, onEdit, t }) {
  const start = new Date(appointment.start);
  const end = new Date(appointment.end);
  const top = Math.max(0, ((start.getHours() * 60 + start.getMinutes()) - DAY_START * 60) / 60 * PIXELS_PER_HOUR);
  const height = Math.max(34, (end - start) / 3600000 * PIXELS_PER_HOUR);
  return (
    <button type="button" onClick={() => onEdit(appointment)}
      className={`absolute inset-x-1 overflow-hidden rounded-md border p-1.5 text-start shadow-sm transition hover:z-10 hover:ring-2 hover:ring-brand/30 ${statusStyle(appointment.status)} ${conflict ? 'border-rose-500 ring-1 ring-rose-500' : 'border-current/20'}`}
      style={{ top, height }} aria-label={`${appointment.patient?.fullName || t('appointments.patientFallback')}, ${timeLabel(appointment.start)} to ${timeLabel(appointment.end)}${conflict ? `, ${t('appointments.scheduleConflict')}` : ''}`}>
      <span className="block truncate text-[11px] font-semibold leading-4">{appointment.patient?.fullName || t('appointments.patientFallback')}</span>
      {height > 48 && <span className="block truncate text-[10px] leading-3 opacity-80">{timeLabel(appointment.start)} - {timeLabel(appointment.end)}</span>}
      {conflict && <span className="block truncate text-[10px] font-semibold leading-3">{t('appointments.conflict')}</span>}
    </button>
  );
}

function DaySchedule({ day, appointments, onEdit, onNew, t }) {
  const items = useMemo(() => appointments.filter((a) => isTimedAppointment(a) && sameDay(new Date(a.start), day)).sort((a, b) => new Date(a.start) - new Date(b.start)), [appointments, day]);
  const resources = useMemo(() => [...new Set(items.map((a) => resourceFor(a, t)))].sort(), [items, t]);
  const conflicts = useMemo(() => {
    const found = new Set(); const active = items.filter((a) => !['cancelled', 'completed', 'no_show'].includes(a.status));
    active.forEach((a, i) => active.slice(i + 1).forEach((b) => { if (sharesBookedResource(a, b) && overlaps(a, b)) { found.add(a._id); found.add(b._id); } }));
    return found;
  }, [items]);
  const columns = resources.length ? resources : [t('appointments.unassigned')];
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
  const height = (DAY_END - DAY_START) * PIXELS_PER_HOUR;
  return <section className="min-w-[720px] border-b border-slate-200 last:border-0 dark:border-slate-700">
    <div className="grid border-b border-slate-200 dark:border-slate-700" style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(170px, 1fr))` }}>
      <div className="px-2 py-3 text-xs text-slate-400">{day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      {columns.map((resource) => <div key={resource} className="flex items-center justify-between border-s border-slate-200 px-3 py-3 dark:border-slate-700"><span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{resource}</span><button type="button" className="text-sm font-semibold text-brand" aria-label={`${t('appointments.addAppointment')} ${resource}`} onClick={() => onNew(day)}>+</button></div>)}
    </div>
    <div className="grid" style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(170px, 1fr))` }}>
      <div className="relative" style={{ height }}>{hours.map((hour) => <div key={hour} className="absolute w-full -translate-y-2 text-end pe-2 text-[10px] text-slate-400" style={{ top: (hour - DAY_START) * PIXELS_PER_HOUR }}>{new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>)}</div>
      {columns.map((resource) => <div key={resource} className="relative border-s border-slate-200 dark:border-slate-700" style={{ height, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${PIXELS_PER_HOUR - 1}px, rgba(148,163,184,.22) ${PIXELS_PER_HOUR}px)` }}>{items.filter((a) => resourceFor(a, t) === resource).map((a) => <AppointmentBlock key={a._id} appointment={a} conflict={conflicts.has(a._id)} onEdit={onEdit} t={t} />)}</div>)}
    </div>
  </section>;
}

function MobileAgenda({ day, appointments, onEdit, onNew, t }) {
  const items = appointments.filter((a) => isTimedAppointment(a) && sameDay(new Date(a.start), day)).sort((a, b) => new Date(a.start) - new Date(b.start));
  return <div className="space-y-2">
    <div className="flex items-center justify-between px-1">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
      <button type="button" onClick={() => onNew(day)} aria-label={t('appointments.addAppointment')} className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-lg font-semibold leading-none text-white shadow-sm shadow-brand/25 transition hover:bg-brand-dark active:bg-brand-dark">+</button>
    </div>
    {items.length ? items.map((a) => <button type="button" key={a._id} onClick={() => onEdit(a)} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-start dark:border-slate-700"><time className="text-xs font-semibold text-slate-600 dark:text-slate-300">{timeLabel(a.start)}</time><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900 dark:text-white">{a.patient?.fullName || t('appointments.patientFallback')}</p><p className="truncate text-xs text-slate-500">{resourceFor(a, t)}</p></div><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle(a.status)}`}>{t(statusTKey(a.status))}</span></button>) : <p className="py-8 text-center text-sm text-slate-400">{t('appointments.noAppointments')}</p>}</div>;
}

export default function CalendarView({ appointments, view, anchorDate, doctorFilter, onEdit, onNew }) {
  const { t } = useT();
  const days = useMemo(() => Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => addDays(anchorDate, i)), [view, anchorDate]);
  const filtered = useMemo(() => appointments.filter((a) => !doctorFilter || a.doctor?._id === doctorFilter), [appointments, doctorFilter]);
  return <div><div className="hidden overflow-x-auto md:block">{days.map((day) => <DaySchedule key={day.toISOString()} day={day} appointments={filtered} onEdit={onEdit} onNew={onNew} t={t} />)}</div><div className="md:hidden">{days.map((day) => <MobileAgenda key={day.toISOString()} day={day} appointments={filtered} onEdit={onEdit} onNew={onNew} t={t} />)}</div></div>;
}
