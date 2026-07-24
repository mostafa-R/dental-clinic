import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDashboardStats, resetDashboard } from '../features/dashboard/dashboardSlice';
import BranchesList from '../features/dashboard/BranchesList';
import ModulesGrid from '../features/dashboard/ModulesGrid';
import RecentActivity from '../features/dashboard/RecentActivity';
import StaffByRole from '../features/dashboard/StaffByRole';
import AppointmentQueue from '../features/dashboard/AppointmentQueue';
import StatCards from '../features/dashboard/StatCards';
import FinancialSummary from '../features/dashboard/owner/FinancialSummary';
import TodayCount from '../features/dashboard/doctor/TodayCount';
import PatientsCount from '../features/dashboard/doctor/PatientsCount';
import PendingEarnings from '../features/dashboard/doctor/PendingEarnings';
import Outstanding from '../features/dashboard/doctor/Outstanding';
import TodaySchedule from '../features/dashboard/doctor/TodaySchedule';
import ActivePlans from '../features/dashboard/doctor/ActivePlans';
import LowStock from '../features/dashboard/doctor/LowStock';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import { RefreshIcon } from '../components/ui/icons';
import { formatDate, greetingFor } from '../lib/format';
import { useT } from '../lib/i18n';
import { useSocketEvent } from '../lib/socket';

function DoctorDashboard() {
  const { t } = useT();
  const user = useSelector((s) => s.auth.user);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          {t('dashboard.greeting', { greeting: t(greetingFor()), name: user?.name?.split(' ')[0] || '' })}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{formatDate(new Date())}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TodayCount />
        <PatientsCount />
        <PendingEarnings />
        <Outstanding />
      </div>

      <TodaySchedule />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivePlans />
        <LowStock />
      </div>
    </div>
  );
}

function OwnerDashboard() {
  const dispatch = useDispatch();
  const { stats, status, error } = useSelector((s) => s.dashboard);
  const user = useSelector((s) => s.auth.user);
  const { t } = useT();

  const isLoading = status === 'loading' || status === 'idle';

  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchDashboardStats());
    }
  }, [dispatch, status]);

  useEffect(() => () => dispatch(resetDashboard()), [dispatch]);

  const refetch = useCallback(() => { dispatch(fetchDashboardStats()); }, [dispatch]);
  useSocketEvent('appointment:created', refetch);
  useSocketEvent('appointment:updated', refetch);
  useSocketEvent('patient:created', refetch);
  useSocketEvent('invoice:created', refetch);
  useSocketEvent('invoice:updated', refetch);

  const onRefresh = () => dispatch(fetchDashboardStats());

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            {t('dashboard.greeting', { greeting: t(greetingFor()), name: user?.name?.split(' ')[0] || '' })}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{formatDate(new Date())}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshIcon width={16} height={16} className={isLoading ? 'animate-spin' : ''} />
          {t('dashboard.refresh')}
        </button>
      </header>

      {isLoading && !stats && (
        <Card>
          <Spinner label={t('dashboard.loading')} />
        </Card>
      )}

      {error && !stats && (
        <Card>
          <EmptyState
            title={t('dashboard.loadFailed')}
            message={error}
          />
          <div className="mt-4">
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {t('common.tryAgain')}
            </button>
          </div>
        </Card>
      )}

      {stats && (
        <>
          <StatCards summary={stats.summary} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title={t('dashboard.staffByRole')}>
              <StaffByRole staffByRole={stats.staffByRole} />
            </Card>
            <Card title={t('dashboard.appointmentQueue')}>
              <AppointmentQueue queueByStatus={stats.queueByStatus} />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card title={t('dashboard.branches')}>
              <BranchesList branches={stats.branches} />
            </Card>
            <Card title={t('dashboard.modules')} className="lg:col-span-2">
              <ModulesGrid modules={stats.modules} />
            </Card>
          </div>

          <FinancialSummary />

          <Card title={t('dashboard.recentActivity')}>
            <RecentActivity recentStaff={stats.recentStaff} />
          </Card>
        </>
      )}
    </div>
  );
}

export default function Dashboard() {
  const user = useSelector((s) => s.auth.user);
  const { t } = useT();

  const isPureDoctor = user?.role === 'doctor';
  const canSwitchDashboard = user?.role === 'clinic_admin' && user?.isDoctor === true;

  const [activeView, setActiveView] = useState(isPureDoctor ? 'doctor' : 'owner');

  useEffect(() => {
    if (isPureDoctor) setActiveView('doctor');
  }, [isPureDoctor]);

  if (isPureDoctor) return <DoctorDashboard />;

  return (
    <div className="space-y-6">
      {canSwitchDashboard && (
        <div className="flex items-center gap-2 self-end">
          <button
            type="button"
            onClick={() => setActiveView('owner')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              activeView === 'owner'
                ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {t('dashboard.viewOwner')}
          </button>
          <button
            type="button"
            onClick={() => setActiveView('doctor')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              activeView === 'doctor'
                ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {t('dashboard.viewDoctor')}
          </button>
        </div>
      )}
      {activeView === 'doctor' ? <DoctorDashboard /> : <OwnerDashboard />}
    </div>
  );
}
