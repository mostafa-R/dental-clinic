export const APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
];

/** i18n key for a given appointment status. */
export function statusTKey(status) {
  return `appointment.status.${status}`;
}

const STATUS_STYLES = {
  scheduled: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30',
  confirmed: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30',
  checked_in: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',
  in_progress: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30',
  cancelled: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600',
  no_show: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30',
};

export function statusStyle(status) {
  return STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600';
}

/** Allowed next statuses from a given current status (mirrors server rules). */
export const ALLOWED_NEXT = {
  scheduled: ['confirmed', 'checked_in', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransition(from, to) {
  return ALLOWED_NEXT[from]?.includes(to) ?? false;
}

export function nextStatusOptions(status) {
  return ALLOWED_NEXT[status] || [];
}
