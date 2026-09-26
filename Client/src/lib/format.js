import { getLang } from './i18n';
import { clinicTimeZone } from './clinicTime';

function locale() {
  return getLang() === 'ar' ? 'ar-EG' : 'en-US';
}

// Every timestamp below is an absolute instant, and the only meaningful way to
// render one is in the clinic's zone. `toLocale*` used the browser's zone, so a
// receptionist in a different zone saw appointment times, note timestamps and
// day-close rows shifted — and a clinic-local midnight rendered as the
// previous day west of the clinic.
function inClinicZone() {
  return { timeZone: clinicTimeZone() };
}

export function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat(locale()).format(n);
}

export function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return new Intl.NumberFormat(locale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(), {
    ...inClinicZone(),
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function timeAgo(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';

  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  // These labels are translated at the call site via the i18n dictionary
  // (dashboard.* keys). Returning a sentinel keeps this helper locale-aware
  // without importing React; callers map values to t().
  if (sec < 60) return { key: 'dashboard.justNow' };
  if (min < 60) return { key: 'dashboard.minutesAgo', vars: { n: min } };
  if (hour < 24) return { key: 'dashboard.hoursAgo', vars: { n: hour } };
  if (day < 30) return { key: 'dashboard.daysAgo', vars: { n: day } };
  return formatDate(d);
}

export function formatTime(date) {
  if (!date) return '--';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '--';
  return new Intl.DateTimeFormat(locale(), {
    ...inClinicZone(),
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function formatDateTime(date) {
  if (!date) return '--';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '--';
  return `${formatDate(d)} · ${formatTime(d)}`;
}

export function greetingFor(date = new Date()) {
  // Evaluated in the clinic's zone: "good evening" must track the clinic's
  // clock, not the receptionist's.
  const h = Number(
    new Intl.DateTimeFormat('en-US', {
      ...inClinicZone(),
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date),
  );
  if (h < 12) return 'dashboard.greetingMorning';
  if (h < 18) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
}
