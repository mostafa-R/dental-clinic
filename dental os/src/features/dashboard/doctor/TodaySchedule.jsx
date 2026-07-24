import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { doctorDashboardApi } from '../doctorDashboardApi';
import Card from '../../../components/ui/Card';
import EmptyState from '../../../components/ui/EmptyState';
import Spinner from '../../../components/ui/Spinner';
import { formatTime } from '../../../lib/format';
import { useT } from '../../../lib/i18n';
import { useSocketEvent } from '../../../lib/socket';

const STATUS_COLORS = {
  scheduled: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  confirmed: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  checked_in: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  in_progress: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  completed: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
  cancelled: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  no_show: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
};

export default function TodaySchedule() {
  const { t } = useT();
  const user = useSelector((s) => s.auth.user);
  const perms = useSelector((s) => s.users.myPermissions);
  const [appointments, setAppointments] = useState(null);
  const [loading, setLoading] = useState(true);

  const hasAccess = perms?.isSystemAdmin || perms?.permissions?.appointments?.includes('read');

  const fetchAppointments = () => {
    if (!hasAccess || !user?._id) return;
    setLoading(true);
    doctorDashboardApi
      .getTodayAppointments(user._id)
      .then(setAppointments)
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAppointments();
  }, [hasAccess, user?._id]);

  useSocketEvent('appointment:created', fetchAppointments);
  useSocketEvent('appointment:updated', fetchAppointments);
  useSocketEvent('appointment:statusChanged', fetchAppointments);

  if (!hasAccess) return null;

  const sorted = appointments
    ? [...appointments].sort((a, b) => new Date(a.start) - new Date(b.start))
    : [];

  return (
    <Card title={t('doctorDashboard.todaySchedule')}>
      {loading && !appointments && <Spinner label={t('common.loading')} />}

      {!loading && sorted.length === 0 && (
        <EmptyState
          title={t('doctorDashboard.noAppointments')}
          message={t('doctorDashboard.noAppointmentsHint')}
        />
      )}

      {sorted.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {sorted.map((appt) => (
            <li key={appt._id} className="flex items-center gap-4 py-3">
              <div className="flex w-16 shrink-0 flex-col items-center text-xs text-slate-500 dark:text-slate-400">
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {formatTime(appt.start)}
                </span>
                <span>{formatTime(appt.end)}</span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                  {appt.patient?.firstName} {appt.patient?.lastName}
                </p>
                {appt.reason && (
                  <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                    {appt.reason}
                  </p>
                )}
              </div>

              {appt.chair && (
                <span className="hidden text-xs text-slate-400 sm:inline dark:text-slate-500">
                  {appt.chair}
                </span>
              )}

              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[appt.status] || 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300'}`}
              >
                {t(`appointment.status.${appt.status}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
